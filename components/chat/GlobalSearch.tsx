"use client";

import { useState, useEffect, useRef } from "react";
import { useChatContext } from "@/context/ChatContext";
import { PROVIDERS, LLMProvider, Message, Conversation } from "@/types";
import {
  FiSearch,
  FiMessageSquare,
  FiCornerDownLeft,
  FiX,
  FiCommand,
} from "react-icons/fi";
import Image from "next/image";

// Logo paths for each provider (reused from MessageInput)
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

interface SearchResult {
  message: Message;
  conversation: Conversation;
  matchType: "message" | "title";
}

export default function GlobalSearch() {
  const { conversations, selectConversation, setProvider } = useChatContext();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Toggle search with Cmd+K / Ctrl+K
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

  // Listen for custom event to open search from sidebar
  useEffect(() => {
    const handleOpenSearch = () => {
      setIsOpen(true);
    };

    window.addEventListener("open-global-search", handleOpenSearch);
    return () =>
      window.removeEventListener("open-global-search", handleOpenSearch);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  // Search logic
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const searchQuery = query.toLowerCase();
    const searchResults: SearchResult[] = [];

    // Limit to most recent 200 conversations to keep it fast
    const recentConversations = conversations.slice(0, 200);

    for (const conv of recentConversations) {
      // Check title
      if (conv.title.toLowerCase().includes(searchQuery)) {
        // If title matches, add the first message or a placeholder
        const firstMsg = conv.messages[0] || {
          id: "placeholder",
          content: "Conversation content",
          role: "user",
          timestamp: conv.createdAt,
        };
        searchResults.push({
          conversation: conv,
          message: firstMsg as Message,
          matchType: "title",
        });
      }

      // Check messages
      for (const msg of conv.messages) {
        if (msg.content.toLowerCase().includes(searchQuery)) {
          // Don't add duplicate if we already added this conversation for title match
          // (Optional: show multiple matches per conversation? For now, let's allow it)
          searchResults.push({
            conversation: conv,
            message: msg,
            matchType: "message",
          });
        }
      }

      if (searchResults.length > 50) break; // Hard limit results
    }

    setResults(searchResults);
    setSelectedIndex(0);
  }, [query, conversations]);

  // Keyboard navigation
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
    setProvider(result.conversation.provider);
    selectConversation(result.conversation.id);
    setIsOpen(false);
  };

  // Scroll active item into view
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
            placeholder="Search all conversations..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="search-badge">
            <span className="kbd">ESC</span>
          </div>
        </div>

        <div className="search-body" ref={listRef}>
          {results.length === 0 && query ? (
            <div className="search-empty">
              <p>No results found for "{query}"</p>
            </div>
          ) : results.length === 0 && !query ? (
            <div className="search-empty">
              <p>Type to search...</p>
              <div className="search-shortcuts">
                <div className="shortcut-item">
                  <FiCommand size={14} />
                  <span>+ K to open</span>
                </div>
              </div>
            </div>
          ) : (
            results.map((result, index) => (
              <div
                key={`${result.conversation.id}-${result.message.id}-${index}`}
                className={`search-item ${
                  index === selectedIndex ? "active" : ""
                }`}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="search-item-icon">
                  <Image
                    src={PROVIDER_LOGOS[result.conversation.provider]}
                    alt={result.conversation.provider}
                    width={20}
                    height={20}
                    style={{ borderRadius: "4px" }}
                  />
                </div>
                <div className="search-item-content">
                  <div className="search-item-header">
                    <span className="search-item-title">
                      {result.conversation.title}
                    </span>
                    <span className="search-item-date">
                      {new Date(result.message.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="search-item-preview">
                    {result.matchType === "title" ? (
                      <span className="match-tag">Title Match</span>
                    ) : (
                      <span className="message-preview">
                        {result.message.role === "user" ? "You: " : "AI: "}
                        {result.message.content.length > 100
                          ? result.message.content.substring(0, 100) + "..."
                          : result.message.content}
                      </span>
                    )}
                  </div>
                </div>
                {index === selectedIndex && (
                  <FiCornerDownLeft className="enter-icon" size={16} />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
