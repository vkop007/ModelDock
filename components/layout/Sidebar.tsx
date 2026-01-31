"use client";

import { useChatContext } from "@/context/ChatContext";
import { useFolderContext } from "@/context/FolderContext";
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
  FiFolder,
} from "react-icons/fi";
import SettingsModal from "../settings/SettingsModal";
import ThemeToggle from "../settings/ThemeToggle";
import FolderManager from "../folders/FolderManager";

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
    isSidebarCollapsed: isCollapsed,
    toggleSidebar: toggleCollapse,
    moveConversationToFolder,
  } = useChatContext();

  const {
    folders,
    isLoading: foldersLoading,
    createFolder,
  } = useFolderContext();

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
          <button className="new-chat-btn" onClick={() => newChat()} title="New Chat">
            <FiPlus size={24} />
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

        {/* Folder Manager (always visible to allow creating folders) */}
        <div className="conversation-list">
          {!isCollapsed && (
            <>
              {/* Always show folder section */}
              <FolderManager
                conversations={filteredConversations}
                currentConversationId={currentConversationId}
                onSelectConversation={selectConversation}
                onDeleteConversation={deleteConversation}
                onMoveConversationToFolder={moveConversationToFolder}
                onNewChatInFolder={(folderId) => newChat(folderId)}
                isCollapsed={isCollapsed}
              />
            </>
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
