import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";
import {
  captureCredentials,
  getStoredCredentials,
  sendDirectMessage,
  sendDirectMessageStreaming,
  CapturedCredentials,
} from "../api-capture";

export class ChatGPTProvider extends BaseProvider {
  private hasActiveConversation: boolean = false;
  private conversationId?: string; // Track conversation for direct API
  private isCapturing: boolean = false; // Flag to capture credentials

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

  // Capture credentials without sending a message - just load page and extract token
  async captureCredentialsOnly(
    cookies?: import("@/types").CookieEntry[]
  ): Promise<boolean> {
    console.log("[ChatGPT] Capturing credentials from page load...");

    try {
      const page = await this.getPage();

      // Inject cookies first to ensure we're logged in
      if (cookies && cookies.length > 0) {
        await this.injectCookies(cookies);
      }

      // Set up credential capture
      const capturePromise = captureCredentials(page, "chatgpt");

      // Navigate to ChatGPT - this will trigger API calls that contain the auth token
      await this.navigate();
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Wait for credentials to be captured (with timeout)
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 15000)
      );

      const result = await Promise.race([capturePromise, timeoutPromise]);

      if (result) {
        console.log("[ChatGPT] Credentials captured! Closing browser...");
        // Close the browser - we don't need it anymore
        const { browserManager } = await import("../browser-manager");
        await browserManager.closePage("chatgpt");
        return true;
      } else {
        console.log("[ChatGPT] Failed to capture credentials");
        return false;
      }
    } catch (error) {
      console.error("[ChatGPT] Error capturing credentials:", error);
      return false;
    }
  }

  async sendMessage(message: string): Promise<SendMessageResult> {
    // First, try direct API if we have credentials
    const credentials = getStoredCredentials("chatgpt");

    if (credentials) {
      console.log("[ChatGPT] Trying direct API call...");
      const result = await sendDirectMessage(
        message,
        credentials,
        this.conversationId
      );

      if (result.success && result.content) {
        if (result.conversationId) {
          this.conversationId = result.conversationId;
        }
        this.hasActiveConversation = true;
        console.log(`[ChatGPT] Direct API success!`);
        return { success: true, content: result.content };
      }

      // If token expired, try to recapture
      if (result.error === "TOKEN_EXPIRED") {
        console.log("[ChatGPT] Token expired, recapturing...");
        const recaptured = await this.captureCredentialsOnly();
        if (recaptured) {
          const newCredentials = getStoredCredentials("chatgpt");
          if (newCredentials) {
            const retryResult = await sendDirectMessage(
              message,
              newCredentials,
              this.conversationId
            );
            if (retryResult.success && retryResult.content) {
              if (retryResult.conversationId) {
                this.conversationId = retryResult.conversationId;
              }
              return { success: true, content: retryResult.content };
            }
          }
        }
      }
    }

    // If all else fails, fall back to browser-based approach
    console.log("[ChatGPT] Using browser method...");

    try {
      const page = await this.getPage();

      // Start capturing credentials in background (for direct API next time)
      if (!this.isCapturing) {
        this.isCapturing = true;
        captureCredentials(page, "chatgpt").then(async () => {
          this.isCapturing = false;
          console.log("[ChatGPT] Credentials captured! Closing browser...");
          // Close browser after capturing - we don't need it anymore
          const { browserManager } = await import("../browser-manager");
          await browserManager.closePage("chatgpt");
        });
      }

      // Only navigate to homepage if we don't have an active conversation
      const currentUrl = page.url();
      const isOnChatGPT =
        currentUrl.includes("chat.openai.com") ||
        currentUrl.includes("chatgpt.com");
      const isInConversation =
        currentUrl.includes("/c/") || currentUrl.includes("/g/");

      if (!isOnChatGPT) {
        // First time - navigate to ChatGPT
        console.log("[ChatGPT] First time - navigating to ChatGPT");
        await this.navigate();
        // Reduced wait time since we block images/fonts
        await new Promise((resolve) => setTimeout(resolve, 2000));
        // Quick network idle check
        try {
          await page.waitForNetworkIdle({ timeout: 3000 });
        } catch {
          // Continue anyway - resources are blocked
        }
      } else if (this.hasActiveConversation && isInConversation) {
        // Already in a conversation - minimal wait
        console.log(
          "[ChatGPT] Continuing existing conversation at:",
          currentUrl
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
      } else {
        // On ChatGPT but not in a conversation - quick wait
        console.log("[ChatGPT] On ChatGPT, waiting for chat interface...");
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Wait for the input field - reduced timeouts since page is lighter
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

      // Click on the input to focus it
      const inputEl =
        (await page.$("#prompt-textarea")) ||
        (await page.$('div[contenteditable="true"]')) ||
        (await page.$("textarea"));

      if (!inputEl) {
        return { success: false, error: "Could not find input element" };
      }

      await inputEl.click();
      await new Promise((resolve) => setTimeout(resolve, 100)); // Reduced from 300ms

      // Type the message faster
      await page.keyboard.type(message, { delay: 10 }); // Reduced from 50ms
      console.log(`[ChatGPT] Typed message: ${message.substring(0, 50)}...`);

      // Quick wait for text to register
      await new Promise((resolve) => setTimeout(resolve, 200)); // Reduced from 500ms

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

    // Wait for streaming to complete by checking if response stops changing
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
        stableCount = 0;
        continue;
      }

      // Get current response text - get the LAST message only
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

    // Get the LAST assistant message text content (for Streamdown markdown rendering)
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
      `[ChatGPT] Response extracted: ${response.substring(0, 100)}...`
    );
    return response;
  }

  // Reset conversation state (for starting a new conversation)
  resetConversation(): void {
    this.hasActiveConversation = false;
  }

  // Streaming version of sendMessage - calls callback with each chunk
  async sendMessageWithStreaming(
    message: string,
    onChunk: (chunk: string) => void
  ): Promise<SendMessageResult> {
    // First, try direct API streaming if we have credentials
    const credentials = getStoredCredentials("chatgpt");
    if (credentials) {
      console.log("[ChatGPT] Trying direct API streaming...");
      const result = await sendDirectMessageStreaming(
        message,
        credentials,
        onChunk,
        this.conversationId
      );

      if (result.success && result.content) {
        if (result.conversationId) {
          this.conversationId = result.conversationId;
        }
        this.hasActiveConversation = true;
        console.log("[ChatGPT] Direct API streaming complete!");
        return { success: true, content: result.content };
      }

      if (result.error === "TOKEN_EXPIRED") {
        console.log("[ChatGPT] Token expired, falling back to browser...");
      }
    }

    // Fall back to browser streaming
    console.log("[ChatGPT] Using browser streaming...");

    try {
      const page = await this.getPage();

      // Start capturing credentials in background
      if (!this.isCapturing && !credentials) {
        this.isCapturing = true;
        captureCredentials(page, "chatgpt").then(async () => {
          this.isCapturing = false;
          console.log("[ChatGPT] Credentials captured! Closing browser...");
          const { browserManager } = await import("../browser-manager");
          await browserManager.closePage("chatgpt");
        });
      }

      // Navigation logic
      const currentUrl = page.url();
      const isOnChatGPT =
        currentUrl.includes("chat.openai.com") ||
        currentUrl.includes("chatgpt.com");

      if (!isOnChatGPT) {
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

      // Wait for response element to appear
      try {
        await page.waitForSelector('[data-message-author-role="assistant"]', {
          timeout: 30000,
        });
      } catch {
        return { success: false, error: "No response received" };
      }

      // Stream the response
      let lastContent = "";
      let stableCount = 0;
      const maxWait = 120000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 300)); // Poll every 300ms

        // Get current response content (text for length comparison)
        const currentContent = await page.evaluate(() => {
          const messages = document.querySelectorAll(
            '[data-message-author-role="assistant"]'
          );
          if (messages.length > 0) {
            // Use textContent for length comparison during streaming
            return messages[messages.length - 1].textContent || "";
          }
          return "";
        });

        // If there's new content, send the delta
        if (currentContent.length > lastContent.length) {
          const newContent = currentContent.substring(lastContent.length);
          onChunk(newContent);
          lastContent = currentContent;
          stableCount = 0;
        } else if (currentContent.length > 0) {
          stableCount++;
        }

        // Check if streaming is complete
        const isStreaming = await page.evaluate(() => {
          return (
            document.querySelector('button[aria-label="Stop generating"]') !==
            null
          );
        });

        if (!isStreaming && stableCount >= 3) {
          break;
        }
      }

      this.hasActiveConversation = true;

      // Get final text content (for Streamdown markdown rendering)
      const finalText = await page.evaluate(() => {
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
        `[ChatGPT] Streaming complete. Text length: ${finalText.length}`
      );

      return { success: true, content: finalText };
    } catch (error) {
      console.error("[ChatGPT] Streaming error:", error);
      return { success: false, error: String(error) };
    }
  }
}
