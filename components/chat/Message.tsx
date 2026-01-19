"use client";

import { Message, PROVIDERS, LLMProvider } from "@/types";
import { useState, useRef, useEffect } from "react";
import { FiCopy, FiCheck, FiRefreshCw, FiEdit2 } from "react-icons/fi";
import { BsPinAngle, BsPinAngleFill } from "react-icons/bs";
import Image from "next/image";
import { StreamdownRenderer } from "./StreamdownRenderer";
import { getRelativeTime, getFormattedTime } from "@/lib/utils/time";

// Logo paths for each provider
const PROVIDER_LOGOS: Record<LLMProvider, string> = {
  chatgpt: "/providers/chatgpt_logo.jpeg",
  claude: "/providers/claude_logo.jpeg",
  gemini: "/providers/gemini.jpeg",
  zai: "/providers/zdotai_logo.jpeg",
  grok: "/providers/grok.jpg",
  qwen: "/providers/qwen_logo.jpeg",
  mistral: "/providers/mistralai_logo.jpeg",
  ollama: "/providers/ollama_logo.png",
};

interface MessageBubbleProps {
  message: Message;
  isLast: boolean;
  isSending?: boolean;
  conversationProvider: LLMProvider;
  onRegenerate?: () => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onPin?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
  canRegenerate?: boolean;
  canEdit?: boolean;
  allowPin?: boolean;
}

export default function MessageBubble({
  message,
  isLast,
  isSending,
  conversationProvider,
  onRegenerate,
  onEdit,
  onPin,
  onUnpin,
  canRegenerate = false,
  canEdit = false,
  allowPin = false,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [relativeTime, setRelativeTime] = useState(
    getRelativeTime(message.timestamp),
  );
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  const isUser = message.role === "user";
  const isLoading =
    message.role === "assistant" && !message.content && isLast && isSending;

  // Update relative time every minute
  useEffect(() => {
    const updateTime = () =>
      setRelativeTime(getRelativeTime(message.timestamp));
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [message.timestamp]);

  // Auto-focus and auto-resize textarea when editing
  useEffect(() => {
    if (isEditing && editTextareaRef.current) {
      editTextareaRef.current.focus();
      editTextareaRef.current.style.height = "auto";
      editTextareaRef.current.style.height =
        Math.min(editTextareaRef.current.scrollHeight, 200) + "px";
    }
  }, [isEditing, editContent]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditSubmit = () => {
    if (editContent.trim() && onEdit) {
      onEdit(message.id, editContent.trim());
      setIsEditing(false);
    }
  };

  const handleEditCancel = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEditSubmit();
    } else if (e.key === "Escape") {
      handleEditCancel();
    }
  };

  const isGeneratedImage = message.content.startsWith("![Generated Image](");
  const imageUrl = isGeneratedImage
    ? message.content.slice(19, -1) // Remove ![Generated Image]( and )
    : null;

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
    <div
      className={`message ${isUser ? "user" : "assistant"} ${message.isPinned ? "pinned" : ""}`}
    >
      {message.isPinned && (
        <div className="pin-indicator" title="Pinned message">
          <BsPinAngleFill size={12} />
        </div>
      )}
      {!isUser && <div className="message-avatar">{getProviderLogo()}</div>}
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
              isEditing ? (
                <div className="edit-mode">
                  <textarea
                    ref={editTextareaRef}
                    className="edit-textarea"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    rows={1}
                  />
                  <div className="edit-actions">
                    <button
                      className="edit-save-btn"
                      onClick={handleEditSubmit}
                      disabled={!editContent.trim()}
                    >
                      Save & Resend
                    </button>
                    <button
                      className="edit-cancel-btn"
                      onClick={handleEditCancel}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="user-bubble">{message.content}</div>
              )
            ) : isGeneratedImage && imageUrl ? (
              <div className="message-image">
                <img
                  src={imageUrl}
                  alt="Generated Image"
                  style={{
                    maxWidth: "300px",
                    width: "100%",
                    borderRadius: "8px",
                  }}
                />
              </div>
            ) : (
              <div className="message-text">
                <StreamdownRenderer
                  content={message.content}
                  isStreaming={isLast && !!isSending}
                />
              </div>
            )}

            {/* Message Footer with Timestamp and Actions */}
            <div className="message-footer">
              <span
                className="message-timestamp"
                title={getFormattedTime(message.timestamp)}
              >
                {relativeTime}
              </span>

              <div className="message-actions">
                {/* Pin action (available for both) */}
                {allowPin && !isSending && (
                  <button
                    className={`action-btn ${message.isPinned ? "active" : ""}`}
                    onClick={() => {
                      if (message.isPinned && onUnpin) onUnpin(message.id);
                      else if (!message.isPinned && onPin) onPin(message.id);
                    }}
                    title={message.isPinned ? "Unpin message" : "Pin message"}
                  >
                    {message.isPinned ? (
                      <BsPinAngleFill size={14} />
                    ) : (
                      <BsPinAngle size={14} />
                    )}
                  </button>
                )}

                {/* User message actions */}
                {isUser && canEdit && !isEditing && !isSending && (
                  <button
                    className="action-btn"
                    onClick={() => setIsEditing(true)}
                    title="Edit message"
                  >
                    <FiEdit2 size={14} />
                  </button>
                )}

                {/* Assistant message actions */}
                {!isUser && message.content && (
                  <>
                    <button
                      className="action-btn"
                      onClick={handleCopy}
                      title="Copy"
                    >
                      {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
                    </button>
                    {canRegenerate && !isSending && (
                      <button
                        className="action-btn"
                        onClick={onRegenerate}
                        title="Regenerate response"
                      >
                        <FiRefreshCw size={14} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
