// Supported LLM Providers
export type LLMProvider = "chatgpt" | "claude" | "gemini" | "zai";

// LLM Provider configuration
export interface ProviderConfig {
  id: LLMProvider;
  name: string;
  url: string;
  icon: string;
  color: string;
}

// Provider configurations
export const PROVIDERS: Record<LLMProvider, ProviderConfig> = {
  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    url: "https://chat.openai.com",
    icon: "SiOpenai",
    color: "#10a37f",
  },
  claude: {
    id: "claude",
    name: "Claude",
    url: "https://claude.ai",
    icon: "SiAnthropic",
    color: "#cc785c",
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    url: "https://gemini.google.com",
    icon: "SiGoogle",
    color: "#4285f4",
  },
  zai: {
    id: "zai",
    name: "Z.ai",
    url: "https://chat.z.ai",
    icon: "SiZendesk", // Temporary placeholder, user might want a custom one
    color: "#000000",
  },
};

// Message structure
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  provider?: LLMProvider;
}

// Conversation structure
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  provider: LLMProvider;
  createdAt: number;
  updatedAt: number;
  externalId?: string;
}

// Cookie configuration per provider
export interface CookieConfig {
  provider: LLMProvider;
  cookies: CookieEntry[];
  lastUpdated?: number;
}

// Individual cookie entry (Puppeteer format)
export interface CookieEntry {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

// Session state for each provider
export interface SessionState {
  provider: LLMProvider;
  isConnected: boolean;
  isLoading: boolean;
  error?: string;
}

// API request/response types
export interface ChatRequest {
  provider: LLMProvider;
  message: string;
  conversationId?: string;
}

export interface ChatResponse {
  success: boolean;
  message?: string;
  content?: string;
  error?: string;
}

export interface SessionRequest {
  provider: LLMProvider;
  cookies: CookieEntry[];
}

export interface SessionResponse {
  success: boolean;
  isAuthenticated: boolean;
  error?: string;
}

// Chat context state
export interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  activeProvider: LLMProvider;
  sessions: Record<LLMProvider, SessionState>;
  cookieConfigs: Record<LLMProvider, CookieConfig | null>;
  isLoading: boolean;
  isSending: boolean;
}

// Chat context actions
export type ChatAction =
  | { type: "SET_PROVIDER"; provider: LLMProvider }
  | { type: "NEW_CONVERSATION" }
  | { type: "SELECT_CONVERSATION"; id: string }
  | { type: "ADD_MESSAGE"; message: Message }
  | { type: "UPDATE_MESSAGE"; id: string; content: string }
  | { type: "SET_LOADING"; isLoading: boolean }
  | { type: "SET_SENDING"; isSending: boolean }
  | {
      type: "SET_SESSION_STATE";
      provider: LLMProvider;
      state: Partial<SessionState>;
    }
  | { type: "SET_COOKIES"; provider: LLMProvider; cookies: CookieEntry[] }
  | { type: "LOAD_STATE"; state: Partial<ChatState> }
  | { type: "DELETE_CONVERSATION"; id: string }
  | { type: "UPDATE_CONVERSATION_TITLE"; id: string; title: string }
  | { type: "UPDATE_CONVERSATION_EXTERNAL_ID"; id: string; externalId: string };
