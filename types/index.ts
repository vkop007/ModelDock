// Supported LLM Providers
export type LLMProvider =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "zai"
  | "grok"
  | "qwen"
  | "mistral"
  | "ollama";

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
  grok: {
    id: "grok",
    name: "Grok",
    url: "https://x.com/i/grok",
    icon: "SiX",
    color: "#000000",
  },
  qwen: {
    id: "qwen",
    name: "Qwen",
    url: "https://chat.qwenlm.ai",
    icon: "SiAlibaba",
    color: "#6366f1",
  },
  mistral: {
    id: "mistral",
    name: "Mistral",
    url: "https://chat.mistral.ai",
    icon: "SiMistral",
    color: "#ff7000",
  },
  ollama: {
    id: "ollama",
    name: "Ollama",
    url: "http://localhost:11434",
    icon: "SiLinux",
    color: "#FFFFFF",
  },
};

// Message structure
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  provider?: LLMProvider;
  images?: string[]; // Array of base64 strings
  isPinned?: boolean;
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

// System instructions per provider
export interface SystemInstructions {
  provider: LLMProvider;
  instructions: string;
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

// Provider status for UI indicators
export type ProviderStatus =
  | "idle"
  | "warming"
  | "ready"
  | "streaming"
  | "error";

// Session state for each provider
export interface SessionState {
  provider: LLMProvider;
  isConnected: boolean;
  isLoading: boolean;
  error?: string;
  // Status indicator
  status: ProviderStatus;
  // Streaming progress stats
  streamingStats?: {
    charsReceived: number;
    startTime: number;
    lastUpdateTime: number;
  };
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
  systemInstructions: Record<LLMProvider, SystemInstructions | null>;
  isLoading: boolean;
  isSending: boolean;
  isUnifiedMode: boolean;
  unifiedProviders: LLMProvider[];
}

// Chat context actions
export type ChatAction =
  | { type: "SET_PROVIDER"; provider: LLMProvider }
  | { type: "NEW_CONVERSATION"; provider?: LLMProvider }
  | { type: "SELECT_CONVERSATION"; id: string }
  | { type: "ADD_MESSAGE"; message: Message; conversationId?: string }
  | {
      type: "UPDATE_MESSAGE";
      id: string;
      content: string;
      conversationId?: string;
    }
  | { type: "SET_LOADING"; isLoading: boolean }
  | { type: "SET_SENDING"; isSending: boolean }
  | {
      type: "SET_SESSION_STATE";
      provider: LLMProvider;
      state: Partial<SessionState>;
    }
  | { type: "SET_COOKIES"; provider: LLMProvider; cookies: CookieEntry[] }
  | {
      type: "SET_SYSTEM_INSTRUCTIONS";
      provider: LLMProvider;
      instructions: string;
    }
  | { type: "LOAD_STATE"; state: Partial<ChatState> }
  | { type: "DELETE_CONVERSATION"; id: string }
  | { type: "UPDATE_CONVERSATION_TITLE"; id: string; title: string }
  | { type: "UPDATE_CONVERSATION_EXTERNAL_ID"; id: string; externalId: string }
  | { type: "DELETE_MESSAGES_AFTER"; messageId: string }
  | { type: "EDIT_MESSAGE"; messageId: string; content: string }
  | { type: "REMOVE_LAST_MESSAGE" }
  | { type: "IMPORT_CONVERSATION"; conversation: Conversation }
  | { type: "PIN_MESSAGE"; messageId: string }
  | { type: "UNPIN_MESSAGE"; messageId: string }
  | { type: "TOGGLE_UNIFIED_MODE" }
  | { type: "TOGGLE_UNIFIED_PROVIDER"; provider: LLMProvider }
  | {
      type: "SET_PROVIDER_STATUS";
      provider: LLMProvider;
      status: ProviderStatus;
    }
  | {
      type: "UPDATE_STREAMING_STATS";
      provider: LLMProvider;
      charsReceived: number;
      startTime: number;
    }
  | { type: "CLEAR_STREAMING_STATS"; provider: LLMProvider };
// Voice settings configuration
export interface VoiceSettings {
  speechRecognition: {
    enabled: boolean;
    language: string; // e.g., 'en-US', 'es-ES', etc.
    continuous: boolean;
  };
  textToSpeech: {
    enabled: boolean;
    autoPlay: boolean; // Auto-play AI responses
    voiceURI: string | null;
    rate: number; // 0.5 - 2.0 (speed)
    pitch: number; // 0 - 2 (tone)
    volume: number; // 0 - 1
  };
}
