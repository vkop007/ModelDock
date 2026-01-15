import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";
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
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          await page.waitForNetworkIdle({ timeout: 3000 });
        } catch {}
      } else if (this.hasActiveConversation && isInConversation) {
        console.log(
          "[ChatGPT] Continuing existing conversation at:",
          currentUrl
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
      } else {
        console.log("[ChatGPT] On ChatGPT, waiting for chat interface...");
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      try {
        await page.waitForSelector("#prompt-textarea", { timeout: 20000 });
        console.log("[ChatGPT] Found #prompt-textarea");
      } catch {
        console.log(
          "[ChatGPT] #prompt-textarea not found, trying alternatives..."
        );
        await page.waitForSelector('div[contenteditable="true"], textarea', {
          timeout: 15000,
        });
      }

      const inputEl =
        (await page.$("#prompt-textarea")) ||
        (await page.$('div[contenteditable="true"]')) ||
        (await page.$("textarea"));

      if (!inputEl) {
        return { success: false, error: "Could not find input element" };
      }

      await inputEl.click();
      await new Promise((resolve) => setTimeout(resolve, 100)); // Reduced from 300ms

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
          active.innerHTML = text; // or textContent? ChatGPT handles HTML sometimes. Safest is text.
          (active as HTMLElement).innerText = text; // Use innerText to be safe
          active.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, message);

      console.log(
        `[ChatGPT] Set message content: ${message.substring(0, 50)}...`
      );

      // Quick wait for text to register in UI state
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Find and click the send button
      const sendButtonClicked = await page.evaluate(() => {
        // Try finding the send button by data-testid
        const sendBtn = document.querySelector(
          '[data-testid="send-button"]'
        ) as HTMLButtonElement;
        if (sendBtn && !sendBtn.disabled) {
          sendBtn.click();
          return true;
        }

        // Try finding by aria-label
        const ariaBtn = document.querySelector(
          'button[aria-label="Send prompt"]'
        ) as HTMLButtonElement;
        if (ariaBtn && !ariaBtn.disabled) {
          ariaBtn.click();
          return true;
        }

        // Try finding the button next to the textarea (inside the form)
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
      });

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
      await page.waitForSelector('[data-message-author-role="assistant"]', {
        timeout: 30000,
      });
      console.log("[ChatGPT] Response element appeared");
    } catch {
      console.log(
        "[ChatGPT] No response element found, checking for alternatives..."
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
      await new Promise((resolve) => setTimeout(resolve, 500)); // Standard poll 500ms

      const isGenerating = await page.evaluate(() => {
        const btn = document.querySelector(
          'button[aria-label="Stop generating"]'
        );
        return btn !== null;
      });

      if (isGenerating) {
        stableCount = 0;
        continue;
      }

      // If stop button is gone, verify text stability
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
        // Require 2 seconds of stability after stop button disappears
        if (stableCount >= 4) {
          console.log("[ChatGPT] Response stable and generation stopped.");
          break;
        }
      } else {
        stableCount = 0;
        lastLength = currentResponse.length;
      }
    }

    // Small delay to ensure content is fully rendered
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get the LAST assistant message text content
    const response = await page.evaluate(() => {
      const messages = document.querySelectorAll(
        '[data-message-author-role="assistant"]'
      );
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        return lastMessage.textContent || "";
      }
      return "";
    });

    console.log(
      `[ChatGPT] Response extracted. Length: ${response.length} chars`
    );
    console.log("[ChatGPT] Response content:", response);
    return response;
  }

  resetConversation(): void {
    this.hasActiveConversation = false;
  }

  async generateImage(
    prompt: string,
    onStatusUpdate?: (status: string) => void
  ): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    console.log("[ChatGPT] Generating image...");
    if (onStatusUpdate) onStatusUpdate("Initializing...");

    try {
      const page = await this.getPage();

      // Ensure we are on ChatGPT
      if (!page.url().includes("chatgpt.com")) {
        if (onStatusUpdate) onStatusUpdate("Navigating to ChatGPT...");
        await this.navigate();
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // 1. Click the "+" button
      if (onStatusUpdate) onStatusUpdate("Opening tools menu...");
      try {
        await page.waitForSelector('[data-testid="composer-plus-btn"]', {
          timeout: 5000,
        });
        await page.click('[data-testid="composer-plus-btn"]');
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (e) {
        console.error("Plus button not found", e);
      }

      // 2. Click "Create image"
      if (onStatusUpdate) onStatusUpdate("Selecting Image Generation...");
      const createImgClicked = await page.evaluate(() => {
        const menuItems = Array.from(
          document.querySelectorAll('div[role="menuitemradio"]')
        );
        const createImgItem = menuItems.find((item) =>
          item.textContent?.includes("Create image")
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

      await new Promise((resolve) => setTimeout(resolve, 1000));

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
          '[data-testid="send-button"]'
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
            document.querySelectorAll('img[alt="Generated image"]')
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
            'div[role="alert"], .text-red-500'
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
    imagePaths?: string[]
  ): Promise<SendMessageResult> {
    console.log("[ChatGPT] Using browser streaming...");

    try {
      const page = await this.getPage();

      // Navigation logic
      const currentUrl = page.url();
      const targetUrl = conversationId
        ? `https://chatgpt.com/c/${conversationId}`
        : null;

      if (targetUrl && !currentUrl.includes(conversationId!)) {
        console.log(
          `[ChatGPT] Navigating to specific conversation: ${conversationId}`
        );
        await page.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else if (!conversationId && currentUrl.includes("/c/")) {
        // If no conversation ID provided but we are in a conversation, go to new chat
        console.log("[ChatGPT] Starting new conversation - navigating to root");
        await this.navigate();
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else if (!currentUrl.includes("chatgpt.com")) {
        console.log("[ChatGPT] First time - navigating to ChatGPT");
        await this.navigate();
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          await page.waitForNetworkIdle({ timeout: 3000 });
        } catch {
          // Continue anyway
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Handle Image Uploads
      if (imagePaths && imagePaths.length > 0) {
        console.log(`[ChatGPT] Uploading ${imagePaths.length} images...`);

        try {
          // 1. Locate file input
          // ChatGPT usually has a hidden file input. If not found, we might need to click the plus button to insert it into DOM.
          let fileInput = await page.$('input[type="file"]');

          if (!fileInput) {
            console.log(
              "[ChatGPT] File input not found, clicking plus button..."
            );
            try {
              await page.waitForSelector('[data-testid="composer-plus-btn"]', {
                timeout: 2000,
              });
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
            // Look for the preview image container or file attachment
            try {
              await page.waitForSelector(
                'button[aria-label="Remove attachment"], [data-testid="file-attachment"], img[alt="Uploaded image"], .group.relative img',
                { timeout: 10000 }
              );
              console.log("[ChatGPT] Upload previews detected");
            } catch (e) {
              console.log(
                "[ChatGPT] Warning: Could not detect upload preview, but continuing..."
              );
            }

            // Wait a bit more for processing (important for image analysis)
            await new Promise((resolve) => setTimeout(resolve, 3000));
          } else {
            console.error("[ChatGPT] Could not find file input for upload");
          }
        } catch (uploadError) {
          console.error("[ChatGPT] Upload failed:", uploadError);
          // Continue to send message anyway, or maybe throw?
          // Prefer continuing but logging error
        }
      }

      // Wait for input - reduced timeouts
      try {
        await page.waitForSelector("#prompt-textarea", { timeout: 20000 });
      } catch {
        await page.waitForSelector('div[contenteditable="true"], textarea', {
          timeout: 15000,
        });
      }

      // Type and send message
      const inputEl =
        (await page.$("#prompt-textarea")) ||
        (await page.$('div[contenteditable="true"]')) ||
        (await page.$("textarea"));

      if (!inputEl) {
        return { success: false, error: "Could not find input element" };
      }

      await inputEl.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await page.keyboard.type(message, { delay: 10 });
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Click send button
      const sendButtonClicked = await page.evaluate(() => {
        const btn = document.querySelector(
          '[data-testid="send-button"]'
        ) as HTMLButtonElement;
        if (btn && !btn.disabled) {
          btn.click();
          return true;
        }
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
      });

      if (!sendButtonClicked) {
        await page.keyboard.press("Enter");
      }

      console.log("[ChatGPT] Message sent, streaming response...");

      try {
        await page.waitForSelector('[data-message-author-role="assistant"]', {
          timeout: 30000,
        });
      } catch {
        return { success: false, error: "No response received" };
      }

      // Fast streaming with 50ms polling
      const config = PROVIDER_CONFIGS.chatgpt;
      const result = await waitForCompletionWithStreaming(
        page,
        config,
        onChunk,
        180000
      );

      this.hasActiveConversation = true;

      const finalText = result.content;
      const finalUrl = page.url();
      const match = finalUrl.match(/\/c\/([a-zA-Z0-9-]+)/);
      const newConversationId = match ? match[1] : undefined;

      console.log(
        `[ChatGPT] Streaming complete. Text length: ${finalText.length}. ConvID: ${newConversationId}`
      );
      console.log("[ChatGPT] Response content:", finalText);

      return {
        success: true,
        content: finalText,
        conversationId: newConversationId,
      };
    } catch (error) {
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
        await new Promise((resolve) => setTimeout(resolve, 2000));
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
            }
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
