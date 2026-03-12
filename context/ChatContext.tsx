"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { v4 as uuidv4 } from "uuid";
import {
  AppView,
  ChatAction,
  ChatState,
  Conversation,
  CookieEntry,
  LLMProvider,
  Message,
  SessionState,
  orderProviders,
} from "@/types";
import {
  saveConversations,
  loadConversations,
  saveCookieConfigs,
  loadCookieConfigs,
  saveActiveProvider,
  loadActiveProvider,
  saveCurrentConversation,
  loadCurrentConversation,
  saveSystemInstructions,
  loadSystemInstructions,
  saveUnifiedProviders,
  loadUnifiedProviders,
  saveEnabledProviders,
  loadEnabledProviders,
  saveColumnWidths,
  loadColumnWidths,
  saveLayoutMode,
  loadLayoutMode,
  saveProviderOrder,
  loadProviderOrder,
} from "@/lib/storage";

// Initial state
const initialSessionState: SessionState = {
  provider: "chatgpt",
  isConnected: false,
  isLoading: false,
  status: "idle",
};

const initialState: ChatState = {
  conversations: [],
  currentConversationId: null,
  activeProvider: "chatgpt",
  activeView: "chat",
  sessions: {
    chatgpt: { ...initialSessionState, provider: "chatgpt" },
    claude: { ...initialSessionState, provider: "claude" },
    gemini: { ...initialSessionState, provider: "gemini" },
    zai: { ...initialSessionState, provider: "zai" },
    grok: { ...initialSessionState, provider: "grok" },
    qwen: { ...initialSessionState, provider: "qwen" },
    mistral: { ...initialSessionState, provider: "mistral" },
    ollama: { ...initialSessionState, provider: "ollama" },
  },
  cookieConfigs: {
    chatgpt: null,
    claude: null,
    gemini: null,
    zai: null,
    grok: null,
    qwen: null,
    mistral: null,
    ollama: null,
  },
  systemInstructions: {
    chatgpt: null,
    claude: null,
    gemini: null,
    zai: null,
    grok: null,
    qwen: null,
    mistral: null,
    ollama: null,
  },
  isLoading: false,
  isSending: false,
  isUnifiedMode: true, // Always true now
  unifiedProviders: ["chatgpt", "gemini"], // Default providers for unified view
  isFocusMode: false,
  isSidebarCollapsed: false,
  enabledProviders: [
    "chatgpt",
    "claude",
    "gemini",
    "zai",
    "grok",
    "qwen",
    "mistral",
    "ollama",
  ],
  columnWidths: {},
  layoutMode: "grid",
  providerOrder: orderProviders([
    "chatgpt",
    "claude",
    "gemini",
    "zai",
    "grok",
    "qwen",
    "mistral",
    "ollama",
  ]),
};

// Reducer
function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SET_PROVIDER": {
      // Find the most recent conversation for the new provider
      const providerConvos = state.conversations.filter(
        (c) => c.provider === action.provider,
      );
      const mostRecent =
        providerConvos.length > 0 ? providerConvos[0].id : null;

      return {
        ...state,
        activeProvider: action.provider,
        activeView: "chat",
        currentConversationId: mostRecent,
      };
    }

    case "SET_ACTIVE_VIEW":
      return { ...state, activeView: action.view };

    case "NEW_CONVERSATION": {
      const provider = action.provider || state.activeProvider;
      const newConversation: Conversation = {
        id: uuidv4(),
        title: "New Chat",
        messages: [],
        provider,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        folderId: action.folderId,
      };

      return {
        ...state,
        activeView: "chat",
        conversations: [newConversation, ...state.conversations],
        currentConversationId: newConversation.id,
      };
    }

    case "SELECT_CONVERSATION": {
      const selectedConv = state.conversations.find((c) => c.id === action.id);
      return {
        ...state,
        activeView: "chat",
        currentConversationId: action.id,
        activeProvider: selectedConv?.provider || state.activeProvider,
      };
    }

    case "ADD_MESSAGE": {
      const targetId = action.conversationId || state.currentConversationId;
      const conversations = state.conversations.map((conv) => {
        if (conv.id === targetId) {
          const updatedMessages = [...conv.messages, action.message];
          // Update title based on first user message
          const title =
            conv.messages.length === 0 && action.message.role === "user"
              ? action.message.content.slice(0, 50) +
                (action.message.content.length > 50 ? "..." : "")
              : conv.title;
          return {
            ...conv,
            messages: updatedMessages,
            title,
            updatedAt: Date.now(),
          };
        }
        return conv;
      });
      return { ...state, conversations };
    }

    case "UPDATE_MESSAGE": {
      const targetId = action.conversationId || state.currentConversationId;
      const conversations = state.conversations.map((conv) => {
        if (conv.id === targetId) {
          const messages = conv.messages.map((msg) =>
            msg.id === action.id ? { ...msg, content: action.content } : msg,
          );
          return { ...conv, messages, updatedAt: Date.now() };
        }
        return conv;
      });
      return { ...state, conversations };
    }

    case "SET_LOADING":
      return { ...state, isLoading: action.isLoading };

    case "SET_SENDING":
      return { ...state, isSending: action.isSending };

    case "SET_SESSION_STATE":
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.provider]: {
            ...state.sessions[action.provider],
            ...action.state,
          },
        },
      };

    case "SET_COOKIES":
      return {
        ...state,
        cookieConfigs: {
          ...state.cookieConfigs,
          [action.provider]: {
            provider: action.provider,
            cookies: action.cookies,
            lastUpdated: Date.now(),
          },
        },
      };

    case "SET_SYSTEM_INSTRUCTIONS":
      return {
        ...state,
        systemInstructions: {
          ...state.systemInstructions,
          [action.provider]: {
            provider: action.provider,
            instructions: action.instructions,
            lastUpdated: Date.now(),
          },
        },
      };

    case "LOAD_STATE": {
      // Validate that currentConversationId exists in the loaded conversations
      let currentConversationId = action.state.currentConversationId ?? null;
      const loadedConversations = action.state.conversations || [];

      if (
        currentConversationId &&
        loadedConversations.length > 0 &&
        !loadedConversations.some((c) => c.id === currentConversationId)
      ) {
        // If the saved currentConversationId doesn't exist, find the most recent conversation
        const recentConversation = loadedConversations[0];
        currentConversationId = recentConversation?.id || null;
      }
      return { ...state, ...action.state, currentConversationId };
    }

    case "DELETE_CONVERSATION": {
      const deletedConversation = state.conversations.find(
        (c) => c.id === action.id,
      );
      const conversations = state.conversations.filter(
        (c) => c.id !== action.id,
      );

      // If we're deleting the current conversation, select a new one from the SAME provider
      let currentConversationId = state.currentConversationId;
      if (state.currentConversationId === action.id) {
        const providerToFilter =
          deletedConversation?.provider || state.activeProvider;
        const sameProviderConvos = conversations.filter(
          (c) => c.provider === providerToFilter,
        );
        currentConversationId =
          sameProviderConvos.length > 0 ? sameProviderConvos[0].id : null;
      }

      return { ...state, conversations, currentConversationId };
    }

    case "DELETE_ALL_CONVERSATIONS": {
      return {
        ...state,
        conversations: [],
        currentConversationId: null,
      };
    }

    case "UPDATE_CONVERSATION_TITLE": {
      const conversations = state.conversations.map((conv) =>
        conv.id === action.id ? { ...conv, title: action.title } : conv,
      );
      return { ...state, conversations };
    }

    case "UPDATE_CONVERSATION_EXTERNAL_ID": {
      const conversations = state.conversations.map((conv) =>
        conv.id === action.id
          ? { ...conv, externalId: action.externalId }
          : conv,
      );
      return { ...state, conversations };
    }

    case "DELETE_MESSAGES_AFTER": {
      const targetId = action.conversationId || state.currentConversationId;
      const conversations = state.conversations.map((conv) => {
        if (conv.id === targetId) {
          const messageIndex = conv.messages.findIndex(
            (m) => m.id === action.messageId,
          );
          if (messageIndex !== -1) {
            return {
              ...conv,
              messages: conv.messages.slice(0, messageIndex + 1),
              updatedAt: Date.now(),
            };
          }
        }
        return conv;
      });
      return { ...state, conversations };
    }

    case "EDIT_MESSAGE": {
      const targetId = action.conversationId || state.currentConversationId;
      const conversations = state.conversations.map((conv) => {
        if (conv.id === targetId) {
          const messages = conv.messages.map((msg) =>
            msg.id === action.messageId
              ? { ...msg, content: action.content }
              : msg,
          );
          return { ...conv, messages, updatedAt: Date.now() };
        }
        return conv;
      });
      return { ...state, conversations };
    }

    case "REMOVE_LAST_MESSAGE": {
      const targetId = action.conversationId || state.currentConversationId;
      const conversations = state.conversations.map((conv) => {
        if (conv.id === targetId && conv.messages.length > 0) {
          return {
            ...conv,
            messages: conv.messages.slice(0, -1),
            updatedAt: Date.now(),
          };
        }
        return conv;
      });
      return { ...state, conversations };
    }

    case "IMPORT_CONVERSATION": {
      return {
        ...state,
        activeView: "chat",
        conversations: [action.conversation, ...state.conversations],
        currentConversationId: action.conversation.id,
      };
    }

    case "PIN_MESSAGE": {
      const targetId = action.conversationId || state.currentConversationId;
      const conversations = state.conversations.map((conv) => {
        if (conv.id === targetId) {
          const messages = conv.messages.map((msg) =>
            msg.id === action.messageId ? { ...msg, isPinned: true } : msg,
          );
          return { ...conv, messages, updatedAt: Date.now() };
        }
        return conv;
      });
      return { ...state, conversations };
    }

    case "UNPIN_MESSAGE": {
      const targetId = action.conversationId || state.currentConversationId;
      const conversations = state.conversations.map((conv) => {
        if (conv.id === targetId) {
          const messages = conv.messages.map((msg) =>
            msg.id === action.messageId ? { ...msg, isPinned: false } : msg,
          );
          return { ...conv, messages, updatedAt: Date.now() };
        }
        return conv;
      });
      return { ...state, conversations };
    }

    case "PIN_CONVERSATION": {
      const conversations = state.conversations.map((conv) =>
        conv.id === action.id
          ? { ...conv, isPinned: true, updatedAt: Date.now() }
          : conv,
      );
      return { ...state, conversations };
    }

    case "UNPIN_CONVERSATION": {
      const conversations = state.conversations.map((conv) =>
        conv.id === action.id
          ? { ...conv, isPinned: false, updatedAt: Date.now() }
          : conv,
      );
      return { ...state, conversations };
    }

    case "TOGGLE_UNIFIED_MODE":
      return { ...state, isUnifiedMode: true };

    case "TOGGLE_UNIFIED_PROVIDER": {
      const current = state.unifiedProviders;
      const updated = current.includes(action.provider)
        ? current.filter((p) => p !== action.provider)
        : [...current, action.provider];

      // If adding a provider, ensure it's also in enabledProviders so it's active by default
      let enabledProviders = state.enabledProviders;
      if (
        updated.includes(action.provider) &&
        !enabledProviders.includes(action.provider)
      ) {
        enabledProviders = [...enabledProviders, action.provider];
      }

      return {
        ...state,
        unifiedProviders: updated,
        enabledProviders,
      };
    }

    case "SET_PROVIDER_STATUS":
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.provider]: {
            ...state.sessions[action.provider],
            status: action.status,
          },
        },
      };

    case "UPDATE_STREAMING_STATS":
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.provider]: {
            ...state.sessions[action.provider],
            status: "streaming",
            streamingStats: {
              charsReceived: action.charsReceived,
              startTime: action.startTime,
              lastUpdateTime: Date.now(),
            },
          },
        },
      };

    case "CLEAR_STREAMING_STATS":
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.provider]: {
            ...state.sessions[action.provider],
            status: "ready",
            streamingStats: undefined,
          },
        },
      };

    case "TOGGLE_FOCUS_MODE":
      return { ...state, isFocusMode: !state.isFocusMode };

    case "SET_LAYOUT_MODE":
      return { ...state, layoutMode: action.mode };

    case "TOGGLE_SIDEBAR":
      return { ...state, isSidebarCollapsed: !state.isSidebarCollapsed };

    case "MOVE_CONVERSATION_TO_FOLDER": {
      const conversations = state.conversations.map((conv) =>
        conv.id === action.conversationId
          ? { ...conv, folderId: action.folderId, updatedAt: Date.now() }
          : conv,
      );
      return { ...state, conversations };
    }

    case "TOGGLE_PROVIDER_ENABLED": {
      const current = state.enabledProviders;
      const updated = current.includes(action.provider)
        ? current.filter((p) => p !== action.provider)
        : [...current, action.provider];
      return { ...state, enabledProviders: updated };
    }

    case "SET_COLUMN_WIDTHS":
      return { ...state, columnWidths: action.widths };

    case "SET_PROVIDER_ORDER":
      return { ...state, providerOrder: action.order };

    default:
      return state;
  }
}

// Context
interface ChatContextValue extends ChatState {
  dispatch: React.Dispatch<ChatAction>;
  sendMessage: (content: string, images?: string[]) => Promise<void>;
  newChat: (folderId?: string) => void;
  selectConversation: (id: string) => void;
  setProvider: (provider: LLMProvider) => void;
  setActiveView: (view: AppView) => void;
  showApiDocsView: () => void;
  showChatView: () => void;
  setCookies: (provider: LLMProvider, cookies: CookieEntry[]) => void;
  setSystemInstructions: (provider: LLMProvider, instructions: string) => void;
  testConnection: (provider: LLMProvider) => Promise<boolean>;
  deleteConversation: (id: string) => void;
  generateImage: (prompt: string) => Promise<void>;
  currentConversation: Conversation | null;
  // New features
  regenerateLastMessage: (conversationId?: string) => Promise<void>;
  editAndResend: (
    messageId: string,
    newContent: string,
    conversationId?: string,
  ) => Promise<void>;
  stopGeneration: () => void;
  exportConversation: (
    format: "json" | "markdown",
    conversationIds?: string[],
  ) => void;
  importConversation: (jsonData: string) => {
    success: boolean;
    importedCount: number;
    error?: string;
  };
  pinMessage: (messageId: string, conversationId?: string) => void;
  unpinMessage: (messageId: string, conversationId?: string) => void;
  toggleUnifiedMode: () => void;
  toggleUnifiedProvider: (provider: LLMProvider) => void;
  toggleFocusMode: () => void;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  broadcastMessage: (content: string, images?: string[]) => Promise<void>;
  showCookiePrompt: boolean;
  setShowCookiePrompt: (show: boolean) => void;
  moveConversationToFolder: (
    conversationId: string,
    folderId: string | undefined,
  ) => void;
  toggleProviderEnabled: (provider: LLMProvider) => void;
  deleteAllConversations: () => void;
  pinConversation: (id: string) => void;
  unpinConversation: (id: string) => void;
  setColumnWidths: (widths: Record<string, number>) => void;
  setLayoutMode: (mode: "grid" | "focus" | "sidebar" | "custom") => void;
  resetColumnWidths: () => void;
  setProviderOrder: (order: LLMProvider[]) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isInitializedRef = useRef(false);

  // Load saved state on mount
  useEffect(() => {
    const loadState = async () => {
      // Async load for conversations (IndexedDB)
      const conversations = await loadConversations();

      // Sync load for other preferences (localStorage)
      const cookieConfigs = loadCookieConfigs();
      const systemInstructions = loadSystemInstructions();
      const activeProvider = loadActiveProvider();
      const currentConversationId = loadCurrentConversation();
      const unifiedProviders = loadUnifiedProviders();
      const enabledProviders = loadEnabledProviders([
        "chatgpt",
        "claude",
        "gemini",
        "zai",
        "grok",
        "qwen",
        "mistral",
        "ollama",
      ]);
      const columnWidths = loadColumnWidths();
      const layoutMode = loadLayoutMode();
      const providerOrder = loadProviderOrder();

      dispatch({
        type: "LOAD_STATE",
        state: {
          conversations,
          cookieConfigs,
          systemInstructions,
          activeProvider,
          currentConversationId,
          unifiedProviders,
          enabledProviders,
          columnWidths,
          layoutMode,
          providerOrder:
            providerOrder.length > 0
              ? providerOrder
              : orderProviders([
                  "chatgpt",
                  "claude",
                  "gemini",
                  "zai",
                  "grok",
                  "qwen",
                  "mistral",
                  "ollama",
                ]),
        },
      });

      // Mark as initialized after loading
      isInitializedRef.current = true;
    };

    loadState();
  }, []);

  // Persist state changes - only after initial load to prevent overwriting saved data
  useEffect(() => {
    if (isInitializedRef.current) {
      saveConversations(state.conversations).catch(console.error);
    }
  }, [state.conversations]);

  useEffect(() => {
    if (isInitializedRef.current) {
      saveCookieConfigs(state.cookieConfigs);
    }
  }, [state.cookieConfigs]);

  useEffect(() => {
    if (isInitializedRef.current) {
      saveSystemInstructions(state.systemInstructions);
    }
  }, [state.systemInstructions]);

  useEffect(() => {
    if (isInitializedRef.current) {
      saveActiveProvider(state.activeProvider);
    }
  }, [state.activeProvider]);

  useEffect(() => {
    if (isInitializedRef.current) {
      saveCurrentConversation(state.currentConversationId);
    }
  }, [state.currentConversationId]);

  useEffect(() => {
    if (isInitializedRef.current) {
      saveUnifiedProviders(state.unifiedProviders);
    }
  }, [state.unifiedProviders]);

  useEffect(() => {
    if (isInitializedRef.current) {
      saveEnabledProviders(state.enabledProviders);
    }
  }, [state.enabledProviders]);

  useEffect(() => {
    if (isInitializedRef.current) {
      saveColumnWidths(state.columnWidths);
    }
  }, [state.columnWidths]);

  useEffect(() => {
    if (isInitializedRef.current) {
      saveLayoutMode(state.layoutMode);
    }
  }, [state.layoutMode]);

  useEffect(() => {
    if (isInitializedRef.current) {
      saveProviderOrder(state.providerOrder);
    }
  }, [state.providerOrder]);

  // Warmup browser page for active provider and unified providers
  const activeProviderCookies =
    state.cookieConfigs[state.activeProvider]?.cookies;

  // Trigger warmup for a list of providers
  const warmupProviders = useCallback(
    async (providers: LLMProvider[]) => {
      // Use state.providerOrder if available, otherwise fallback to default order
      const uniqueProviders = (() => {
        const defaults = orderProviders(providers);
        if (state.providerOrder && state.providerOrder.length > 0) {
          return [...defaults].sort((a, b) => {
            const idxA = state.providerOrder.indexOf(a);
            const idxB = state.providerOrder.indexOf(b);
            // If not found in custom order, push to end
            return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
          });
        }
        return defaults;
      })();

      console.log(
        `[ChatContext] Warming up providers: ${uniqueProviders.join(", ")}`,
      );

      // Sequential execution to ensure tab order matches initialization order
      for (const provider of uniqueProviders) {
        const cookies = state.cookieConfigs[provider]?.cookies;
        if (!cookies || cookies.length === 0) continue;

        // Set status to warming immediately
        dispatch({
          type: "SET_PROVIDER_STATUS",
          provider,
          status: "warming",
        });

        try {
          // Trigger warmup request and wait for it to complete (initial navigation)
          await fetch("/api/session/warmup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: provider,
              cookies: cookies,
              preventSwitch: true,
              awaitWarmup: true,
            }),
          });

          // Start polling in parallel (don't block next provider on full readiness, just on creation)
          (async () => {
            let isWarmed = false;
            let attempts = 0;
            const maxAttempts = 60; // 60 seconds (generous timeout for parallel loads)

            while (!isWarmed && attempts < maxAttempts) {
              try {
                const warmupRes = await fetch(
                  `/api/session/warmup?provider=${provider}`,
                );
                const warmupData = await warmupRes.json();

                if (warmupData.success && warmupData.isWarmed) {
                  isWarmed = true;
                  break;
                }
              } catch (e) {
                // ignore fetch errors during polling
              }

              // Wait 1 second
              await new Promise((resolve) => setTimeout(resolve, 1000));
              attempts++;
            }

            if (isWarmed) {
              // After warmup, confirm authentication before marking ready
              let isAuthenticated = false;
              let authAttempts = 0;
              const maxAuthAttempts = 10;

              while (!isAuthenticated && authAttempts < maxAuthAttempts) {
                try {
                  const sessionRes = await fetch(
                    `/api/session?provider=${provider}`,
                  );
                  const sessionData = await sessionRes.json();
                  if (sessionData.success && sessionData.isAuthenticated) {
                    isAuthenticated = true;
                    break;
                  }
                } catch (e) {
                  // ignore and retry
                }
                await new Promise((resolve) => setTimeout(resolve, 1000));
                authAttempts++;
              }

              dispatch({
                type: "SET_PROVIDER_STATUS",
                provider,
                status: isAuthenticated ? "ready" : "error",
              });
            } else {
              // Timeout
              console.warn(`[ChatContext] Warmup timed out for ${provider}`);
              dispatch({
                type: "SET_PROVIDER_STATUS",
                provider,
                status: "idle",
              });
            }
          })();
        } catch (error) {
          console.error(`[ChatContext] Warmup failed for ${provider}:`, error);
          dispatch({
            type: "SET_PROVIDER_STATUS",
            provider,
            status: "error",
          });
        }
      }
    },
    [state.cookieConfigs],
  );

  // Prompt logic
  const [showCookiePrompt, setShowCookiePrompt] = React.useState(false);
  const hasPromptedRef = useRef(false);

  // Initial warmup on mount for default unified providers + active
  useEffect(() => {
    if (isInitializedRef.current) {
      // Warmup all unified providers (defaults to chatgpt, gemini) plus current active one
      const providersToWarm = [...state.unifiedProviders, state.activeProvider];
      warmupProviders(providersToWarm);

      // Check if we need to show cookie prompt for active provider
      const activeCookies =
        state.cookieConfigs[state.activeProvider]?.cookies || [];
      if (activeCookies.length === 0 && !hasPromptedRef.current) {
        // Only prompt once per session
        setShowCookiePrompt(true);
        hasPromptedRef.current = true;
      }
    }
  }, [isInitializedRef.current, warmupProviders]); // Depend on initialization

  // Keep the active provider warmup on change if needed, but the above covers initial load
  useEffect(() => {
    if (isInitializedRef.current) {
      const activeCookies =
        state.cookieConfigs[state.activeProvider]?.cookies || [];
      if (activeCookies.length > 0) {
        warmupProviders([state.activeProvider]);
        setShowCookiePrompt(false); // Hide prompt if cookies appear (e.g. manual add)
      } else if (!hasPromptedRef.current) {
        // Also check on provider switch? Maybe annoying. Let's stick to mount for now or explicit user action.
        // Actually user might switch to empty provider. Let's show prompt then too?
        // User said "when user load the website first time". Stick to that.
      }
    }
  }, [state.activeProvider, activeProviderCookies, warmupProviders]);

  // Get current conversation
  const currentConversation =
    state.conversations.find((c) => c.id === state.currentConversationId) ||
    null;

  // Actions
  const newChat = useCallback(
    (folderId?: string) => {
      if (state.isUnifiedMode) {
        // In unified mode, create new chats for ALL unified providers
        // CRITICAL: We must ensure the ACTIVE provider is processed LAST
        // so that its new conversation becomes the currentConversationId.

        const providersToCreate = [...state.unifiedProviders];

        // If active provider is in the list, move it to the end
        if (providersToCreate.includes(state.activeProvider)) {
          providersToCreate.splice(
            providersToCreate.indexOf(state.activeProvider),
            1,
          );
          providersToCreate.push(state.activeProvider);
        } else {
          // If not in the list, just add it to the end
          providersToCreate.push(state.activeProvider);
        }

        providersToCreate.forEach((provider) => {
          dispatch({ type: "NEW_CONVERSATION", provider, folderId });
        });
      } else {
        // Single mode - just reset current
        dispatch({ type: "NEW_CONVERSATION", folderId });
      }
    },
    [state.isUnifiedMode, state.unifiedProviders, state.activeProvider],
  );

  const selectConversation = useCallback((id: string) => {
    dispatch({ type: "SELECT_CONVERSATION", id });
  }, []);

  const setProvider = useCallback((provider: LLMProvider) => {
    // Cancel any ongoing stream when switching providers
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    dispatch({ type: "SET_SENDING", isSending: false });
    dispatch({ type: "SET_PROVIDER", provider });
  }, []);

  const setActiveView = useCallback((view: AppView) => {
    dispatch({ type: "SET_ACTIVE_VIEW", view });
  }, []);

  const showApiDocsView = useCallback(() => {
    dispatch({ type: "SET_ACTIVE_VIEW", view: "api-docs" });
  }, []);

  const showChatView = useCallback(() => {
    dispatch({ type: "SET_ACTIVE_VIEW", view: "chat" });
  }, []);

  const setCookies = useCallback(
    (provider: LLMProvider, cookies: CookieEntry[]) => {
      dispatch({ type: "SET_COOKIES", provider, cookies });
    },
    [],
  );

  const setSystemInstructions = useCallback(
    (provider: LLMProvider, instructions: string) => {
      dispatch({ type: "SET_SYSTEM_INSTRUCTIONS", provider, instructions });
    },
    [],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      const conversation = state.conversations.find((c) => c.id === id);
      if (!conversation) return;

      const normalizeText = (value?: string) =>
        value ? value.trim().toLowerCase() : "";
      const firstUserMessage = normalizeText(
        conversation.messages.find((m) => m.role === "user")?.content,
      );
      const title = normalizeText(conversation.title);
      const createdAt = conversation.createdAt;

      let conversationsToDelete = [conversation];

      if (state.isUnifiedMode) {
        const siblingMatches = state.conversations.filter((c) => {
          if (c.id === conversation.id) return false;
          const siblingFirstUser = normalizeText(
            c.messages.find((m) => m.role === "user")?.content,
          );
          const siblingTitle = normalizeText(c.title);
          const timeDiff = Math.abs(c.createdAt - createdAt);
          const timeMatch = timeDiff <= 2 * 60 * 1000;
          const titleMatch = title && siblingTitle === title;
          const messageMatch =
            firstUserMessage && siblingFirstUser === firstUserMessage;

          return (messageMatch && timeMatch) || (messageMatch && titleMatch);
        });

        if (siblingMatches.length > 0) {
          conversationsToDelete = [conversation, ...siblingMatches];
        }
      }

      const uniqueIds = Array.from(
        new Set(conversationsToDelete.map((c) => c.id)),
      );

      // Delete locally first (optimistic update)
      uniqueIds.forEach((convId) => {
        dispatch({ type: "DELETE_CONVERSATION", id: convId });
      });

      // Delete remotely if possible
      await Promise.all(
        conversationsToDelete.map(async (conv) => {
          if (!conv.externalId || !conv.provider) return;
          try {
            const cookies = state.cookieConfigs[conv.provider]?.cookies || [];
            await fetch("/api/chat/delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                provider: conv.provider,
                conversationId: conv.externalId,
                cookies,
              }),
            });
          } catch (error) {
            console.error("Failed to delete remote conversation", error);
          }
        }),
      );
    },
    [state.conversations, state.cookieConfigs, state.isUnifiedMode],
  );

  const deleteAllConversations = useCallback(() => {
    dispatch({ type: "DELETE_ALL_CONVERSATIONS" });
  }, []);

  const pinConversation = useCallback((id: string) => {
    dispatch({ type: "PIN_CONVERSATION", id });
  }, []);

  const unpinConversation = useCallback((id: string) => {
    dispatch({ type: "UNPIN_CONVERSATION", id });
  }, []);

  const testConnection = useCallback(
    async (provider: LLMProvider): Promise<boolean> => {
      const cookies = state.cookieConfigs[provider]?.cookies;
      if (!cookies || cookies.length === 0) {
        return false;
      }

      dispatch({
        type: "SET_SESSION_STATE",
        provider,
        state: { isLoading: true },
      });
      // Set visual status to warming
      dispatch({
        type: "SET_PROVIDER_STATUS",
        provider,
        status: "warming",
      });

      try {
        // Step 1: Trigger Warmup
        await fetch("/api/session/warmup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, cookies, preventSwitch: true }),
        });

        // Step 2: Poll for "isWarmed" status
        let isWarmed = false;
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds timeout

        while (!isWarmed && attempts < maxAttempts) {
          const warmupRes = await fetch(
            `/api/session/warmup?provider=${provider}`,
          );
          const warmupData = await warmupRes.json();

          if (warmupData.success && warmupData.isWarmed) {
            isWarmed = true;
            break;
          }

          // Wait 1 second before next check
          await new Promise((resolve) => setTimeout(resolve, 1000));
          attempts++;
        }

        if (!isWarmed) {
          throw new Error("Timeout waiting for browser warmup");
        }

        // Step 3: Check Authentication (now that page is ready)
        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, cookies }),
        });

        const data = await response.json();
        const isConnected = data.isAuthenticated;

        dispatch({
          type: "SET_SESSION_STATE",
          provider,
          state: {
            isLoading: false,
            isConnected: isConnected,
            error: data.error,
          },
        });

        dispatch({
          type: "SET_PROVIDER_STATUS",
          provider,
          status: isConnected ? "ready" : "error",
        });

        return isConnected;
      } catch (error) {
        console.error(`[ChatContext] Connection test failed:`, error);
        dispatch({
          type: "SET_SESSION_STATE",
          provider,
          state: { isLoading: false, isConnected: false, error: String(error) },
        });
        dispatch({
          type: "SET_PROVIDER_STATUS",
          provider,
          status: "error",
        });
        return false;
      }
    },
    [state.cookieConfigs],
  );

  const sendMessage = useCallback(
    async (content: string, images?: string[]) => {
      if (
        (!content.trim() && (!images || images.length === 0)) ||
        state.isSending
      )
        return;

      let activeConversationId = state.currentConversationId;

      // Safety check: Ensure currentConversationId belongs to the activeProvider
      // This fixes the glitch where typing in ChatGPT would send to a Gemini conversation
      if (activeConversationId) {
        const currentConv = state.conversations.find(
          (c) => c.id === activeConversationId,
        );
        if (currentConv && currentConv.provider !== state.activeProvider) {
          // Mismatch detected! Find the correct conversation for the active provider
          const activeProviderConv = state.conversations.find(
            (c) => c.provider === state.activeProvider,
          );
          if (activeProviderConv) {
            console.log(
              `[ChatContext] Auto-switched conversation from ${currentConv.provider} to ${state.activeProvider}`,
            );
            activeConversationId = activeProviderConv.id;
            dispatch({ type: "SELECT_CONVERSATION", id: activeConversationId });
          } else {
            // No conversation exists for active provider? Should be rare, but let's clear ID so a new one is created
            activeConversationId = null;
          }
        }
      }

      if (!activeConversationId) {
        const newConvId = uuidv4();
        activeConversationId = newConvId;

        const newConversation: Conversation = {
          id: newConvId,
          title: "New Chat",
          messages: [],
          provider: state.activeProvider,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        dispatch({
          type: "LOAD_STATE",
          state: {
            conversations: [newConversation, ...state.conversations],
            currentConversationId: newConvId,
          },
        });
      }

      // Add user message
      const userMessage: Message = {
        id: uuidv4(),
        role: "user",
        content: content.trim(),
        images,
        timestamp: Date.now(),
        provider: state.activeProvider,
      };
      dispatch({ type: "ADD_MESSAGE", message: userMessage });
      dispatch({ type: "SET_SENDING", isSending: true });

      // Create placeholder for assistant response
      const assistantMessage: Message = {
        id: uuidv4(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        provider: state.activeProvider,
      };
      dispatch({ type: "ADD_MESSAGE", message: assistantMessage });

      try {
        // Create AbortController for this request
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        const cookies =
          state.cookieConfigs[state.activeProvider]?.cookies || [];

        // Use streaming endpoint - look up conversation by our tracked ID
        const currentConv = state.conversations.find(
          (c) => c.id === activeConversationId,
        );
        const externalId = currentConv?.externalId;

        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: state.activeProvider,
            message: content.trim(),
            images,
            cookies,
            conversationId: externalId,
          }),
          signal,
        });

        if (!response.ok) {
          throw new Error("Failed to connect to streaming endpoint");
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = "";
        let sseBuffer = ""; // Buffer for incomplete SSE messages

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            sseBuffer += chunk;
            const lines = sseBuffer.split("\n");
            // Keep the last incomplete line in the buffer
            sseBuffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.substring(6));

                  if (data.type === "chunk" && data.content) {
                    accumulatedContent += data.content;
                    dispatch({
                      type: "UPDATE_MESSAGE",
                      id: assistantMessage.id,
                      content: accumulatedContent,
                    });
                  } else if (data.type === "done") {
                    if (data.success && data.content) {
                      dispatch({
                        type: "UPDATE_MESSAGE",
                        id: assistantMessage.id,
                        content: data.content,
                      });

                      // Update conversation external ID if provided
                      if (activeConversationId && data.conversationId) {
                        dispatch({
                          type: "UPDATE_CONVERSATION_EXTERNAL_ID",
                          id: activeConversationId,
                          externalId: data.conversationId,
                        });
                      }
                    } else if (data.error) {
                      dispatch({
                        type: "UPDATE_MESSAGE",
                        id: assistantMessage.id,
                        content: `Error: ${data.error}`,
                      });
                    }
                  } else if (data.type === "error") {
                    dispatch({
                      type: "UPDATE_MESSAGE",
                      id: assistantMessage.id,
                      content: `Error: ${data.error}`,
                    });
                  }
                } catch {
                  // Ignore JSON parse errors for incomplete chunks
                }
              }
            }
          }
        }
      } catch (error) {
        // Don't show error if the request was intentionally aborted (e.g., when switching providers)
        if (error instanceof Error && error.name === "AbortError") {
          console.log("[ChatContext] Stream aborted");
          return;
        }
        dispatch({
          type: "UPDATE_MESSAGE",
          id: assistantMessage.id,
          content: `Error: ${String(error)}`,
        });
      } finally {
        abortControllerRef.current = null;
        dispatch({ type: "SET_SENDING", isSending: false });
      }
    },
    [
      state.currentConversationId,
      state.activeProvider,
      state.cookieConfigs,
      state.isSending,
      state.conversations,
    ],
  );

  const generateImage = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || state.isSending) return;

      // Track the actual conversation ID we're using
      // This is needed because dispatch is async and state.currentConversationId
      // may not be updated immediately after NEW_CONVERSATION dispatch
      let activeConversationId = state.currentConversationId;

      // Create new conversation if none exists
      if (!activeConversationId) {
        // Generate ID here to track it immediately
        const newConvId = uuidv4();
        activeConversationId = newConvId;

        const newConversation: Conversation = {
          id: newConvId,
          title: "New Chat",
          messages: [],
          provider: state.activeProvider,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        // Dispatch with the new conversation directly
        dispatch({
          type: "LOAD_STATE",
          state: {
            conversations: [newConversation, ...state.conversations],
            currentConversationId: newConvId,
          },
        });
      }

      // Add user message
      const userMessage: Message = {
        id: uuidv4(),
        role: "user",
        content: `Generate image: ${prompt}`,
        timestamp: Date.now(),
        provider: state.activeProvider,
      };
      dispatch({ type: "ADD_MESSAGE", message: userMessage });
      dispatch({ type: "SET_SENDING", isSending: true });

      // Create placeholder for assistant response with loading state
      const assistantMessage: Message = {
        id: uuidv4(),
        role: "assistant",
        content: "Generating image...",
        timestamp: Date.now(),
        provider: state.activeProvider,
      };
      dispatch({ type: "ADD_MESSAGE", message: assistantMessage });

      try {
        const cookies =
          state.cookieConfigs[state.activeProvider]?.cookies || [];

        // Use streaming endpoint - look up conversation by our tracked ID
        const currentConv = state.conversations.find(
          (c) => c.id === activeConversationId,
        );
        const externalId = currentConv?.externalId;

        const response = await fetch("/api/chat/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: state.activeProvider,
            prompt: prompt.trim(),
            cookies,
            conversationId: externalId,
          }),
        });

        const data = await response.json();

        if (response.ok && data.success && data.imageUrl) {
          dispatch({
            type: "UPDATE_MESSAGE",
            id: assistantMessage.id,
            content: `![Generated Image](${data.imageUrl})`,
          });

          // Update conversation external ID if provided
          if (activeConversationId && data.conversationId) {
            dispatch({
              type: "UPDATE_CONVERSATION_EXTERNAL_ID",
              id: activeConversationId,
              externalId: data.conversationId,
            });
          }
        } else {
          dispatch({
            type: "UPDATE_MESSAGE",
            id: assistantMessage.id,
            content: `Error generating image: ${data.error || "Unknown error"}`,
          });
        }
      } catch (error) {
        dispatch({
          type: "UPDATE_MESSAGE",
          id: assistantMessage.id,
          content: `Error: ${String(error)}`,
        });
      } finally {
        dispatch({ type: "SET_SENDING", isSending: false });
      }
    },
    [
      state.currentConversationId,
      state.activeProvider,
      state.cookieConfigs,
      state.isSending,
      state.conversations,
    ],
  );

  const toggleUnifiedMode = useCallback(() => {
    dispatch({ type: "TOGGLE_UNIFIED_MODE" });
  }, []);

  const toggleUnifiedProvider = useCallback(
    (provider: LLMProvider) => {
      // Trigger warmup if adding a new provider
      if (!state.unifiedProviders.includes(provider)) {
        warmupProviders([provider]);
      }
      dispatch({ type: "TOGGLE_UNIFIED_PROVIDER", provider });
    },
    [state.unifiedProviders, warmupProviders, dispatch],
  );

  const toggleProviderEnabled = useCallback(
    (provider: LLMProvider) => {
      dispatch({ type: "TOGGLE_PROVIDER_ENABLED", provider });
    },
    [dispatch],
  );

  const broadcastMessage = useCallback(
    async (content: string, images?: string[]) => {
      if (
        (!content.trim() && (!images || images.length === 0)) ||
        state.isSending
      )
        return;

      dispatch({ type: "SET_SENDING", isSending: true });

      let orderedProviders: LLMProvider[];

      if (state.providerOrder && state.providerOrder.length > 0) {
        // Use custom order
        const toOrder = Array.from(
          new Set([...state.unifiedProviders, state.activeProvider]),
        );
        orderedProviders = toOrder.sort((a, b) => {
          const idxA = state.providerOrder.indexOf(a);
          const idxB = state.providerOrder.indexOf(b);
          return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        });
      } else {
        // Default order
        orderedProviders = orderProviders([
          ...state.unifiedProviders,
          state.activeProvider,
        ]);
      }

      const providersToCall = orderedProviders.filter((p) =>
        state.enabledProviders.includes(p),
      );

      try {
        // Track all active streams
        const streamPromises: Promise<void>[] = [];

        // Execute sequentially to create a visual "tour"
        for (const provider of providersToCall) {
          try {
            // Find latest conversation or create new one for this provider
            const providerConvos = state.conversations.filter(
              (c) => c.provider === provider,
            );

            // Should reuse latest? Usually yes.
            let conversationId =
              providerConvos.length > 0 ? providerConvos[0].id : uuidv4();
            let isNew = providerConvos.length === 0;

            if (isNew) {
              const newConversation: Conversation = {
                id: conversationId,
                title: "New Chat",
                messages: [],
                provider: provider,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              dispatch({
                type: "IMPORT_CONVERSATION", // Easier than LOAD_STATE
                conversation: newConversation,
              });
            }

            // User Message
            const userMessage: Message = {
              id: uuidv4(),
              role: "user",
              content: content.trim(),
              images,
              timestamp: Date.now(),
              provider: provider,
            };
            dispatch({
              type: "ADD_MESSAGE",
              message: userMessage,
              conversationId,
            });

            // Assistant Message
            const assistantMessage: Message = {
              id: uuidv4(),
              role: "assistant",
              content: "",
              timestamp: Date.now(),
              provider: provider,
            };
            dispatch({
              type: "ADD_MESSAGE",
              message: assistantMessage,
              conversationId,
            });

            // Stream
            const streamStartTime = Date.now();
            dispatch({
              type: "SET_PROVIDER_STATUS",
              provider,
              status: "streaming",
            });

            const cookies = state.cookieConfigs[provider]?.cookies || [];
            // Need external ID if existing conversation
            const currentConv = isNew
              ? null
              : state.conversations.find((c) => c.id === conversationId);
            const externalId = currentConv?.externalId;

            // Initiate the request
            // This will trigger 'runTask' in BrowserManager which switches the tab
            const response = await fetch("/api/chat/stream", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                provider,
                message: content.trim(),
                images,
                cookies,
                conversationId: externalId,
              }),
            });

            if (!response.ok) throw new Error("Connection failed");

            // Process the stream
            // Note: We don't await the stream completion here, allowing parallel streaming RESPONSE
            // after the sequential REQUEST initiation.
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            // Process reading in background so we can move to next provider input
            const streamPromise = (async () => {
              let accumulatedContent = "";
              let sseBuffer = "";
              try {
                if (reader) {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    sseBuffer += chunk;
                    const lines = sseBuffer.split("\n");
                    sseBuffer = lines.pop() || "";

                    for (const line of lines) {
                      if (line.startsWith("data: ")) {
                        try {
                          const data = JSON.parse(line.substring(6));
                          if (data.type === "chunk" && data.content) {
                            accumulatedContent += data.content;
                            dispatch({
                              type: "UPDATE_MESSAGE",
                              id: assistantMessage.id,
                              content: accumulatedContent,
                              conversationId,
                            });
                            // Update streaming stats
                            dispatch({
                              type: "UPDATE_STREAMING_STATS",
                              provider,
                              charsReceived: accumulatedContent.length,
                              startTime: streamStartTime,
                            });
                          } else if (data.type === "done" && data.success) {
                            dispatch({
                              type: "UPDATE_MESSAGE",
                              id: assistantMessage.id,
                              content: data.content,
                              conversationId,
                            });
                            // Update external ID
                            if (data.conversationId) {
                              dispatch({
                                type: "UPDATE_CONVERSATION_EXTERNAL_ID",
                                id: conversationId,
                                externalId: data.conversationId,
                              });
                            }
                          } else if (data.error) {
                            dispatch({
                              type: "UPDATE_MESSAGE",
                              id: assistantMessage.id,
                              content: `Error: ${data.error}`,
                              conversationId,
                            });
                          }
                        } catch {}
                      }
                    }
                  }
                }
              } catch (err) {
                dispatch({
                  type: "UPDATE_MESSAGE",
                  id: assistantMessage.id,
                  content: `Error: ${String(err)}`,
                  conversationId,
                });
                dispatch({
                  type: "SET_PROVIDER_STATUS",
                  provider,
                  status: "error",
                });
              } finally {
                dispatch({ type: "CLEAR_STREAMING_STATS", provider });
              }
            })();

            streamPromises.push(streamPromise);
          } catch (err) {
            console.error(`Error sending to ${provider}:`, err);
            // Dispatch error status for UI but continue loop
            dispatch({
              type: "SET_PROVIDER_STATUS",
              provider,
              status: "error",
            });
          }
        } // End for loop

        // Do not auto-focus any provider after broadcast.
        // This prevents the UI from snapping back to the first provider tab.

        // Wait for all streams to finish before setting isSending to false
        await Promise.all(streamPromises);
      } catch (error) {
        console.error("Broadcast failed", error);
      } finally {
        dispatch({ type: "SET_SENDING", isSending: false });
      }
    },
    [
      state.unifiedProviders,
      state.conversations,
      state.isSending,
      state.cookieConfigs,
      state.activeProvider,
      state.enabledProviders,
    ],
  );

  // New features implementation
  const regenerateLastMessage = useCallback(
    async (targetConversationId?: string) => {
      if (state.isSending) return;

      const conversationId =
        targetConversationId || state.currentConversationId || undefined;
      const conversation = state.conversations.find(
        (c) => c.id === conversationId,
      );

      if (!conversation || conversation.messages.length === 0) return;

      const lastMessage =
        conversation.messages[conversation.messages.length - 1];
      if (lastMessage.role !== "assistant") return;

      // Remove the last message from UI
      dispatch({
        type: "REMOVE_LAST_MESSAGE",
        conversationId: conversationId!,
      });

      // Find the last user message to resend
      // We need to look backwards from end-1 since we just removed end
      const messages = conversation.messages.slice(0, -1);
      const lastUserMessage = messages
        .slice()
        .reverse()
        .find((m) => m.role === "user");

      if (lastUserMessage && conversation.provider) {
        dispatch({ type: "SET_SENDING", isSending: true });

        try {
          // Prepare messages for context if needed (not implemented fully for Puppeteer yet)
          // Just resending the last prompt for now
          // Ideally we should pass conversation history

          // We use broadcastMessage logic but targeted?
          // Actually, we should use the same stream logic as sendMessage but for specific provider
          // Re-using sendMessage logic but forcing provider?
          // sendMessage uses activeProvider. We need to use conversation.provider.

          const provider = conversation.provider;
          const content = lastUserMessage.content;
          const images = lastUserMessage.images;

          // Dispatch initial assistant message placeholder
          const assistantMessageId = uuidv4();
          const assistantMessage: Message = {
            id: assistantMessageId,
            role: "assistant", // Using 'assistant' role
            content: "",
            timestamp: Date.now(),
            provider,
          };
          dispatch({
            type: "ADD_MESSAGE",
            message: assistantMessage,
            conversationId: conversationId!,
          }); // Force specific convo ID

          // Trigger stream
          // We must duplicate the fetch logic here or refactor sendMessage to accept provider/convoId
          // Let's copy-paste-modify for safety and speed, refactor later
          const activeCookies = state.cookieConfigs[provider]?.cookies || [];

          dispatch({
            type: "SET_PROVIDER_STATUS",
            provider,
            status: "streaming",
          });

          const response = await fetch("/api/chat/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider,
              message: content,
              images,
              cookies: activeCookies,
              conversationId: conversation.externalId,
            }),
          });

          // ... processing stream ...
          // Using a shared helper would be better, but given constraints:
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let accumulatedContent = "";

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value);
              const lines = chunk.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const data = JSON.parse(line.substring(6));
                    if (data.type === "chunk" && data.content) {
                      accumulatedContent += data.content;
                      dispatch({
                        type: "UPDATE_MESSAGE",
                        id: assistantMessageId,
                        content: accumulatedContent,
                        conversationId: conversationId,
                      });
                      dispatch({
                        type: "UPDATE_STREAMING_STATS",
                        provider,
                        charsReceived: accumulatedContent.length,
                        startTime: Date.now(), // Approximate
                      });
                    } else if (data.type === "done") {
                      if (data.content) {
                        dispatch({
                          type: "UPDATE_MESSAGE",
                          id: assistantMessageId,
                          content: data.content,
                          conversationId: conversationId,
                        });
                      }
                      if (data.conversationId) {
                        dispatch({
                          type: "UPDATE_CONVERSATION_EXTERNAL_ID",
                          id: conversationId!,
                          externalId: data.conversationId,
                        });
                      }
                    }
                  } catch {}
                }
              }
            }
          }
        } catch (error) {
          console.error("Regenerate failed", error);
        } finally {
          dispatch({ type: "SET_SENDING", isSending: false });
          dispatch({
            type: "CLEAR_STREAMING_STATS",
            provider: conversation.provider,
          });
          dispatch({
            type: "SET_PROVIDER_STATUS",
            provider: conversation.provider,
            status: "ready", // or idle
          });
        }
      }
    },
    [
      state.conversations,
      state.currentConversationId,
      state.isSending,
      state.cookieConfigs,
    ],
  );

  const editAndResend = useCallback(
    async (
      messageId: string,
      newContent: string,
      targetConversationId?: string,
    ) => {
      const conversationId =
        targetConversationId || state.currentConversationId || undefined;
      // edit message content check
      dispatch({
        type: "EDIT_MESSAGE",
        messageId,
        content: newContent,
        conversationId: conversationId!,
      });

      // Delete all subsequent messages
      dispatch({
        type: "DELETE_MESSAGES_AFTER",
        messageId,
        conversationId: conversationId!,
      });

      // Trigger regeneration (which will pick up the last user message, which is now this one)
      // We can reuse the logic, but for now calling regenerateLastMessage might work
      // IF we ensure state is updated. Reducer is synchronous, so it should be fine.
      // But regenerateLastMessage expects the last message to be assistant.
      // We just deleted everything AFTER the user message. So the last message IS the user message.
      // regenerateLastMessage logic above assumes last message is assistant to remove it.
      // So we need separate logic or tweak regenerate.

      // Custom resend logic:
      const conversation = state.conversations.find(
        (c) => c.id === conversationId,
      );
      if (!conversation) return;
      const provider = conversation.provider;

      dispatch({ type: "SET_SENDING", isSending: true });
      try {
        const assistantMessageId = uuidv4();
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          provider,
        };
        dispatch({
          type: "ADD_MESSAGE",
          message: assistantMessage,
          conversationId: conversationId!,
        });

        const activeCookies = state.cookieConfigs[provider]?.cookies || [];
        dispatch({
          type: "SET_PROVIDER_STATUS",
          provider,
          status: "streaming",
        });

        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            message: newContent,
            cookies: activeCookies,
            conversationId: conversation.externalId,
          }),
        });

        // ... stream processing (simplified duplicate) ...
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.substring(6));
                  if (data.type === "chunk" && data.content) {
                    accumulatedContent += data.content;
                    dispatch({
                      type: "UPDATE_MESSAGE",
                      id: assistantMessageId,
                      content: accumulatedContent,
                      conversationId: conversationId,
                    });
                    dispatch({
                      type: "UPDATE_STREAMING_STATS",
                      provider,
                      charsReceived: accumulatedContent.length,
                      startTime: Date.now(),
                    });
                  } else if (data.type === "done") {
                    if (data.content) {
                      dispatch({
                        type: "UPDATE_MESSAGE",
                        id: assistantMessageId,
                        content: data.content,
                        conversationId: conversationId,
                      });
                    }
                  }
                } catch {}
              }
            }
          }
        }
      } catch (e) {
        console.error("Edit resend failed", e);
      } finally {
        dispatch({ type: "SET_SENDING", isSending: false });
        dispatch({ type: "CLEAR_STREAMING_STATS", provider });
        dispatch({
          type: "SET_PROVIDER_STATUS",
          provider,
          status: "ready", // or idle
        });
      }
    },
    [state.conversations, state.currentConversationId, state.cookieConfigs],
  );

  const stopGeneration = useCallback(() => {
    // iterate all active controllers/streams?
    // For now just global stop
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    dispatch({ type: "SET_SENDING", isSending: false });
    // We should ideally tell backend to stop too, but client-side abort is a start
  }, []);

  const exportConversation = useCallback(
    (format: "json" | "markdown", conversationIds?: string[]) => {
      const ids =
        conversationIds && conversationIds.length > 0
          ? conversationIds
          : state.currentConversationId
            ? [state.currentConversationId]
            : [];

      if (ids.length === 0) return;

      const conversationsToExport = state.conversations.filter((c) =>
        ids.includes(c.id),
      );
      if (conversationsToExport.length === 0) return;

      const sanitizeFilePart = (value: string) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 80) || "conversation";

      const formatDate = (timestamp: number) =>
        new Date(timestamp).toLocaleString();

      let content = "";
      let filename = "conversations";
      let mimeType = "application/json";

      if (format === "json") {
        content = JSON.stringify(
          conversationsToExport.length === 1
            ? conversationsToExport[0]
            : conversationsToExport,
          null,
          2,
        );
        mimeType = "application/json";
        if (conversationsToExport.length === 1) {
          filename = sanitizeFilePart(conversationsToExport[0].title);
        } else {
          filename = `conversations-${new Date().toISOString().slice(0, 10)}`;
        }
      } else {
        const markdownBlocks = conversationsToExport.map((conv) => {
          const header = [
            `# ${conv.title || "Conversation"}`,
            `- Provider: ${conv.provider}`,
            `- Created: ${formatDate(conv.createdAt)}`,
            `- Updated: ${formatDate(conv.updatedAt)}`,
            "",
          ].join("\n");

          const messageBlocks = conv.messages.map((msg) => {
            const role = msg.role === "assistant" ? "Assistant" : "User";
            const meta = `**${role}** • ${formatDate(msg.timestamp)}`;
            const images =
              msg.images && msg.images.length > 0
                ? msg.images
                    .map(
                      (img, index) =>
                        `![image ${index + 1}](data:image/png;base64,${img})`,
                    )
                    .join("\n")
                : "";

            return [meta, "", msg.content || "", images, ""]
              .filter(Boolean)
              .join("\n");
          });

          return [header, ...messageBlocks].join("\n");
        });

        content = markdownBlocks.join("\n---\n\n");
        mimeType = "text/markdown";
        if (conversationsToExport.length === 1) {
          filename = sanitizeFilePart(conversationsToExport[0].title);
        } else {
          filename = `conversations-${new Date().toISOString().slice(0, 10)}`;
        }
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.${format === "json" ? "json" : "md"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
    [state.currentConversationId, state.conversations],
  );

  const importConversation = useCallback(
    (jsonData: string) => {
      const existingIds = new Set(state.conversations.map((c) => c.id));
      const normalizeProvider = (value: any): LLMProvider | null => {
        if (typeof value !== "string") return null;
        const normalized = value.toLowerCase().trim();
        const map: Record<string, LLMProvider> = {
          chatgpt: "chatgpt",
          openai: "chatgpt",
          "gpt-4": "chatgpt",
          "gpt-3.5": "chatgpt",
          claude: "claude",
          anthropic: "claude",
          gemini: "gemini",
          google: "gemini",
          zai: "zai",
          "z.ai": "zai",
          grok: "grok",
          xai: "grok",
          qwen: "qwen",
          alibaba: "qwen",
          mistral: "mistral",
          ollama: "ollama",
        };
        return map[normalized] || null;
      };

      const normalizeMessage = (msg: any, fallbackProvider: LLMProvider) => {
        if (!msg || (msg.role !== "user" && msg.role !== "assistant"))
          return null;
        return {
          id: typeof msg.id === "string" ? msg.id : uuidv4(),
          role: msg.role,
          content: typeof msg.content === "string" ? msg.content : "",
          timestamp:
            typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
          provider: normalizeProvider(msg.provider) || fallbackProvider,
          images: Array.isArray(msg.images) ? msg.images : undefined,
          isPinned: Boolean(msg.isPinned),
        };
      };

      const normalizeConversation = (raw: any): Conversation | null => {
        if (!raw) return null;
        const inferredFromMessages = Array.isArray(raw.messages)
          ? raw.messages
              .map((msg: any) => normalizeProvider(msg?.provider))
              .find(Boolean) || null
          : null;
        const provider =
          normalizeProvider(raw.provider) ||
          inferredFromMessages ||
          state.activeProvider;
        const messages = Array.isArray(raw.messages)
          ? raw.messages
              .map((msg: any) => normalizeMessage(msg, provider))
              .filter(Boolean)
          : [];

        const baseId =
          typeof raw.id === "string" && raw.id.trim() ? raw.id : uuidv4();
        const id = existingIds.has(baseId) ? uuidv4() : baseId;
        existingIds.add(id);

        const now = Date.now();
        return {
          id,
          title:
            typeof raw.title === "string" && raw.title.trim()
              ? raw.title
              : "Imported Chat",
          messages,
          provider,
          createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now,
          updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : now,
          externalId:
            typeof raw.externalId === "string" ? raw.externalId : undefined,
          folderId: typeof raw.folderId === "string" ? raw.folderId : undefined,
          isPinned: Boolean(raw.isPinned),
        };
      };

      try {
        const parsed = JSON.parse(jsonData);
        const payload = Array.isArray(parsed)
          ? parsed
          : parsed?.conversations && Array.isArray(parsed.conversations)
            ? parsed.conversations
            : [parsed];

        const normalized = payload
          .map((item: any) => normalizeConversation(item))
          .filter(Boolean) as Conversation[];

        if (normalized.length === 0) {
          return { success: false, importedCount: 0, error: "No valid chats" };
        }

        normalized.forEach((conversation) => {
          dispatch({ type: "IMPORT_CONVERSATION", conversation });
        });

        return { success: true, importedCount: normalized.length };
      } catch (error) {
        return {
          success: false,
          importedCount: 0,
          error: "Invalid JSON format",
        };
      }
    },
    [state.conversations, state.activeProvider],
  );

  const pinMessage = useCallback(
    (messageId: string, conversationId?: string) => {
      dispatch({ type: "PIN_MESSAGE", messageId, conversationId });
    },
    [],
  );

  const unpinMessage = useCallback(
    (messageId: string, conversationId?: string) => {
      dispatch({ type: "UNPIN_MESSAGE", messageId, conversationId });
    },
    [],
  );

  const moveConversationToFolder = useCallback(
    (conversationId: string, folderId: string | undefined) => {
      dispatch({
        type: "MOVE_CONVERSATION_TO_FOLDER",
        conversationId,
        folderId,
      });
    },
    [],
  );

  const setColumnWidths = useCallback((widths: Record<string, number>) => {
    dispatch({ type: "SET_COLUMN_WIDTHS", widths });
  }, []);

  const setLayoutMode = useCallback(
    (mode: "grid" | "focus" | "sidebar" | "custom") => {
      dispatch({ type: "SET_LAYOUT_MODE", mode });
    },
    [],
  );

  const resetColumnWidths = useCallback(() => {
    dispatch({ type: "SET_COLUMN_WIDTHS", widths: {} });
    dispatch({ type: "SET_LAYOUT_MODE", mode: "grid" });
  }, []);

  const setProviderOrder = useCallback((order: LLMProvider[]) => {
    dispatch({ type: "SET_PROVIDER_ORDER", order });
  }, []);

  const value: ChatContextValue = {
    ...state,
    dispatch,
    sendMessage,
    newChat,
    selectConversation,
    setProvider,
    setActiveView,
    showApiDocsView,
    showChatView,
    setCookies,
    setSystemInstructions,
    testConnection,
    deleteConversation,
    generateImage,
    currentConversation,
    // New features
    regenerateLastMessage,
    editAndResend,
    stopGeneration,
    exportConversation,
    importConversation,
    pinMessage,
    unpinMessage,
    toggleUnifiedMode,
    isFocusMode: state.isFocusMode,
    toggleFocusMode: () => dispatch({ type: "TOGGLE_FOCUS_MODE" }),
    toggleUnifiedProvider,
    isSidebarCollapsed: state.isSidebarCollapsed,
    toggleSidebar: () => dispatch({ type: "TOGGLE_SIDEBAR" }),
    broadcastMessage,
    showCookiePrompt,
    setShowCookiePrompt,
    moveConversationToFolder,
    toggleProviderEnabled,
    deleteAllConversations,
    pinConversation,
    unpinConversation,
    enabledProviders: state.enabledProviders,
    unifiedProviders: state.unifiedProviders,
    columnWidths: state.columnWidths,
    setColumnWidths,
    setLayoutMode,
    resetColumnWidths,
    setProviderOrder,
    providerOrder: state.providerOrder,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}
