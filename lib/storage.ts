import {
  Conversation,
  CookieConfig,
  Folder,
  LLMProvider,
  SystemInstructions,
  VoiceSettings,
} from "@/types";

const STORAGE_KEYS = {
  CONVERSATIONS: "llm-chat-conversations",
  FOLDERS: "llm-chat-folders",
  COOKIES: "llm-chat-cookies",
  SYSTEM_INSTRUCTIONS: "llm-chat-system-instructions",
  ACTIVE_PROVIDER: "llm-chat-active-provider",
  CURRENT_CONVERSATION: "llm-chat-current-conversation",
  UNIFIED_PROVIDERS: "llm-chat-unified-providers",
  VOICE_SETTINGS: "llm-chat-voice-settings",
  ENABLED_PROVIDERS: "llm-chat-enabled-providers",
};

// Check if we're in browser environment
const isBrowser = typeof window !== "undefined";

// IndexedDB Helper
const DB_NAME = "llm-chat-db";
const STORE_NAME = "key-value-store";

function openDB(): Promise<IDBDatabase> {
  if (!isBrowser) return Promise.reject("Not in browser");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  if (!isBrowser) return null;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error(`Failed to get ${key} from IndexedDB:`, error);
    return null;
  }
}

async function idbSet(key: string, value: any): Promise<void> {
  if (!isBrowser) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error(`Failed to set ${key} in IndexedDB:`, error);
  }
}

// Conversations (Now Async with IndexedDB)
export async function saveConversations(
  conversations: Conversation[],
): Promise<void> {
  await idbSet(STORAGE_KEYS.CONVERSATIONS, conversations);
}

export async function loadConversations(): Promise<Conversation[]> {
  const conversations = await idbGet<Conversation[]>(
    STORAGE_KEYS.CONVERSATIONS,
  );

  // Migration: If no conversations in IDB, check localStorage
  if (!conversations && isBrowser) {
    try {
      const localData = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
      if (localData) {
        const parsed = JSON.parse(localData);
        // Save to IDB for next time
        await saveConversations(parsed);
        // Clear from localStorage to free up space
        localStorage.removeItem(STORAGE_KEYS.CONVERSATIONS);
        return parsed;
      }
    } catch (e) {
      console.warn("Migration from localStorage failed", e);
    }
  }

  return conversations || [];
}

// Cookie configs
export function saveCookieConfigs(
  configs: Record<LLMProvider, CookieConfig | null>,
): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(STORAGE_KEYS.COOKIES, JSON.stringify(configs));
  } catch (error) {
    console.error("Failed to save cookie configs:", error);
  }
}

export function loadCookieConfigs(): Record<LLMProvider, CookieConfig | null> {
  const defaults: Record<LLMProvider, CookieConfig | null> = {
    chatgpt: null,
    claude: null,
    gemini: null,
    zai: null,
    grok: null,
    qwen: null,
    mistral: null,
    ollama: null,
  };

  if (!isBrowser) return defaults;

  try {
    const data = localStorage.getItem(STORAGE_KEYS.COOKIES);
    if (!data) return defaults;

    const parsed = JSON.parse(data);
    // Merge parsed data with defaults to ensure all keys exist
    return { ...defaults, ...parsed };
  } catch (error) {
    console.error("Failed to load cookie configs:", error);
    return defaults;
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

// System Instructions
export function saveSystemInstructions(
  configs: Record<LLMProvider, SystemInstructions | null>,
): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(
      STORAGE_KEYS.SYSTEM_INSTRUCTIONS,
      JSON.stringify(configs),
    );
  } catch (error) {
    console.error("Failed to save system instructions:", error);
  }
}

export function loadSystemInstructions(): Record<
  LLMProvider,
  SystemInstructions | null
> {
  const defaults: Record<LLMProvider, SystemInstructions | null> = {
    chatgpt: null,
    claude: null,
    gemini: null,
    zai: null,
    grok: null,
    qwen: null,
    mistral: null,
    ollama: null,
  };

  if (!isBrowser) return defaults;

  try {
    const data = localStorage.getItem(STORAGE_KEYS.SYSTEM_INSTRUCTIONS);
    if (!data) return defaults;

    const parsed = JSON.parse(data);
    // Merge parsed data with defaults to ensure all keys exist
    return { ...defaults, ...parsed };
  } catch (error) {
    console.error("Failed to load system instructions:", error);
    return defaults;
  }
}

// Unified Providers
export function saveUnifiedProviders(providers: LLMProvider[]): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(
      STORAGE_KEYS.UNIFIED_PROVIDERS,
      JSON.stringify(providers),
    );
  } catch (error) {
    console.error("Failed to save unified providers:", error);
  }
}

export function loadUnifiedProviders(): LLMProvider[] {
  if (!isBrowser) return ["chatgpt", "gemini"]; // Default
  try {
    const data = localStorage.getItem(STORAGE_KEYS.UNIFIED_PROVIDERS);
    return data ? JSON.parse(data) : ["chatgpt", "gemini"];
  } catch (error) {
    console.error("Failed to load unified providers:", error);
    return ["chatgpt", "gemini"];
  }
}

// Enabled Providers
export function saveEnabledProviders(providers: LLMProvider[]): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(
      STORAGE_KEYS.ENABLED_PROVIDERS,
      JSON.stringify(providers),
    );
  } catch (error) {
    console.error("Failed to save enabled providers:", error);
  }
}

export function loadEnabledProviders(
  allProviders: LLMProvider[],
): LLMProvider[] {
  if (!isBrowser) return allProviders;
  try {
    const data = localStorage.getItem(STORAGE_KEYS.ENABLED_PROVIDERS);
    return data ? JSON.parse(data) : allProviders;
  } catch (error) {
    console.error("Failed to load enabled providers:", error);
    return allProviders;
  }
}

// ==================== Folder Storage ====================

// Folders (Using IndexedDB for better performance with larger datasets)
export async function saveFolders(folders: Folder[]): Promise<void> {
  await idbSet(STORAGE_KEYS.FOLDERS, folders);
}

export async function loadFolders(): Promise<Folder[]> {
  const folders = await idbGet<Folder[]>(STORAGE_KEYS.FOLDERS);

  // Migration: If no folders in IDB, check localStorage
  if (!folders && isBrowser) {
    try {
      const localData = localStorage.getItem(STORAGE_KEYS.FOLDERS);
      if (localData) {
        const parsed = JSON.parse(localData);
        await saveFolders(parsed);
        localStorage.removeItem(STORAGE_KEYS.FOLDERS);
        return parsed;
      }
    } catch (e) {
      console.warn("Migration from localStorage failed", e);
    }
  }

  return folders || [];
}

// ==================== Voice Settings Storage ====================

// Default voice settings
const defaultVoiceSettings: VoiceSettings = {
  speechRecognition: {
    enabled: true,
    language: "en-US",
    continuous: false,
  },
  textToSpeech: {
    enabled: false,
    autoPlay: false,
    voiceURI: null,
    rate: 1,
    pitch: 1,
    volume: 1,
  },
};

export function saveVoiceSettings(settings: VoiceSettings): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(STORAGE_KEYS.VOICE_SETTINGS, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save voice settings:", error);
  }
}

export function loadVoiceSettings(): VoiceSettings {
  if (!isBrowser) return defaultVoiceSettings;

  try {
    const data = localStorage.getItem(STORAGE_KEYS.VOICE_SETTINGS);
    if (!data) return defaultVoiceSettings;

    const parsed = JSON.parse(data);
    // Merge with defaults to ensure all properties exist
    return {
      speechRecognition: {
        ...defaultVoiceSettings.speechRecognition,
        ...(parsed.speechRecognition || {}),
      },
      textToSpeech: {
        ...defaultVoiceSettings.textToSpeech,
        ...(parsed.textToSpeech || {}),
      },
    };
  } catch (error) {
    console.error("Failed to load voice settings:", error);
    return defaultVoiceSettings;
  }
}
