"use client";

import { Message, PROVIDERS, LLMProvider } from "@/types";
import { useState } from "react";
import { FiUser, FiCopy, FiCheck } from "react-icons/fi";
import Image from "next/image";
import { StreamdownRenderer } from "./StreamdownRenderer";

// Logo paths for each provider
const PROVIDER_LOGOS: Record<LLMProvider, string> = {
  chatgpt: "/providers/chatgpt_logo.jpeg",
  claude: "/providers/claude_logo.jpeg",
  gemini: "/providers/gemini.jpeg",
  zai: "/providers/zdotai_logo.jpeg",
  grok: "/providers/grok.jpg",
  qwen: "/providers/qwen_logo.jpeg",
  mistral: "/providers/mistralai_logo.jpeg",
};

interface MessageBubbleProps {
  message: Message;
  isLast: boolean;
  isSending?: boolean;
  conversationProvider: LLMProvider;
}

export default function MessageBubble({
  message,
  isLast,
  isSending,
  conversationProvider,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isLoading =
    message.role === "assistant" && !message.content && isLast && isSending;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getProviderLogo = () => {
    // Use message's provider, falling back to the conversation's provider
    const provider = message.provider || conversationProvider;
    return (
      <Image
        src={PROVIDER_LOGOS[provider]}
        alt={`${PROVIDERS[provider].name} logo`}
        width={28}
        height={28}
        style={{ borderRadius: "6px", objectFit: "cover" }}
      />
    );
  };

  return (
    <div className={`message ${isUser ? "user" : "assistant"}`}>
      <div className="message-avatar">
        {isUser ? <FiUser size={18} /> : getProviderLogo()}
      </div>
      <div className="message-content">
        {isLoading ? (
          <div className="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        ) : (
          <>
            {isUser ? (
              <div className="message-text">{message.content}</div>
            ) : (
              <div className="message-text">
                <StreamdownRenderer
                  content={message.content}
                  isStreaming={isLast && !!isSending}
                />
              </div>
            )}
            {!isUser && message.content && (
              <div className="message-actions">
                <button
                  className="action-btn"
                  onClick={handleCopy}
                  title="Copy"
                >
                  {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
