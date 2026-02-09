import { connect } from "puppeteer-real-browser";
import { Browser, Page } from "puppeteer";
import { LLMProvider, CookieEntry } from "@/types";
import path from "path";
import fs from "fs";

const USER_DATA_ROOT = path.join(process.cwd(), ".browser-data");

export const PROVIDER_URLS: Record<LLMProvider, string> = {
  chatgpt: "https://chatgpt.com",
  claude: "https://claude.ai",
  gemini: "https://gemini.google.com",
  zai: "https://chat.z.ai",
  grok: "https://grok.com",
  qwen: "https://chat.qwenlm.ai",
  mistral: "https://chat.mistral.ai",
  ollama: "http://localhost:11434",
};

declare global {
  var __browserManager_v3: BrowserManager | undefined;
}

class BrowserManager {
  private sharedBrowser: Browser | null = null;
  private pages: Map<LLMProvider, Page> = new Map();
  private pendingPages: Map<LLMProvider, Promise<Page>> = new Map();
  private cookiesInjected: Map<LLMProvider, boolean> = new Map();
  private pagesWarmed: Set<LLMProvider> = new Set();
  private initializing: Promise<Browser> | null = null;
  private activeProvider: LLMProvider | null = null;

  async getBrowser(): Promise<Browser> {
    if (this.sharedBrowser) {
      if (this.sharedBrowser.connected) {
        return this.sharedBrowser;
      }
      console.log(
        `[BrowserManager] Shared browser disconnected, reinitializing...`,
      );
      this.sharedBrowser = null;
      this.pages.clear();
      this.cookiesInjected.clear();
      this.pagesWarmed.clear();
      this.activeProvider = null;
    }

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

    this.cleanSharedBrowserData();

    const userDataDir = path.join(USER_DATA_ROOT, "shared");
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
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=CalculateNativeWinOcclusion,IsolateOrigins,site-per-process",
        "--disable-site-isolation-trials",
        "--disable-gpu", // Performance Optimization
        "--disable-background-networking", // Performance Optimization
        "--no-zygote", // Performance Optimization
        "--disable-extensions", // Performance Optimization
        '--js-flags="--max-old-space-size=512"', // Performance Optimization: Limit V8 heap
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

    if (page) {
      try {
        if (!page.isClosed()) {
          if (page.browser().connected) {
            console.log(
              `[BrowserManager] Reusing existing page for ${provider}`,
            );
            return page;
          }
        }
      } catch {}
      this.pages.delete(provider);
      this.cookiesInjected.delete(provider);
    }

    if (this.pendingPages.has(provider)) {
      console.log(
        `[BrowserManager] Waiting for pending page creation for ${provider}...`,
      );
      return this.pendingPages.get(provider)!;
    }

    const browserPromise = this.getBrowser();

    const pagePromise = (async () => {
      const browser = await browserPromise;

      const existingPage = this.pages.get(provider);
      if (existingPage && !existingPage.isClosed()) {
        return existingPage;
      }
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

      // Performance Optimization: Block non-essential resources
      await newPage.setRequestInterception(true);
      newPage.on("request", (request) => {
        const resourceType = request.resourceType();
        if (["image", "font", "media"].includes(resourceType)) {
          request.abort();
        } else {
          request.continue();
        }
      });

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
    options?: { preventSwitch?: boolean },
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
      const targetUrl = PROVIDER_URLS[provider];
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

      // Bring the page to front after warming (unless prevented)
      if (!options?.preventSwitch) {
        await this.switchToPage(provider);
      }
    } catch (error) {
      console.error(
        `[BrowserManager] Failed to warm page for ${provider}:`,
        error,
      );
    }
  }

  // Switch to a provider's window (bring to front)
  async switchToPage(provider: LLMProvider): Promise<boolean> {
    const page = this.pages.get(provider);
    if (!page || page.isClosed()) {
      console.log(`[BrowserManager] No page to switch to for ${provider}`);
      this.activeProvider =
        this.activeProvider === provider ? null : this.activeProvider;
      return false;
    }

    try {
      // Removing optimization as it causes desync issues when browser auto-focuses new tabs
      // if (this.activeProvider === provider) {
      //   return true;
      // }

      await page.bringToFront();
      this.activeProvider = provider;
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

    if (this.cookiesInjected.get(provider)) {
      console.log(
        `[BrowserManager] Cookies already injected for ${provider}, skipping`,
      );
      return;
    }

    const page = await this.getPage(provider);

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
      console.log(`[BrowserManager] Cookie details for ${provider}:`);
      puppeteerCookies.forEach((c) => {
        console.log(`  - ${c.name}: domain=${c.domain}, path=${c.path}`);
      });

      await page.setCookie(...puppeteerCookies);
      this.cookiesInjected.set(provider, true);
      console.log(
        `[BrowserManager] Injected ${cookies.length} cookies for ${provider}`,
      );

      try {
        console.log(
          `[BrowserManager] Reloading page for ${provider} to apply cookies...`,
        );
        await page.reload({ waitUntil: "domcontentloaded" });
      } catch (e) {
        console.error(`[BrowserManager] Reload failed: ${e}`);
      }
    }
  }

  async closePage(provider: LLMProvider): Promise<void> {
    const page = this.pages.get(provider);
    if (page) {
      if (!page.isClosed()) {
        try {
          await page.close();
        } catch (e) {}
      }
      this.pages.delete(provider);
      this.cookiesInjected.delete(provider);
      this.pagesWarmed.delete(provider);
      console.log(`[BrowserManager] Closed tab for ${provider}`);
    }
  }

  async closeAll(): Promise<void> {
    const closePagePromises = Array.from(this.pages.values()).map((p) => {
      if (!p.isClosed()) return p.close().catch(() => {});
      return Promise.resolve();
    });
    await Promise.all(closePagePromises);

    this.pages.clear();
    this.cookiesInjected.clear();
    this.pagesWarmed.clear();
    this.activeProvider = null;

    if (this.sharedBrowser && this.sharedBrowser.connected) {
      await this.sharedBrowser.close();
      console.log("[BrowserManager] Closed shared browser");
    }
    this.sharedBrowser = null;

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
        if (item === "Local Storage") {
          continue;
        }

        // Handle race condition where file may be deleted between readdir and stat
        let stat;
        try {
          stat = fs.statSync(itemPath);
        } catch (e: unknown) {
          // File was deleted between readdir and stat, skip it
          if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw e;
        }

        if (item === "Default" && stat.isDirectory()) {
          const defaultItems = fs.readdirSync(itemPath);
          for (const defaultItem of defaultItems) {
            const defaultItemPath = path.join(itemPath, defaultItem);
            if (defaultItem === "Local Storage") continue;
            try {
              fs.rmSync(defaultItemPath, { recursive: true, force: true });
            } catch (e: unknown) {
              if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
            }
          }
        } else {
          try {
            fs.rmSync(itemPath, { recursive: true, force: true });
          } catch (e: unknown) {
            if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
          }
        }
      }
      console.log(`[BrowserManager] Cleaned shared data`);
    } catch (error) {
      // Log but don't throw - cleaning is best effort
      console.warn(`[BrowserManager] Warning during cleanup:`, error);
    }
  }

  private executionQueue: Promise<void> = Promise.resolve();

  async runTask<T>(
    provider: LLMProvider,
    task: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(new Error("AbortError"));
    }

    const previousTaskPromise = this.executionQueue;

    const currentTaskPromise = (async () => {
      await previousTaskPromise.catch(() => {});

      if (signal?.aborted) {
        throw new Error("AbortError");
      }

      console.log(`[BrowserManager] Starting task for ${provider}`);

      try {
        const switched = await this.switchToPage(provider);
        if (!switched) {
          console.warn(
            `[BrowserManager] Could not switch to ${provider}, task might fail`,
          );
        } else {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        if (signal?.aborted) {
          throw new Error("AbortError");
        }

        const result = await task();
        return result;
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === "AbortError" || error.message === "AbortError")
        ) {
          console.log(`[BrowserManager] Task for ${provider} aborted`);
        } else {
          console.error(`[BrowserManager] Task error for ${provider}:`, error);
        }
        throw error;
      }
    })();

    // Update the queue tail prevents stalling
    this.executionQueue = currentTaskPromise.then(
      () => {},
      () => {},
    );

    return currentTaskPromise;
  }
}

export const browserManager: BrowserManager =
  global.__browserManager_v3 ||
  (global.__browserManager_v3 = new BrowserManager());
