import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";
import { browserManager } from "../browser-manager";
import {
  waitForCompletionWithStreaming,
  PROVIDER_CONFIGS,
} from "../fast-streaming";

export class GeminiProvider extends BaseProvider {
  constructor() {
    super("gemini", "https://gemini.google.com/app");
  }

  async checkAuthentication(page: Page): Promise<boolean> {
    try {
      await page.waitForSelector(
        PROVIDER_CONFIGS.gemini.loginSelectors.join(", "),
        { timeout: 10000 },
      );
      return true;
    } catch {
      const signInButton = await page.$(
        PROVIDER_CONFIGS.gemini.loginButtonSelectors.join(", "),
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
    conversationId?: string,
    imagePaths?: string[],
    signal?: AbortSignal,
  ): Promise<SendMessageResult> {
    try {
      // Check signal before starting
      if (signal?.aborted) throw new Error("AbortError");

      // ----------------------------------------------------------------------
      // BLOCK 1: INPUT PHASE (Serialized)
      // ----------------------------------------------------------------------
      let previousResponseCount = 0;

      await browserManager.runTask(this.provider, async () => {
        const page = await this.getPage();

        if (signal?.aborted) throw new Error("AbortError");

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
          try {
            await page.waitForSelector(
              PROVIDER_CONFIGS.gemini.inputSelectors.join(", "),
              { timeout: 10000 },
            );
          } catch {}
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
            try {
              await page.waitForSelector(
                PROVIDER_CONFIGS.gemini.inputSelectors.join(", "),
                { timeout: 10000 },
              );
            } catch {}
          }
        } else if (!currentUrl.includes("gemini.google.com")) {
          await this.navigate();
          try {
            await page.waitForSelector(
              PROVIDER_CONFIGS.gemini.inputSelectors.join(", "),
              { timeout: 10000 },
            );
          } catch {}
        }

        if (signal?.aborted) throw new Error("AbortError");

        // Handle Image Uploads
        if (imagePaths && imagePaths.length > 0) {
          console.log(`[Gemini] Uploading ${imagePaths.length} images...`);
          try {
            // 1. Locate file input. Gemini usually has one.
            // Sometimes we need to click "Add to prompt" (+) button first.
            let fileInput = await page.$('input[type="file"]');

            if (!fileInput) {
              const plusBtn = await page.$(
                'button[aria-label="Add to prompt"], button[aria-label="Upload image"]',
              );
              if (plusBtn) {
                await plusBtn.click();
                await new Promise((resolve) => setTimeout(resolve, 500));
                fileInput = await page.$('input[type="file"]');
              }
            }

            if (fileInput) {
              await fileInput.uploadFile(...imagePaths);
              console.log("[Gemini] Files assigned to input");

              // Wait for preview to appear
              // Gemini shows thumbnails in the input area
              try {
                await page.waitForSelector(
                  'img[alt="Image preview"], .image-preview',
                  { timeout: 10000 },
                );
                console.log("[Gemini] Upload previews detected");
              } catch (e) {
                console.log("[Gemini] Warning: Image preview not detected");
              }
              await new Promise((resolve) => setTimeout(resolve, 2000));
            } else {
              console.error("[Gemini] Could not find file input for upload");
            }
          } catch (uploadError) {
            console.error("[Gemini] Upload failed:", uploadError);
          }
        }

        if (signal?.aborted) throw new Error("AbortError");

        // Wait for the input field - Updated selectors for 2024 Gemini UI
        const inputSelector = PROVIDER_CONFIGS.gemini.inputSelectors.join(", ");
        await page.waitForSelector(inputSelector, { timeout: 30000 });

        // Focus and type the message
        const input = await page.$(inputSelector);
        if (input) {
          await input.click();
          await new Promise((resolve) => setTimeout(resolve, 50));

          // Select all and delete any existing content
          await page.keyboard.down("Meta"); // Cmd on Mac
          await page.keyboard.press("a");
          await page.keyboard.up("Meta");
          await page.keyboard.press("Backspace");
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Type the message using keyboard
          await page.keyboard.type(message, { delay: 5 });
        }

        // Small delay for UI to update
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Count existing responses BEFORE sending so we can detect the new one
        previousResponseCount = await page.evaluate((selectors: string[]) => {
          const responses = document.querySelectorAll(selectors.join(", "));
          return responses.length;
        }, PROVIDER_CONFIGS.gemini.responseSelectors);

        // Click send button
        const sendButton = await page.$(
          PROVIDER_CONFIGS.gemini.sendButtonSelectors.join(", "),
        );
        if (sendButton) {
          await sendButton.click();
        } else {
          // Try pressing Enter
          await page.keyboard.press("Enter");
        }
      });

      if (signal?.aborted) throw new Error("AbortError");

      // ----------------------------------------------------------------------
      // BLOCK 2: OUTPUT PHASE (Serialized)
      // ----------------------------------------------------------------------
      return await browserManager.runTask(this.provider, async () => {
        const page = await this.getPage();

        if (signal?.aborted) throw new Error("AbortError");

        // Wait for response with streaming
        console.log("[Gemini] Waiting for response to start streaming...");

        // Wait for a NEW response to appear (more than previousResponseCount)
        try {
          await page.waitForFunction(
            (prevCount: number, selectors: string[]) => {
              const responses = document.querySelectorAll(selectors.join(", "));
              return responses.length > prevCount;
            },
            { timeout: 15000 },
            previousResponseCount,
            PROVIDER_CONFIGS.gemini.responseSelectors,
          );
        } catch {
          // Continue, might use loading indicator
        }

        console.log("[Gemini] Waiting for streaming to complete...");

        // Fast streaming with 50ms polling
        const config = PROVIDER_CONFIGS.gemini;
        const result = await waitForCompletionWithStreaming(
          page,
          config,
          onChunk,
          180000,
          signal, // Pass signal to break polling
        );
        const lastContent = result.content;

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
      });
    } catch (error) {
      if (error instanceof Error && error.message === "AbortError") {
        console.log(
          "[Gemini] Request aborted, attempting to stop generation in browser...",
        );
        // Best-effort attempt to stop the browser generation
        await browserManager
          .runTask(this.provider, async () => {
            const page = await this.getPage();
            // Try common stop button selectors
            const stopSelector =
              PROVIDER_CONFIGS.gemini.generatingSelectors.join(", ");
            const stopBtn = await page.$(stopSelector);
            if (stopBtn) {
              await stopBtn.click();
              console.log("[Gemini] Clicked stop button in browser");
            }
          })
          .catch((e) => console.error("[Gemini] Failed to click stop", e));
      }
      return { success: false, error: String(error) };
    }
  }

  async waitForResponse(): Promise<string> {
    const page = await this.getPage();

    console.log("[Gemini] Waiting for response to start streaming...");

    // Wait for any likely response container or loading indicator
    try {
      await page.waitForSelector(
        PROVIDER_CONFIGS.gemini.responseSelectors.join(", ") +
          ", .loading-indicator",
        { timeout: 15000 },
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
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check for stop button
      const isGenerating = await page.evaluate((selectors: string[]) => {
        for (const selector of selectors) {
          if (document.querySelector(selector)) return true;
        }
        return false;
      }, PROVIDER_CONFIGS.gemini.generatingSelectors);

      if (isGenerating) {
        stableCount = 0;
        continue;
      }

      // Check content stability
      const currentResponse = await page.evaluate((selectors: string[]) => {
        const responses = document.querySelectorAll(selectors.join(", "));
        if (responses.length > 0) {
          return responses[responses.length - 1].textContent || "";
        }
        return "";
      }, PROVIDER_CONFIGS.gemini.responseSelectors);

      if (
        (currentResponse as string).length === lastLength &&
        (currentResponse as string).length > 0
      ) {
        stableCount++;
        if (stableCount >= 4) {
          // 2 seconds stable
          console.log("[Gemini] Response stable and generation stopped.");
          break;
        }
      } else {
        stableCount = 0;
        lastLength = (currentResponse as string).length;
      }
    }

    // Small delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get final response
    const response = await page.evaluate((selectors: string[]) => {
      const responses = document.querySelectorAll(selectors.join(", "));
      if (responses.length > 0) {
        return responses[responses.length - 1].textContent || "";
      }
      return "";
    }, PROVIDER_CONFIGS.gemini.responseSelectors);

    return response as string;
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
        try {
          await page.waitForSelector(
            '[data-test-id="conversation-actions-button"]',
            { timeout: 10000 },
          );
        } catch {}
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
    onStatusUpdate?: (status: string) => void,
  ): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    console.log("[Gemini] Generating image...");
    if (onStatusUpdate) onStatusUpdate("Initializing...");

    try {
      const page = await this.getPage();

      // Ensure we are on Gemini
      if (!page.url().includes("gemini.google.com")) {
        if (onStatusUpdate) onStatusUpdate("Navigating to Gemini...");
        await this.navigate();
        try {
          await page.waitForSelector('button[aria-label="Tools"]', {
            timeout: 15000,
          });
        } catch {}
      }

      // 1. Open Toolbox if not already open (or just find the button)
      if (onStatusUpdate) onStatusUpdate("Opening tools menu...");

      // Try to clicking the Tools button
      try {
        const toolsBtn = await page.$('button[aria-label="Tools"]');
        if (toolsBtn) {
          await toolsBtn.click();
          await page.waitForFunction(
            () => {
              const buttons = Array.from(document.querySelectorAll("button"));
              return buttons.some((btn) =>
                btn.textContent?.includes("Create images"),
              );
            },
            { timeout: 5000 },
          );
        }
      } catch (e) {
        console.log(
          "[Gemini] Tools button interaction failed or not needed",
          e,
        );
      }

      // 2. Select "Create images"
      if (onStatusUpdate) onStatusUpdate("Selecting Image Generation...");

      const createImgClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const createImgBtn = buttons.find((btn) =>
          btn.textContent?.includes("Create images"),
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
          "[Gemini] 'Create images' option not found, trying direct prompt...",
        );
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // 3. Type prompt
      if (onStatusUpdate) onStatusUpdate("Typing prompt...");
      const inputSelector = PROVIDER_CONFIGS.gemini.inputSelectors.join(", ");
      await page.waitForSelector(inputSelector, { timeout: 10000 });

      const input = await page.$(inputSelector);
      if (!input) throw new Error("Input not found");

      await input.click();
      await page.keyboard.type(prompt, { delay: 10 });
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 4. Send
      if (onStatusUpdate) onStatusUpdate("Sending request...");
      const sendButton = await page.$(
        PROVIDER_CONFIGS.gemini.sendButtonSelectors.join(", "),
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
            `Failed to fetch image: ${response.status} ${response.statusText}`,
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

  /**
   * Set custom instructions in Gemini's saved info settings.
   * Uses browser automation on the Personal Context page.
   */
  async setCustomInstructions(
    instructions: string,
  ): Promise<{ success: boolean; error?: string }> {
    console.log(
      "[Gemini] Setting custom instructions via browser automation...",
    );

    try {
      const page = await this.getPage();

      // Navigate to the saved-info (Personal Context) page
      console.log("[Gemini] Navigating to Personal Context page...");
      await page.goto("https://gemini.google.com/saved-info", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      try {
        await page.waitForSelector("button.create-memory-button", {
          timeout: 15000,
        });
      } catch {}

      // If instructions is empty, just delete all and return
      if (!instructions || instructions.trim() === "") {
        console.log("[Gemini] Empty instructions - deleting all...");
        const deleteAllBtn = await page.$("button.delete-all-memories-button");
        if (deleteAllBtn) {
          console.log("[Gemini] Found delete all button, clicking...");
          await deleteAllBtn.click();

          // Wait for the confirmation dialog to appear
          console.log("[Gemini] Waiting for confirmation dialog...");
          try {
            await page.waitForSelector(
              'button[data-test-id="delete-all-memories-button"]',
              { timeout: 5000 },
            );
            const confirmBtn = await page.$(
              'button[data-test-id="delete-all-memories-button"]',
            );
            if (confirmBtn) {
              console.log("[Gemini] Clicking confirm delete button...");
              await confirmBtn.click();
              await new Promise((resolve) => setTimeout(resolve, 1500));
              console.log("[Gemini] All instructions deleted successfully");
            }
          } catch (e) {
            console.log(
              "[Gemini] Confirmation dialog not found, may already be deleted",
            );
          }
        } else {
          console.log(
            "[Gemini] No delete button found - no instructions to delete",
          );
        }
        return { success: true };
      }

      // Step 1: Click the "Add" button
      console.log("[Gemini] Clicking Add button...");
      const addButton = await page.$("button.create-memory-button");
      if (!addButton) {
        return { success: false, error: "Could not find Add button" };
      }
      await addButton.click();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 3: Fill in the textarea
      console.log("[Gemini] Filling in instruction textarea...");
      const textarea = await page.$("textarea.edit-memory-input");
      if (!textarea) {
        return { success: false, error: "Could not find instruction textarea" };
      }
      await textarea.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await page.keyboard.down("Meta");
      await page.keyboard.press("a");
      await page.keyboard.up("Meta");
      await page.keyboard.press("Backspace");
      await page.keyboard.type(instructions, { delay: 5 });
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Step 4: Click the Submit button
      console.log("[Gemini] Clicking Submit button...");
      const submitButton = await page.$(
        'button[data-test-id="submit-button"], button.edit-memory-submit-button',
      );
      if (!submitButton) {
        return { success: false, error: "Could not find Submit button" };
      }
      await submitButton.click();
      await new Promise((resolve) => setTimeout(resolve, 1500));

      console.log("[Gemini] Custom instructions set successfully");
      return { success: true };
    } catch (error) {
      console.error("[Gemini] Error setting custom instructions:", error);
      return { success: false, error: String(error) };
    }
  }
}
