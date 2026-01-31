"use client";

import { useChatContext } from "@/context/ChatContext";
import { PROVIDERS, LLMProvider } from "@/types";
import MessageList from "./MessageList";
import Image from "next/image";
import {
  FiTrash2,
  FiX,
  FiPlus,
  FiMaximize2,
  FiMinimize2,
} from "react-icons/fi";
import { useState, useEffect } from "react";
import ProviderStatusBadge from "./ProviderStatusBadge";
import StreamingStats from "./StreamingStats";
import ProviderLoadingOverlay from "./ProviderLoadingOverlay";

const getProviderLogo = (provider: LLMProvider, size: number) => {
  const logos: Record<LLMProvider, string> = {
    chatgpt: "/providers/chatgpt_logo.jpeg",
    claude: "/providers/claude_logo.jpeg",
    gemini: "/providers/gemini.jpeg",
    zai: "/providers/zdotai_logo.jpeg",
    grok: "/providers/grok.jpg",
    qwen: "/providers/qwen_logo.jpeg",
    mistral: "/providers/mistralai_logo.jpeg",
    ollama: "/providers/ollama.png",
  };

  const config = PROVIDERS[provider];

  return (
    <Image
      src={logos[provider]}
      alt={`${config.name} logo`}
      width={size}
      height={size}
      style={{ borderRadius: "4px", objectFit: "cover" }}
    />
  );
};

export default function UnifiedChatArea() {
  const {
    unifiedProviders,
    conversations,
    isSending,
    toggleUnifiedProvider,
    deleteConversation,
    activeProvider, // Added for sorting logic
    sessions, // For status indicators
    isFocusMode,
    toggleFocusMode,
  } = useChatContext();

  const [showAddMenu, setShowAddMenu] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [resizeWidth, setResizeWidth] = useState<number | null>(null);

  // Load from localStorage on mount (client-side only to avoid hydration mismatch)
  useEffect(() => {
    const saved = localStorage.getItem("unifiedColumnWidths");
    if (saved) {
      try {
        setColumnWidths(JSON.parse(saved));
      } catch {}
    }
  }, []);

  // Save to localStorage when widths change
  useEffect(() => {
    if (Object.keys(columnWidths).length > 0) {
      localStorage.setItem("unifiedColumnWidths", JSON.stringify(columnWidths));
    }
  }, [columnWidths]);

  // Initialize widths if not set
  const getColumnWidth = (provider: string) => {
    return columnWidths[provider] || 450;
  };

  const startResizing = (provider: string, e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(provider);
    setResizeWidth(getColumnWidth(provider));

    const startX = e.clientX;
    const startWidth = getColumnWidth(provider);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.clientX - startX;
      // Minimum width 300px, max 800px or so
      const newWidth = Math.max(300, Math.min(800, startWidth + diff));
      setColumnWidths((prev) => ({
        ...prev,
        [provider]: newWidth,
      }));
      setResizeWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizing(null);
      setResizeWidth(null);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const combinedProviders = Array.from(
    new Set([...unifiedProviders, activeProvider]),
  );
  const sortedProviders = combinedProviders.filter(Boolean).sort((a, b) => {
    const priority = ["chatgpt", "gemini"];
    if (activeProvider && !priority.includes(activeProvider)) {
      priority.push(activeProvider);
    }

    const idxA = priority.indexOf(a);
    const idxB = priority.indexOf(b);

    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;

    return a.localeCompare(b);
  });

  const providerConversations = sortedProviders.map((provider) => {
    const providerConvos = conversations.filter((c) => c.provider === provider);
    const sorted = providerConvos.sort((a, b) => b.updatedAt - a.updatedAt);
    return {
      provider,
      conversation: sorted.length > 0 ? sorted[0] : null,
    };
  });

  return (
    <div className="unified-chat-container">
      {providerConversations.map(({ provider, conversation }) => {
        const config = PROVIDERS[provider];
        const width = getColumnWidth(provider);
        const session = sessions[provider];
        const isStreaming = session?.status === "streaming";

        return (
          <div
            key={provider}
            className="unified-chat-column-wrapper"
            style={{ width: width, flexShrink: 0 }}
          >
            <div className="unified-chat-column">
              <div className="unified-column-header">
                <div className="provider-info">
                  {getProviderLogo(provider, 20)}
                  <span className="provider-name">{config.name}</span>
                  <ProviderStatusBadge status={session?.status || "idle"} />
                </div>
                <div className="column-actions">
                  {conversation && (
                    <button
                      className="column-action-btn"
                      onClick={() => deleteConversation(conversation.id)}
                      title="Clear conversation"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  )}
                  <button
                    className="column-action-btn"
                    onClick={() => toggleUnifiedProvider(provider)}
                    title="Remove from view"
                  >
                    <FiX size={14} />
                  </button>
                </div>
              </div>
              {isStreaming && (
                <StreamingStats
                  charsReceived={session?.streamingStats?.charsReceived || 0}
                  startTime={session?.streamingStats?.startTime || Date.now()}
                  isActive={isStreaming}
                />
              )}

              <div className="unified-messages-area">
                {conversation ? (
                  <MessageList
                    messages={conversation.messages}
                    isSending={isSending}
                    conversationProvider={provider}
                    conversationId={conversation.id}
                  />
                ) : (
                  <div className="empty-column-state"></div>
                )}
              </div>

              <ProviderLoadingOverlay
                provider={provider}
                status={session?.status || "idle"}
              />
            </div>
            {/* Resizer Handle */}
            <div
              className={`column-resizer ${isResizing === provider ? "resizing" : ""}`}
              onMouseDown={(e) => startResizing(provider, e)}
              onDoubleClick={() => {
                // Double-click to reset to default width
                setColumnWidths((prev) => {
                  const updated = { ...prev };
                  delete updated[provider];
                  return updated;
                });
              }}
              title="Drag to resize • Double-click to reset"
            >
              {isResizing === provider && resizeWidth && (
                <span className="resize-tooltip">{resizeWidth}px</span>
              )}
            </div>
          </div>
        );
      })}

      <div className="unified-add-column">
        <button
          className="add-column-btn"
          onClick={toggleFocusMode}
          title={isFocusMode ? "Exit Focus Mode" : "Enter Focus Mode"}
        >
          {isFocusMode ? <FiMinimize2 size={20} /> : <FiMaximize2 size={20} />}
        </button>

        <div className="add-column-content">
          <button
            className="add-column-btn"
            onClick={() => setShowAddMenu(!showAddMenu)}
            title="Add Chat Column"
          >
            <FiPlus size={20} />
          </button>

          {showAddMenu && (
            <div className="add-provider-menu">
              <h3>Add Provider</h3>
              <div className="provider-grid">
                {(Object.keys(PROVIDERS) as LLMProvider[])
                  .filter((p) => !unifiedProviders.includes(p))
                  .map((provider) => (
                    <button
                      key={provider}
                      className="provider-option-btn"
                      onClick={() => {
                        toggleUnifiedProvider(provider);
                        setShowAddMenu(false);
                      }}
                    >
                      {getProviderLogo(provider, 24)}
                      <span>{PROVIDERS[provider].name}</span>
                    </button>
                  ))}
                {(Object.keys(PROVIDERS) as LLMProvider[]).filter(
                  (p) => !unifiedProviders.includes(p),
                ).length === 0 && (
                  <p className="no-providers">All providers added</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
