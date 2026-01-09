import { Conversation, CookieConfig, LLMProvider } from "@/types";

const STORAGE_KEYS = {
  CONVERSATIONS: "llm-chat-conversations",
  COOKIES: "llm-chat-cookies",
  ACTIVE_PROVIDER: "llm-chat-active-provider",
  CURRENT_CONVERSATION: "llm-chat-current-conversation",
};

// Check if we're in browser environment
const isBrowser = typeof window !== "undefined";

// Conversations
export function saveConversations(conversations: Conversation[]): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(
      STORAGE_KEYS.CONVERSATIONS,
      JSON.stringify(conversations)
    );
  } catch (error) {
    console.error("Failed to save conversations:", error);
  }
}

export function loadConversations(): Conversation[] {
  if (!isBrowser) return [];
  try {
    const data = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Failed to load conversations:", error);
    return [];
  }
}

// Cookie configs
export function saveCookieConfigs(
  configs: Record<LLMProvider, CookieConfig | null>
): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(STORAGE_KEYS.COOKIES, JSON.stringify(configs));
  } catch (error) {
    console.error("Failed to save cookie configs:", error);
  }
}

export function loadCookieConfigs(): Record<LLMProvider, CookieConfig | null> {
  if (!isBrowser) return { chatgpt: null, claude: null, gemini: null };
  try {
    const data = localStorage.getItem(STORAGE_KEYS.COOKIES);
    return data
      ? JSON.parse(data)
      : { chatgpt: null, claude: null, gemini: null };
  } catch (error) {
    console.error("Failed to load cookie configs:", error);
    return { chatgpt: null, claude: null, gemini: null };
  }
}

// Active provider
export function saveActiveProvider(provider: LLMProvider): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROVIDER, provider);
  } catch (error) {
    console.error("Failed to save active provider:", error);
  }
}

export function loadActiveProvider(): LLMProvider {
  if (!isBrowser) return "chatgpt";
  try {
    const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROVIDER);
    return (data as LLMProvider) || "chatgpt";
  } catch (error) {
    console.error("Failed to load active provider:", error);
    return "chatgpt";
  }
}

// Current conversation
export function saveCurrentConversation(id: string | null): void {
  if (!isBrowser) return;
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_CONVERSATION, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_CONVERSATION);
    }
  } catch (error) {
    console.error("Failed to save current conversation:", error);
  }
}

export function loadCurrentConversation(): string | null {
  if (!isBrowser) return null;
  try {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_CONVERSATION);
  } catch (error) {
    console.error("Failed to load current conversation:", error);
    return null;
  }
}

// Parse JSON cookies from user input
export function parseCookiesFromJSON(jsonString: string): {
  success: boolean;
  cookies?: any[];
  error?: string;
} {
  try {
    const parsed = JSON.parse(jsonString);

    // Handle array format
    if (Array.isArray(parsed)) {
      return { success: true, cookies: parsed };
    }

    // Handle object format (convert to array)
    if (typeof parsed === "object" && parsed !== null) {
      const cookies = Object.entries(parsed).map(([name, value]) => ({
        name,
        value: String(value),
        domain: "", // User will need to specify
      }));
      return { success: true, cookies };
    }

    return { success: false, error: "Invalid cookie format" };
  } catch (error) {
    return { success: false, error: "Invalid JSON format" };
  }
}
