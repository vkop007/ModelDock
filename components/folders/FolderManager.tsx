"use client";

import React, { useState } from "react";
import { useFolderContext, FOLDER_COLORS } from "@/context/FolderContext";
import {
  FiFolder,
  FiFolderPlus,
  FiFolderMinus,
  FiEdit2,
  FiTrash2,
  FiChevronDown,
  FiChevronRight,
  FiMoreVertical,
  FiMove,
  FiPlus,
} from "react-icons/fi";
import { Folder } from "@/types";

interface FolderManagerProps {
  conversations: { id: string; title: string; folderId?: string }[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onMoveConversationToFolder?: (
    conversationId: string,
    folderId: string | undefined,
  ) => void;
  onNewChatInFolder?: (folderId: string) => void;
  isCollapsed?: boolean;
}

export default function FolderManager({
  conversations,
  currentConversationId,
  onSelectConversation,
  onDeleteConversation,
  onMoveConversationToFolder,
  onNewChatInFolder,
  isCollapsed,
}: FolderManagerProps) {
  const {
    folders,
    isLoading,
    createFolder,
    updateFolder,
    deleteFolder,
    expandedFolders,
    toggleFolderExpanded,
    setAllFoldersExpanded,
  } = useFolderContext();

  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [selectedColor, setSelectedColor] = useState(FOLDER_COLORS[0]);
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null);
  const [showFolderMenu, setShowFolderMenu] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [moveMenuOpen, setMoveMenuOpen] = useState<string | null>(null);

  // Get conversations without a folder (unsorted)
  const unsortedConversations = conversations.filter((c) => !c.folderId);

  // Group conversations by folder
  const conversationsByFolder = folders.reduce(
    (acc, folder) => {
      acc[folder.id] = conversations.filter((c) => c.folderId === folder.id);
      return acc;
    },
    {} as Record<string, typeof conversations>,
  );

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder(newFolderName.trim(), { color: selectedColor });
      setNewFolderName("");
      setShowCreateFolder(false);
      setSelectedColor(FOLDER_COLORS[folders.length % FOLDER_COLORS.length]);
    }
  };

  const handleStartEdit = (folder: Folder) => {
    setEditingFolder(folder.id);
    setEditingName(folder.name);
  };

  const handleSaveEdit = (folderId: string) => {
    if (editingName.trim()) {
      updateFolder(folderId, { name: editingName.trim() });
    }
    setEditingFolder(null);
    setEditingName("");
  };

  const handleCancelEdit = () => {
    setEditingFolder(null);
    setEditingName("");
  };

  if (isCollapsed) {
    return (
      <div className="folder-manager-collapsed">
        {folders.map((folder) => (
          <button
            key={folder.id}
            className="folder-collapsed-btn"
            style={{ color: folder.color }}
            title={folder.name}
          >
            <FiFolder size={18} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="folder-manager">
      {/* Header with actions */}
      <div className="folder-manager-header">
        <span className="folder-label">Folders</span>
        <div className="folder-actions">
          <button
            className="folder-action-btn"
            onClick={() => setShowCreateFolder(true)}
            title="Create folder"
          >
            <FiFolderPlus size={14} />
          </button>
          <button
            className="folder-action-btn"
            onClick={() =>
              setAllFoldersExpanded(
                !Object.values(expandedFolders).some((v) => v),
              )
            }
            title={
              Object.values(expandedFolders).some((v) => v)
                ? "Collapse all"
                : "Expand all"
            }
          >
            {Object.values(expandedFolders).some((v) => v) ? (
              <FiFolderMinus size={14} />
            ) : (
              <FiFolder size={14} />
            )}
          </button>
        </div>
      </div>

      {/* Create folder form */}
      {showCreateFolder && (
        <div className="create-folder-form">
          <input
            type="text"
            className="folder-name-input"
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            autoFocus
          />
          <div className="folder-color-picker">
            {FOLDER_COLORS.map((color) => (
              <button
                key={color}
                className={`color-option ${selectedColor === color ? "selected" : ""}`}
                style={{ backgroundColor: color }}
                onClick={() => setSelectedColor(color)}
              />
            ))}
          </div>
          <div className="create-folder-actions">
            <button
              className="cancel-btn"
              onClick={() => setShowCreateFolder(false)}
            >
              Cancel
            </button>
            <button className="create-btn" onClick={handleCreateFolder}>
              Create
            </button>
          </div>
        </div>
      )}

      {/* Folders list */}
      <div className="folders-list">
        {folders.length === 0 ? (
          <div className="folders-empty">
            <FiFolder size={24} />
            <p>No folders yet</p>
            <p className="folders-empty-hint">
              Click the + button to create a folder
            </p>
          </div>
        ) : (
          folders.map((folder) => {
            const folderConvs = conversationsByFolder[folder.id] || [];
            const isExpanded = expandedFolders[folder.id] ?? true;

            return (
              <div key={folder.id} className="folder-group">
                {/* Folder header */}
                <div
                  className="folder-header"
                  onMouseEnter={() => setHoveredFolder(folder.id)}
                  onMouseLeave={() => {
                    setHoveredFolder(null);
                    setShowFolderMenu(null);
                  }}
                >
                  <button
                    className="folder-expand-btn"
                    onClick={() => toggleFolderExpanded(folder.id)}
                  >
                    {isExpanded ? (
                      <FiChevronDown size={14} />
                    ) : (
                      <FiChevronRight size={14} />
                    )}
                  </button>

                  <button
                    className="folder-name-btn"
                    onClick={() => toggleFolderExpanded(folder.id)}
                    style={{ color: folder.color }}
                  >
                    <FiFolder size={16} />
                    {editingFolder === folder.id ? (
                      <input
                        type="text"
                        className="folder-name-edit"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => handleSaveEdit(folder.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(folder.id);
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <span className="folder-name">{folder.name}</span>
                    )}
                    <span className="folder-count">({folderConvs.length})</span>
                  </button>

                  {/* Folder actions */}
                  {hoveredFolder === folder.id &&
                    editingFolder !== folder.id && (
                      <div className="folder-item-actions">
                        {onNewChatInFolder && (
                          <button
                            className="folder-item-btn"
                            onClick={() => onNewChatInFolder(folder.id)}
                            title="Add chat to folder"
                          >
                            <FiPlus size={12} />
                          </button>
                        )}
                        <button
                          className="folder-item-btn"
                          onClick={() => handleStartEdit(folder)}
                          title="Rename"
                        >
                          <FiEdit2 size={12} />
                        </button>
                        <button
                          className="folder-item-btn delete"
                          onClick={() => {
                            if (
                              confirm(
                                `Delete "${folder.name}"? Conversations will be moved to unsorted.`,
                              )
                            ) {
                              deleteFolder(folder.id);
                            }
                          }}
                          title="Delete"
                        >
                          <FiTrash2 size={12} />
                        </button>
                      </div>
                    )}
                </div>

                {/* Folder conversations */}
                {isExpanded && (
                  <div className="folder-conversations">
                    {folderConvs.length === 0 ? (
                      <div className="folder-empty">
                        No chats in this folder
                      </div>
                    ) : (
                      folderConvs.map((conv) => (
                        <div
                          key={conv.id}
                          className={`folder-conv-item ${
                            currentConversationId === conv.id ? "active" : ""
                          }`}
                          onClick={() => onSelectConversation(conv.id)}
                        >
                          <span className="conv-title">{conv.title}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Unsorted conversations */}
      {unsortedConversations.length > 0 && (
        <div className="unsorted-section">
          <div className="unsorted-header">
            <FiFolder size={16} />
            <span>Unsorted</span>
            <span className="unsorted-count">
              ({unsortedConversations.length})
            </span>
          </div>
          <div className="unsorted-conversations">
            {unsortedConversations.map((conv) => (
              <div
                key={conv.id}
                className={`unsorted-conv-item ${
                  currentConversationId === conv.id ? "active" : ""
                }`}
                onClick={() => onSelectConversation(conv.id)}
                onMouseEnter={(e) => {
                  const btns = e.currentTarget.querySelectorAll(
                    ".action-btn",
                  ) as NodeListOf<HTMLElement>;
                  btns.forEach((btn) => (btn.style.opacity = "1"));
                }}
                onMouseLeave={(e) => {
                  const btns = e.currentTarget.querySelectorAll(
                    ".action-btn",
                  ) as NodeListOf<HTMLElement>;
                  btns.forEach((btn) => (btn.style.opacity = "0"));
                }}
              >
                <span className="conv-title">{conv.title}</span>
                <div className="conv-actions">
                  {onMoveConversationToFolder && folders.length > 0 && (
                    <div className="move-dropdown">
                      <button
                        className="action-btn move-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMoveMenuOpen(
                            moveMenuOpen === conv.id ? null : conv.id,
                          );
                        }}
                        title="Move to folder"
                      >
                        <FiMove size={12} />
                      </button>
                      {moveMenuOpen === conv.id && (
                        <div className="move-menu">
                          <div className="move-menu-header">Move to folder</div>
                          {folders.map((folder) => (
                            <button
                              key={folder.id}
                              className="move-menu-item"
                              onClick={(e) => {
                                e.stopPropagation();
                                onMoveConversationToFolder(conv.id, folder.id);
                                setMoveMenuOpen(null);
                              }}
                            >
                              <FiFolder
                                size={12}
                                style={{ color: folder.color }}
                              />
                              <span>{folder.name}</span>
                            </button>
                          ))}
                          <button
                            className="move-menu-item unsort"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveConversationToFolder(conv.id, undefined);
                              setMoveMenuOpen(null);
                            }}
                          >
                            <FiFolder size={12} />
                            <span>Unsorted</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    className="action-btn delete-conv-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                    }}
                    title="Delete"
                  >
                    <FiTrash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
