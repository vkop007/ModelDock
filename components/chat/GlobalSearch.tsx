"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useChatContext } from "@/context/ChatContext";
import { useThemeContext } from "@/context/ThemeContext";
import { PROVIDERS, LLMProvider, Message, Conversation } from "@/types";
import {
  FiSearch,
  FiCornerDownLeft,
  FiCommand,
  FiMoon,
  FiSun,
  FiPlus,
  FiDownload,
  FiTrash2,
  FiCpu,
  FiLayout,
  FiMaximize,
  FiSidebar,
  FiMessageSquare,
} from "react-icons/fi";
import Image from "next/image";

// Logo paths for each provider
const PROVIDER_LOGOS: Record<LLMProvider, string> = {
  chatgpt: "/providers/chatgpt_logo.jpeg",
  claude: "/providers/claude_logo.jpeg",
  gemini: "/providers/gemini.jpeg",
  zai: "/providers/zdotai_logo.jpeg",
  grok: "/providers/grok.jpg",
  qwen: "/providers/qwen_logo.jpeg",
  mistral: "/providers/mistralai_logo.jpeg",
  ollama: "/providers/ollama.png",
};

type ResultType = "command" | "conversation" | "message";

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action: () => void;
  group: string;
  score?: number;
}

interface Command {
  id: string;
  title: string;
  keywords: string[];
  icon: React.ReactNode;
  action: (context: any) => void;
  section: "System" | "Navigation" | "Actions";
}

export default function GlobalSearch() {
  const {
    conversations,
    selectConversation,
    setProvider,
    newChat,
    exportConversation,
    deleteAllConversations,
    toggleSidebar,
    toggleFocusMode,
    activeProvider,
  } = useChatContext();

  const { theme, setTheme, toggleTheme } = useThemeContext();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Define commands
  const commands: Command[] = useMemo(
    () => [
      // Provider Switching
      ...Object.entries(PROVIDERS).map(([key, config]) => ({
        id: `switch-${key}`,
        title: `Switch to ${config.name}`,
        keywords: ["switch", "provider", key, config.name.toLowerCase()],
        icon: (
          <Image
            src={PROVIDER_LOGOS[key as LLMProvider]}
            alt={config.name}
            width={16}
            height={16}
            style={{ borderRadius: "2px" }}
          />
        ),
        action: () => setProvider(key as LLMProvider),
        section: "Navigation" as const,
      })),
      // Actions
      {
        id: "new-chat",
        title: "New Chat",
        keywords: ["new", "chat", "create", "start"],
        icon: <FiPlus size={16} />,
        action: () => newChat(),
        section: "Actions" as const,
      },
      {
        id: "export-json",
        title: "Export All Data (JSON)",
        keywords: ["export", "json", "download", "backup"],
        icon: <FiDownload size={16} />,
        action: () => exportConversation("json"),
        section: "Actions" as const,
      },
      {
        id: "export-md",
        title: "Export Current Chat (Markdown)",
        keywords: ["export", "markdown", "md", "download"],
        icon: <FiDownload size={16} />,
        action: () => exportConversation("markdown"),
        section: "Actions" as const,
      },
      {
        id: "delete-all",
        title: "Delete All Conversations",
        keywords: ["delete", "clear", "remove", "all", "history"],
        icon: <FiTrash2 size={16} />,
        action: () => {
          if (
            confirm(
              "Are you sure you want to delete all conversations? This cannot be undone.",
            )
          ) {
            deleteAllConversations();
          }
        },
        section: "Actions" as const,
      },
      // System
      {
        id: "toggle-theme",
        title: `Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`,
        keywords: ["theme", "dark", "light", "mode", "color", "toggle"],
        icon: theme === "dark" ? <FiSun size={16} /> : <FiMoon size={16} />,
        action: () => toggleTheme(),
        section: "System" as const,
      },
      {
        id: "toggle-sidebar",
        title: "Toggle Sidebar",
        keywords: ["sidebar", "hide", "show", "toggle", "menu"],
        icon: <FiSidebar size={16} />,
        action: () => toggleSidebar(),
        section: "System" as const,
      },
      {
        id: "toggle-focus",
        title: "Toggle Focus Mode",
        keywords: ["focus", "zen", "mode", "toggle", "fullscreen"],
        icon: <FiMaximize size={16} />,
        action: () => toggleFocusMode(),
        section: "System" as const,
      },
    ],
    [
      setProvider,
      newChat,
      exportConversation,
      deleteAllConversations,
      toggleSidebar,
      toggleFocusMode,
      theme,
      toggleTheme,
    ],
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Listen for custom open event
  useEffect(() => {
    const handleOpenSearch = () => setIsOpen(true);
    window.addEventListener("open-global-search", handleOpenSearch);
    return () =>
      window.removeEventListener("open-global-search", handleOpenSearch);
  }, []);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setSelectedIndex(0);
      // Initialize with just commands or empty?
      // Let's initialize with top commands
      filterResults("");
    }
  }, [isOpen]);

  // Filtering logic
  const filterResults = (searchQuery: string) => {
    const normalize = (s: string) => s.toLowerCase();
    const q = normalize(searchQuery);

    let combinedResults: SearchResult[] = [];

    // 1. Filter Commands
    const matchedCommands = commands
      .filter(
        (cmd) =>
          !q || // Show all if empty query? Maybe just top ones.
          normalize(cmd.title).includes(q) ||
          cmd.keywords.some((k) => k.includes(q)),
      )
      .map((cmd) => ({
        id: cmd.id,
        type: "command" as ResultType,
        title: cmd.title,
        subtitle: cmd.section,
        icon: cmd.icon,
        action: () => cmd.action({}),
        group: "Commands",
        score: cmd.title.startsWith(q) ? 10 : 5, // Simple scoring
      }));

    // If query is empty, show suggested commands
    if (!q) {
      combinedResults = matchedCommands.slice(0, 5); // Top 5 commands
    } else {
      combinedResults = [...matchedCommands];
    }

    // 2. Filter Conversations (only if query exists)
    if (q) {
      const convResults: SearchResult[] = [];
      const recentConversations = conversations.slice(0, 100); // Limit search space

      for (const conv of recentConversations) {
        // Title Match
        if (normalize(conv.title).includes(q)) {
          convResults.push({
            id: `conv-${conv.id}`,
            type: "conversation",
            title: conv.title,
            subtitle: `Conversation • ${new Date(conv.updatedAt).toLocaleDateString()}`,
            icon: (
              <Image
                src={PROVIDER_LOGOS[conv.provider]}
                alt={conv.provider}
                width={16}
                height={16}
                style={{ borderRadius: "2px", opacity: 0.8 }}
              />
            ),
            action: () => selectConversation(conv.id),
            group: "Conversations",
            score: 1,
          });
        }

        // Message Match (only if not already matched by title to avoid clutter)
        // actually let's show both if relevant
        const matchingMsg = conv.messages.find((m) =>
          normalize(m.content).includes(q),
        );
        if (matchingMsg) {
          convResults.push({
            id: `msg-${matchingMsg.id}`,
            type: "message",
            title: conv.title,
            subtitle: `"${matchingMsg.content.substring(0, 60)}..."`,
            icon: <FiMessageSquare size={16} />,
            action: () => selectConversation(conv.id), // Ideally jump to message
            group: "Messages",
            score: 0.5,
          });
        }
      }

      combinedResults = [...combinedResults, ...convResults];
    }

    // Sort by group then score? Or just mixed?
    // Let's prioritize Commands -> Conversations -> Messages
    combinedResults.sort((a, b) => {
      const typeScore = { command: 3, conversation: 2, message: 1 };
      if (typeScore[a.type] !== typeScore[b.type]) {
        return typeScore[b.type] - typeScore[a.type];
      }
      return (b.score || 0) - (a.score || 0);
    });

    setResults(combinedResults.slice(0, 50)); // Hard limit
  };

  useEffect(() => {
    filterResults(query);
    setSelectedIndex(0);
  }, [query, commands, conversations]);

  // Navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    }
  };

  const handleSelect = (result: SearchResult) => {
    result.action();
    setIsOpen(false);
  };

  // Scroll active
  useEffect(() => {
    if (listRef.current) {
      const activeElement = listRef.current.children[
        selectedIndex
      ] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="search-modal-overlay" onClick={() => setIsOpen(false)}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-header">
          <FiSearch className="search-icon" size={20} />
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="search-badge">
            <span className="kbd">ESC</span>
          </div>
        </div>

        <div className="search-body" ref={listRef}>
          {results.length === 0 ? (
            <div className="search-empty">
              <p>No matching commands or conversations</p>
            </div>
          ) : (
            results.map((result, index) => (
              <div
                key={result.id}
                className={`search-item ${index === selectedIndex ? "active" : ""}`}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className={`search-item-icon ${result.type}`}>
                  {result.icon}
                </div>
                <div className="search-item-content">
                  <div className="search-item-header">
                    <span className="search-item-title">{result.title}</span>
                  </div>
                  {result.subtitle && (
                    <div className="search-item-preview">
                      <span className="match-tag">{result.subtitle}</span>
                    </div>
                  )}
                </div>
                {index === selectedIndex && (
                  <FiCornerDownLeft className="enter-icon" size={16} />
                )}
              </div>
            ))
          )}
        </div>

        <div className="search-footer">
          <div className="footer-item">
            <span className="kbd">↑↓</span> to navigate
          </div>
          <div className="footer-item">
            <span className="kbd">↵</span> to select
          </div>
          <div className="footer-item">
            <span className="kbd">/</span> for commands
          </div>
        </div>
      </div>
    </div>
  );
}
