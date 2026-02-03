"use client";

import { useChatContext } from "@/context/ChatContext";
import { PROVIDERS, LLMProvider, orderProviders } from "@/types";
import MessageList from "./MessageList";
import Image from "next/image";
import {
  FiTrash2,
  FiX,
  FiPlus,
  FiMaximize2,
  FiMinimize2,
  FiPower,
  FiLayout,
  FiGrid,
  FiSidebar,
  FiMaximize,
} from "react-icons/fi";
import { useState, useEffect } from "react";
import ProviderStatusBadge from "./ProviderStatusBadge";
import StreamingStats from "./StreamingStats";
import ProviderLoadingOverlay from "./ProviderLoadingOverlay";
import Toggle from "./Toggle";
import { estimateTokensFromText } from "@/lib/utils/token";

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
    enabledProviders,
    toggleProviderEnabled,
    columnWidths: contextColumnWidths,
    setColumnWidths: setContextColumnWidths,
    resetColumnWidths,
    layoutMode,
    setLayoutMode,
  } = useChatContext();

  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  // Local state for smooth resizing (syncs with context)
  const [columnWidths, setColumnWidths] =
    useState<Record<string, number>>(contextColumnWidths);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [resizeWidth, setResizeWidth] = useState<number | null>(null);

  // Sync with context when not resizing
  useEffect(() => {
    if (!isResizing) {
      setColumnWidths(contextColumnWidths);
    }
  }, [contextColumnWidths, isResizing]);

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

    const onMouseUp = () => {
      setIsResizing(null);
      setResizeWidth(null);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";

      // Commit final widths to context
      setContextColumnWidths(currentWidths);
    };

    let currentWidths = { ...columnWidths };

    const onMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.clientX - startX;
      // Minimum width 300px, max 800px or so
      const newWidth = Math.max(300, Math.min(800, startWidth + diff));

      currentWidths = {
        ...columnWidths,
        [provider]: newWidth,
      };

      setColumnWidths(currentWidths);
      setResizeWidth(newWidth);

      // Switch to custom mode if resizing
      if (layoutMode !== "custom") {
        setLayoutMode("custom");
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const { currentConversationId } = useChatContext();

  const sortedProviders = orderProviders(
    [...unifiedProviders, activeProvider].filter(Boolean) as LLMProvider[],
  );

  const providerConversations = sortedProviders.map((provider) => {
    const providerConvos = conversations.filter((c) => c.provider === provider);
    const sorted = providerConvos.sort((a, b) => b.updatedAt - a.updatedAt);

    // 1. Direct match: If currentConversationId belongs to this provider
    const directMatch = providerConvos.find(
      (c) => c.id === currentConversationId,
    );
    if (directMatch) {
      return { provider, conversation: directMatch };
    }

    // 2. Smart Sync: If we have a selected conversation, try to find one for this provider
    // with the same title or created around the same time (within 1 minute)
    if (currentConversationId) {
      const selectedConv = conversations.find(
        (c) => c.id === currentConversationId,
      );
      if (selectedConv) {
        const titleMatch = providerConvos.find(
          (c) => c.title === selectedConv.title && c.title !== "New Chat",
        );
        if (titleMatch) {
          return { provider, conversation: titleMatch };
        }

        const timeMatch = providerConvos.find(
          (c) => Math.abs(c.createdAt - selectedConv.createdAt) < 60000,
        );
        if (timeMatch) {
          return { provider, conversation: timeMatch };
        }
      }
    }

    // 3. Fallback to most recent
    return {
      provider,
      conversation: sorted.length > 0 ? sorted[0] : null,
    };
  });

  return (
    <div className="unified-chat-container">
      {providerConversations.map(({ provider, conversation }) => {
        const config = PROVIDERS[provider];
        const customWidth = columnWidths[provider];
        const session = sessions[provider];
        const isStreaming = session?.status === "streaming";

        const totalTokens = conversation
          ? conversation.messages.reduce(
              (sum, msg) => sum + estimateTokensFromText(msg.content || ""),
              0,
            )
          : 0;
        const lastAssistantMessage = conversation
          ? [...conversation.messages]
              .reverse()
              .find((msg) => msg.role === "assistant")
          : null;
        const lastResponseTokens = lastAssistantMessage
          ? estimateTokensFromText(lastAssistantMessage.content || "")
          : 0;

        const formatCost = (value: number) => {
          if (value <= 0) return "$0.00";
          if (value < 0.01) return `$${value.toFixed(4)}`;
          return `$${value.toFixed(2)}`;
        };

        return (
          <div
            key={provider}
            className="unified-chat-column-wrapper"
            style={{
              width: customWidth ? `${customWidth}px` : "0px",
              flex: customWidth ? "0 0 auto" : "1 1 0",
              minWidth: "320px",
              transition: isResizing
                ? "none"
                : "all 0.4s cubic-bezier(0.25, 1, 0.5, 1)",
            }}
          >
            <div
              className={`unified-chat-column ${!enabledProviders.includes(provider) ? "disabled" : ""}`}
            >
              <div className="unified-column-header">
                <div className="provider-header">
                  <div className="provider-info">
                    {getProviderLogo(provider, 20)}
                    <span className="provider-name">{config.name}</span>
                    <ProviderStatusBadge status={session?.status || "idle"} />
                  </div>
                  <div className="provider-metrics">
                    <span>Tokens: ~{totalTokens}</span>
                    <span>Last: ~{lastResponseTokens}</span>
                  </div>
                </div>
                <div className="column-actions">
                  <Toggle
                    enabled={enabledProviders.includes(provider)}
                    onChange={() => toggleProviderEnabled(provider)}
                    title={
                      enabledProviders.includes(provider)
                        ? "Disable for messaging"
                        : "Enable for messaging"
                    }
                    className="mr-1"
                  />
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
                // Double-click to reset THIS column to default
                const newWidths = { ...columnWidths };
                delete newWidths[provider];
                setColumnWidths(newWidths);
                setContextColumnWidths(newWidths);
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
            onClick={() => setShowLayoutMenu(!showLayoutMenu)}
            title="Layout Options"
          >
            <FiLayout size={20} />
          </button>

          {showLayoutMenu && (
            <div
              className="add-provider-menu"
              style={{
                top: "0",
                right: "48px",
                width: "220px",
              }}
            >
              <h3>Layouts</h3>
              <div
                className="provider-grid"
                style={{ gridTemplateColumns: "1fr" }}
              >
                <button
                  className={`provider-option-btn ${layoutMode === "grid" ? "active-layout" : ""}`}
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-start",
                    padding: "12px",
                    background:
                      layoutMode === "grid" ? "var(--bg-secondary)" : undefined,
                    borderColor:
                      layoutMode === "grid" ? "var(--text-primary)" : undefined,
                  }}
                  onClick={() => {
                    resetColumnWidths();
                    // Mode is set to 'grid' inside resetColumnWidths
                    setShowLayoutMenu(false);
                  }}
                >
                  <FiGrid size={18} />
                  <span>Grid (Equal)</span>
                </button>

                <button
                  className={`provider-option-btn ${layoutMode === "focus" ? "active-layout" : ""}`}
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-start",
                    padding: "12px",
                    background:
                      layoutMode === "focus"
                        ? "var(--bg-secondary)"
                        : undefined,
                    borderColor:
                      layoutMode === "focus"
                        ? "var(--text-primary)"
                        : undefined,
                  }}
                  onClick={() => {
                    // Focus: Active gets 800px, others default (or minimal)
                    const newWidths: Record<string, number> = {};
                    unifiedProviders.forEach((p) => {
                      if (p === activeProvider) {
                        newWidths[p] = 800;
                      } else {
                        newWidths[p] = 320;
                      }
                    });
                    setContextColumnWidths(newWidths);
                    setLayoutMode("focus");
                    setShowLayoutMenu(false);
                  }}
                >
                  <FiMaximize size={18} />
                  <span>Focus (Active)</span>
                </button>

                <button
                  className={`provider-option-btn ${layoutMode === "sidebar" ? "active-layout" : ""}`}
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-start",
                    padding: "12px",
                    background:
                      layoutMode === "sidebar"
                        ? "var(--bg-secondary)"
                        : undefined,
                    borderColor:
                      layoutMode === "sidebar"
                        ? "var(--text-primary)"
                        : undefined,
                  }}
                  onClick={() => {
                    // Sidebar: Active gets Auto (undefined), others fixed 320px
                    const newWidths: Record<string, number> = {};
                    unifiedProviders.forEach((p) => {
                      if (p !== activeProvider) {
                        newWidths[p] = 320;
                      }
                      // Active left as undefined -> auto/flex grow
                    });
                    setContextColumnWidths(newWidths);
                    setLayoutMode("sidebar");
                    setShowLayoutMenu(false);
                  }}
                >
                  <FiSidebar size={18} />
                  <span>Sidebar</span>
                </button>
              </div>
            </div>
          )}

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
