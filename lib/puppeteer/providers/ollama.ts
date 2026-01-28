import { Page } from "puppeteer";
import { BaseProvider, SendMessageResult } from "./base";

interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
    images?: string[] | null;
  };
  done: boolean;
}

interface OllamaStreamResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

export class OllamaProvider extends BaseProvider {
  private model: string = "llama3";

  private async ensureModel(): Promise<void> {
    try {
      const response = await fetch(`${this.url}/api/tags`);
      if (!response.ok) return;

      const data = (await response.json()) as { models: { name: string }[] };
      const models = data.models || [];

      // If we have models, check if our current one exists
      const hasCurrent = models.some((m) => m.name.includes(this.model));
      if (!hasCurrent && models.length > 0) {
        // Fallback to the first available model
        console.log(
          `[Ollama] Model '${this.model}' not found, falling back to '${models[0].name}'`,
        );
        this.model = models[0].name;
      }
    } catch (e) {
      console.error("[Ollama] Failed to fetch models:", e);
    }
  }

  constructor() {
    super("ollama", "http://localhost:11434");
  }

  async getPage(): Promise<Page> {
    throw new Error("Ollama provider does not use Puppeteer pages");
  }

  async injectCookies(): Promise<void> {}

  async navigate(): Promise<void> {}

  async isAuthenticated(): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/api/tags`);
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  async checkAuthentication(_page: Page): Promise<boolean> {
    return this.isAuthenticated();
  }

  async sendMessage(message: string): Promise<SendMessageResult> {
    try {
      await this.ensureModel();
      const response = await fetch(`${this.url}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "user",
              content: message,
            },
          ],
          stream: false,
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Ollama API error: ${response.statusText}`,
        };
      }

      const data = (await response.json()) as OllamaResponse;

      return {
        success: true,
        content: data.message.content,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async sendMessageWithStreaming(
    message: string,
    onChunk: (chunk: string) => void,
    conversationId?: string,
  ): Promise<SendMessageResult> {
    try {
      await this.ensureModel();
      const response = await fetch(`${this.url}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "user",
              content: message,
            },
          ],
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        return {
          success: false,
          error: `Ollama API error: ${response.statusText}`,
        };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((line) => line.trim() !== "");

        for (const line of lines) {
          try {
            const json = JSON.parse(line) as OllamaStreamResponse;
            if (json.message?.content) {
              const contentToCheck = json.message.content;
              fullContent += contentToCheck;
              onChunk(contentToCheck);
            }
          } catch (e) {
            console.error("Error parsing Ollama chunk:", e);
          }
        }
      }

      return {
        success: true,
        content: fullContent,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async waitForResponse(): Promise<string> {
    return "";
  }

  async deleteConversation(_conversationId: string): Promise<boolean> {
    return true;
  }
}
