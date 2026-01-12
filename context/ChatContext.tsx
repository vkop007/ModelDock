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
  ChatState,
  ChatAction,
  LLMProvider,
  Message,
  Conversation,
  CookieEntry,
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
} from "@/lib/storage";

// Initial state
const initialSessionState: SessionState = {
  provider: "chatgpt",
  isConnected: false,
  isLoading: false,
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
  isLoading: false,
  isSending: false,
};

// Reducer
function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SET_PROVIDER": {
      // Find the most recent conversation for the new provider
      const providerConvos = state.conversations.filter(
        (c) => c.provider === action.provider
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
      const newConversation: Conversation = {
        id: uuidv4(),
        title: "New Chat",
        messages: [],
        provider: state.activeProvider,
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
      const conversations = state.conversations.map((conv) => {
        if (conv.id === state.currentConversationId) {
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
      const conversations = state.conversations.map((conv) => {
        if (conv.id === state.currentConversationId) {
          const messages = conv.messages.map((msg) =>
            msg.id === action.id ? { ...msg, content: action.content } : msg
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

    case "LOAD_STATE":
      return { ...state, ...action.state };

    case "DELETE_CONVERSATION": {
      const deletedConversation = state.conversations.find(
        (c) => c.id === action.id
      );
      const conversations = state.conversations.filter(
        (c) => c.id !== action.id
      );

      // If we're deleting the current conversation, select a new one from the SAME provider
      let currentConversationId = state.currentConversationId;
      if (state.currentConversationId === action.id) {
        const providerToFilter =
          deletedConversation?.provider || state.activeProvider;
        const sameProviderConvos = conversations.filter(
          (c) => c.provider === providerToFilter
        );
        currentConversationId =
          sameProviderConvos.length > 0 ? sameProviderConvos[0].id : null;
      }

      return { ...state, conversations, currentConversationId };
    }

    case "UPDATE_CONVERSATION_TITLE": {
      const conversations = state.conversations.map((conv) =>
        conv.id === action.id ? { ...conv, title: action.title } : conv
      );
      return { ...state, conversations };
    }

    case "UPDATE_CONVERSATION_EXTERNAL_ID": {
      const conversations = state.conversations.map((conv) =>
        conv.id === action.id
          ? { ...conv, externalId: action.externalId }
          : conv
      );
      return { ...state, conversations };
    }

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
  testConnection: (provider: LLMProvider) => Promise<boolean>;
  deleteConversation: (id: string) => void;
  generateImage: (prompt: string) => Promise<void>;
  currentConversation: Conversation | null;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load saved state on mount
  useEffect(() => {
    const conversations = loadConversations();
    const cookieConfigs = loadCookieConfigs();
    const activeProvider = loadActiveProvider();
    const currentConversationId = loadCurrentConversation();

    dispatch({
      type: "LOAD_STATE",
      state: {
        conversations,
        cookieConfigs,
        activeProvider,
        currentConversationId,
      },
    });
  }, []);

  // Persist state changes
  useEffect(() => {
    saveConversations(state.conversations);
  }, [state.conversations]);

  useEffect(() => {
    saveCookieConfigs(state.cookieConfigs);
  }, [state.cookieConfigs]);

  useEffect(() => {
    saveActiveProvider(state.activeProvider);
  }, [state.activeProvider]);

  useEffect(() => {
    saveCurrentConversation(state.currentConversationId);
  }, [state.currentConversationId]);

  // Warmup browser page for active provider
  useEffect(() => {
    const warmupProvider = async () => {
      const cookies = state.cookieConfigs[state.activeProvider]?.cookies || [];
      try {
        console.log(
          `[ChatContext] Warming up browser for ${state.activeProvider}`
        );
        await fetch("/api/session/warmup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: state.activeProvider,
            cookies,
          }),
        });
      } catch (error) {
        console.error("[ChatContext] Warmup failed:", error);
      }
    };

    // Only warmup if we have loaded cookies (not on very first render)
    if (state.cookieConfigs[state.activeProvider]) {
      warmupProvider();
    }
  }, [state.activeProvider, state.cookieConfigs]);

  // Get current conversation
  const currentConversation =
    state.conversations.find((c) => c.id === state.currentConversationId) ||
    null;

  // Actions
  const newChat = useCallback(() => {
    dispatch({ type: "NEW_CONVERSATION" });
  }, []);

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
    []
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
    [state.conversations, state.cookieConfigs]
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
    [state.cookieConfigs]
  );

  const sendMessage = useCallback(
    async (content: string, images?: string[]) => {
      if (
        (!content.trim() && (!images || images.length === 0)) ||
        state.isSending
      )
        return;

      // Create new conversation if none exists
      if (!state.currentConversationId) {
        dispatch({ type: "NEW_CONVERSATION" });
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

        // Use streaming endpoint
        const currentConv = state.conversations.find(
          (c) => c.id === state.currentConversationId
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

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

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
                      if (state.currentConversationId && data.conversationId) {
                        dispatch({
                          type: "UPDATE_CONVERSATION_EXTERNAL_ID",
                          id: state.currentConversationId,
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
    ]
  );

  const generateImage = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || state.isSending) return;

      // Create new conversation if none exists
      if (!state.currentConversationId) {
        dispatch({ type: "NEW_CONVERSATION" });
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

        const currentConv = state.conversations.find(
          (c) => c.id === state.currentConversationId
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
    ]
  );

  const value: ChatContextValue = {
    ...state,
    dispatch,
    sendMessage,
    newChat,
    selectConversation,
    setProvider,
    setCookies,
    testConnection,
    deleteConversation,
    generateImage,
    currentConversation,
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
