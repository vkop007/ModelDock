import { connect } from "puppeteer-real-browser";
import { Browser, Page } from "puppeteer";
import { LLMProvider, CookieEntry } from "@/types";

// Singleton browser manager using puppeteer-real-browser
// This library bypasses Cloudflare Turnstile and other bot detection
class BrowserManager {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private pages: Map<LLMProvider, Page> = new Map();
  private initializing: Promise<{ browser: Browser; page: Page }> | null = null;

  async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    // Prevent multiple simultaneous initialization
    if (this.initializing) {
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
      headless: false, // Run in headless mode (Cloudflare bypass working)
      turnstile: true, // Auto-solve Cloudflare Turnstile
      fingerprint: true, // Use unique fingerprint
      disableXvfb: true, // Disable virtual display on macOS
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=1280,800",
      ],
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

    if (page && !page.isClosed()) {
      return page;
    }

    const browser = await this.getBrowser();

    // Use the default page for the first provider, create new pages for others
    if (this.page && !this.page.isClosed() && this.pages.size === 0) {
      page = this.page;
    } else {
      page = await browser.newPage();
    }

    // Set viewport
    await page.setViewport({ width: 1280, height: 800 });

    this.pages.set(provider, page);
    console.log(`[BrowserManager] Created page for ${provider}`);

    return page;
  }

  async injectCookies(
    provider: LLMProvider,
    cookies: CookieEntry[]
  ): Promise<void> {
    if (!cookies || cookies.length === 0) {
      console.log(`[BrowserManager] No cookies to inject for ${provider}`);
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
      await page.setCookie(...puppeteerCookies);
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

// Export singleton instance
export const browserManager = new BrowserManager();
