"use client";

import { useChatContext } from "@/context/ChatContext";
import { LLMProvider } from "@/types";
import { useState, useRef, useEffect } from "react";
import {
  FiPlus,
  FiMessageSquare,
  FiSettings,
  FiTrash2,
  FiSearch,
  FiDownload,
  FiUpload,
  FiChevronLeft,
  FiChevronRight,
  FiGrid,
} from "react-icons/fi";
import SettingsModal from "../settings/SettingsModal";
import ThemeToggle from "../settings/ThemeToggle";

const SIDEBAR_WIDTH = 260;
const COLLAPSED_WIDTH = 60;

export default function Sidebar() {
  const {
    conversations,
    currentConversationId,
    activeProvider,
    newChat,
    selectConversation,
    deleteConversation,
    exportConversation,
    importConversation,
    currentConversation,
    isUnifiedMode,
    toggleUnifiedMode,
    isSidebarCollapsed: isCollapsed,
    toggleSidebar: toggleCollapse,
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

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const effectiveWidth = isCollapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <>
      <aside
        className={`sidebar ${isCollapsed ? "collapsed" : ""}`}
        style={{ width: effectiveWidth }}
      >
        {/* Actions Header */}
        <div className="sidebar-actions">
          <button className="new-chat-btn" onClick={newChat} title="New Chat">
            <FiPlus size={18} />
            {!isCollapsed && <span>New Chat</span>}
          </button>
          {!isCollapsed && (
            <button
              className="search-trigger-btn"
              onClick={() =>
                window.dispatchEvent(new Event("open-global-search"))
              }
              title="Search (Cmd+K)"
            >
              <FiSearch size={18} />
            </button>
          )}
        </div>

        {/* Export/Import Actions */}
        {!isCollapsed && (
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
        )}

        {/* Conversation List */}
        <div className="conversation-list">
          {!isCollapsed && (
            <label className="conversation-label">Recent Chats</label>
          )}
          {filteredConversations.length === 0 ? (
            !isCollapsed && (
              <div className="empty-state">
                <FiMessageSquare size={24} />
                <p>No conversations yet</p>
              </div>
            )
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
                  title={isCollapsed ? conv.title : undefined}
                >
                  <FiMessageSquare size={16} />
                  {!isCollapsed && (
                    <>
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
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with Settings and Collapse Toggle */}
        <div className="sidebar-footer">
          {/* Theme Toggle - Full Width (Options variant when expanded) */}
          <div className="sidebar-theme-container">
            {!isCollapsed ? (
              <ThemeToggle
                variant="options"
                className="sidebar-theme-options"
              />
            ) : (
              <ThemeToggle variant="toggle" className="sidebar-theme-toggle" />
            )}
          </div>

          {/* Bottom Row: Settings & Collapse */}
          <div className="sidebar-footer-controls">
            <button
              className="settings-btn"
              onClick={() => setShowSettingsModal(true)}
              title="Settings"
            >
              <FiSettings size={18} />
              {!isCollapsed && <span>Settings</span>}
            </button>

            <button
              className="collapse-btn"
              onClick={toggleCollapse}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? (
                <FiChevronRight size={18} />
              ) : (
                <FiChevronLeft size={18} />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal onClose={() => setShowSettingsModal(false)} />
      )}
    </>
  );
}
