import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";

export class ClaudeProvider extends BaseProvider {
  constructor() {
    super("claude", "https://claude.ai");
  }

  async checkAuthentication(page: Page): Promise<boolean> {
    try {
      // Check for presence of chat interface elements
      await page.waitForSelector(
        '[data-testid="composer-input"], div[contenteditable="true"]',
        { timeout: 10000 }
      );
      return true;
    } catch {
      // Check for login elements
      const loginElement = await page.$(
        'button:has-text("Log in"), a:has-text("Sign in")'
      );
      return !loginElement;
    }
  }

  async sendMessage(message: string): Promise<SendMessageResult> {
    try {
      const page = await this.getPage();
      await this.navigate();

      // Wait for the input field
      const inputSelector =
        '[data-testid="composer-input"], div[contenteditable="true"].ProseMirror';
      await page.waitForSelector(inputSelector, { timeout: 30000 });

      // Focus and type the message
      const input = await page.$(inputSelector);
      if (!input) {
        return { success: false, error: "Could not find input field" };
      }

      await input.click();
      await page.keyboard.type(message, { delay: 30 });

      // Click send button or press Enter
      const sendButton = await page.$(
        '[data-testid="submit-button"], button[aria-label="Send message"]'
      );
      if (sendButton) {
        await sendButton.click();
      } else {
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
    console.log("[Claude] Waiting for response to stream...");

    // Wait for initial response
    try {
      await page.waitForSelector(
        '[data-testid="assistant-message"], .assistant-message',
        { timeout: 15000 }
      );
    } catch {
      // Continue
    }

    console.log("[Claude] Waiting for streaming to complete...");

    let lastLength = 0;
    let stableCount = 0;
    const maxWait = 180000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check for stop button
      const isGenerating = await page.evaluate(() => {
        const stopBtn = document.querySelector(
          'button[aria-label="Stop generating"], [data-testid="stop-button"]'
        );
        return stopBtn !== null;
      });

      if (isGenerating) {
        stableCount = 0;
        continue;
      }

      // Check content stability
      const currentResponse = await page.evaluate(() => {
        const messages = document.querySelectorAll(
          '[data-testid="assistant-message"], .assistant-message'
        );
        if (messages.length > 0) {
          return messages[messages.length - 1].textContent || "";
        }
        return "";
      });

      if (currentResponse.length === lastLength && currentResponse.length > 0) {
        stableCount++;
        if (stableCount >= 4) {
          console.log("[Claude] Response stable and generation stopped.");
          break;
        }
      } else {
        stableCount = 0;
        lastLength = currentResponse.length;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const response = await page.evaluate(() => {
      const messages = document.querySelectorAll(
        '[data-testid="assistant-message"], .assistant-message'
      );
      if (messages.length > 0) {
        return messages[messages.length - 1].textContent || "";
      }
      const allMessages = document.querySelectorAll(".prose, .message-content");
      if (allMessages.length > 0) {
        return allMessages[allMessages.length - 1].textContent || "";
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
