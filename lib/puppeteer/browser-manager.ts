import { connect } from "puppeteer-real-browser";
import { Browser, Page } from "puppeteer";
import { LLMProvider, CookieEntry } from "@/types";

// Global state to persist across Next.js hot reloads
declare global {
  // eslint-disable-next-line no-var
  var __browserManager: BrowserManager | undefined;
}

// Singleton browser manager using puppeteer-real-browser
// This library bypasses Cloudflare Turnstile and other bot detection
class BrowserManager {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private pages: Map<LLMProvider, Page> = new Map();
  private cookiesInjected: Map<LLMProvider, boolean> = new Map();
  private pagesWarmed: Set<LLMProvider> = new Set(); // Track pre-warmed pages
  private initializing: Promise<{ browser: Browser; page: Page }> | null = null;

  async getBrowser(): Promise<Browser> {
    // Check if browser is still connected
    if (this.browser) {
      try {
        // Test if browser is still responsive
        if (this.browser.connected) {
          console.log("[BrowserManager] Reusing existing browser");
          return this.browser;
        }
      } catch {
        // Browser disconnected, need to reinitialize
        console.log("[BrowserManager] Browser disconnected, reinitializing...");
        this.browser = null;
        this.page = null;
        this.pages.clear();
        this.cookiesInjected.clear();
      }
    }

    // Prevent multiple simultaneous initialization
    if (this.initializing) {
      console.log("[BrowserManager] Waiting for existing initialization...");
      const result = await this.initializing;
      return result.browser;
    }

    this.initializing = this.initBrowser();
    try {
      const result = await this.initializing;
      this.browser = result.browser;
      this.page = result.page;
      return this.browser;
    } finally {
      this.initializing = null;
    }
  }

  private async initBrowser(): Promise<{ browser: Browser; page: Page }> {
    console.log("[BrowserManager] Initializing puppeteer-real-browser...");

    const response = await connect({
      headless: false, // Use visible browser for reliability (hidden via AppleScript)
      turnstile: true, // Auto-solve Cloudflare Turnstile
      disableXvfb: true, // Disable virtual display on macOS
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=390,844", // Mobile viewport size (iPhone 14)
        "--disable-blink-features=AutomationControlled",
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

    console.log(
      "[BrowserManager] Browser launched with Cloudflare bypass enabled"
    );
    return {
      browser: response.browser as unknown as Browser,
      page: response.page as unknown as Page,
    };
  }

  async getPage(provider: LLMProvider): Promise<Page> {
    let page = this.pages.get(provider);

    // Check if existing page is still valid
    if (page) {
      try {
        if (!page.isClosed()) {
          console.log(`[BrowserManager] Reusing existing page for ${provider}`);
          return page;
        }
      } catch {
        // Page is invalid, remove it
        this.pages.delete(provider);
        this.cookiesInjected.delete(provider);
      }
    }

    const browser = await this.getBrowser();

    // Use the default page for the first provider, create new pages for others
    if (this.page && !this.page.isClosed() && this.pages.size === 0) {
      page = this.page;
      console.log(`[BrowserManager] Using default page for ${provider}`);
    } else {
      page = await browser.newPage();
      console.log(`[BrowserManager] Created new page for ${provider}`);
    }

    // Set mobile viewport and user agent for faster loading
    await page.setViewport({
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    await page.setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );

    // Block unnecessary resources for faster loading
    await page.setRequestInterception(true);
    page.on("request", (request) => {
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
        request.continue();
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
        request.abort();
      } else {
        request.continue();
      }
    });

    this.pages.set(provider, page);

    return page;
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
    cookies?: CookieEntry[]
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
        grok: "https://x.com/i/grok",
        qwen: "https://chat.qwenlm.ai",
        mistral: "https://chat.mistral.ai",
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
        error
      );
      // Don't throw - warming is best-effort
    }
  }

  // Switch to a provider's tab (bring to front)
  async switchToPage(provider: LLMProvider): Promise<boolean> {
    const page = this.pages.get(provider);
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
    cookies: CookieEntry[]
  ): Promise<void> {
    if (!cookies || cookies.length === 0) {
      console.log(`[BrowserManager] No cookies to inject for ${provider}`);
      return;
    }

    // Check if cookies already injected for this provider
    if (this.cookiesInjected.get(provider)) {
      console.log(
        `[BrowserManager] Cookies already injected for ${provider}, skipping`
      );
      return;
    }

    const page = await this.getPage(provider);

    // Convert cookies to Puppeteer format, filtering out invalid values
    const puppeteerCookies = cookies
      .filter((cookie) => cookie.name && cookie.value && cookie.domain)
      .map((cookie) => {
        const puppeteerCookie: {
          name: string;
          value: string;
          domain: string;
          path: string;
          expires: number;
          httpOnly: boolean;
          secure: boolean;
          sameSite?: "Strict" | "Lax" | "None";
        } = {
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path || "/",
          expires: cookie.expires || Date.now() / 1000 + 86400 * 30, // 30 days default
          httpOnly: cookie.httpOnly ?? false,
          secure: cookie.secure ?? true,
        };

        // Only add sameSite if it's a valid string value
        if (
          cookie.sameSite &&
          typeof cookie.sameSite === "string" &&
          ["Strict", "Lax", "None"].includes(cookie.sameSite)
        ) {
          puppeteerCookie.sameSite = cookie.sameSite;
        }

        return puppeteerCookie;
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
        `[BrowserManager] Injected ${cookies.length} cookies for ${provider}`
      );
    }
  }

  async closePage(provider: LLMProvider): Promise<void> {
    const page = this.pages.get(provider);
    if (page && !page.isClosed()) {
      await page.close();
      this.pages.delete(provider);
      this.cookiesInjected.delete(provider);
      console.log(`[BrowserManager] Closed page for ${provider}`);
    }
  }

  async closeAll(): Promise<void> {
    for (const [provider, page] of this.pages) {
      if (!page.isClosed()) {
        await page.close();
      }
      this.pages.delete(provider);
    }
    this.cookiesInjected.clear();

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log("[BrowserManager] Browser closed");
    }
  }

  isPageOpen(provider: LLMProvider): boolean {
    const page = this.pages.get(provider);
    return page !== undefined && !page.isClosed();
  }
}

// Use global to persist across hot reloads in development
export const browserManager: BrowserManager =
  global.__browserManager || (global.__browserManager = new BrowserManager());
