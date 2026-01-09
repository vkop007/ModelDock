import { Page } from "puppeteer";

// Captured API credentials for direct API calls
export interface CapturedCredentials {
  accessToken: string;
  deviceId?: string;
  oaiDeviceId?: string;
  sessionToken?: string;
  capturedAt: number;
}

// Global storage for captured credentials
declare global {
  // eslint-disable-next-line no-var
  var __capturedCredentials: Map<string, CapturedCredentials>;
}

if (!global.__capturedCredentials) {
  global.__capturedCredentials = new Map();
}

// Capture API credentials from network requests
export async function captureCredentials(
  page: Page,
  provider: string
): Promise<CapturedCredentials | null> {
  console.log(`[ApiCapture] Setting up network capture for ${provider}...`);

  return new Promise((resolve) => {
    let credentials: Partial<CapturedCredentials> = {};
    let resolved = false;

    // Listen for API requests
    const requestHandler = (request: import("puppeteer").HTTPRequest) => {
      const url = request.url();
      const headers = request.headers();

      // ChatGPT API endpoints
      if (
        url.includes("/backend-api/") ||
        url.includes("/backend-anon/") ||
        url.includes("api.openai.com")
      ) {
        // Capture authorization token
        const authHeader = headers["authorization"];
        if (authHeader && authHeader.startsWith("Bearer ")) {
          credentials.accessToken = authHeader.replace("Bearer ", "");
          console.log("[ApiCapture] Captured access token");
        }

        // Capture device ID from headers
        if (headers["oai-device-id"]) {
          credentials.oaiDeviceId = headers["oai-device-id"];
        }
      }

      // If we have what we need, resolve
      if (credentials.accessToken && !resolved) {
        resolved = true;
        credentials.capturedAt = Date.now();

        const fullCredentials = credentials as CapturedCredentials;
        global.__capturedCredentials.set(provider, fullCredentials);
        console.log(`[ApiCapture] Credentials captured for ${provider}`);

        // Clean up listener
        page.off("request", requestHandler);
        resolve(fullCredentials);
      }
    };

    page.on("request", requestHandler);

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        page.off("request", requestHandler);
        console.log("[ApiCapture] Capture timeout - no credentials found");
        resolve(null);
      }
    }, 30000);
  });
}

// Get stored credentials
export function getStoredCredentials(
  provider: string
): CapturedCredentials | null {
  const creds = global.__capturedCredentials.get(provider);

  if (!creds) {
    return null;
  }

  // Check if credentials are expired (1 hour)
  const age = Date.now() - creds.capturedAt;
  if (age > 60 * 60 * 1000) {
    console.log(`[ApiCapture] Credentials expired for ${provider}`);
    global.__capturedCredentials.delete(provider);
    return null;
  }

  return creds;
}

// Make direct API call to ChatGPT
export async function sendDirectMessage(
  message: string,
  credentials: CapturedCredentials,
  conversationId?: string
): Promise<{
  success: boolean;
  content?: string;
  error?: string;
  conversationId?: string;
}> {
  console.log("[ApiCapture] Sending direct API request...");

  try {
    const response = await fetch(
      "https://chat.openai.com/backend-api/conversation",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credentials.accessToken}`,
          Accept: "text/event-stream",
          Origin: "https://chat.openai.com",
          Referer: "https://chat.openai.com/",
          ...(credentials.oaiDeviceId && {
            "oai-device-id": credentials.oaiDeviceId,
          }),
        },
        body: JSON.stringify({
          action: "next",
          messages: [
            {
              id: crypto.randomUUID(),
              author: { role: "user" },
              content: {
                content_type: "text",
                parts: [message],
              },
            },
          ],
          parent_message_id: crypto.randomUUID(),
          model: "auto",
          timezone_offset_min: new Date().getTimezoneOffset(),
          ...(conversationId && { conversation_id: conversationId }),
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        // Token expired, need to recapture
        console.log("[ApiCapture] Token expired, will recapture");
        return { success: false, error: "TOKEN_EXPIRED" };
      }
      throw new Error(`API error: ${response.status}`);
    }

    // Parse SSE stream
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    let fullContent = "";
    let newConversationId: string | undefined;
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ") && line !== "data: [DONE]") {
          try {
            const data = JSON.parse(line.slice(6));

            // Extract conversation ID
            if (data.conversation_id) {
              newConversationId = data.conversation_id;
            }

            // Extract message content
            if (data.message?.content?.parts?.[0]) {
              fullContent = data.message.content.parts[0];
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }

    console.log(
      `[ApiCapture] Direct API success! Content length: ${fullContent.length}`
    );
    return {
      success: true,
      content: fullContent,
      conversationId: newConversationId,
    };
  } catch (error) {
    console.error("[ApiCapture] Direct API error:", error);
    return { success: false, error: String(error) };
  }
}

// Streaming version - calls onChunk with each piece of content
export async function sendDirectMessageStreaming(
  message: string,
  credentials: CapturedCredentials,
  onChunk: (chunk: string) => void,
  conversationId?: string
): Promise<{
  success: boolean;
  content?: string;
  error?: string;
  conversationId?: string;
}> {
  console.log("[ApiCapture] Sending direct API request with streaming...");

  try {
    const response = await fetch(
      "https://chat.openai.com/backend-api/conversation",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credentials.accessToken}`,
          Accept: "text/event-stream",
          Origin: "https://chat.openai.com",
          Referer: "https://chat.openai.com/",
          ...(credentials.oaiDeviceId && {
            "oai-device-id": credentials.oaiDeviceId,
          }),
        },
        body: JSON.stringify({
          action: "next",
          messages: [
            {
              id: crypto.randomUUID(),
              author: { role: "user" },
              content: {
                content_type: "text",
                parts: [message],
              },
            },
          ],
          parent_message_id: crypto.randomUUID(),
          model: "auto",
          timezone_offset_min: new Date().getTimezoneOffset(),
          ...(conversationId && { conversation_id: conversationId }),
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.log("[ApiCapture] Token expired, will recapture");
        return { success: false, error: "TOKEN_EXPIRED" };
      }
      throw new Error(`API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    let fullContent = "";
    let lastContent = "";
    let newConversationId: string | undefined;
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ") && line !== "data: [DONE]") {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.conversation_id) {
              newConversationId = data.conversation_id;
            }

            if (data.message?.content?.parts?.[0]) {
              fullContent = data.message.content.parts[0];

              // Send only the new content as a chunk
              if (fullContent.length > lastContent.length) {
                const newChunk = fullContent.slice(lastContent.length);
                onChunk(newChunk);
                lastContent = fullContent;
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }

    console.log(
      `[ApiCapture] Direct streaming complete! Content length: ${fullContent.length}`
    );
    return {
      success: true,
      content: fullContent,
      conversationId: newConversationId,
    };
  } catch (error) {
    console.error("[ApiCapture] Direct streaming error:", error);
    return { success: false, error: String(error) };
  }
}
