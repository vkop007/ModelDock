import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";

export class ZaiProvider extends BaseProvider {
  constructor() {
    super("zai", "https://chat.z.ai");
  }

  async checkAuthentication(page: Page): Promise<boolean> {
    try {
      // Check for presence of chat interface elements
      // We look for either the input or the send button
      await page.waitForSelector("#chat-input, #send-message-button", {
        timeout: 15000,
      });
      return true;
    } catch {
      console.log(
        "[Z.ai] Authentication check failed: Input or Send button not found."
      );
      try {
        const title = await page.title();
        console.log(`[Z.ai] Current Page Title: ${title}`);
      } catch {}
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
    console.log("[Z.ai] Sending message with streaming...");

    try {
      const page = await this.getPage();
      await this.navigate();

      // Wait for input
      const inputSelector = "#chat-input";
      try {
        await page.waitForSelector(inputSelector, { timeout: 20000 });
      } catch {
        return {
          success: false,
          error: "Could not find input element (#chat-input)",
        };
      }

      // Focus and type
      const inputEl = await page.$(inputSelector);
      if (!inputEl) {
        return { success: false, error: "Input element not found" };
      }

      await inputEl.click();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check and disable "Deep Think" if enabled
      try {
        await page.evaluate(() => {
          const deepThinkBtn = document.querySelector(
            'button[data-autothink="true"]'
          );
          if (deepThinkBtn) {
            (deepThinkBtn as HTMLElement).click();
          }
        });
      } catch (e) {
        console.log("[Z.ai] Error checking Deep Think button:", e);
      }

      await page.keyboard.type(message, { delay: 10 });
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Click send button
      try {
        await page.waitForSelector("#send-message-button", { timeout: 5000 });
        await page.click("#send-message-button");
      } catch (e) {
        console.log("[Z.ai] Send button not found or clickable, trying Enter");
        await page.keyboard.press("Enter");
      }

      console.log("[Z.ai] Message sent, waiting for response...");

      // Streaming logic
      let lastContent = "";
      let stableCount = 0;
      const maxWait = 90000; // 90s
      const startTime = Date.now();
      let finalResponse = "";

      // Wait for response to start (any likely container)
      try {
        await page.waitForSelector(
          "div[class*='message'], div[class*='response'], .markdown, .prose",
          { timeout: 20000 }
        );
      } catch {
        // Continue anyway, might be slow
      }

      while (Date.now() - startTime < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 500)); // Poll every 500ms

        const currentResponse = await page.evaluate(() => {
          // Target the response container directly
          const responseContainers =
            document.querySelectorAll(".chat-assistant");
          if (responseContainers.length === 0) return "";

          // Get the last one
          const assistantMessage =
            responseContainers[responseContainers.length - 1];
          if (!assistantMessage) return "";

          const container = assistantMessage.querySelector(
            "#response-content-container"
          );
          if (!container) return "";

          // Extract text while preserving structure and ignoring thinking chain
          let text = "";
          container.childNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement;
              if (el.classList.contains("thinking-chain-container")) return;

              text += el.innerText;

              const style = window.getComputedStyle(el);
              if (
                style.display === "block" ||
                style.display === "flex" ||
                el.tagName === "P" ||
                el.tagName === "DIV"
              ) {
                text += "\n\n";
              }
            } else if (node.nodeType === Node.TEXT_NODE) {
              text += node.textContent;
            }
          });

          return text || "";
        });

        if (currentResponse && currentResponse.length > lastContent.length) {
          const chunk = currentResponse.substring(lastContent.length);
          onChunk(chunk);
          lastContent = currentResponse;
          stableCount = 0;
        } else if (currentResponse && currentResponse.length > 0) {
          // Content didn't change
          stableCount++;
          if (stableCount >= 4) {
            // 2 seconds of stability
            finalResponse = currentResponse;
            break;
          }
        }
      }

      if (lastContent.length === 0 && finalResponse.length === 0) {
        return { success: false, error: "No response text detected" };
      }

      return { success: true, content: finalResponse || lastContent };
    } catch (error) {
      console.error("[Z.ai] Error:", error);
      return { success: false, error: String(error) };
    }
  }

  async waitForResponse(): Promise<string> {
    const page = await this.getPage();
    console.log("[Z.ai] Waiting for response to stream...");

    try {
      // Wait for any likely message container
      await page.waitForSelector("#response-content-container", {
        timeout: 15000,
      });
    } catch {
      console.log(
        "[Z.ai] Warning: Standard message selectors not found immediately."
      );
    }

    // Stability check loop
    let lastContentLength = 0;
    let stableCount = 0;
    const maxWait = 60000;
    const startTime = Date.now();
    let finalResponse = "";

    while (Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const currentResponse = await page.evaluate(() => {
        const responseContainers = document.querySelectorAll(".chat-assistant");
        if (responseContainers.length === 0) return "";
        const assistantMessage =
          responseContainers[responseContainers.length - 1];
        if (!assistantMessage) return "";

        const container = assistantMessage.querySelector(
          "#response-content-container"
        );
        if (!container) return "";

        let text = "";
        container.childNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.classList.contains("thinking-chain-container")) return;

            text += el.innerText;

            const style = window.getComputedStyle(el);
            if (
              style.display === "block" ||
              style.display === "flex" ||
              el.tagName === "P" ||
              el.tagName === "DIV"
            ) {
              text += "\n\n";
            }
          } else if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent;
          }
        });

        return text || "";
      });

      if (currentResponse && currentResponse.length > 0) {
        if (currentResponse.length === lastContentLength) {
          stableCount++;
          if (stableCount >= 3) {
            finalResponse = currentResponse;
            break;
          }
        } else {
          stableCount = 0;
          lastContentLength = currentResponse.length;
        }
      }
    }

    return finalResponse;
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    // TODO: Implement deletion logic when specific UI elements are known
    // For now return true to assume it "worked" or just log
    console.log(
      "[Z.ai] Delete conversation not yet fully implemented for this provider."
    );
    return false;
  }
}
