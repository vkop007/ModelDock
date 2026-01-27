import { connect } from "puppeteer-real-browser";
import { Browser, Page } from "puppeteer";
import { LLMProvider, CookieEntry } from "@/types";
import path from "path";
import fs from "fs";

const USER_DATA_ROOT = path.join(process.cwd(), ".browser-data");

// Global state to persist across Next.js hot reloads
declare global {
  // eslint-disable-next-line no-var
  var __browserManager: BrowserManager | undefined;
}

class BrowserManager {
  private browsers: Map<LLMProvider, Browser> = new Map();
  private pages: Map<LLMProvider, Page> = new Map();
  private cookiesInjected: Map<LLMProvider, boolean> = new Map();
  private pagesWarmed: Set<LLMProvider> = new Set(); // Track pre-warmed pages
  private initializing: Map<
    LLMProvider,
    Promise<{ browser: Browser; page: Page }>
  > = new Map();

  async getBrowser(provider: LLMProvider): Promise<Browser> {
    const existingBrowser = this.browsers.get(provider);

    // Check if browser is still connected
    if (existingBrowser) {
      try {
        // Test if browser is still responsive
        if (existingBrowser.connected) {
          console.log(
            `[BrowserManager] Reusing existing browser for ${provider}`,
          );
          return existingBrowser;
        }
      } catch {
        // Browser disconnected, clean up
        console.log(
          `[BrowserManager] Browser for ${provider} disconnected, reinitializing...`,
        );
        this.browsers.delete(provider);
        this.pages.delete(provider);
        this.cookiesInjected.delete(provider);
      }
    }

    // Prevent multiple simultaneous initialization for the same provider
    const activeInit = this.initializing.get(provider);
    if (activeInit) {
      console.log(
        `[BrowserManager] Waiting for existing initialization for ${provider}...`,
      );
      const result = await activeInit;
      return result.browser;
    }

    const initPromise = this.initBrowser(provider);
    this.initializing.set(provider, initPromise);

    try {
      const result = await initPromise;
      this.browsers.set(provider, result.browser);
      this.pages.set(provider, result.page); // Store the initial page created with the browser
      return result.browser;
    } finally {
      this.initializing.delete(provider);
    }
  }

  private async initBrowser(
    provider: LLMProvider,
  ): Promise<{ browser: Browser; page: Page }> {
    console.log(
      `[BrowserManager] Initializing new browser window for ${provider}...`,
    );

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
    this.cleanBrowserData(provider);

    const userDataDir = path.join(USER_DATA_ROOT, provider);
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
        "--window-size=390,844", // Mobile viewport size (iPhone 14)
        "--disable-blink-features=AutomationControlled",
        `--user-data-dir=${userDataDir}`,
      ],
      connectOption: {
        defaultViewport: {
          width: 390,
          height: 844,
          isMobile: true,
          hasTouch: true,
        },
        slowMo: 20,
      },
    });

    console.log(`[BrowserManager] Browser launched for ${provider}`);
    console.log(
      `[BrowserManager] Browser launched on ${process.platform} with Cloudflare bypass enabled`,
    );
    return {
      browser: response.browser as unknown as Browser,
      page: response.page as unknown as Page,
    };
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

    // This will trigger initBrowser if needed
    const browser = await this.getBrowser(provider);

    // Retrieve the page...
    let newPage = this.pages.get(provider);

    // If browser exists but page doesn't (e.g. it was closed manually or invalid), create a new one
    if (!newPage || newPage.isClosed()) {
      console.log(
        `[BrowserManager] Creating new page for existing browser ${provider}`,
      );
      newPage = await browser.newPage();
      this.pages.set(provider, newPage);
    }

    if (!newPage) {
      throw new Error(`Failed to initialize page for ${provider}`);
    }

    // Set mobile viewport and user agent (idempotent, harmless to redo)
    await newPage.setViewport({
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    await newPage.setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );

    // Block unnecessary resources for faster loading
    await newPage.setRequestInterception(true);
    newPage.removeAllListeners("request"); // Avoid duplicate listeners
    newPage.on("request", (request) => {
      const resourceType = request.resourceType();
      const url = request.url();

      // Always allow essential requests (API calls, documents)
      if (
        resourceType === "document" ||
        resourceType === "xhr" ||
        resourceType === "fetch" ||
        resourceType === "websocket" ||
        url.includes("/api/") ||
        url.includes("completion") ||
        url.includes("chat") ||
        url.includes("conversation")
      ) {
        if (!request.isInterceptResolutionHandled()) request.continue();
        return;
      }

      // Block non-essential resources (but keep stylesheets for proper UI)
      const shouldBlock =
        // Block heavy resources (but NOT stylesheets - needed for UI)
        resourceType === "image" ||
        resourceType === "font" ||
        resourceType === "media" ||
        // Block analytics and tracking
        url.includes("analytics") ||
        url.includes("tracking") ||
        url.includes("gtag") ||
        url.includes("gtm.js") ||
        url.includes("facebook") ||
        url.includes("hotjar") ||
        url.includes("sentry") ||
        url.includes("datadog") ||
        url.includes("segment") ||
        url.includes("mixpanel") ||
        url.includes("amplitude") ||
        url.includes("intercom") ||
        url.includes("crisp") ||
        url.includes("zendesk") ||
        url.includes("googletagmanager") ||
        url.includes("googlesyndication") ||
        url.includes("doubleclick") ||
        // Block ads
        url.includes("/ads") ||
        url.includes("adservice") ||
        // Block prefetch/preload that slows things down
        resourceType === "prefetch" ||
        resourceType === "preflight";

      if (shouldBlock) {
        if (!request.isInterceptResolutionHandled()) request.abort();
      } else {
        if (!request.isInterceptResolutionHandled()) request.continue();
      }
    });

    return newPage;
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
    const browser = this.browsers.get(provider);
    if (browser) {
      await browser.close();
      this.browsers.delete(provider);
      this.pages.delete(provider);
      this.cookiesInjected.delete(provider);
      this.pagesWarmed.delete(provider); // Also clear warmed status
      console.log(`[BrowserManager] Closed browser for ${provider}`);

      // Clean up data after closing to save space
      this.cleanBrowserData(provider);
    }
  }

  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.browsers.values()).map((b) =>
      b.close(),
    );
    await Promise.all(closePromises);

    this.browsers.clear();
    this.pages.clear();
    this.cookiesInjected.clear();
    this.pagesWarmed.clear();

    // Clean up all data directories
    const providers = Object.keys(this.browsers) as LLMProvider[];
    providers.forEach((p) => this.cleanBrowserData(p));

    console.log("[BrowserManager] All browsers closed and data cleaned");
  }

  isPageOpen(provider: LLMProvider): boolean {
    const page = this.pages.get(provider);
    return page !== undefined && !page.isClosed();
  }

  private cleanBrowserData(provider: LLMProvider) {
    const userDataDir = path.join(USER_DATA_ROOT, provider);
    if (!fs.existsSync(userDataDir)) return;

    console.log(`[BrowserManager] Cleaning data for ${provider}...`);

    try {
      const items = fs.readdirSync(userDataDir);
      for (const item of items) {
        const itemPath = path.join(userDataDir, item);
        // Preserve 'Local Storage' directory, delete everything else
        if (item === "Local Storage") {
          continue;
        }

        // Also strictly preserve 'Default/Local Storage' if the structure is nested (Chrome default)
        // Usually it's in Default/Local Storage but with custom userDataDir it might be at root or Default
        // Let's be safer: Only delete known cache directories or delete everything EXCEPT Local Storage

        // Strategy: Delete specific cache folders to be safe, or everything else?
        // User asked for "Fresh" state. "only local storage data will be persistant"
        // Chrome structure:
        // User Data/
        //   Default/
        //     Local Storage/
        //     Cache/
        //     Code Cache/
        //     Service Worker/

        // We are setting --user-data-dir to `userDataDir`.
        // Chrome usually creates a 'Default' profile inside, or uses the root if it's a specific profile dir.
        // Actually for puppeteer connect/launch with user-data-dir:
        // It uses that dir as the User Data Directory. Inside it, there will be 'Default' (or 'Profile X').

        // Let's do a recursive check? No, simple strings first.

        // If we delete 'Default', we lose Local Storage inside it.
        // We need to look INSIDE Default if it exists.

        const stat = fs.statSync(itemPath);

        if (item === "Default" && stat.isDirectory()) {
          // Go inside Default
          const defaultItems = fs.readdirSync(itemPath);
          for (const defaultItem of defaultItems) {
            const defaultItemPath = path.join(itemPath, defaultItem);
            if (defaultItem === "Local Storage") continue;
            // Keep Preferences? existing cookies? User said "when close data all data or caches removed except local storage"
            // So maybe keep just Local Storage.

            // If we delete 'Cookies', we lose cookies. User said "Cookies (injected by the app)" can persist or be re-injected.
            // Plan said: "Only Local Storage and Cookies (injected by the app) will persist."
            // Re-injection happens in warmPage.

            fs.rmSync(defaultItemPath, { recursive: true, force: true });
          }
        } else {
          // If it's not Default, it's likely safe to delete (Safe Browsing, etc),
          // UNLESS the structure is flat (headless sometimes flat? no usually adheres to chrome)
          fs.rmSync(itemPath, { recursive: true, force: true });
        }
      }
      console.log(`[BrowserManager] Cleaned data for ${provider}`);
    } catch (error) {
      console.error(
        `[BrowserManager] Failed to clean data for ${provider}:`,
        error,
      );
    }
  }
}

// Use global to persist across hot reloads in development
export const browserManager: BrowserManager =
  global.__browserManager || (global.__browserManager = new BrowserManager());
