"use client";

import { useChatContext } from "@/context/ChatContext";
import { PROVIDERS } from "@/types";
import MessageList from "../chat/MessageList";
import MessageInput from "../chat/MessageInput";
import { SiOpenai, SiGoogle } from "react-icons/si";
import { FiMessageCircle } from "react-icons/fi";

export default function ChatArea() {
  const { currentConversation, activeProvider, sessions, isSending } =
    useChatContext();
  const providerConfig = PROVIDERS[activeProvider];
  const session = sessions[activeProvider];

  // Empty state when no conversation
  if (!currentConversation || currentConversation.messages.length === 0) {
    return (
      <main className="chat-area">
        <div className="empty-chat">
          <div className="empty-chat-content">
            <div
              className="provider-badge"
              style={{ backgroundColor: providerConfig.color }}
            >
              {activeProvider === "chatgpt" && <SiOpenai size={32} />}
              {activeProvider === "gemini" && <SiGoogle size={32} />}
              {activeProvider === "claude" && (
                <span className="claude-icon">A</span>
              )}
            </div>
            <h1>Chat with {providerConfig.name}</h1>
            <p className="subtitle">
              {session.isConnected
                ? "Start a conversation by typing a message below"
                : `Configure your ${providerConfig.name} cookies in settings to begin`}
            </p>
            <div className="suggestions">
              <button className="suggestion" onClick={() => {}}>
                <FiMessageCircle size={16} />
                <span>Explain quantum computing</span>
              </button>
              <button className="suggestion" onClick={() => {}}>
                <FiMessageCircle size={16} />
                <span>Write a Python function</span>
              </button>
              <button className="suggestion" onClick={() => {}}>
                <FiMessageCircle size={16} />
                <span>Help me plan a trip</span>
              </button>
            </div>
          </div>
        </div>
        <MessageInput />
      </main>
    );
  }

  return (
    <main className="chat-area">
      <div className="chat-header">
        <div
          className="provider-indicator"
          style={{ backgroundColor: providerConfig.color }}
        >
          {activeProvider === "chatgpt" && <SiOpenai size={14} />}
          {activeProvider === "gemini" && <SiGoogle size={14} />}
          {activeProvider === "claude" && (
            <span style={{ fontWeight: "bold", fontSize: 12 }}>A</span>
          )}
        </div>
        <span>{providerConfig.name}</span>
        {isSending && <span className="typing-indicator">typing...</span>}
      </div>
      <MessageList messages={currentConversation.messages} />
      <MessageInput />
    </main>
  );
}
