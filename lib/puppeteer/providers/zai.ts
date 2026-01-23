import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";
import {
  waitForCompletionWithStreaming,
  PROVIDER_CONFIGS,
} from "../fast-streaming";

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

      // Navigation logic
      const currentUrl = page.url();
      const targetUrl = conversationId
        ? `https://chat.z.ai/c/${conversationId}`
        : "https://chat.z.ai";

      if (conversationId && !currentUrl.includes(conversationId)) {
        console.log(`[Z.ai] Navigating to conversation: ${conversationId}`);
        await page.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else if (!conversationId && currentUrl.includes("/c/")) {
        // If no ID but we are in a chat, go to root for new chat
        console.log("[Z.ai] Navigating to new chat");
        await page.goto("https://chat.z.ai", { waitUntil: "domcontentloaded" });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else if (!currentUrl.includes("chat.z.ai")) {
        await this.navigate();
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

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
        message
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
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

      // Wait for response to start (any likely container)
      try {
        await page.waitForSelector(
          "div[class*='message'], div[class*='response'], .markdown, .prose, .chat-assistant",
          { timeout: 20000 }
        );
      } catch {
        // Continue anyway, might be slow
      }

      // Fast streaming with 50ms polling
      const config = PROVIDER_CONFIGS.zai;
      const result = await waitForCompletionWithStreaming(
        page,
        config,
        onChunk,
        90000
      );
      const lastContent = result.content;

      if (lastContent.length === 0) {
        return { success: false, error: "No response text detected" };
      }

      // Extract Conversation ID from URL
      // Sometimes the URL update is delayed. Wait for it if we are at root.
      if (!page.url().includes("/c/")) {
        try {
          await page.waitForFunction(
            () => window.location.href.includes("/c/"),
            {
              timeout: 5000,
            }
          );
        } catch {
          console.log("[Z.ai] Timeout waiting for URL to update to /c/");
        }
      }

      const finalUrl = page.url();
      // URL pattern: https://chat.z.ai/c/<UUID>
      const match = finalUrl.match(/\/c\/([a-zA-Z0-9-]+)/);
      const newConversationId = match ? match[1] : undefined;

      console.log(`[Z.ai] Finished. ID: ${newConversationId}`);

      return {
        success: true,
        content: lastContent,
        conversationId: newConversationId,
      };
    } catch (error) {
      console.error("[Z.ai] Error:", error);
      return { success: false, error: String(error) };
    }
  }

  async waitForResponse(): Promise<string> {
    const page = await this.getPage();
    console.log("[Z.ai] Waiting for response to stream...");

    try {
      await page.waitForSelector("#response-content-container", {
        timeout: 15000,
      });
    } catch {
      // Continue
    }

    let lastContentLength = 0;
    let stableCount = 0;
    const maxWait = 180000;
    const startTime = Date.now();
    let finalResponse = "";

    while (Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check for stop button
      const isGenerating = await page.evaluate(() => {
        // Standard checks
        const stopBtn = document.querySelector(
          'button[aria-label="Stop generating"], button[aria-label="Stop response"], [class*="stop-button"]'
        );
        if (stopBtn) return true;

        // Specific Z.ai structure check (button with a square span inside)
        // <button><span class="block bg-white size-3 ..."></span></button>
        const allButtons = Array.from(document.querySelectorAll("button"));
        const zaiStopBtn = allButtons.find((btn) => {
          const span = btn.querySelector("span");
          if (!span) return false;

          // Check for the "square" icon classes typically found in Tailwind-like stop buttons
          // "size-3" and "rounded-xs" are highly specific from the user snippet
          const cls = span.className || "";
          return cls.includes("size-3") && cls.includes("rounded-xs");
        });

        if (zaiStopBtn) return true;

        // NEW: Check for loading container (3 dots animation)
        const loadingContainer = document.querySelector(".loading-container");
        if (loadingContainer) return true;

        return false;
      });

      if (isGenerating) {
        stableCount = 0;
        continue;
      }

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

        // Get the first child div that contains the actual content
        const contentDiv = container.querySelector("div");
        if (!contentDiv) {
          return (container as HTMLElement).innerText || "";
        }

        return contentDiv.innerText || "";
      });

      if (currentResponse && currentResponse.length > 0) {
        if (currentResponse.length === lastContentLength) {
          stableCount++;
          if (stableCount >= 4) {
            // 2 seconds stable
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
    const page = await this.getPage();
    console.log(`[Z.ai] Deleting conversation ${conversationId}...`);

    try {
      return await page.evaluate(async (cId) => {
        const getCookie = (name: string) => {
          const value = `; ${document.cookie}`;
          const parts = value.split(`; ${name}=`);
          if (parts.length === 2) return parts.pop()?.split(";").shift();
        };

        const token =
          getCookie("token") ||
          localStorage.getItem("token") ||
          localStorage.getItem("access_token");

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };

        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(`https://chat.z.ai/api/v1/chats/${cId}`, {
          method: "DELETE",
          headers,
        });

        if (response.ok) {
          return true;
        }

        console.error(
          `[Z.ai] Delete failed: ${response.status} ${response.statusText}`
        );
        return false;
      }, conversationId);
    } catch (e) {
      console.error("[Z.ai] Error deleting conversation:", e);
      return false;
    }
  }
}
