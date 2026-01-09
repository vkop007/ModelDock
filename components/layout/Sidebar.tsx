"use client";

import { useChatContext } from "@/context/ChatContext";
import { PROVIDERS, LLMProvider } from "@/types";
import { useState } from "react";
import {
  FiPlus,
  FiMessageSquare,
  FiSettings,
  FiTrash2,
  FiCheck,
  FiAlertCircle,
} from "react-icons/fi";
import { SiOpenai, SiGoogle } from "react-icons/si";
import CookieModal from "../settings/CookieModal";

// Provider icon mapping
function ProviderIcon({
  provider,
  size = 16,
}: {
  provider: LLMProvider;
  size?: number;
}) {
  switch (provider) {
    case "chatgpt":
      return <SiOpenai size={size} />;
    case "gemini":
      return <SiGoogle size={size} />;
    case "claude":
      return <span style={{ fontSize: size, fontWeight: "bold" }}>A</span>;
    default:
      return null;
  }
}

export default function Sidebar() {
  const {
    conversations,
    currentConversationId,
    activeProvider,
    sessions,
    cookieConfigs,
    newChat,
    selectConversation,
    setProvider,
    deleteConversation,
  } = useChatContext();

  const [showCookieModal, setShowCookieModal] = useState(false);
  const [hoveredConversation, setHoveredConversation] = useState<string | null>(
    null
  );

  // Filter conversations by active provider
  const filteredConversations = conversations.filter(
    (c) => c.provider === activeProvider
  );

  return (
    <>
      <aside className="sidebar">
        {/* New Chat Button */}
        <button className="new-chat-btn" onClick={newChat}>
          <FiPlus size={18} />
          <span>New Chat</span>
        </button>

        {/* Provider Selector */}
        <div className="provider-selector">
          <label className="provider-label">Model</label>
          <div className="provider-options">
            {(Object.keys(PROVIDERS) as LLMProvider[]).map((provider) => {
              const config = PROVIDERS[provider];
              const session = sessions[provider];
              const hasCookies =
                (cookieConfigs[provider]?.cookies?.length ?? 0) > 0;

              return (
                <button
                  key={provider}
                  className={`provider-option ${
                    activeProvider === provider ? "active" : ""
                  }`}
                  onClick={() => setProvider(provider)}
                  style={
                    { "--provider-color": config.color } as React.CSSProperties
                  }
                >
                  <ProviderIcon provider={provider} size={18} />
                  <span>{config.name}</span>
                  {hasCookies && (
                    <span className="status-indicator">
                      {session.isConnected ? (
                        <FiCheck size={12} className="connected" />
                      ) : (
                        <FiAlertCircle size={12} className="disconnected" />
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Conversation List */}
        <div className="conversation-list">
          <label className="conversation-label">Recent Chats</label>
          {filteredConversations.length === 0 ? (
            <div className="empty-state">
              <FiMessageSquare size={24} />
              <p>No conversations yet</p>
            </div>
          ) : (
            <div className="conversations">
              {filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`conversation-item ${
                    currentConversationId === conv.id ? "active" : ""
                  }`}
                  onClick={() => selectConversation(conv.id)}
                  onMouseEnter={() => setHoveredConversation(conv.id)}
                  onMouseLeave={() => setHoveredConversation(null)}
                >
                  <FiMessageSquare size={16} />
                  <span className="conversation-title">{conv.title}</span>
                  {hoveredConversation === conv.id && (
                    <button
                      className="delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(conv.id);
                      }}
                    >
                      <FiTrash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Settings Button */}
        <div className="sidebar-footer">
          <button
            className="settings-btn"
            onClick={() => setShowCookieModal(true)}
          >
            <FiSettings size={18} />
            <span>Configure Cookies</span>
          </button>
        </div>
      </aside>

      {/* Cookie Configuration Modal */}
      {showCookieModal && (
        <CookieModal onClose={() => setShowCookieModal(false)} />
      )}
    </>
  );
}
