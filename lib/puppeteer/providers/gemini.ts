import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";

export class GeminiProvider extends BaseProvider {
  constructor() {
    super("gemini", "https://gemini.google.com/app");
  }

  async checkAuthentication(page: Page): Promise<boolean> {
    try {
      await page.waitForSelector(
        "rich-textarea, .ql-editor, [data-placeholder]",
        { timeout: 10000 }
      );
      return true;
    } catch {
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
    console.log(`[Gemini] Deleting conversation via UI: ${conversationId}`);
    try {
      const page = await this.getPage();

      // Navigate to the conversation if not already there
      const currentUrl = page.url();
      if (!currentUrl.includes(conversationId)) {
        await page.goto(`https://gemini.google.com/app/${conversationId}`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Step 1: Click the conversation actions button (three dots menu)
      const optionsButtonSelector =
        '[data-test-id="conversation-actions-button"]';
      try {
        await page.waitForSelector(optionsButtonSelector, { timeout: 5000 });
        await page.click(optionsButtonSelector);
        console.log("[Gemini] Clicked options button");
      } catch {
        console.error("[Gemini] Could not find options button");
        return false;
      }

      // Wait for menu to appear
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 2: Click the delete button in the menu
      const deleteButtonSelector = '[data-test-id="delete-button"]';
      try {
        await page.waitForSelector(deleteButtonSelector, { timeout: 3000 });
        await page.click(deleteButtonSelector);
        console.log("[Gemini] Clicked delete button");
      } catch {
        console.error("[Gemini] Could not find delete button");
        return false;
      }

      // Wait for confirmation dialog to appear
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 3: Click the confirmation "Delete" button in the dialog
      try {
        // Look for the confirmation button - it's a button with "Delete" text in a dialog
        const confirmed = await page.evaluate(() => {
          // Find all buttons with "Delete" text
          const buttons = Array.from(document.querySelectorAll("button"));
          const confirmBtn = buttons.find((btn) => {
            const text = btn.textContent?.trim();
            // The confirmation button has exactly "Delete" text (not "Delete chat?" etc)
            return text === "Delete";
          });
          if (confirmBtn) {
            (confirmBtn as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (confirmed) {
          console.log("[Gemini] Clicked confirmation Delete button");
        } else {
          console.error("[Gemini] Could not find confirmation button");
          return false;
        }
      } catch {
        console.error("[Gemini] Error clicking confirmation button");
        return false;
      }

      // Wait for deletion to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      console.log("[Gemini] Conversation deleted successfully");
      return true;
    } catch (error) {
      console.error("[Gemini] Deletion error:", error);
      return false;
    }
  }
  async generateImage(
    prompt: string,
    onStatusUpdate?: (status: string) => void
  ): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    console.log("[Gemini] Generating image...");
    if (onStatusUpdate) onStatusUpdate("Initializing...");

    try {
      const page = await this.getPage();

      // Ensure we are on Gemini
      if (!page.url().includes("gemini.google.com")) {
        if (onStatusUpdate) onStatusUpdate("Navigating to Gemini...");
        await this.navigate();
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // 1. Open Toolbox if not already open (or just find the button)
      if (onStatusUpdate) onStatusUpdate("Opening tools menu...");

      // Try to clicking the Tools button
      try {
        const toolsBtn = await page.$('button[aria-label="Tools"]');
        if (toolsBtn) {
          await toolsBtn.click();
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (e) {
        console.log(
          "[Gemini] Tools button interaction failed or not needed",
          e
        );
      }

      // 2. Select "Create images"
      if (onStatusUpdate) onStatusUpdate("Selecting Image Generation...");

      const createImgClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const createImgBtn = buttons.find((btn) =>
          btn.textContent?.includes("Create images")
        );

        if (createImgBtn) {
          createImgBtn.click();
          return true;
        }
        return false;
      });

      if (!createImgClicked) {
        // It might be that we don't need to select a mode in Gemini sometimes?
        // But user provided the steps, so we assume it defines the mode.
        // However, if we fail, we might try to just type the prompt "Generate an image of..."
        console.log(
          "[Gemini] 'Create images' option not found, trying direct prompt..."
        );
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // 3. Type prompt
      if (onStatusUpdate) onStatusUpdate("Typing prompt...");
      const inputSelector =
        'rich-textarea .ql-editor, .text-input-field, [contenteditable="true"]';
      await page.waitForSelector(inputSelector, { timeout: 10000 });

      const input = await page.$(inputSelector);
      if (!input) throw new Error("Input not found");

      await input.click();
      await page.keyboard.type(prompt, { delay: 10 });
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 4. Send
      if (onStatusUpdate) onStatusUpdate("Sending request...");
      const sendButton = await page.$(
        'button[aria-label="Send message"], .send-button, mat-icon[data-mat-icon-name="send"]'
      );
      if (sendButton) {
        await sendButton.click();
      } else {
        await page.keyboard.press("Enter");
      }

      // 5. Wait for image
      if (onStatusUpdate) onStatusUpdate("Generating image...");

      const maxWait = 120000; // 2 minutes
      const startTime = Date.now();
      let imageUrl = "";

      while (Date.now() - startTime < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Wait for generation to stop
        // Gemini often has loading indicators

        // Check for generated images
        imageUrl = await page.evaluate(async () => {
          const images = Array.from(document.querySelectorAll("img"));
          // Iterate backwards to find the newest image
          for (let i = images.length - 1; i >= 0; i--) {
            const img = images[i];
            const src = img.src;
            const alt = img.alt || "";
            const className = img.className || "";

            const isGeminiImage =
              className.includes("image") &&
              className.includes("animate") &&
              (src.includes("lh3.googleusercontent.com") ||
                src.includes("lh3.google.com"));

            if (isGeminiImage) {
              const src = img.src;

              // FOUND IT!
              // Just return the src. We will fetch it in Node.js to avoid CORS/CORP blocks.
              return src;
            }
          }
          return "";
        });

        if (imageUrl) {
          // Wait a bit for stability
          await new Promise((resolve) => setTimeout(resolve, 2000));
          break;
        }
      }

      if (!imageUrl) {
        throw new Error("Timeout waiting for image");
      }

      // Fetch the image in Node.js context to bypass Browser CORS/CORP
      console.log(`[Gemini] Fetching image from: ${imageUrl}`);

      try {
        // Get cookies from the page to authenticate the request
        const cookies = await page.cookies();
        const cookieHeader = cookies
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");

        const response = await fetch(imageUrl, {
          headers: {
            Cookie: cookieHeader,
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });

        if (!response.ok) {
          throw new Error(
            `Failed to fetch image: ${response.status} ${response.statusText}`
          );
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString("base64");
        const mimeType = response.headers.get("content-type") || "image/png";

        const dataUri = `data:${mimeType};base64,${base64}`;

        if (onStatusUpdate) onStatusUpdate("Image generated!");
        return { success: true, imageUrl: dataUri };
      } catch (fetchError) {
        console.error("[Gemini] Node fetch error:", fetchError);
        // Fallback to the raw URL if server fetch fails
        return { success: true, imageUrl: imageUrl };
      }
    } catch (error) {
      console.error("[Gemini] Image generation error:", error);
      return { success: false, error: String(error) };
    }
  }
}
