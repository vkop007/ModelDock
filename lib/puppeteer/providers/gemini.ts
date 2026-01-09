import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";

export class GeminiProvider extends BaseProvider {
  constructor() {
    super("gemini", "https://gemini.google.com/app");
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
      const targetUrl = conversationId
        ? `https://gemini.google.com/app/${conversationId}`
        : "https://gemini.google.com/app";

      if (conversationId && !currentUrl.includes(conversationId)) {
        console.log(`[Gemini] Navigating to conversation: ${conversationId}`);
        await page.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else if (!conversationId && currentUrl.includes("/app/")) {
        // If no ID but we are in a chat (URL has ID), go to new chat
        const isNewChat =
          currentUrl === "https://gemini.google.com/app" ||
          currentUrl === "https://gemini.google.com/";
        if (!isNewChat) {
          console.log("[Gemini] Navigating to new chat");
          await page.goto("https://gemini.google.com/app", {
            waitUntil: "domcontentloaded",
          });
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } else if (!currentUrl.includes("gemini.google.com")) {
        await this.navigate();
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

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
      await page.keyboard.type(message, { delay: 10 });

      // Small delay before sending
      await new Promise((resolve) => setTimeout(resolve, 100));

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

      // Count existing responses BEFORE sending so we can detect the new one
      const previousResponseCount = await page.evaluate(() => {
        const responses = document.querySelectorAll(
          ".response-content, .model-response-text, message-content"
        );
        return responses.length;
      });

      // Wait for response with streaming
      console.log("[Gemini] Waiting for response to start streaming...");

      // Wait for a NEW response to appear (more than previousResponseCount)
      try {
        await page.waitForFunction(
          (prevCount: number) => {
            const responses = document.querySelectorAll(
              ".response-content, .model-response-text, message-content"
            );
            return responses.length > prevCount;
          },
          { timeout: 15000 },
          previousResponseCount
        );
      } catch {
        // Continue, might use loading indicator
      }

      console.log("[Gemini] Waiting for streaming to complete...");

      let lastContent = "";
      let stableCount = 0;
      const maxWait = 180000; // 3 minutes
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 200));

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

        // Get the NEW response only (at index >= previousResponseCount)
        const currentResponse = await page.evaluate((prevCount: number) => {
          const responses = document.querySelectorAll(
            ".response-content, .model-response-text, message-content"
          );
          // Get the newest response (index >= prevCount means it's new)
          if (responses.length > prevCount) {
            return responses[responses.length - 1].textContent || "";
          }
          return "";
        }, previousResponseCount);

        // Streaming update
        if (currentResponse.length > lastContent.length) {
          const chunk = currentResponse.substring(lastContent.length);
          onChunk(chunk);
          lastContent = currentResponse;
          // Reset stable count if we are getting data
          if (isGenerating) stableCount = 0;
        }

        if (isGenerating) {
          // If generating but no new content, we wait
          if (currentResponse.length === lastContent.length) {
            // do nothing
          }
          continue;
        }

        // If not generating, check stability
        if (
          currentResponse.length === lastContent.length &&
          currentResponse.length > 0
        ) {
          stableCount++;
          if (stableCount >= 4) {
            // 2 seconds stable (4 * 500ms... wait loop is 200ms now so 10)
            // Let's adjust logic: 200ms sleep.
            // We want 1-2s stability. 10 * 200 = 2000ms.
            if (stableCount >= 10) {
              break;
            }
          }
        } else {
          stableCount = 0;
          lastContent = currentResponse;
        }
      }

      // Extract Conversation ID from URL
      const finalUrl = page.url();
      // URL pattern: https://gemini.google.com/app/([a-zA-Z0-9]+)
      const match = finalUrl.match(/\/app\/([a-zA-Z0-9]+)/);
      const newConversationId = match ? match[1] : undefined;

      console.log(`[Gemini] Done. ID: ${newConversationId}`);

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
