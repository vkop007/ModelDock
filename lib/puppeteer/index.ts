import { LLMProvider } from "@/types";
import { BaseProvider } from "./providers/base";
import { ChatGPTProvider } from "./providers/chatgpt";
import { ClaudeProvider } from "./providers/claude";
import { GeminiProvider } from "./providers/gemini";
import { ZaiProvider } from "./providers/zai";
import { GrokProvider } from "./providers/grok";
import { QwenProvider } from "./providers/qwen";
import { MistralProvider } from "./providers/mistral";
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
      case "grok":
        providers.set(provider, new GrokProvider());
        break;
      case "qwen":
        providers.set(provider, new QwenProvider());
        break;
      case "mistral":
        providers.set(provider, new MistralProvider());
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  return providers.get(provider)!;
}

export function getAllProviders(): BaseProvider[] {
  return ["chatgpt", "claude", "gemini", "zai", "grok", "qwen", "mistral"].map(
    (p) => getProvider(p as LLMProvider)
  );
}
