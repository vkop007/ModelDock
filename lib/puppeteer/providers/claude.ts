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

    // Wait for the streaming to complete (stop button disappears)
    await page.waitForFunction(
      () => {
        const stopButton = document.querySelector(
          'button[aria-label="Stop generating"], [data-testid="stop-button"]'
        );
        return !stopButton;
      },
      { timeout: 120000, polling: 500 }
    );

    // Small delay for content to render
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get the last assistant message
    const response = await page.evaluate(() => {
      const messages = document.querySelectorAll(
        '[data-testid="assistant-message"], .assistant-message'
      );
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        return lastMessage.textContent || "";
      }

      // Fallback: look for message containers
      const allMessages = document.querySelectorAll(".prose, .message-content");
      if (allMessages.length > 0) {
        const lastMessage = allMessages[allMessages.length - 1];
        return lastMessage.textContent || "";
      }

      return "";
    });

    return response;
  }
}
