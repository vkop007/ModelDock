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

      // Navigation logic
      const currentUrl = page.url();
      const isInConversation =
        currentUrl.includes("/chat/") && !currentUrl.includes("/new");

      if (conversationId && !currentUrl.includes(conversationId)) {
        // Navigate to specific conversation
        console.log(`[Claude] Navigating to conversation: ${conversationId}`);
        await page.goto(`https://claude.ai/chat/${conversationId}`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else if (!conversationId && isInConversation) {
        // No conversation ID but we're in an existing chat - start new conversation
        console.log("[Claude] Starting new conversation - navigating to /new");
        await page.goto("https://claude.ai/new", {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else if (!currentUrl.includes("claude.ai")) {
        // Not on Claude at all, navigate to new chat
        await this.navigate();
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      // If already on claude.ai/new or homepage, stay on current page

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
      // Use direct value setting for speed
      await page.evaluate(
        (selector, text) => {
          const el = document.querySelector(selector) as HTMLElement;
          if (el) {
            // Claude uses ProseMirror, which is a contenteditable div
            // Setting innerText/textContent directly might break the editor state
            // But usually a simple input event triggers a resync
            el.innerHTML = `<p>${text}</p>`; // Basic paragraph structure often helps ProseMirror
            // If that fails, simple textContent:
            // el.textContent = text;
            el.dispatchEvent(new Event("input", { bubbles: true }));

            // Dispatch a comparison event just in case
            const event = new Event("input", { bubbles: true });
            el.dispatchEvent(event);
          }
        },
        inputSelector,
        message
      );
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Count existing responses BEFORE clicking send
      const previousResponseCount = await page.evaluate(() => {
        const responses = document.querySelectorAll(
          ".font-claude-response .standard-markdown, .font-claude-response .progressive-markdown"
        );
        return responses.length;
      });

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

      // Wait for a NEW response to appear (more than previousResponseCount)
      try {
        await page.waitForFunction(
          (prevCount: number) => {
            const responses = document.querySelectorAll(
              ".font-claude-response .standard-markdown, .font-claude-response .progressive-markdown"
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

        // Check for stop button (indicates still generating)
        const isGenerating = await page.evaluate(() => {
          const stopBtn = document.querySelector(
            'button[aria-label="Stop response"], [data-testid="stop-button"]'
          );
          return stopBtn !== null;
        });

        // Get the NEW response only (at index >= previousResponseCount)
        const currentResponse = await page.evaluate((prevCount: number) => {
          const responses = document.querySelectorAll(
            ".font-claude-response .standard-markdown, .font-claude-response .progressive-markdown"
          );
          // Only return content if there's a new response
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

      // Check for stop button (indicates still generating)
      const isGenerating = await page.evaluate(() => {
        const stopBtn = document.querySelector(
          'button[aria-label="Stop response"], [data-testid="stop-button"]'
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
    console.log(`[Claude] Deleting conversation via API: ${conversationId}`);
    try {
      const page = await this.getPage();

      // Make sure we're on Claude to have valid cookies/auth
      const currentUrl = page.url();
      if (!currentUrl.includes("claude.ai")) {
        await this.navigate();
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Use the Claude API directly from the browser context
      const result = await page.evaluate(async (convId: string) => {
        try {
          // Get the organization ID from the cookie
          const cookies = document.cookie.split(";");
          let orgId = "";
          let deviceId = "";

          for (const cookie of cookies) {
            const [name, value] = cookie.trim().split("=");
            if (name === "lastActiveOrg") {
              orgId = value;
            }
            if (name === "anthropic-device-id") {
              deviceId = value;
            }
          }

          if (!orgId) {
            return { success: false, error: "Could not find organization ID" };
          }

          // Delete the conversation
          const response = await fetch(
            `https://claude.ai/api/organizations/${orgId}/chat_conversations/${convId}`,
            {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                "anthropic-client-platform": "web_claude_ai",
                ...(deviceId && { "anthropic-device-id": deviceId }),
              },
              credentials: "include",
            }
          );

          if (response.ok || response.status === 204) {
            return { success: true };
          } else {
            const text = await response.text();
            return {
              success: false,
              error: `HTTP ${response.status}: ${text}`,
            };
          }
        } catch (err) {
          return { success: false, error: String(err) };
        }
      }, conversationId);

      if (result.success) {
        console.log(`[Claude] Conversation deleted successfully`);
        return true;
      } else {
        console.error(`[Claude] API delete failed:`, result.error);
        return false;
      }
    } catch (error) {
      console.error("[Claude] Deletion error:", error);
      return false;
    }
  }
}
