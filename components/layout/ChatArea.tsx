"use client";

import { useChatContext } from "@/context/ChatContext";
import { PROVIDERS } from "@/types";
import MessageList from "../chat/MessageList";
import MessageInput from "../chat/MessageInput";
import Image from "next/image";
import { FiMessageCircle, FiMaximize2, FiMinimize2 } from "react-icons/fi";

import UnifiedChatArea from "../chat/UnifiedChatArea";

export default function ChatArea() {
  const {
    currentConversation,
    activeProvider,
    sessions,
    isSending,
    isUnifiedMode,
    isFocusMode,
    toggleFocusMode,
  } = useChatContext();

  // Always return UnifiedChatArea, ignoring activeProvider single-view logic
  return (
    <main className="chat-area" style={{ position: "relative" }}>
      <button
        onClick={toggleFocusMode}
        className="focus-mode-toggle"
        title={isFocusMode ? "Exit Focus Mode" : "Enter Focus Mode"}
        style={{
          position: "absolute",
          top: "16px",
          right: "16px",
          zIndex: 50,
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          color: "var(--text-secondary)",
          padding: "8px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s ease",
        }}
      >
        {isFocusMode ? <FiMinimize2 size={18} /> : <FiMaximize2 size={18} />}
      </button>
      <UnifiedChatArea />
      <MessageInput />
    </main>
  );
}
