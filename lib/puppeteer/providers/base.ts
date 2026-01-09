import { Page } from "puppeteer";
import { LLMProvider, CookieEntry } from "@/types";
import { browserManager } from "../browser-manager";

export interface SendMessageResult {
  success: boolean;
  content?: string;
  error?: string;
}

export abstract class BaseProvider {
  protected provider: LLMProvider;
  protected url: string;

  constructor(provider: LLMProvider, url: string) {
    this.provider = provider;
    this.url = url;
  }

  async getPage(): Promise<Page> {
    return browserManager.getPage(this.provider);
  }

  async injectCookies(cookies: CookieEntry[]): Promise<void> {
    await browserManager.injectCookies(this.provider, cookies);
  }

  async navigate(): Promise<void> {
    const page = await this.getPage();
    const currentUrl = page.url();

    if (!currentUrl.includes(new URL(this.url).hostname)) {
      console.log(`[${this.provider}] Navigating to ${this.url}`);
      await page.goto(this.url, { waitUntil: "networkidle2", timeout: 60000 });
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const page = await this.getPage();
    await this.navigate();

    // Each provider should override this with specific checks
    return this.checkAuthentication(page);
  }

  // Abstract methods to be implemented by each provider
  abstract checkAuthentication(page: Page): Promise<boolean>;
  abstract sendMessage(message: string): Promise<SendMessageResult>;
  abstract waitForResponse(): Promise<string>;

  async close(): Promise<void> {
    await browserManager.closePage(this.provider);
  }
}
