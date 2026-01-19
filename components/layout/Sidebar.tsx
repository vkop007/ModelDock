"use client";

import { useChatContext } from "@/context/ChatContext";
import { PROVIDERS, LLMProvider } from "@/types";
import { useState, useRef } from "react";
import {
  FiPlus,
  FiMessageSquare,
  FiSettings,
  FiTrash2,
  FiCheck,
  FiAlertCircle,
  FiSearch,
  FiDownload,
  FiUpload,
  FiMoreHorizontal,
} from "react-icons/fi";
import { SiOpenai, SiGoogle } from "react-icons/si";
import SettingsModal from "../settings/SettingsModal";

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
    exportConversation,
    importConversation,
    currentConversation,
  } = useChatContext();

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [hoveredConversation, setHoveredConversation] = useState<string | null>(
    null,
  );
  const [showExportMenu, setShowExportMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter conversations by active provider
  const filteredConversations = conversations.filter(
    (c) => c.provider === activeProvider,
  );

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const success = importConversation(text);
      if (!success) {
        alert("Failed to import conversation. Invalid file format.");
      }
    } catch (error) {
      alert("Failed to read file.");
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

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

        {/* Export/Import Actions */}
        <div className="sidebar-export-actions">
          <div className="export-dropdown">
            <button
              className="export-btn"
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={!currentConversation}
              title={
                currentConversation
                  ? "Export conversation"
                  : "No conversation selected"
              }
            >
              <FiDownload size={16} />
              <span>Export</span>
            </button>
            {showExportMenu && currentConversation && (
              <div className="export-menu">
                <button
                  onClick={() => {
                    exportConversation("json");
                    setShowExportMenu(false);
                  }}
                >
                  Export as JSON
                </button>
                <button
                  onClick={() => {
                    exportConversation("markdown");
                    setShowExportMenu(false);
                  }}
                >
                  Export as Markdown
                </button>
              </div>
            )}
          </div>
          <button
            className="import-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Import conversation"
          >
            <FiUpload size={16} />
            <span>Import</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            accept=".json"
            style={{ display: "none" }}
          />
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
            onClick={() => setShowSettingsModal(true)}
          >
            <FiSettings size={18} />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal onClose={() => setShowSettingsModal(false)} />
      )}
    </>
  );
}
