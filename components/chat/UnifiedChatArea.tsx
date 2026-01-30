"use client";

import { useChatContext } from "@/context/ChatContext";
import { PROVIDERS, LLMProvider } from "@/types";
import MessageList from "./MessageList";
import Image from "next/image";
import { FiMoreVertical, FiTrash2, FiX, FiPlus } from "react-icons/fi";
import { useState } from "react";
import ProviderStatusBadge from "./ProviderStatusBadge";
import StreamingStats from "./StreamingStats";

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
  } = useChatContext();

  // Debug sorting
  // console.log("Sort Debug:", { activeProvider, unifiedProviders });

  const [showAddMenu, setShowAddMenu] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [isResizing, setIsResizing] = useState<string | null>(null);

  // Initialize widths if not set
  const getColumnWidth = (provider: string) => {
    return columnWidths[provider] || 450;
  };

  const startResizing = (provider: string, e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(provider);

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
    };

    const onMouseUp = () => {
      setIsResizing(null);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "default";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
  };

  // Sort providers according to user preference: ChatGPT -> Gemini -> Active -> Others
  // Sort providers according to user preference: ChatGPT -> Gemini -> Active -> Others
  const combinedProviders = Array.from(
    new Set([...unifiedProviders, activeProvider]),
  );
  const sortedProviders = combinedProviders.filter(Boolean).sort((a, b) => {
    const priority = ["chatgpt", "gemini"];

    // Add active provider to priority if not already there, after Gemini
    if (activeProvider && !priority.includes(activeProvider)) {
      priority.push(activeProvider);
    }

    const idxA = priority.indexOf(a);
    const idxB = priority.indexOf(b);

    // If both are in priority list, sort by priority index
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    // If only A is in priority, it comes first
    if (idxA !== -1) return -1;
    // If only B is in priority, it comes first
    if (idxB !== -1) return 1;

    // Default to alphabetical or keep original for others
    return a.localeCompare(b);
  });

  const providerConversations = sortedProviders.map((provider) => {
    // Filter conversations for this provider
    const providerConvos = conversations.filter((c) => c.provider === provider);
    // Sort by updatedAt desc
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

              {/* Streaming Stats */}
              {isStreaming && session?.streamingStats && (
                <StreamingStats
                  charsReceived={session.streamingStats.charsReceived}
                  startTime={session.streamingStats.startTime}
                  isActive={isStreaming}
                />
              )}

              <div className="unified-messages-area">
                {conversation ? (
                  <MessageList
                    messages={conversation.messages}
                    isSending={isSending} // Note: this makes all spinners spin if ANY is sending. Can refine later.
                    conversationProvider={provider}
                  />
                ) : (
                  <div className="empty-column-state">
                    <p>No conversation yet</p>
                  </div>
                )}
              </div>
            </div>
            {/* Resizer Handle */}
            <div
              className={`column-resizer ${isResizing === provider ? "resizing" : ""}`}
              onMouseDown={(e) => startResizing(provider, e)}
            />
          </div>
        );
      })}

      {/* Add Provider Column */}
      <div className="unified-add-column">
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
