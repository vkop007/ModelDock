import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";

export class ClaudeProvider extends BaseProvider {
  constructor() {
    super("claude", "https://claude.ai/new");
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

      // Navigation logic - simplified
      const currentUrl = page.url();

      if (conversationId && !currentUrl.includes(conversationId)) {
        // Navigate to specific conversation
        console.log(`[Claude] Navigating to conversation: ${conversationId}`);
        await page.goto(`https://claude.ai/chat/${conversationId}`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else if (!currentUrl.includes("claude.ai")) {
        // Not on Claude at all, navigate to new chat
        await this.navigate();
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      // If already on claude.ai and no specific conversation needed, stay on current page

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
      await page.keyboard.type(message, { delay: 10 });

      // Click send button or press Enter
      const sendButton = await page.$(
        '[data-testid="submit-button"], button[aria-label="Send message"]'
      );
      if (sendButton) {
        await sendButton.click();
      } else {
        await page.keyboard.press("Enter");
      }

      // Wait for response with streaming
      console.log("[Claude] Waiting for streaming to complete...");

      let lastContent = "";
      let stableCount = 0;
      const maxWait = 180000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Check for stop button
        const isGenerating = await page.evaluate(() => {
          const stopBtn = document.querySelector(
            'button[aria-label="Stop generating"], [data-testid="stop-button"]'
          );
          return stopBtn !== null;
        });

        const currentResponse = await page.evaluate(() => {
          // Primary selector: Claude's response container with standard/progressive markdown
          const responses = document.querySelectorAll(
            ".font-claude-response .standard-markdown, .font-claude-response .progressive-markdown"
          );
          if (responses.length > 0) {
            return responses[responses.length - 1].textContent || "";
          }
          // Fallback: data-testid based selectors
          const messages = document.querySelectorAll(
            '[data-testid="assistant-message"], .assistant-message'
          );
          if (messages.length > 0) {
            return messages[messages.length - 1].textContent || "";
          }
          return "";
        });

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
            // 2s at 200ms poll
            break;
          }
        } else {
          stableCount = 0;
          lastContent = currentResponse;
        }
      }

      // Extract Conversation ID
      const finalUrl = page.url();
      // URL pattern: https://claude.ai/chat/([a-zA-Z0-9-]+)
      const match = finalUrl.match(/\/chat\/([a-zA-Z0-9-]+)/);
      const newConversationId = match ? match[1] : undefined;

      console.log(`[Claude] Done. ID: ${newConversationId}`);

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
    console.log("[Claude] Waiting for response to stream...");

    // Wait for initial response
    try {
      await page.waitForSelector(
        '.font-claude-response .standard-markdown, .font-claude-response .progressive-markdown, [data-testid="assistant-message"]',
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
        const responses = document.querySelectorAll(
          ".font-claude-response .standard-markdown, .font-claude-response .progressive-markdown"
        );
        if (responses.length > 0) {
          return responses[responses.length - 1].textContent || "";
        }
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
      const responses = document.querySelectorAll(
        ".font-claude-response .standard-markdown, .font-claude-response .progressive-markdown"
      );
      if (responses.length > 0) {
        return responses[responses.length - 1].textContent || "";
      }
      const messages = document.querySelectorAll(
        '[data-testid="assistant-message"], .assistant-message'
      );
      if (messages.length > 0) {
        return messages[messages.length - 1].textContent || "";
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
