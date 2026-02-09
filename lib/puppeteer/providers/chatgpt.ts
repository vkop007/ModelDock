import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";
import { browserManager } from "../browser-manager";
import {
  waitForCompletionWithStreaming,
  PROVIDER_CONFIGS,
} from "../fast-streaming";

export class ChatGPTProvider extends BaseProvider {
  private hasActiveConversation: boolean = false;

  constructor() {
    super("chatgpt", "https://chat.openai.com");
  }

  async checkAuthentication(page: Page): Promise<boolean> {
    try {
      // Check for presence of chat interface elements
      await page.waitForSelector(
        PROVIDER_CONFIGS.chatgpt.loginSelectors.join(", "),
        { timeout: 10000 },
      );
      return true;
    } catch {
      // Check for login button or sign-in page
      const loginButton = await page.$(
        PROVIDER_CONFIGS.chatgpt.loginButtonSelectors.join(", "),
      );
      return !loginButton;
    }
  }

  async sendMessage(message: string): Promise<SendMessageResult> {
    console.log("[ChatGPT] Using browser method...");

    try {
      const page = await this.getPage();
      const currentUrl = page.url();
      const isOnChatGPT =
        currentUrl.includes("chat.openai.com") ||
        currentUrl.includes("chatgpt.com");
      const isInConversation =
        currentUrl.includes("/c/") || currentUrl.includes("/g/");

      if (!isOnChatGPT) {
        console.log("[ChatGPT] First time - navigating to ChatGPT");
        await this.navigate();
        // Smart Wait: Wait for input to be present instead of fixed delay
        const inputSelector =
          PROVIDER_CONFIGS.chatgpt.inputSelectors.join(", ");
        try {
          await page.waitForSelector(inputSelector, { timeout: 15000 });
          await page.waitForNetworkIdle({ timeout: 3000 });
        } catch {}
      } else if (this.hasActiveConversation && isInConversation) {
        console.log(
          "[ChatGPT] Continuing existing conversation at:",
          currentUrl,
        );
        // Minimal delay for DOM settling
        await new Promise((resolve) => setTimeout(resolve, 50));
      } else {
        console.log("[ChatGPT] On ChatGPT, waiting for chat interface...");
        const inputSelector =
          PROVIDER_CONFIGS.chatgpt.inputSelectors.join(", ");
        try {
          await page.waitForSelector(inputSelector, { timeout: 5000 });
        } catch {}
      }

      // Wait for input
      const inputSelectors = PROVIDER_CONFIGS.chatgpt.inputSelectors;

      let inputFound = false;
      for (const selector of inputSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          console.log(`[ChatGPT] Found input: ${selector}`);
          inputFound = true;
          break;
        } catch {
          // Try next selector
        }
      }

      if (!inputFound) {
        console.log(
          "[ChatGPT] Primary selectors failed, waiting for any input...",
        );
        await page.waitForSelector(inputSelectors.join(", "), {
          timeout: 20000,
        });
      }

      // Find the input element
      let inputEl = null;
      for (const selector of inputSelectors) {
        inputEl = await page.$(selector);
        if (inputEl) break;
      }

      if (!inputEl) {
        return { success: false, error: "Could not find input element" };
      }

      await inputEl.click();
      // Click verification or minimal settle
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Use direct value setting for speed (like paste)
      await page.evaluate((text) => {
        const active = document.activeElement as HTMLElement;
        if (!active) return;

        if (active.tagName === "TEXTAREA") {
          const el = active as HTMLTextAreaElement;
          el.value = text;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (active.getAttribute("contenteditable") === "true") {
          // Use textContent instead of innerHTML to avoid Trusted Types errors
          active.textContent = text;
          active.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, message);

      console.log(
        `[ChatGPT] Set message content: ${message.substring(0, 50)}...`,
      );

      // Quick verification that text was set
      await page.waitForFunction(
        (text) => {
          const active = document.activeElement as HTMLElement;
          if (!active) return false;
          return (
            active.textContent?.includes(text.substring(0, 10)) ||
            (active as HTMLTextAreaElement).value?.includes(
              text.substring(0, 10),
            )
          );
        },
        { timeout: 2000 },
        message,
      );

      // Find and click the send button
      // Find and click the send button
      const sendButtonClicked = await page.evaluate((selectors: string[]) => {
        for (const selector of selectors) {
          // data-testid
          if (selector.includes("data-testid")) {
            const btn = document.querySelector(selector) as HTMLButtonElement;
            if (btn && !btn.disabled) {
              btn.click();
              return true;
            }
          }
          // aria-label
          else if (selector.includes("aria-label")) {
            const btn = document.querySelector(selector) as HTMLButtonElement;
            if (btn && !btn.disabled) {
              btn.click();
              return true;
            }
          }
          // Generic query for others
          else {
            const btn = document.querySelector(selector) as HTMLButtonElement;
            if (btn && !btn.disabled) {
              btn.click();
              return true;
            }
          }
        }

        // Fallback: Try finding the button next to the textarea (inside the form)
        const form = document.querySelector("form");
        if (form) {
          const buttons = form.querySelectorAll("button");
          for (const btn of buttons) {
            if (btn.querySelector("svg") && !btn.disabled) {
              btn.click();
              return true;
            }
          }
        }

        return false;
      }, PROVIDER_CONFIGS.chatgpt.sendButtonSelectors);

      if (!sendButtonClicked) {
        console.log("[ChatGPT] No button clicked, pressing Enter");
        await page.keyboard.press("Enter");
      }

      console.log("[ChatGPT] Message sent, waiting for response...");

      // Wait for response
      const response = await this.waitForResponse();

      // Mark that we now have an active conversation
      this.hasActiveConversation = true;

      // Log the current URL (should now include /c/ for the conversation)
      const newUrl = page.url();
      console.log(`[ChatGPT] Current conversation URL: ${newUrl}`);

      if (!response) {
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
      await page.waitForSelector(
        PROVIDER_CONFIGS.chatgpt.responseSelectors.join(", "),
        {
          timeout: 30000,
        },
      );
      console.log("[ChatGPT] Response element appeared");
    } catch {
      console.log(
        "[ChatGPT] No response element found, checking for alternatives...",
      );
      try {
        await page.waitForSelector('.markdown, .prose, [class*="message"]', {
          timeout: 15000,
        });
      } catch {
        console.log("[ChatGPT] No response detected");
        return "";
      }
    }

    // Wait for streaming to complete
    console.log("[ChatGPT] Waiting for streaming to complete...");

    let lastLength = 0;
    let stableCount = 0;
    const maxWait = 180000; // 3 minutes max for long responses
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      // Reduced polling delay for faster detection
      await new Promise((resolve) => setTimeout(resolve, 200));

      const isGenerating = await page.evaluate((selectors: string[]) => {
        for (const selector of selectors) {
          if (document.querySelector(selector)) return true;
        }
        return false;
      }, PROVIDER_CONFIGS.chatgpt.generatingSelectors);

      if (isGenerating) {
        stableCount = 0;
        continue;
      }

      // If stop button is gone, verify text stability
      const currentResponse = await page.evaluate((selectors: string[]) => {
        // Try precise selector first
        const messages = document.querySelectorAll(selectors[0]);
        if (messages.length > 0) {
          return messages[messages.length - 1].textContent || "";
        }
        return "";
      }, PROVIDER_CONFIGS.chatgpt.responseSelectors);

      if (
        (currentResponse as string).length === lastLength &&
        (currentResponse as string).length > 0
      ) {
        stableCount++;
        // Require 2 seconds of stability after stop button disappears
        if (stableCount >= 4) {
          console.log("[ChatGPT] Response stable and generation stopped.");
          break;
        }
      } else {
        stableCount = 0;
        lastLength = (currentResponse as string).length;
      }
    }

    // Final verify step with minimal wait
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Get the LAST assistant message text content
    const response = await page.evaluate((selectors: string[]) => {
      const messages = document.querySelectorAll(selectors[0]);
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        return lastMessage.textContent || "";
      }
      return "";
    }, PROVIDER_CONFIGS.chatgpt.responseSelectors);

    console.log(
      `[ChatGPT] Response extracted. Length: ${response.length} chars`,
    );
    console.log("[ChatGPT] Response content:", response);
    return response as string;
  }

  resetConversation(): void {
    this.hasActiveConversation = false;
  }

  /**
   * Set custom instructions in ChatGPT's personalization settings.
   * Uses ChatGPT's backend API directly for reliability.
   */
  async setCustomInstructions(
    instructions: string,
  ): Promise<{ success: boolean; error?: string }> {
    console.log("[ChatGPT] Setting custom instructions via API...");

    try {
      const page = await this.getPage();

      // Make sure we're on ChatGPT domain to have proper auth context
      const currentUrl = page.url();
      if (!currentUrl.includes("chatgpt.com")) {
        console.log("[ChatGPT] Navigating to ChatGPT for auth context...");
        await page.goto("https://chatgpt.com/", {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // First, get the access token by making a request to the session endpoint
      const accessToken = await page.evaluate(async () => {
        try {
          // Try to get token from session API
          const sessionResponse = await fetch(
            "https://chatgpt.com/api/auth/session",
            { credentials: "include" },
          );
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            return sessionData.accessToken || null;
          }
          return null;
        } catch {
          return null;
        }
      });

      if (!accessToken) {
        return {
          success: false,
          error:
            "Could not obtain access token. Please ensure you are logged in to ChatGPT.",
        };
      }

      console.log("[ChatGPT] Got access token, making API call...");

      // Make the API call with the access token
      const result = await page.evaluate(
        async (traitsMessage: string, token: string) => {
          try {
            const response = await fetch(
              "https://chatgpt.com/backend-api/user_system_messages",
              {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                credentials: "include",
                body: JSON.stringify({
                  about_user_message: "",
                  about_model_message: "",
                  name_user_message: "",
                  role_user_message: "",
                  traits_model_message: traitsMessage,
                  other_user_message: "",
                  disabled_tools: [],
                  enabled: true,
                  conversation_id: null,
                  message_id: null,
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
        },
        instructions,
        accessToken,
      );

      if (result.success) {
        console.log("[ChatGPT] Custom instructions set successfully via API");
      } else {
        console.error("[ChatGPT] API call failed:", result.error);
      }

      return result;
    } catch (error) {
      console.error("[ChatGPT] Error setting custom instructions:", error);
      return { success: false, error: String(error) };
    }
  }

  async generateImage(
    prompt: string,
    onStatusUpdate?: (status: string) => void,
  ): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    console.log("[ChatGPT] Generating image...");
    if (onStatusUpdate) onStatusUpdate("Initializing...");

    try {
      const page = await this.getPage();

      // Ensure we are on ChatGPT
      if (!page.url().includes("chatgpt.com")) {
        if (onStatusUpdate) onStatusUpdate("Navigating to ChatGPT...");
        await this.navigate();
        try {
          await page.waitForSelector('[data-testid="composer-plus-btn"]', {
            timeout: 15000,
          });
        } catch {}
      }

      // 1. Click the "+" button
      if (onStatusUpdate) onStatusUpdate("Opening tools menu...");
      try {
        await page.waitForSelector('[data-testid="composer-plus-btn"]', {
          timeout: 5000,
        });
        await page.click('[data-testid="composer-plus-btn"]');
        // Wait for menu to appear instead of fixed delay
        await page.waitForSelector('div[role="menu"]', { timeout: 5000 });
      } catch (e) {
        console.error("Plus button not found", e);
      }

      // 2. Click "Create image"
      if (onStatusUpdate) onStatusUpdate("Selecting Image Generation...");
      const createImgClicked = await page.evaluate(() => {
        const menuItems = Array.from(
          document.querySelectorAll('div[role="menuitemradio"]'),
        );
        const createImgItem = menuItems.find((item) =>
          item.textContent?.includes("Create image"),
        );
        if (createImgItem) {
          (createImgItem as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (!createImgClicked) {
        throw new Error("Could not find 'Create image' option");
      }

      // Minimal settle
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 3. Type prompt
      if (onStatusUpdate) onStatusUpdate("Typing prompt...");
      const inputEl =
        (await page.$("#prompt-textarea")) ||
        (await page.$('div[contenteditable="true"]')) ||
        (await page.$("textarea"));

      if (!inputEl) {
        throw new Error("Could not find input element");
      }

      await inputEl.click();
      await page.keyboard.type(prompt, { delay: 10 });
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 4. Send
      if (onStatusUpdate) onStatusUpdate("Sending request...");

      const sendButtonClicked = await page.evaluate(() => {
        const sendBtn = document.querySelector(
          '[data-testid="send-button"]',
        ) as HTMLButtonElement;
        if (sendBtn && !sendBtn.disabled) {
          sendBtn.click();
          return true;
        }
        return false;
      });

      if (!sendButtonClicked) {
        console.log("[ChatGPT] No send button found, pressing Enter");
        await page.keyboard.press("Enter");
      }

      const maxWait = 120000; // 2 minutes
      const startTime = Date.now();
      let imageUrl = "";

      while (Date.now() - startTime < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check for stop button
        const isGenerating = await page.evaluate(() => {
          return (
            document.querySelector('button[aria-label="Stop generating"]') !==
            null
          );
        });

        if (isGenerating) {
          continue;
        }

        const imageCreatedText = await page.evaluate(() => {
          const spans = Array.from(document.querySelectorAll("span"));
          return spans.some((s) => s.textContent?.includes("Image created"));
        });

        if (!imageCreatedText) {
          continue;
        }

        imageUrl = await page.evaluate(async () => {
          const images = Array.from(
            document.querySelectorAll('img[alt="Generated image"]'),
          );
          if (images.length > 0) {
            const imgParams = images[images.length - 1] as HTMLImageElement;
            const src = imgParams.src;

            try {
              const response = await fetch(src);
              const blob = await response.blob();
              return await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
            } catch (e) {
              console.error("Failed to convert to base64", e);
              return src;
            }
          }
          return "";
        });

        if (imageUrl) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          break;
        }

        const errorMsg = await page.evaluate(() => {
          const alerts = document.querySelectorAll(
            'div[role="alert"], .text-red-500',
          );
          if (alerts.length > 0) {
            return alerts[alerts.length - 1].textContent;
          }
          return null;
        });

        if (errorMsg) {
          throw new Error(`Generation failed: ${errorMsg}`);
        }
      }

      if (!imageUrl) {
        throw new Error("Timeout waiting for image generation");
      }

      if (onStatusUpdate) onStatusUpdate("Image generated!");
      return { success: true, imageUrl };
    } catch (error) {
      console.error("[ChatGPT] Image generation error:", error);
      return { success: false, error: String(error) };
    }
  }

  // Streaming version of sendMessage - calls callback with each chunk
  async sendMessageWithStreaming(
    message: string,
    onChunk: (chunk: string) => void,
    conversationId?: string,
    imagePaths?: string[],
    signal?: AbortSignal,
  ): Promise<SendMessageResult> {
    console.log("[ChatGPT] Using browser streaming...");

    try {
      // ----------------------------------------------------------------------
      // BLOCK 1: INPUT PHASE (Serialized)
      // ----------------------------------------------------------------------
      // Check signal before starting
      if (signal?.aborted) throw new Error("AbortError");

      await browserManager.runTask(this.provider, async () => {
        const page = await this.getPage();

        // Check signal inside task
        if (signal?.aborted) throw new Error("AbortError");

        // Navigation logic
        const currentUrl = page.url();
        const targetUrl = conversationId
          ? `https://chatgpt.com/c/${conversationId}`
          : null;

        if (targetUrl && !currentUrl.includes(conversationId!)) {
          console.log(
            `[ChatGPT] Navigating to specific conversation: ${conversationId}`,
          );
          await page.goto(targetUrl, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
          });
          const inputSelector =
            PROVIDER_CONFIGS.chatgpt.inputSelectors.join(", ");
          try {
            await page.waitForSelector(inputSelector, { timeout: 10000 });
          } catch {}
        } else if (!conversationId && currentUrl.includes("/c/")) {
          console.log(
            "[ChatGPT] Starting new conversation - navigating to root",
          );
          await this.navigate();
          const inputSelector =
            PROVIDER_CONFIGS.chatgpt.inputSelectors.join(", ");
          try {
            await page.waitForSelector(inputSelector, { timeout: 10000 });
          } catch {}
        } else if (!currentUrl.includes("chatgpt.com")) {
          console.log("[ChatGPT] First time - navigating to ChatGPT");
          await this.navigate();
          const inputSelector =
            PROVIDER_CONFIGS.chatgpt.inputSelectors.join(", ");
          try {
            await page.waitForSelector(inputSelector, { timeout: 15000 });
          } catch {}
        } else {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        if (signal?.aborted) throw new Error("AbortError");

        // Handle Image Uploads
        if (imagePaths && imagePaths.length > 0) {
          console.log(`[ChatGPT] Uploading ${imagePaths.length} images...`);

          try {
            // 1. Locate file input
            let fileInput = await page.$('input[type="file"]');

            if (!fileInput) {
              console.log(
                "[ChatGPT] File input not found, clicking plus button...",
              );
              try {
                await page.waitForSelector(
                  '[data-testid="composer-plus-btn"]',
                  {
                    timeout: 2000,
                  },
                );
                await page.click('[data-testid="composer-plus-btn"]');
                await new Promise((resolve) => setTimeout(resolve, 500));
                fileInput = await page.$('input[type="file"]');
              } catch (e) {
                console.log("[ChatGPT] Plus button interaction failed", e);
              }
            }

            if (fileInput) {
              // 2. Upload files
              await fileInput.uploadFile(...imagePaths);
              console.log("[ChatGPT] Files assigned to input");

              // 3. Wait for upload to complete
              try {
                await page.waitForSelector(
                  'button[aria-label="Remove attachment"], [data-testid="file-attachment"], img[alt="Uploaded image"], .group.relative img',
                  { timeout: 10000 },
                );
                console.log("[ChatGPT] Upload previews detected");
              } catch (e) {
                console.log(
                  "[ChatGPT] Warning: Could not detect upload preview, but continuing...",
                );
              }
              await new Promise((resolve) => setTimeout(resolve, 3000));
            } else {
              console.error("[ChatGPT] Could not find file input for upload");
            }
          } catch (uploadError) {
            console.error("[ChatGPT] Upload failed:", uploadError);
          }
        }

        if (signal?.aborted) throw new Error("AbortError");

        // Wait for input
        const inputSelectors = PROVIDER_CONFIGS.chatgpt.inputSelectors;

        let inputFound = false;
        for (const selector of inputSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 5000 });
            console.log(`[ChatGPT] Found input: ${selector}`);
            inputFound = true;
            break;
          } catch {
            // Try next selector
          }
        }

        if (!inputFound) {
          // Last resort - wait longer for any input
          console.log(
            "[ChatGPT] Primary selectors failed, waiting for any input...",
          );
          await page.waitForSelector(inputSelectors.join(", "), {
            timeout: 20000,
          });
        }

        // Type and send message - try all known input selectors
        let inputEl = null;
        for (const selector of inputSelectors) {
          inputEl = await page.$(selector);
          if (inputEl) break;
        }

        if (!inputEl) {
          throw new Error("Could not find input element");
        }

        await inputEl.click();
        await new Promise((resolve) => setTimeout(resolve, 20));
        await page.keyboard.type(message, { delay: 10 });
        // Verification wait
        await page.waitForFunction(
          (text) => {
            const active = document.activeElement as HTMLElement;
            return (
              active?.textContent?.includes(text.substring(0, 5)) ||
              (active as HTMLTextAreaElement)?.value?.includes(
                text.substring(0, 5),
              )
            );
          },
          { timeout: 2000 },
          message,
        );

        // NOW click send button
        const sendButtonClicked = await page.evaluate((selectors: string[]) => {
          for (const selector of selectors) {
            const btn = document.querySelector(
              selector,
            ) as HTMLButtonElement | null;
            if (btn && !btn.disabled) {
              btn.click();
              return true;
            }
          }

          // Fallback
          const form = document.querySelector("form");
          if (form) {
            const buttons = form.querySelectorAll("button");
            for (const b of buttons) {
              if (b.querySelector("svg") && !b.disabled) {
                b.click();
                return true;
              }
            }
          }
          return false;
        }, PROVIDER_CONFIGS.chatgpt.sendButtonSelectors);

        if (!sendButtonClicked) {
          await page.keyboard.press("Enter");
        }

        console.log("[ChatGPT] Message sent, waiting for response...");
      });

      if (signal?.aborted) throw new Error("AbortError");

      // ----------------------------------------------------------------------
      // BLOCK 2: OUTPUT PHASE (Serialized)
      // ----------------------------------------------------------------------
      return await browserManager.runTask(this.provider, async () => {
        const page = await this.getPage();

        if (signal?.aborted) throw new Error("AbortError");

        // Wait for assistant message to appear
        try {
          await page.waitForSelector(
            PROVIDER_CONFIGS.chatgpt.responseSelectors[0],
            { timeout: 30000 },
          );
        } catch {
          return { success: false, error: "No response received" };
        }

        // Use DOM polling for streaming
        const config = PROVIDER_CONFIGS.chatgpt;
        const result = await waitForCompletionWithStreaming(
          page,
          config,
          onChunk,
          180000,
          signal,
        );

        this.hasActiveConversation = true;

        const finalText = result.content;
        const finalUrl = page.url();
        const match = finalUrl.match(/\/c\/([a-zA-Z0-9-]+)/);
        const newConversationId = match ? match[1] : undefined;

        console.log(
          `[ChatGPT] Streaming complete. Text length: ${finalText.length}. ConvID: ${newConversationId}`,
        );
        console.log("[ChatGPT] Response content:", finalText);

        return {
          success: true,
          content: finalText,
          conversationId: newConversationId,
        };
      });
    } catch (error) {
      if (error instanceof Error && error.message === "AbortError") {
        console.log(
          "[ChatGPT] Request aborted, attempting to stop generation in browser...",
        );
        // Best-effort attempt to stop the browser generation
        await browserManager
          .runTask(this.provider, async () => {
            const page = await this.getPage();
            // Try common stop button selectors
            const stopSelector =
              'button[aria-label="Stop generating"], button[aria-label="Stop response"]';
            const stopBtn = await page.$(stopSelector);
            if (stopBtn) {
              await stopBtn.click();
              console.log("[ChatGPT] Clicked stop button in browser");
            }
          })
          .catch((e) => console.error("[ChatGPT] Failed to click stop", e));
      }
      console.error("[ChatGPT] Streaming error:", error);
      return { success: false, error: String(error) };
    }
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    console.log(`[ChatGPT] Deleting conversation via API: ${conversationId}`);
    try {
      const page = await this.getPage();

      const currentUrl = page.url();
      if (!currentUrl.includes("chatgpt.com")) {
        await this.navigate();
        try {
          await page.waitForSelector("form", { timeout: 10000 });
        } catch {}
      }

      const result = await page.evaluate(async (convId: string) => {
        try {
          const sessionRes = await fetch("/api/auth/session", {
            credentials: "include",
          });
          const sessionData = await sessionRes.json();
          const accessToken = sessionData?.accessToken;

          if (!accessToken) {
            return { success: false, error: "Could not retrieve access token" };
          }

          const response = await fetch(
            `https://chatgpt.com/backend-api/conversation/${convId}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ is_visible: false }),
              credentials: "include",
            },
          );

          if (response.ok) {
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
        console.log(`[ChatGPT] Conversation deleted successfully`);
        this.resetConversation();
        return true;
      } else {
        console.error(`[ChatGPT] API delete failed:`, result.error);
        return false;
      }
    } catch (error) {
      console.error("[ChatGPT] Deletion error:", error);
      return false;
    }
  }
}
