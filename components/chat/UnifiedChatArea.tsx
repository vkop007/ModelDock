"use client";

import { useChatContext } from "@/context/ChatContext";
import { PROVIDERS, LLMProvider } from "@/types";
import MessageList from "./MessageList";
import Image from "next/image";
import { FiMoreVertical, FiTrash2, FiX, FiPlus } from "react-icons/fi";
import { useState } from "react";

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
  } = useChatContext();

  const [showAddMenu, setShowAddMenu] = useState(false);

  // Find latest conversation for each provider
  const providerConversations = unifiedProviders.map((provider) => {
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

        return (
          <div key={provider} className="unified-chat-column">
            <div className="unified-column-header">
              <div className="provider-info">
                {getProviderLogo(provider, 20)}
                <span className="provider-name">{config.name}</span>
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
            <FiPlus size={24} />
            <span>Add Chat</span>
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
