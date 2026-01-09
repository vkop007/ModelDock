import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";

export class GrokProvider extends BaseProvider {
  constructor() {
    super("grok", "https://grok.com/");
  }

  async checkAuthentication(page: Page): Promise<boolean> {
    try {
      // Check for presence of chat interface elements
      await page.waitForSelector('textarea, [contenteditable="true"]', {
        timeout: 10000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async sendMessage(message: string): Promise<SendMessageResult> {
    const result = await this.sendMessageWithStreaming(message, () => {});
    return {
      success: result.success,
      content: result.content,
      error: result.error,
      conversationId: result.conversationId,
    };
  }

  async sendMessageWithStreaming(
    message: string,
    onChunk: (chunk: string) => void,
    conversationId?: string
  ): Promise<SendMessageResult> {
    try {
      const page = await this.getPage();

      // Navigation logic
      const currentUrl = page.url();

      if (conversationId) {
        // Navigate to existing conversation if not already there
        if (!currentUrl.includes(`/c/${conversationId}`)) {
          console.log(`[Grok] Navigating to conversation: ${conversationId}`);
          await page.goto(`https://grok.com/c/${conversationId}`, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } else {
        // New chat - navigate to base URL for fresh conversation
        if (currentUrl.includes("/c/")) {
          console.log("[Grok] Starting new chat...");
          await page.goto("https://grok.com/", {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else if (!currentUrl.includes("grok.com")) {
          console.log("[Grok] Navigating to Grok...");
          await this.navigate();
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      console.log("[Grok] Checking page state...");
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Wait for the input field - Grok uses textarea
      const inputSelector = "textarea";
      await page.waitForSelector(inputSelector, { timeout: 30000 });

      // Focus and type the message
      const input = await page.$(inputSelector);
      if (!input) {
        return { success: false, error: "Could not find input field" };
      }

      await input.click();
      await page.keyboard.type(message, { delay: 10 });

      // Count existing responses BEFORE clicking send
      // Grok uses .response-content-markdown for AI responses
      const previousResponseCount = await page.evaluate(() => {
        const responses = document.querySelectorAll(
          ".response-content-markdown"
        );
        return responses.length;
      });

      // Click send button or press Enter
      // Grok uses a button with aria-label or type submit
      const sendButton = await page.$(
        'button[type="submit"], button[aria-label*="Send"]'
      );
      if (sendButton) {
        await sendButton.click();
      } else {
        await page.keyboard.press("Enter");
      }

      console.log("[Grok] Waiting for streaming to complete...");

      // Wait for a NEW response to appear
      try {
        await page.waitForFunction(
          (prevCount: number) => {
            const responses = document.querySelectorAll(
              ".response-content-markdown"
            );
            return responses.length > prevCount;
          },
          { timeout: 15000 },
          previousResponseCount
        );
      } catch {
        // Continue, might be slow
      }

      let lastContent = "";
      let stableCount = 0;
      const maxWait = 180000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Check for stop button or regenerate button (indicates generation state)
        const isGenerating = await page.evaluate(() => {
          const stopBtn = document.querySelector(
            'button[aria-label*="Stop"], button[aria-label*="Cancel"]'
          );
          return stopBtn !== null;
        });

        // Get the NEW response only - using .response-content-markdown
        const currentResponse = await page.evaluate((prevCount: number) => {
          const responses = document.querySelectorAll(
            ".response-content-markdown"
          );
          if (responses.length > prevCount) {
            // Get the last (newest) response
            const lastResponse = responses[responses.length - 1];
            return lastResponse?.textContent || "";
          }
          return "";
        }, previousResponseCount);

        // Streaming update
        if (currentResponse.length > lastContent.length) {
          const chunk = currentResponse.substring(lastContent.length);
          onChunk(chunk);
          lastContent = currentResponse;
          if (isGenerating) stableCount = 0;
        }

        if (isGenerating) {
          continue;
        }

        if (
          currentResponse.length === lastContent.length &&
          currentResponse.length > 0
        ) {
          stableCount++;
          if (stableCount >= 10) {
            break;
          }
        } else {
          stableCount = 0;
          lastContent = currentResponse;
        }
      }

      // Extract Conversation ID from URL
      // URL pattern: https://grok.com/c/<id>
      const finalUrl = page.url();
      const match = finalUrl.match(/\/c\/([a-zA-Z0-9_-]+)/);
      const newConversationId = match ? match[1] : undefined;

      console.log(`[Grok] Done. ID: ${newConversationId}`);

      return {
        success: true,
        content: lastContent,
        conversationId: newConversationId,
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async waitForResponse(): Promise<string> {
    const page = await this.getPage();
    console.log("[Grok] Waiting for response...");

    let lastLength = 0;
    let stableCount = 0;
    const maxWait = 180000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const isGenerating = await page.evaluate(() => {
        const stopBtn = document.querySelector('button[aria-label*="Stop"]');
        return stopBtn !== null;
      });

      if (isGenerating) {
        stableCount = 0;
        continue;
      }

      const currentResponse = await page.evaluate(() => {
        const responses = document.querySelectorAll(
          ".response-content-markdown"
        );
        if (responses.length > 0) {
          return responses[responses.length - 1].textContent || "";
        }
        return "";
      });

      if (currentResponse.length === lastLength && currentResponse.length > 0) {
        stableCount++;
        if (stableCount >= 4) {
          break;
        }
      } else {
        stableCount = 0;
        lastLength = currentResponse.length;
      }
    }

    const response = await page.evaluate(() => {
      const responses = document.querySelectorAll(".response-content-markdown");
      if (responses.length > 0) {
        return responses[responses.length - 1].textContent || "";
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
