"use client";

import { Message } from "@/types";
import { useState } from "react";
import { FiUser, FiCopy, FiCheck } from "react-icons/fi";
import { SiOpenai, SiGoogle } from "react-icons/si";

interface MessageBubbleProps {
  message: Message;
  isLast: boolean;
}

export default function MessageBubble({ message, isLast }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isLoading = message.role === "assistant" && !message.content && isLast;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getProviderIcon = () => {
    switch (message.provider) {
      case "chatgpt":
        return <SiOpenai size={18} />;
      case "gemini":
        return <SiGoogle size={18} />;
      case "claude":
        return <span style={{ fontWeight: "bold", fontSize: 16 }}>A</span>;
      default:
        return <SiOpenai size={18} />;
    }
  };

  return (
    <div className={`message ${isUser ? "user" : "assistant"}`}>
      <div className="message-avatar">
        {isUser ? <FiUser size={18} /> : getProviderIcon()}
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
            <div className="message-text">{message.content}</div>
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
