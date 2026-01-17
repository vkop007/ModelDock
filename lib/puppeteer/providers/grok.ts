import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";
import {
  waitForCompletionWithStreaming,
  PROVIDER_CONFIGS,
} from "../fast-streaming";

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
      const isInConversation =
        currentUrl.includes("/c/") || currentUrl.includes("/chat/");

      if (conversationId) {
        // Check if we're already in this conversation
        const alreadyInConversation = currentUrl.includes(conversationId);
        if (!alreadyInConversation) {
          console.log(`[Grok] Navigating to conversation: ${conversationId}`);
          // Try both possible URL patterns
          await page.goto(`https://grok.com/chat/${conversationId}`, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          console.log(`[Grok] Already in conversation ${conversationId}`);
        }
      } else if (isInConversation) {
        // No conversationId but we're in a chat - start new conversation
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
      // If already on grok.com homepage with no conversation, stay there

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

      // Fast streaming with 50ms polling
      const config = PROVIDER_CONFIGS.grok;
      const result = await waitForCompletionWithStreaming(
        page,
        config,
        onChunk,
        180000
      );
      const lastContent = result.content;

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
    console.log(`[Grok] Deleting conversation via API: ${conversationId}`);
    try {
      const page = await this.getPage();

      // Make sure we're on Grok to have valid cookies/auth
      const currentUrl = page.url();
      if (!currentUrl.includes("grok.com")) {
        await this.navigate();
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Use the Grok API directly from the browser context
      const result = await page.evaluate(async (convId: string) => {
        try {
          const response = await fetch(
            `https://grok.com/rest/app-chat/conversations/soft/${convId}`,
            {
              method: "DELETE",
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
        console.log(`[Grok] Conversation deleted successfully`);
        return true;
      } else {
        console.error(`[Grok] API delete failed:`, result.error);
        return false;
      }
    } catch (error) {
      console.error("[Grok] Deletion error:", error);
      return false;
    }
  }

  /**
   * Set custom instructions in Grok's system prompt settings.
   * First gets the existing system prompt ID, then updates it with PUT.
   * If no existing prompt, creates a new one with POST.
   */
  async setCustomInstructions(
    instructions: string
  ): Promise<{ success: boolean; error?: string }> {
    console.log("[Grok] Setting custom instructions via API...");

    try {
      const page = await this.getPage();

      // Make sure we're on Grok domain to have proper auth context
      const currentUrl = page.url();
      if (!currentUrl.includes("grok.com")) {
        console.log("[Grok] Navigating to Grok for auth context...");
        await page.goto("https://grok.com/", {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Make the API call from within the page context
      const result = await page.evaluate(async (instructionsText: string) => {
        try {
          // First, try to get existing system prompts to find the ID
          const listResponse = await fetch(
            "https://grok.com/rest/system-prompt/list",
            {
              method: "GET",
              credentials: "include",
            }
          );

          let existingPromptId: string | null = null;

          if (listResponse.ok) {
            const listData = await listResponse.json();
            // Look for an existing "Custom" prompt or any prompt to update
            if (listData && Array.isArray(listData) && listData.length > 0) {
              // Find a Custom prompt or use the first one
              const customPrompt = listData.find(
                (p: { name?: string }) => p.name === "Custom"
              );
              existingPromptId = customPrompt?.id || listData[0]?.id;
            }
          }

          let response;
          if (existingPromptId) {
            // Update existing prompt with PUT
            console.log(`[Grok] Updating existing prompt: ${existingPromptId}`);
            response = await fetch(
              `https://grok.com/rest/system-prompt/${existingPromptId}`,
              {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({
                  name: "Custom",
                  content: [{ text: instructionsText }],
                }),
              }
            );
          } else {
            // Create new prompt with POST
            console.log("[Grok] Creating new system prompt");
            response = await fetch(
              "https://grok.com/rest/system-prompt/67fe7a87-92d4-4d7d-ae01-427ff11111f8",
              {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({
                  name: "Custom",
                  content: [{ text: instructionsText }],
                }),
              }
            );
          }

          if (!response.ok) {
            const errorText = await response.text();
            return {
              success: false,
              error: `API returned ${response.status}: ${errorText}`,
            };
          }

          return { success: true };
        } catch (err) {
          return { success: false, error: String(err) };
        }
      }, instructions);

      if (result.success) {
        console.log("[Grok] Custom instructions set successfully via API");
      } else {
        console.error("[Grok] API call failed:", result.error);
      }

      return result;
    } catch (error) {
      console.error("[Grok] Error setting custom instructions:", error);
      return { success: false, error: String(error) };
    }
  }
}
