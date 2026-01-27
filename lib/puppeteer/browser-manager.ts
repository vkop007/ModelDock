import { connect } from "puppeteer-real-browser";
import { Browser, Page } from "puppeteer";
import { LLMProvider, CookieEntry } from "@/types";
import path from "path";
import fs from "fs";

const USER_DATA_ROOT = path.join(process.cwd(), ".browser-data");

// Global state to persist across Next.js hot reloads
declare global {
  // eslint-disable-next-line no-var
  var __browserManager_v3: BrowserManager | undefined;
}

class BrowserManager {
  private sharedBrowser: Browser | null = null;
  private pages: Map<LLMProvider, Page> = new Map();
  private pendingPages: Map<LLMProvider, Promise<Page>> = new Map();
  private cookiesInjected: Map<LLMProvider, boolean> = new Map();
  private pagesWarmed: Set<LLMProvider> = new Set(); // Track pre-warmed pages
  private initializing: Promise<Browser> | null = null;

  async getBrowser(): Promise<Browser> {
    // Check if browser is still connected
    if (this.sharedBrowser) {
      if (this.sharedBrowser.connected) {
        return this.sharedBrowser;
      }
      // Browser disconnected, clean up
      console.log(
        `[BrowserManager] Shared browser disconnected, reinitializing...`,
      );
      this.sharedBrowser = null;
      this.pages.clear();
      this.cookiesInjected.clear();
      this.pagesWarmed.clear();
    }

    // Prevent multiple simultaneous initialization
    if (this.initializing) {
      console.log(`[BrowserManager] Waiting for browser initialization...`);
      return this.initializing;
    }

    this.initializing = this.initSharedBrowser();

    try {
      this.sharedBrowser = await this.initializing;
      return this.sharedBrowser;
    } finally {
      this.initializing = null;
    }
  }

  private async initSharedBrowser(): Promise<Browser> {
    console.log(`[BrowserManager] Initializing shared browser...`);

    // Detect platform for platform-specific configurations
    const platform = process.platform;

    if (platform === "win32") {
      console.log(
        "[BrowserManager] Detected Windows platform - Chrome will be auto-detected",
      );
    } else if (platform === "darwin") {
      console.log(
        "[BrowserManager] Detected macOS platform - Chrome will be auto-detected",
      );
    } else if (platform === "linux") {
      console.log(
        "[BrowserManager] Detected Linux platform - Chrome will be auto-detected",
      );
    }

    // Clean data before launch to ensure fresh state (except Local Storage)
    this.cleanSharedBrowserData();

    const userDataDir = path.join(USER_DATA_ROOT, "shared");
    // Ensure directory exists
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    const response = await connect({
      headless: false, // Use visible browser for reliability
      turnstile: true, // Auto-solve Cloudflare Turnstile
      disableXvfb: platform === "darwin", // Only disable Xvfb on macOS
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=1024,844", // Larger window for multiple tabs
        "--disable-blink-features=AutomationControlled",
        `--user-data-dir=${userDataDir}`,
        // Concurrency flags to prevent background throttling
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=CalculateNativeWinOcclusion,IsolateOrigins,site-per-process",
        "--disable-site-isolation-trials",
      ],
      connectOption: {
        defaultViewport: null, // Let the window size dictate viewport
        slowMo: 20,
      },
    });

    console.log(
      `[BrowserManager] Shared browser launched on ${process.platform}`,
    );
    return response.browser as unknown as Browser;
  }

  async getPage(provider: LLMProvider): Promise<Page> {
    let page = this.pages.get(provider);

    // Check if existing page is valid
    if (page) {
      try {
        if (!page.isClosed()) {
          // Verify browser connection too
          if (page.browser().connected) {
            console.log(
              `[BrowserManager] Reusing existing page for ${provider}`,
            );
            return page;
          }
        }
      } catch {
        // Page is invalid, remove it
      }
      this.pages.delete(provider);
      this.cookiesInjected.delete(provider);
    }

    // Check for pending initialization for this provider
    if (this.pendingPages.has(provider)) {
      console.log(
        `[BrowserManager] Waiting for pending page creation for ${provider}...`,
      );
      return this.pendingPages.get(provider)!;
    }

    // This will trigger initBrowser if needed
    const browserPromise = this.getBrowser();

    // Create a promise for the new page creation
    const pagePromise = (async () => {
      const browser = await browserPromise;

      // Double check if page was created while waiting for browser
      const existingPage = this.pages.get(provider);
      if (existingPage && !existingPage.isClosed()) {
        return existingPage;
      }

      // Create a new page (tab) for this provider
      console.log(`[BrowserManager] Creating new page for ${provider}`);
      let newPage: Page;
      try {
        newPage = await browser.newPage();
      } catch (e) {
        // Fallback: if browser is disconnected, retry once
        console.error(
          `[BrowserManager] Failed to create page, retrying browser init: ${e}`,
        );
        this.sharedBrowser = null;
        const freshBrowser = await this.getBrowser();
        newPage = await freshBrowser.newPage();
      }

      this.pages.set(provider, newPage);

      // Set mobile viewport and user agent
      await newPage.setViewport({
        width: 390,
        height: 844,
        isMobile: true,
        hasTouch: true,
      });
      await newPage.setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      );

      // Hack: Override Page Visibility API to ensure the page always thinks it is visible
      // This prevents web apps from pausing streaming/rendering when in a background tab
      await newPage.evaluateOnNewDocument(() => {
        Object.defineProperty(document, "visibilityState", {
          get: () => "visible",
        });
        Object.defineProperty(document, "hidden", {
          get: () => false,
        });
        Object.defineProperty(document, "hasFocus", {
          get: () => true,
        });

        // Also prevent window.blur/focus events from signaling background state
        window.addEventListener(
          "blur",
          (e) => e.stopImmediatePropagation(),
          true,
        );
        window.addEventListener(
          "visibilitychange",
          (e) => e.stopImmediatePropagation(),
          true,
        );
      });

      return newPage;
    })();

    // Store the pending promise
    this.pendingPages.set(provider, pagePromise);

    try {
      const page = await pagePromise;
      return page;
    } finally {
      // Clean up pending promise
      this.pendingPages.delete(provider);
    }
  }

  // Check if page is already warmed up
  isPageWarmed(provider: LLMProvider): boolean {
    return this.pagesWarmed.has(provider);
  }

  // Mark page as warmed
  setPageWarmed(provider: LLMProvider): void {
    this.pagesWarmed.add(provider);
    console.log(`[BrowserManager] Page warmed for ${provider}`);
  }

  // Pre-warm a page by navigating to the provider URL
  async warmPage(
    provider: LLMProvider,
    cookies?: CookieEntry[],
  ): Promise<void> {
    console.log(`[BrowserManager] Warming page for ${provider}...`);

    // Skip if already warmed
    if (this.isPageWarmed(provider)) {
      console.log(`[BrowserManager] Page already warmed for ${provider}`);
      return;
    }

    try {
      // Inject cookies first if provided
      if (cookies && cookies.length > 0) {
        await this.injectCookies(provider, cookies);
      }

      const page = await this.getPage(provider);

      // Provider URL mapping
      const providerUrls: Record<LLMProvider, string> = {
        chatgpt: "https://chatgpt.com",
        claude: "https://claude.ai",
        gemini: "https://gemini.google.com",
        zai: "https://chat.z.ai",
        grok: "https://grok.com",
        qwen: "https://chat.qwenlm.ai",
        mistral: "https://chat.mistral.ai",
        ollama: "http://localhost:11434",
      };

      const targetUrl = providerUrls[provider];
      const currentUrl = page.url();

      // Only navigate if not already on the provider's site
      if (!currentUrl.includes(new URL(targetUrl).hostname)) {
        console.log(`[BrowserManager] Navigating to ${targetUrl} for warmup`);
        await page.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
      }

      this.setPageWarmed(provider);
      console.log(`[BrowserManager] Successfully warmed page for ${provider}`);

      // Bring the page to front after warming
      await this.switchToPage(provider);
    } catch (error) {
      console.error(
        `[BrowserManager] Failed to warm page for ${provider}:`,
        error,
      );
      // Don't throw - warming is best-effort
    }
  }

  // Switch to a provider's window (bring to front)
  async switchToPage(provider: LLMProvider): Promise<boolean> {
    const page = this.pages.get(provider);
    // Since we now have separate browsers/pages, switching basically requires touching the page
    if (!page || page.isClosed()) {
      console.log(`[BrowserManager] No page to switch to for ${provider}`);
      return false;
    }

    try {
      await page.bringToFront();
      console.log(`[BrowserManager] Switched to ${provider} tab`);
      return true;
    } catch (error) {
      console.error(`[BrowserManager] Failed to switch to ${provider}:`, error);
      return false;
    }
  }

  async injectCookies(
    provider: LLMProvider,
    cookies: CookieEntry[],
  ): Promise<void> {
    if (!cookies || cookies.length === 0) {
      console.log(`[BrowserManager] No cookies to inject for ${provider}`);
      return;
    }

    // Check if cookies already injected for this provider
    if (this.cookiesInjected.get(provider)) {
      console.log(
        `[BrowserManager] Cookies already injected for ${provider}, skipping`,
      );
      return;
    }

    const page = await this.getPage(provider);

    // Convert cookies to Puppeteer format, filtering out invalid values
    const puppeteerCookies = cookies
      .filter((cookie) => cookie.name && cookie.value && cookie.domain)
      .map((cookie) => {
        return {
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path || "/",
          expires: cookie.expires || Date.now() / 1000 + 86400 * 30, // 30 days default
          httpOnly: cookie.httpOnly ?? false,
          secure: cookie.secure ?? true,
          sameSite:
            cookie.sameSite &&
            ["Strict", "Lax", "None"].includes(cookie.sameSite as string)
              ? (cookie.sameSite as "Strict" | "Lax" | "None")
              : undefined,
        };
      });

    if (puppeteerCookies.length > 0) {
      // Debug: log cookie names and domains
      console.log(`[BrowserManager] Cookie details for ${provider}:`);
      puppeteerCookies.forEach((c) => {
        console.log(`  - ${c.name}: domain=${c.domain}, path=${c.path}`);
      });

      await page.setCookie(...puppeteerCookies);
      this.cookiesInjected.set(provider, true);
      console.log(
        `[BrowserManager] Injected ${cookies.length} cookies for ${provider}`,
      );
    }
  }

  async closePage(provider: LLMProvider): Promise<void> {
    const page = this.pages.get(provider);
    if (page) {
      if (!page.isClosed()) {
        try {
          await page.close();
        } catch (e) {
          // Ignore if already closed
        }
      }
      this.pages.delete(provider);
      this.cookiesInjected.delete(provider);
      this.pagesWarmed.delete(provider);
      console.log(`[BrowserManager] Closed tab for ${provider}`);
    }
  }

  async closeAll(): Promise<void> {
    // Close all pages
    const closePagePromises = Array.from(this.pages.values()).map((p) => {
      if (!p.isClosed()) return p.close().catch(() => {});
      return Promise.resolve();
    });
    await Promise.all(closePagePromises);

    this.pages.clear();
    this.cookiesInjected.clear();
    this.pagesWarmed.clear();

    // Close shared browser
    if (this.sharedBrowser && this.sharedBrowser.connected) {
      await this.sharedBrowser.close();
      console.log("[BrowserManager] Closed shared browser");
    }
    this.sharedBrowser = null;

    // Clean up data
    this.cleanSharedBrowserData();
    console.log("[BrowserManager] Cleaned shared browser data");
  }

  isPageOpen(provider: LLMProvider): boolean {
    const page = this.pages.get(provider);
    return page !== undefined && !page.isClosed();
  }

  private cleanSharedBrowserData() {
    const userDataDir = path.join(USER_DATA_ROOT, "shared");
    if (!fs.existsSync(userDataDir)) return;

    console.log(`[BrowserManager] Cleaning shared browser data...`);

    try {
      const items = fs.readdirSync(userDataDir);
      for (const item of items) {
        const itemPath = path.join(userDataDir, item);

        // Preserve 'Local Storage' directory, delete everything else
        if (item === "Local Storage") {
          continue;
        }

        const stat = fs.statSync(itemPath);

        if (item === "Default" && stat.isDirectory()) {
          // Go inside Default
          const defaultItems = fs.readdirSync(itemPath);
          for (const defaultItem of defaultItems) {
            const defaultItemPath = path.join(itemPath, defaultItem);
            if (defaultItem === "Local Storage") continue;
            fs.rmSync(defaultItemPath, { recursive: true, force: true });
          }
        } else {
          fs.rmSync(itemPath, { recursive: true, force: true });
        }
      }
      console.log(`[BrowserManager] Cleaned shared data`);
    } catch (error) {
      console.error(`[BrowserManager] Failed to clean shared data:`, error);
    }
  }

  // Execution Queue for enforcing strict sequential interaction
  private executionQueue: Promise<void> = Promise.resolve();

  /**
   * Execute a task for a provider ensuring it is the focused tab.
   * This queue strictly serializes all browser interactions to prevent race conditions
   * and ensuring that the active tab is always the one performing work.
   */
  async runTask<T>(provider: LLMProvider, task: () => Promise<T>): Promise<T> {
    // We implicitly chain onto the executionQueue
    const taskPromise = this.executionQueue.then(async () => {
      try {
        console.log(`[BrowserManager] Starting task for ${provider}`);

        // 1. Ensure the page is focused
        const switched = await this.switchToPage(provider);
        if (!switched) {
          console.warn(
            `[BrowserManager] Could not switch to ${provider}, task might fail`,
          );
        } else {
          // Small delay to let browser handle focus event
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // 2. Run the task
        return await task();
      } catch (error) {
        console.error(`[BrowserManager] Task error for ${provider}:`, error);
        throw error;
      }
    });

    // Update the queue tail, catching errors so the queue doesn't stall
    this.executionQueue = taskPromise.then(
      () => {},
      () => {},
    );

    return taskPromise;
  }
}

// Use global to persist across hot reloads in development
// Use global to persist across hot reloads in development
export const browserManager: BrowserManager =
  global.__browserManager_v3 ||
  (global.__browserManager_v3 = new BrowserManager());
