"use client";

import { useChatContext } from "@/context/ChatContext";
import { PROVIDERS } from "@/types";
import MessageList from "../chat/MessageList";
import MessageInput from "../chat/MessageInput";
import Image from "next/image";
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
            <div className="provider-badge">
              <Image
                src={`/providers/${
                  activeProvider === "chatgpt"
                    ? "chatgpt_logo.jpeg"
                    : activeProvider === "gemini"
                    ? "gemini.jpeg"
                    : activeProvider === "claude"
                    ? "claude_logo.jpeg"
                    : activeProvider === "grok"
                    ? "grok.jpg"
                    : activeProvider === "zai"
                    ? "zdotai_logo.jpeg"
                    : activeProvider === "qwen"
                    ? "qwen_logo.jpeg"
                    : "mistralai_logo.jpeg"
                }`}
                alt={`${providerConfig.name} logo`}
                width={32}
                height={32}
                style={{ borderRadius: "8px", objectFit: "cover" }}
              />
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
        <div className="provider-indicator">
          <Image
            src={`/providers/${
              activeProvider === "chatgpt"
                ? "chatgpt_logo.jpeg"
                : activeProvider === "gemini"
                ? "gemini.jpeg"
                : activeProvider === "claude"
                ? "claude_logo.jpeg"
                : activeProvider === "grok"
                ? "grok.jpg"
                : activeProvider === "zai"
                ? "zdotai_logo.jpeg"
                : activeProvider === "qwen"
                ? "qwen_logo.jpeg"
                : "mistralai_logo.jpeg"
            }`}
            alt={`${providerConfig.name} logo`}
            width={20}
            height={20}
            style={{ borderRadius: "4px", objectFit: "cover" }}
          />
        </div>
        <span>{providerConfig.name}</span>
        {isSending && <span className="typing-indicator">typing...</span>}
      </div>
      <MessageList
        messages={currentConversation.messages}
        isSending={isSending}
        conversationProvider={currentConversation.provider}
      />
      <MessageInput />
    </main>
  );
}
