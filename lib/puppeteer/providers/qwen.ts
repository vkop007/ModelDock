import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";
import { browserManager } from "../browser-manager";
import {
  waitForCompletionWithStreaming,
  PROVIDER_CONFIGS,
} from "../fast-streaming";

export class QwenProvider extends BaseProvider {
  constructor() {
    super("qwen", "https://chat.qwen.ai/");
  }

  async checkAuthentication(page: Page): Promise<boolean> {
    try {
      // Check for presence of chat interface elements
      await page.waitForSelector(
        PROVIDER_CONFIGS.qwen.loginSelectors.join(", "),
        {
          timeout: 10000,
        },
      );
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
    conversationId?: string,
    imagePaths?: string[],
    signal?: AbortSignal,
  ): Promise<SendMessageResult> {
    try {
      let previousResponseCount = 0;

      await browserManager.runTask(this.provider, async () => {
        const page = await this.getPage();

        // Navigation logic
        const currentUrl = page.url();
        const isInConversation = currentUrl.includes("/c/");

        if (conversationId) {
          // Check if already in this conversation
          const alreadyInConversation = currentUrl.includes(conversationId);
          if (!alreadyInConversation) {
            console.log(`[Qwen] Navigating to conversation: ${conversationId}`);
            await page.goto(`https://chat.qwen.ai/c/${conversationId}`, {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            });
            await new Promise((resolve) => setTimeout(resolve, 2000));
          } else {
            console.log(`[Qwen] Already in conversation ${conversationId}`);
          }
        } else if (isInConversation) {
          // No conversationId but we're in a chat - start new conversation
          console.log("[Qwen] Starting new chat...");
          await page.goto("https://chat.qwen.ai/", {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else if (!currentUrl.includes("chat.qwen.ai")) {
          console.log("[Qwen] Navigating to Qwen...");
          await this.navigate();
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        console.log("[Qwen] Checking page state...");
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Wait for the input field - Qwen uses textarea
        const inputSelector = PROVIDER_CONFIGS.qwen.inputSelectors.join(", ");
        await page.waitForSelector(inputSelector, { timeout: 30000 });

        // Focus and type the message
        const input = await page.$(inputSelector);
        if (!input) {
          throw new Error("Could not find input field");
        }

        await input.click();
        // Use direct value setting for speed
        await page.evaluate(
          (selector, text) => {
            const el = document.querySelector(selector) as HTMLTextAreaElement;
            if (el) {
              el.value = text;
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
            }
          },
          inputSelector,
          message,
        );
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Count existing responses BEFORE clicking send
        previousResponseCount = await page.evaluate((selectors: string[]) => {
          const responses = document.querySelectorAll(selectors.join(", "));
          return responses.length;
        }, PROVIDER_CONFIGS.qwen.responseSelectors);

        // Click send button
        const sendButton = await page.$(
          PROVIDER_CONFIGS.qwen.sendButtonSelectors.join(", "),
        );
        if (sendButton) {
          await sendButton.click();
        } else {
          await page.keyboard.press("Enter");
        }
      });

      // ----------------------------------------------------------------------
      // BLOCK 2: OUTPUT PHASE (Serialized)
      // ----------------------------------------------------------------------
      return await browserManager.runTask(this.provider, async () => {
        const page = await this.getPage();

        console.log("[Qwen] Waiting for streaming to complete...");

        // Wait for a NEW response to appear
        try {
          await page.waitForFunction(
            (prevCount: number, selectors: string[]) => {
              const responses = document.querySelectorAll(selectors.join(", "));
              return responses.length > prevCount;
            },
            { timeout: 15000 },
            previousResponseCount,
            PROVIDER_CONFIGS.qwen.responseSelectors,
          );
        } catch {
          // Continue, might be slow
        }

        const config = PROVIDER_CONFIGS.qwen;
        const result = await waitForCompletionWithStreaming(
          page,
          config,
          onChunk,
          180000,
        );
        const lastContent = result.content;

        const finalUrl = page.url();
        const match = finalUrl.match(/\/c\/([a-zA-Z0-9_-]+)/);
        const newConversationId = match ? match[1] : undefined;

        console.log(`[Qwen] Done. ID: ${newConversationId}`);

        return {
          success: true,
          content: lastContent,
          conversationId: newConversationId,
        };
      });
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async waitForResponse(): Promise<string> {
    const page = await this.getPage();
    console.log("[Qwen] Waiting for response...");

    let lastLength = 0;
    let stableCount = 0;
    const maxWait = 180000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const isGenerating = await page.evaluate((selectors: string[]) => {
        for (const selector of selectors) {
          if (document.querySelector(selector)) return true;
        }
        return false;
      }, PROVIDER_CONFIGS.qwen.generatingSelectors);

      if (isGenerating) {
        stableCount = 0;
        continue;
      }

      const response = await page.evaluate((selectors: string[]) => {
        const responses = document.querySelectorAll(selectors.join(", "));
        if (responses.length > 0) {
          return responses[responses.length - 1].textContent || "";
        }
        return "";
      }, PROVIDER_CONFIGS.qwen.responseSelectors);

      if (response.length === lastLength && response.length > 0) {
        stableCount++;
        if (stableCount >= 4) {
          break;
        }
      } else {
        stableCount = 0;
        lastLength = (currentResponse as string).length;
      }
    }

    const response = await page.evaluate((selectors: string[]) => {
      const responses = document.querySelectorAll(selectors.join(", "));
      if (responses.length > 0) {
        return responses[responses.length - 1].textContent || "";
      }
      return "";
    });

    return response;
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      const page = await this.getPage();

      console.log(`[Qwen] Deleting conversation: ${conversationId}`);

      // Ensure we're on Qwen domain so cookies are sent
      const currentUrl = page.url();
      if (!currentUrl.includes("chat.qwen.ai")) {
        await page.goto("https://chat.qwen.ai/", {
          waitUntil: "domcontentloaded",
          timeout: 10000,
        });
      }

      // Make the DELETE request from the browser context (cookies auto-included with credentials)
      const result = await page.evaluate(async (chatId: string) => {
        try {
          const response = await fetch(
            `https://chat.qwen.ai/api/v2/chats/${chatId}`,
            {
              method: "DELETE",
              credentials: "include",
              headers: {
                accept: "application/json, text/plain, */*",
                source: "web",
              },
            },
          );
          return { success: response.ok, status: response.status };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      }, conversationId);

      if (result.success) {
        console.log(
          `[Qwen] Successfully deleted conversation: ${conversationId}`,
        );
        return true;
      } else {
        console.log(
          `[Qwen] Failed to delete conversation: ${JSON.stringify(result)}`,
        );
        return false;
      }
    } catch (error) {
      console.error(`[Qwen] Error deleting conversation:`, error);
      return false;
    }
  }

  /**
   * Set custom instructions in Qwen's personalization settings.
   * Uses Qwen's user settings API directly.
   */
  async setCustomInstructions(
    instructions: string,
  ): Promise<{ success: boolean; error?: string }> {
    console.log("[Qwen] Setting custom instructions via API...");

    try {
      const page = await this.getPage();

      // Make sure we're on Qwen domain to have proper auth context
      const currentUrl = page.url();
      if (!currentUrl.includes("chat.qwen.ai")) {
        console.log("[Qwen] Navigating to Qwen for auth context...");
        await page.goto("https://chat.qwen.ai/", {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Make the API call from within the page context
      const result = await page.evaluate(async (instructionsText: string) => {
        try {
          const response = await fetch(
            "https://chat.qwen.ai/api/v2/users/user/settings/update",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                accept: "application/json, text/plain, */*",
                source: "web",
              },
              credentials: "include",
              body: JSON.stringify({
                personalization: {
                  name: "",
                  description: "",
                  instruction: instructionsText,
                },
              }),
            },
          );

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
        console.log("[Qwen] Custom instructions set successfully via API");
      } else {
        console.error("[Qwen] API call failed:", result.error);
      }

      return result;
    } catch (error) {
      console.error("[Qwen] Error setting custom instructions:", error);
      return { success: false, error: String(error) };
    }
  }
}
