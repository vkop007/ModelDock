import { LLMProvider } from "@/types";
import { BaseProvider } from "./providers/base";
import { ChatGPTProvider } from "./providers/chatgpt";
import { ClaudeProvider } from "./providers/claude";
import { GeminiProvider } from "./providers/gemini";
import { ZaiProvider } from "./providers/zai";
export { browserManager } from "./browser-manager";

// Provider factory
const providers: Map<LLMProvider, BaseProvider> = new Map();

export function getProvider(provider: LLMProvider): BaseProvider {
  if (!providers.has(provider)) {
    switch (provider) {
      case "chatgpt":
        providers.set(provider, new ChatGPTProvider());
        break;
      case "claude":
        providers.set(provider, new ClaudeProvider());
        break;
      case "gemini":
        providers.set(provider, new GeminiProvider());
        break;
      case "zai":
        providers.set(provider, new ZaiProvider());
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  return providers.get(provider)!;
}

export function getAllProviders(): BaseProvider[] {
  return ["chatgpt", "claude", "gemini", "zai"].map((p) =>
    getProvider(p as LLMProvider)
  );
}
