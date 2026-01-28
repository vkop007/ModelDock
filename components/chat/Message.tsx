"use client";

import { Message, PROVIDERS, LLMProvider } from "@/types";
import { useState, useRef, useEffect } from "react";
import {
  FiCopy,
  FiCheck,
  FiRefreshCw,
  FiEdit2,
  FiVolume2,
  FiVolumeX,
} from "react-icons/fi";
import { BsPinAngle, BsPinAngleFill } from "react-icons/bs";
import Image from "next/image";
import { getRelativeTime, getFormattedTime } from "@/lib/utils/time";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { useSmartRelativeTime } from "@/hooks/useSmartRelativeTime";

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
  const relativeTime = useSmartRelativeTime(message.timestamp);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // TTS for assistant messages
  const {
    isSpeaking,
    isPaused,
    isSupported: isTTSSupported,
    speak,
    pause,
    resume,
    stop,
  } = useTextToSpeech();

  const isUser = message.role === "user";
  const isLoading =
    message.role === "assistant" && !message.content && isLast && isSending;

  // Auto-focus and auto-resize textarea when editing
  useEffect(() => {
    if (isEditing && editTextareaRef.current) {
      editTextareaRef.current.focus();
      editTextareaRef.current.style.height = "auto";
      editTextareaRef.current.style.height =
        Math.min(editTextareaRef.current.scrollHeight, 300) + "px";
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

  // Handle TTS
  const handleTTSToggle = () => {
    if (!isTTSSupported) {
      alert("Text-to-speech is not supported in your browser.");
      return;
    }

    if (isSpeaking) {
      if (isPaused) {
        resume();
      } else {
        pause();
      }
    } else {
      // Strip markdown and speak plain text
      const plainText = message.content
        .replace(/```[\s\S]*?```/g, "")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/[*_~#\[\]]/g, "")
        .trim();
      speak(plainText);
    }
  };

  const handleTTSStop = () => {
    stop();
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
                <div className="flex flex-col gap-3 bg-neutral-800/80 p-3 rounded-2xl border border-neutral-700/50 backdrop-blur-sm w-full max-w-2xl">
                  <textarea
                    ref={editTextareaRef}
                    className="w-full bg-transparent text-neutral-200 text-sm resize-none outline-none p-1 min-h-[60px]"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    rows={1}
                  />
                  <div className="flex items-center justify-end gap-2 border-t border-neutral-700/50 pt-2">
                    <button
                      className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-700/50 rounded-lg transition-colors"
                      onClick={handleEditCancel}
                    >
                      Cancel
                    </button>
                    <button
                      className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-500 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleEditSubmit}
                      disabled={!editContent.trim()}
                    >
                      Save
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
              <div className="message-text">{message.content}</div>
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
                    {/* TTS Button */}
                    <button
                      className={`action-btn ${isSpeaking ? "speaking" : ""}`}
                      onClick={handleTTSToggle}
                      title={
                        isSpeaking
                          ? isPaused
                            ? "Resume"
                            : "Pause"
                          : "Read aloud"
                      }
                    >
                      {isSpeaking ? (
                        <FiVolumeX size={14} />
                      ) : (
                        <FiVolume2 size={14} />
                      )}
                    </button>
                    {isSpeaking && (
                      <button
                        className="action-btn"
                        onClick={handleTTSStop}
                        title="Stop"
                      >
                        <FiCheck size={14} />
                      </button>
                    )}
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
