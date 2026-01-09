import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";

export class GeminiProvider extends BaseProvider {
  constructor() {
    super("gemini", "https://gemini.google.com");
  }

  async checkAuthentication(page: Page): Promise<boolean> {
    try {
      // Check for presence of chat interface elements
      await page.waitForSelector(
        "rich-textarea, .ql-editor, [data-placeholder]",
        { timeout: 10000 }
      );
      return true;
    } catch {
      // Check for sign-in button
      const signInButton = await page.$(
        'a[href*="accounts.google.com"], button:has-text("Sign in")'
      );
      return !signInButton;
    }
  }

  async sendMessage(message: string): Promise<SendMessageResult> {
    try {
      const page = await this.getPage();
      await this.navigate();

      // Wait for the input field
      const inputSelector =
        'rich-textarea .ql-editor, .text-input-field, [contenteditable="true"]';
      await page.waitForSelector(inputSelector, { timeout: 30000 });

      // Focus and type the message
      const input = await page.$(inputSelector);
      if (!input) {
        return { success: false, error: "Could not find input field" };
      }

      await input.click();
      await page.keyboard.type(message, { delay: 30 });

      // Small delay before sending
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Click send button
      const sendButton = await page.$(
        'button[aria-label="Send message"], .send-button, mat-icon[data-mat-icon-name="send"]'
      );
      if (sendButton) {
        await sendButton.click();
      } else {
        // Try pressing Enter
        await page.keyboard.press("Enter");
      }

      // Wait for response
      const response = await this.waitForResponse();
      return { success: true, content: response };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async waitForResponse(): Promise<string> {
    const page = await this.getPage();

    // Wait for loading indicator to disappear
    await page.waitForFunction(
      () => {
        const loading = document.querySelector(
          '.loading-indicator, [aria-label="Loading"], .thinking-indicator'
        );
        return !loading;
      },
      { timeout: 120000, polling: 500 }
    );

    // Additional wait for content to fully render
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get the last response
    const response = await page.evaluate(() => {
      const responses = document.querySelectorAll(
        ".response-content, .model-response-text, message-content"
      );
      if (responses.length > 0) {
        const lastResponse = responses[responses.length - 1];
        return lastResponse.textContent || "";
      }

      // Fallback: look for formatted markdown content
      const markdown = document.querySelectorAll(
        ".markdown-content, .response-text"
      );
      if (markdown.length > 0) {
        return markdown[markdown.length - 1].textContent || "";
      }

      return "";
    });

    return response;
  }
}
