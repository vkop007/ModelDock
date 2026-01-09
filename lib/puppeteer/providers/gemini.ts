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

    console.log("[Gemini] Waiting for response to start streaming...");

    // Wait for any likely response container or loading indicator
    try {
      await page.waitForSelector(
        ".response-content, .model-response-text, message-content, .loading-indicator",
        { timeout: 15000 }
      );
    } catch {
      // Continue, might be already there
    }

    console.log("[Gemini] Waiting for streaming to complete...");

    let lastLength = 0;
    let stableCount = 0;
    const maxWait = 180000; // 3 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check for stop button
      const isGenerating = await page.evaluate(() => {
        const stopBtn = document.querySelector(
          'button[aria-label="Stop response"], button[aria-label="Stop generating"], [data-testid="stop-button"]'
        );
        // Also check for loading indicators
        const loading = document.querySelector(
          '.loading-indicator, [aria-label="Loading"], .thinking-indicator'
        );
        return stopBtn !== null || loading !== null;
      });

      if (isGenerating) {
        stableCount = 0;
        continue;
      }

      // Check content stability
      const currentResponse = await page.evaluate(() => {
        const responses = document.querySelectorAll(
          ".response-content, .model-response-text, message-content"
        );
        if (responses.length > 0) {
          return responses[responses.length - 1].textContent || "";
        }
        // Fallback
        const markdown = document.querySelectorAll(
          ".markdown-content, .response-text"
        );
        if (markdown.length > 0) {
          return markdown[markdown.length - 1].textContent || "";
        }
        return "";
      });

      if (currentResponse.length === lastLength && currentResponse.length > 0) {
        stableCount++;
        if (stableCount >= 4) {
          // 2 seconds stable
          console.log("[Gemini] Response stable and generation stopped.");
          break;
        }
      } else {
        stableCount = 0;
        lastLength = currentResponse.length;
      }
    }

    // Small delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get final response
    const response = await page.evaluate(() => {
      const responses = document.querySelectorAll(
        ".response-content, .model-response-text, message-content"
      );
      if (responses.length > 0) {
        return responses[responses.length - 1].textContent || "";
      }
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
  async deleteConversation(conversationId: string): Promise<boolean> {
    console.log(`[${this.provider}] Delete conversation not implemented.`);
    return false;
  }
}
