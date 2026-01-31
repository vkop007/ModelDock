"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { v4 as uuidv4 } from "uuid";
import { Folder } from "@/types";
import { saveFolders, loadFolders } from "@/lib/storage";

// Default folder colors
export const FOLDER_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
];

interface FolderContextValue {
  folders: Folder[];
  isLoading: boolean;
  // CRUD operations
  createFolder: (
    name: string,
    options?: { color?: string; description?: string },
  ) => Folder;
  updateFolder: (id: string, updates: Partial<Folder>) => void;
  deleteFolder: (id: string) => void;
  // Conversation management
  moveConversationToFolder: (
    conversationId: string,
    folderId: string | undefined,
  ) => void;
  // UI state
  expandedFolders: Record<string, boolean>;
  toggleFolderExpanded: (folderId: string) => void;
  setAllFoldersExpanded: (expanded: boolean) => void;
  // Helpers
  getFolderById: (id: string) => Folder | undefined;
  getConversationsInFolder: (
    folderId: string,
    conversations: { id: string; folderId?: string }[],
  ) => { id: string }[];
}

const FolderContext = createContext<FolderContextValue | null>(null);

export function FolderProvider({ children }: { children: React.ReactNode }) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<
    Record<string, boolean>
  >({});

  // Load folders on mount
  useEffect(() => {
    const load = async () => {
      try {
        const loadedFolders = await loadFolders();
        setFolders(loadedFolders.sort((a, b) => a.order - b.order));

        // Load expanded state
        const savedState = localStorage.getItem("folder-expanded-state");
        if (savedState) {
          try {
            setExpandedFolders(JSON.parse(savedState));
          } catch {}
        }
      } catch (error) {
        console.error("Failed to load folders:", error);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // Persist folders
  const persistFolders = useCallback((newFolders: Folder[]) => {
    setFolders(newFolders);
    saveFolders(newFolders).catch(console.error);
  }, []);

  // Create folder
  const createFolder = useCallback(
    (
      name: string,
      options?: { color?: string; description?: string },
    ): Folder => {
      const newFolder: Folder = {
        id: uuidv4(),
        name: name.trim(),
        description: options?.description?.trim(),
        color:
          options?.color ||
          FOLDER_COLORS[folders.length % FOLDER_COLORS.length],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        order: folders.length,
      };

      persistFolders([...folders, newFolder]);
      return newFolder;
    },
    [folders, persistFolders],
  );

  // Update folder
  const updateFolder = useCallback(
    (id: string, updates: Partial<Folder>) => {
      const newFolders = folders.map((f) =>
        f.id === id ? { ...f, ...updates, updatedAt: Date.now() } : f,
      );
      persistFolders(newFolders);
    },
    [folders, persistFolders],
  );

  // Delete folder (moves conversations to unsorted)
  const deleteFolder = useCallback(
    (id: string) => {
      const newFolders = folders.filter((f) => f.id !== id);
      persistFolders(newFolders);

      // Update expanded state
      const newExpanded = { ...expandedFolders };
      delete newExpanded[id];
      setExpandedFolders(newExpanded);
      localStorage.setItem(
        "folder-expanded-state",
        JSON.stringify(newExpanded),
      );
    },
    [folders, persistFolders, expandedFolders],
  );

  // Move conversation to folder (handled via conversation's folderId)
  const moveConversationToFolder = useCallback(
    (conversationId: string, folderId: string | undefined) => {
      // This is handled by the parent component that manages conversations
      // We emit a custom event for cross-context communication
      window.dispatchEvent(
        new CustomEvent("move-conversation-to-folder", {
          detail: { conversationId, folderId },
        }),
      );
    },
    [],
  );

  // Toggle folder expanded state
  const toggleFolderExpanded = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const updated = { ...prev, [folderId]: !prev[folderId] };
      localStorage.setItem("folder-expanded-state", JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Set all folders expanded/collapsed
  const setAllFoldersExpanded = useCallback(
    (expanded: boolean) => {
      const allIds = folders.map((f) => f.id);
      const updated = allIds.reduce(
        (acc, id) => ({ ...acc, [id]: expanded }),
        {},
      );
      setExpandedFolders(updated);
      localStorage.setItem("folder-expanded-state", JSON.stringify(updated));
    },
    [folders],
  );

  // Get folder by ID
  const getFolderById = useCallback(
    (id: string) => folders.find((f) => f.id === id),
    [folders],
  );

  // Get conversations in a folder
  const getConversationsInFolder = useCallback(
    (folderId: string, conversations: { id: string; folderId?: string }[]) => {
      return conversations.filter((c) => c.folderId === folderId);
    },
    [],
  );

  return (
    <FolderContext.Provider
      value={{
        folders,
        isLoading,
        createFolder,
        updateFolder,
        deleteFolder,
        moveConversationToFolder,
        expandedFolders,
        toggleFolderExpanded,
        setAllFoldersExpanded,
        getFolderById,
        getConversationsInFolder,
      }}
    >
      {children}
    </FolderContext.Provider>
  );
}

export function useFolderContext() {
  const context = useContext(FolderContext);
  if (!context) {
    throw new Error("useFolderContext must be used within a FolderProvider");
  }
  return context;
}
