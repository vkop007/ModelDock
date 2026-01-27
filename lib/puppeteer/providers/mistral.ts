import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";
import { browserManager } from "../browser-manager";
import {
  waitForCompletionWithStreaming,
  PROVIDER_CONFIGS,
} from "../fast-streaming";

export class MistralProvider extends BaseProvider {
  constructor() {
    super("mistral", "https://chat.mistral.ai/");
  }

  async checkAuthentication(page: Page): Promise<boolean> {
    try {
      await page.waitForSelector(
        'textarea, [contenteditable="true"], .ProseMirror',
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
  ): Promise<SendMessageResult> {
    try {
      // ----------------------------------------------------------------------
      // BLOCK 1: INPUT PHASE (Serialized)
      // ----------------------------------------------------------------------
      let previousResponseCount = 0;

      await browserManager.runTask(this.provider, async () => {
        const page = await this.getPage();
        const currentUrl = page.url();

        if (conversationId) {
          if (!currentUrl.includes(`/chat/${conversationId}`)) {
            console.log(
              `[Mistral] Navigating to conversation: ${conversationId}`,
            );
            await page.goto(`https://chat.mistral.ai/chat/${conversationId}`, {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            });
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } else {
          if (currentUrl.includes("/chat/")) {
            console.log("[Mistral] Starting new chat...");
            await page.goto("https://chat.mistral.ai/", {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            });
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } else if (!currentUrl.includes("chat.mistral.ai")) {
            console.log("[Mistral] Navigating to Mistral...");
            await this.navigate();
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }

        console.log("[Mistral] Checking page state...");
        await new Promise((resolve) => setTimeout(resolve, 500));

        const inputSelector = '.ProseMirror, div[contenteditable="true"]';
        await page.waitForSelector(inputSelector, { timeout: 30000 });

        const input = await page.$(inputSelector);
        if (!input) {
          throw new Error("Could not find input field");
        }

        // Use direct value setting for speed (ProseMirror / contenteditable)
        await page.evaluate(
          (selector, text) => {
            const el = document.querySelector(selector) as HTMLElement;
            if (el) {
              // Mistral uses ProseMirror - use DOM methods instead of innerHTML to avoid Trusted Types errors
              el.replaceChildren();
              const p = document.createElement("p");
              p.textContent = text;
              el.appendChild(p);
              el.dispatchEvent(new Event("input", { bubbles: true }));
            }
          },
          inputSelector,
          message,
        );
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Count existing assistant messages
        previousResponseCount = await page.evaluate(() => {
          const responses = document.querySelectorAll(
            '[data-message-author-role="assistant"]',
          );
          return responses.length;
        });

        // Click send or press Enter
        const sendButton = await page.$(
          'button[type="submit"], button[aria-label*="Send"]',
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

        console.log("[Mistral] Waiting for streaming to complete...");

        // Wait for new response
        try {
          await page.waitForFunction(
            (prevCount: number) => {
              const responses = document.querySelectorAll(
                '[data-message-author-role="assistant"]',
              );
              return responses.length > prevCount;
            },
            { timeout: 15000 },
            previousResponseCount,
          );
        } catch {
          // Continue
        }

        // Fast streaming with 50ms polling
        const config = PROVIDER_CONFIGS.mistral;
        const result = await waitForCompletionWithStreaming(
          page,
          config,
          onChunk,
          180000,
        );
        const lastContent = result.content;

        // Extract conversation ID from URL: https://chat.mistral.ai/chat/{id}
        const finalUrl = page.url();
        const match = finalUrl.match(/\/chat\/([a-zA-Z0-9_-]+)/);
        const newConversationId = match ? match[1] : undefined;

        console.log(`[Mistral] Done. ID: ${newConversationId}`);

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
    console.log("[Mistral] Waiting for response...");

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
          '[data-message-author-role="assistant"]',
        );
        if (responses.length > 0) {
          const lastResponse = responses[responses.length - 1];
          // Target only the answer part to avoid time text
          const answerPart = lastResponse.querySelector(
            '[data-message-part-type="answer"]',
          );
          return answerPart?.textContent || "";
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
      const responses = document.querySelectorAll(
        '[data-message-author-role="assistant"]',
      );
      if (responses.length > 0) {
        const lastResponse = responses[responses.length - 1];
        // Target only the answer part to avoid time text
        const answerPart = lastResponse.querySelector(
          '[data-message-part-type="answer"]',
        );
        return answerPart?.textContent || "";
      }
      return "";
    });

    return response;
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      const page = await this.getPage();

      console.log(`[Mistral] Deleting conversation: ${conversationId}`);

      const currentUrl = page.url();
      if (!currentUrl.includes("chat.mistral.ai")) {
        await page.goto("https://chat.mistral.ai/", {
          waitUntil: "domcontentloaded",
          timeout: 10000,
        });
      }

      // Use tRPC delete endpoint
      const result = await page.evaluate(async (chatId: string) => {
        try {
          const response = await fetch(
            "https://chat.mistral.ai/api/trpc/chat.delete?batch=1",
            {
              method: "POST",
              credentials: "include",
              headers: {
                accept: "*/*",
                "content-type": "application/json",
                "trpc-accept": "application/jsonl",
                "x-trpc-source": "nextjs-react",
              },
              body: JSON.stringify({ "0": { json: { id: chatId } } }),
            },
          );
          return { success: response.ok, status: response.status };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      }, conversationId);

      if (result.success) {
        console.log(
          `[Mistral] Successfully deleted conversation: ${conversationId}`,
        );
        return true;
      } else {
        console.log(`[Mistral] Failed to delete: ${JSON.stringify(result)}`);
        return false;
      }
    } catch (error) {
      console.error(`[Mistral] Error deleting:`, error);
      return false;
    }
  }
}
