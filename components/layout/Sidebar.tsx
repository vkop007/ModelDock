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
  FiSearch,
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
        {/* Actions Header */}
        <div className="sidebar-actions">
          <button className="new-chat-btn" onClick={newChat}>
            <FiPlus size={18} />
            <span>New Chat</span>
          </button>
          <button
            className="search-trigger-btn"
            onClick={() =>
              window.dispatchEvent(new Event("open-global-search"))
            }
            title="Search (Cmd+K)"
          >
            <FiSearch size={18} />
          </button>
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
