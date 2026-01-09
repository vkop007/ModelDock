import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";

export class ChatGPTProvider extends BaseProvider {
  constructor() {
    super("chatgpt", "https://chat.openai.com");
  }

  async checkAuthentication(page: Page): Promise<boolean> {
    try {
      // Check for presence of chat interface elements
      await page.waitForSelector(
        '#prompt-textarea, [data-testid="send-button"], textarea',
        { timeout: 10000 }
      );
      return true;
    } catch {
      // Check for login button or sign-in page
      const loginButton = await page.$(
        'button:has-text("Log in"), a[href*="login"]'
      );
      return !loginButton;
    }
  }

  async sendMessage(message: string): Promise<SendMessageResult> {
    try {
      const page = await this.getPage();
      await this.navigate();

      // Take a screenshot to see what the page looks like
      const os = await import("os");
      const path = await import("path");
      const screenshotPath = path.join(
        os.homedir(),
        ".gemini/antigravity/brain/f02285d8-4121-4715-b45c-b7f48511b7f3",
        `puppeteer_debug_${Date.now()}.png`
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`[ChatGPT] Debug screenshot saved to: ${screenshotPath}`);

      // Wait for the page to fully load
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Wait for the input field - look for #prompt-textarea specifically
      try {
        await page.waitForSelector("#prompt-textarea", { timeout: 60000 });
        console.log("[ChatGPT] Found #prompt-textarea");
      } catch {
        // Try alternative selectors
        console.log(
          "[ChatGPT] #prompt-textarea not found, trying alternatives..."
        );
        await page.waitForSelector('div[contenteditable="true"], textarea', {
          timeout: 30000,
        });
      }

      // Click on the input to focus it
      const inputEl =
        (await page.$("#prompt-textarea")) ||
        (await page.$('div[contenteditable="true"]')) ||
        (await page.$("textarea"));

      if (!inputEl) {
        return { success: false, error: "Could not find input element" };
      }

      await inputEl.click();
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Clear any existing text and type the new message
      await page.keyboard.type(message, { delay: 50 });
      console.log(`[ChatGPT] Typed message: ${message}`);

      // Wait for text to be registered
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Find and click the send button
      const sendButtonClicked = await page.evaluate(() => {
        // Try finding the send button by data-testid
        const sendBtn = document.querySelector(
          '[data-testid="send-button"]'
        ) as HTMLButtonElement;
        if (sendBtn && !sendBtn.disabled) {
          sendBtn.click();
          console.log("[ChatGPT] Clicked send button via data-testid");
          return true;
        }

        // Try finding by aria-label
        const ariaBtn = document.querySelector(
          'button[aria-label="Send prompt"]'
        ) as HTMLButtonElement;
        if (ariaBtn && !ariaBtn.disabled) {
          ariaBtn.click();
          console.log("[ChatGPT] Clicked send button via aria-label");
          return true;
        }

        // Try finding the button next to the textarea (inside the form)
        const form = document.querySelector("form");
        if (form) {
          const buttons = form.querySelectorAll("button");
          for (const btn of buttons) {
            if (btn.querySelector("svg") && !btn.disabled) {
              btn.click();
              console.log("[ChatGPT] Clicked form button with svg");
              return true;
            }
          }
        }

        return false;
      });

      if (!sendButtonClicked) {
        // Fallback: press Enter
        console.log("[ChatGPT] No button clicked, pressing Enter");
        await page.keyboard.press("Enter");
      }

      console.log("[ChatGPT] Message sent, waiting for response...");

      // Wait for response
      const response = await this.waitForResponse();

      if (!response) {
        // Take screenshot to debug
        const errorScreenshotPath = path.join(
          os.homedir(),
          ".gemini/antigravity/brain/f02285d8-4121-4715-b45c-b7f48511b7f3",
          `puppeteer_response_error_${Date.now()}.png`
        );
        await page.screenshot({ path: errorScreenshotPath, fullPage: true });
        console.log(
          `[ChatGPT] Response error screenshot: ${errorScreenshotPath}`
        );
        return { success: false, error: "No response received from ChatGPT" };
      }

      return { success: true, content: response };
    } catch (error) {
      console.error("[ChatGPT] Error:", error);
      return { success: false, error: String(error) };
    }
  }

  async waitForResponse(): Promise<string> {
    const page = await this.getPage();

    console.log("[ChatGPT] Waiting for response to start streaming...");

    // First, wait for any response element to appear
    try {
      await page.waitForSelector('[data-message-author-role="assistant"]', {
        timeout: 30000,
      });
      console.log("[ChatGPT] Response element appeared");
    } catch {
      console.log(
        "[ChatGPT] No response element found, checking for alternatives..."
      );
      // Try alternative selectors
      try {
        await page.waitForSelector('.markdown, .prose, [class*="message"]', {
          timeout: 15000,
        });
      } catch {
        console.log("[ChatGPT] No response detected");
        return "";
      }
    }

    // Wait for streaming to complete by checking if "Stop generating" button disappears
    // or by waiting for the response to stop changing
    console.log("[ChatGPT] Waiting for streaming to complete...");

    let lastLength = 0;
    let stableCount = 0;
    const maxWait = 60000; // 60 seconds max
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check if stop button is still visible
      const stopButtonVisible = await page.evaluate(() => {
        const btn = document.querySelector(
          'button[aria-label="Stop generating"]'
        );
        return btn !== null;
      });

      if (stopButtonVisible) {
        console.log("[ChatGPT] Still streaming...");
        stableCount = 0;
        continue;
      }

      // Get current response length
      const currentResponse = await page.evaluate(() => {
        const messages = document.querySelectorAll(
          '[data-message-author-role="assistant"]'
        );
        if (messages.length > 0) {
          return messages[messages.length - 1].textContent || "";
        }
        return "";
      });

      if (currentResponse.length === lastLength && currentResponse.length > 0) {
        stableCount++;
        if (stableCount >= 2) {
          console.log("[ChatGPT] Response stable, extracting...");
          break;
        }
      } else {
        stableCount = 0;
        lastLength = currentResponse.length;
      }
    }

    // Small delay to ensure content is fully rendered
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get the last assistant message
    const response = await page.evaluate(() => {
      const messages = document.querySelectorAll(
        '[data-message-author-role="assistant"]'
      );
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        return lastMessage.textContent || "";
      }

      // Fallback: try to get any markdown content
      const markdownBlocks = document.querySelectorAll(".markdown, .prose");
      if (markdownBlocks.length > 0) {
        return markdownBlocks[markdownBlocks.length - 1].textContent || "";
      }

      return "";
    });

    console.log(
      `[ChatGPT] Response extracted: ${response.substring(0, 100)}...`
    );
    return response;
  }
}
