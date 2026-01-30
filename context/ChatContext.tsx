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
  ChatAction,
  ChatState,
  Conversation,
  CookieEntry,
  LLMProvider,
  Message,
  SessionState,
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
        currentConversationId: mostRecent,
      };
    }

    case "NEW_CONVERSATION": {
      const provider = action.provider || state.activeProvider;
      const newConversation: Conversation = {
        id: uuidv4(),
        title: "New Chat",
        messages: [],
        provider,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      return {
        ...state,
        conversations: [newConversation, ...state.conversations],
        currentConversationId: newConversation.id,
      };
    }

    case "SELECT_CONVERSATION":
      return { ...state, currentConversationId: action.id };

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

    case "LOAD_STATE":
      return { ...state, ...action.state };

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
      const conversations = state.conversations.map((conv) => {
        if (conv.id === state.currentConversationId) {
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
      const conversations = state.conversations.map((conv) => {
        if (conv.id === state.currentConversationId) {
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
      const conversations = state.conversations.map((conv) => {
        if (
          conv.id === state.currentConversationId &&
          conv.messages.length > 0
        ) {
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
        conversations: [action.conversation, ...state.conversations],
        currentConversationId: action.conversation.id,
      };
    }

    case "PIN_MESSAGE": {
      const conversations = state.conversations.map((conv) => {
        if (conv.id === state.currentConversationId) {
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
      const conversations = state.conversations.map((conv) => {
        if (conv.id === state.currentConversationId) {
          const messages = conv.messages.map((msg) =>
            msg.id === action.messageId ? { ...msg, isPinned: false } : msg,
          );
          return { ...conv, messages, updatedAt: Date.now() };
        }
        return conv;
      });
      return { ...state, conversations };
    }

    // Unified Mode is now permanent, so this toggle is no-op or removed
    case "TOGGLE_UNIFIED_MODE":
      return { ...state, isUnifiedMode: true };

    case "TOGGLE_UNIFIED_PROVIDER": {
      const current = state.unifiedProviders;
      const updated = current.includes(action.provider)
        ? current.filter((p) => p !== action.provider)
        : [...current, action.provider];
      return { ...state, unifiedProviders: updated };
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

    default:
      return state;
  }
}

// Context
interface ChatContextValue extends ChatState {
  dispatch: React.Dispatch<ChatAction>;
  sendMessage: (content: string, images?: string[]) => Promise<void>;
  newChat: () => void;
  selectConversation: (id: string) => void;
  setProvider: (provider: LLMProvider) => void;
  setCookies: (provider: LLMProvider, cookies: CookieEntry[]) => void;
  setSystemInstructions: (provider: LLMProvider, instructions: string) => void;
  testConnection: (provider: LLMProvider) => Promise<boolean>;
  deleteConversation: (id: string) => void;
  generateImage: (prompt: string) => Promise<void>;
  currentConversation: Conversation | null;
  // New features
  regenerateLastMessage: () => Promise<void>;
  editAndResend: (messageId: string, newContent: string) => Promise<void>;
  stopGeneration: () => void;
  exportConversation: (format: "json" | "markdown") => void;
  importConversation: (jsonData: string) => boolean;
  pinMessage: (messageId: string) => void;
  unpinMessage: (messageId: string) => void;
  toggleUnifiedMode: () => void;
  toggleUnifiedProvider: (provider: LLMProvider) => void;
  broadcastMessage: (content: string, images?: string[]) => Promise<void>;
  showCookiePrompt: boolean;
  setShowCookiePrompt: (show: boolean) => void;
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

      dispatch({
        type: "LOAD_STATE",
        state: {
          conversations,
          cookieConfigs,
          systemInstructions,
          activeProvider,
          currentConversationId,
          unifiedProviders,
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

  // Warmup browser page for active provider and unified providers
  const activeProviderCookies =
    state.cookieConfigs[state.activeProvider]?.cookies;

  // Trigger warmup for a list of providers
  const warmupProviders = useCallback(
    async (providers: LLMProvider[]) => {
      // Deduplicate
      const uniqueProviders = Array.from(new Set(providers));

      // Sort providers based on UI order (unifiedProviders)
      uniqueProviders.sort((a, b) => {
        const indexA = state.unifiedProviders.indexOf(a);
        const indexB = state.unifiedProviders.indexOf(b);

        // If both are in unified list, sort by index
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        // If only A is in list, it comes first
        if (indexA !== -1) return -1;
        // If only B is in list, it comes first
        if (indexB !== -1) return 1;
        // If neither, keep original order (or alphabetical?)
        return 0;
      });

      console.log(
        `[ChatContext] Warming up providers in order: ${uniqueProviders.join(", ")}`,
      );

      // Execute sequentially to ensure physical tab order
      for (const provider of uniqueProviders) {
        const cookies = state.cookieConfigs[provider]?.cookies;

        // We use preventSwitch: true to avoid creating a "flickering" effect where every new tab grabs focus.
        // The tabs will be created in the background (physically ordered by creation time).
        // Since we explicitly focus the ACTIVE provider at the end, we don't need intermediate switches.

        try {
          console.log(`[ChatContext] Warming up browser for ${provider}`);
          await fetch("/api/session/warmup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: provider,
              cookies: cookies || [],
              preventSwitch: true, // Prevent focus stealing
            }),
          });
        } catch (error) {
          console.error(`[ChatContext] Warmup failed for ${provider}:`, error);
        }
      }

      // Final step: Ensure the active provider is focused/switched to
      // This corrects the focus if the last warmed provider wasn't the active one.
      const activeProvider = state.activeProvider;
      if (activeProvider) {
        try {
          console.log(
            `[ChatContext] Final focus switch to active provider: ${activeProvider}`,
          );
          const cookies = state.cookieConfigs[activeProvider]?.cookies;
          await fetch("/api/session/warmup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: activeProvider,
              cookies: cookies || [],
            }),
          });
        } catch (e) {
          console.error(`[ChatContext] Failed to focus active provider:`, e);
        }
      }
    },
    [state.cookieConfigs, state.activeProvider, state.unifiedProviders],
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
  const newChat = useCallback(() => {
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
        dispatch({ type: "NEW_CONVERSATION", provider });
      });
    } else {
      // Single mode - just reset current
      dispatch({ type: "NEW_CONVERSATION" });
    }
  }, [state.isUnifiedMode, state.unifiedProviders, state.activeProvider]);

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
      const externalId = conversation?.externalId;
      const provider = conversation?.provider;

      // Delete locally first (optimistic update)
      dispatch({ type: "DELETE_CONVERSATION", id });

      // If we have an external ID, try to delete remotely
      if (externalId && provider) {
        try {
          const cookies = state.cookieConfigs[provider]?.cookies || [];
          await fetch("/api/chat/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider,
              conversationId: externalId,
              cookies,
            }),
          });
        } catch (error) {
          console.error("Failed to delete remote conversation", error);
        }
      }
    },
    [state.conversations, state.cookieConfigs],
  );

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

      try {
        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, cookies }),
        });

        const data = await response.json();
        dispatch({
          type: "SET_SESSION_STATE",
          provider,
          state: {
            isLoading: false,
            isConnected: data.isAuthenticated,
            error: data.error,
          },
        });

        return data.isAuthenticated;
      } catch (error) {
        dispatch({
          type: "SET_SESSION_STATE",
          provider,
          state: { isLoading: false, isConnected: false, error: String(error) },
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

  // Stop generation - aborts the current streaming request
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      dispatch({ type: "SET_SENDING", isSending: false });
    }
  }, []);

  // Regenerate last message - removes last assistant message and resends last user message
  const regenerateLastMessage = useCallback(async () => {
    if (!currentConversation || state.isSending) return;

    const messages = currentConversation.messages;
    if (messages.length < 2) return;

    // Find the last user message
    let lastUserMessageIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserMessageIndex = i;
        break;
      }
    }

    if (lastUserMessageIndex === -1) return;

    const lastUserMessage = messages[lastUserMessageIndex];
    const content = lastUserMessage.content;
    const images = lastUserMessage.images;

    // Find the message before the user message to delete from there
    // This way we delete both the user message AND all messages after it
    if (lastUserMessageIndex > 0) {
      const previousMessage = messages[lastUserMessageIndex - 1];
      dispatch({
        type: "DELETE_MESSAGES_AFTER",
        messageId: previousMessage.id,
      });
    } else {
      // If user message is the first message, clear all messages
      dispatch({
        type: "LOAD_STATE",
        state: {
          conversations: state.conversations.map((conv) =>
            conv.id === currentConversation.id
              ? { ...conv, messages: [], updatedAt: Date.now() }
              : conv,
          ),
        },
      });
    }

    // Now sendMessage will add a fresh user message
    await sendMessage(content, images);
  }, [currentConversation, state.isSending, state.conversations, sendMessage]);

  const editAndResend = useCallback(
    async (messageId: string, newContent: string) => {
      if (!currentConversation || state.isSending) return;

      const messageIndex = currentConversation.messages.findIndex(
        (m) => m.id === messageId,
      );
      if (messageIndex === -1) return;

      const message = currentConversation.messages[messageIndex];
      if (message.role !== "user") return;

      const images = message.images;

      // Delete this message and all messages after it
      // sendMessage will add a fresh user message with the new content
      if (messageIndex > 0) {
        const previousMessage = currentConversation.messages[messageIndex - 1];
        dispatch({
          type: "DELETE_MESSAGES_AFTER",
          messageId: previousMessage.id,
        });
      } else {
        // If this is the first message, clear all messages
        dispatch({
          type: "LOAD_STATE",
          state: {
            conversations: state.conversations.map((conv) =>
              conv.id === currentConversation.id
                ? { ...conv, messages: [], updatedAt: Date.now() }
                : conv,
            ),
          },
        });
      }

      // Resend with new content
      await sendMessage(newContent, images);
    },
    [currentConversation, state.isSending, state.conversations, sendMessage],
  );

  // Export conversation
  const exportConversation = useCallback(
    (format: "json" | "markdown") => {
      if (!currentConversation) return;

      let content: string;
      let filename: string;
      let mimeType: string;

      if (format === "json") {
        content = JSON.stringify(currentConversation, null, 2);
        filename = `${currentConversation.title.replace(/[^a-z0-9]/gi, "_")}.json`;
        mimeType = "application/json";
      } else {
        // Markdown format
        const lines: string[] = [
          `# ${currentConversation.title}`,
          "",
          `**Provider:** ${currentConversation.provider}`,
          `**Created:** ${new Date(currentConversation.createdAt).toLocaleString()}`,
          "",
          "---",
          "",
        ];

        for (const msg of currentConversation.messages) {
          const role = msg.role === "user" ? "**You:**" : "**Assistant:**";
          lines.push(role);
          lines.push("");
          lines.push(msg.content);
          lines.push("");
        }

        content = lines.join("\n");
        filename = `${currentConversation.title.replace(/[^a-z0-9]/gi, "_")}.md`;
        mimeType = "text/markdown";
      }

      // Create download
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [currentConversation],
  );

  // Import conversation
  const importConversation = useCallback((jsonData: string): boolean => {
    try {
      const parsed = JSON.parse(jsonData);

      // Validate the structure
      if (
        !parsed.id ||
        !parsed.title ||
        !Array.isArray(parsed.messages) ||
        !parsed.provider
      ) {
        console.error("Invalid conversation format");
        return false;
      }

      // Generate a new ID to avoid conflicts
      const importedConversation: Conversation = {
        id: uuidv4(),
        title: `[Imported] ${parsed.title}`,
        messages: parsed.messages.map((msg: Message) => ({
          ...msg,
          id: uuidv4(), // Generate new IDs for messages too
        })),
        provider: parsed.provider,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      dispatch({
        type: "IMPORT_CONVERSATION",
        conversation: importedConversation,
      });
      return true;
    } catch (error) {
      console.error("Failed to import conversation:", error);
      return false;
    }
  }, []);

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
    [state.unifiedProviders, warmupProviders],
  );

  const broadcastMessage = useCallback(
    async (content: string, images?: string[]) => {
      if (
        (!content.trim() && (!images || images.length === 0)) ||
        state.isSending
      )
        return;

      dispatch({ type: "SET_SENDING", isSending: true });

      // Always include active provider in broadcast
      const providersToCall = Array.from(
        new Set([...state.unifiedProviders, state.activeProvider]),
      );

      // Sort providers based on UI order (unifiedProviders)
      providersToCall.sort((a, b) => {
        const indexA = state.unifiedProviders.indexOf(a);
        const indexB = state.unifiedProviders.indexOf(b);

        // If both are in unified list, sort by index
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        // If only A is in list, it comes first
        if (indexA !== -1) return -1;
        // If only B is in list, it comes first
        if (indexB !== -1) return 1;
        // If neither, keep original order
        return 0;
      });

      try {
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
            (async () => {
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

        // Final step: Ensure the active provider is focused/switched to
        // We do this by triggering a lightweight warmup/switch call
        const activeProvider = state.activeProvider;
        if (activeProvider) {
          try {
            console.log(
              `[ChatContext] Final focus switch to active provider: ${activeProvider}`,
            );
            const cookies = state.cookieConfigs[activeProvider]?.cookies;
            // We execute this AFTER the loop, so it happens after all inputs are sent
            await fetch("/api/session/warmup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                provider: activeProvider,
                cookies: cookies || [],
              }),
            });
          } catch (e) {
            console.error(`[ChatContext] Failed to focus active provider:`, e);
          }
        }
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
    ],
  );

  const pinMessage = useCallback((messageId: string) => {
    dispatch({ type: "PIN_MESSAGE", messageId });
  }, []);

  const unpinMessage = useCallback((messageId: string) => {
    dispatch({ type: "UNPIN_MESSAGE", messageId });
  }, []);

  const value: ChatContextValue = {
    ...state,
    dispatch,
    sendMessage,
    newChat,
    selectConversation,
    setProvider,
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
    toggleUnifiedMode, // Kept for interface compatibility but no-op/true
    toggleUnifiedProvider,
    broadcastMessage,
    showCookiePrompt,
    setShowCookiePrompt,
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
