"use client";

import { Message, LLMProvider } from "@/types";
import { useEffect, useRef } from "react";
import { useChatContext } from "@/context/ChatContext";
import MessageBubble from "./Message";
import { BsPinAngleFill, BsX } from "react-icons/bs";

interface MessageListProps {
  messages: Message[];
  isSending: boolean;
  conversationProvider: LLMProvider;
}

export default function MessageList({
  messages,
  isSending,
  conversationProvider,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { regenerateLastMessage, editAndResend, pinMessage, unpinMessage } =
    useChatContext();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Find the last assistant message index for regenerate button
  const lastAssistantIndex = messages.reduce(
    (lastIdx, msg, idx) => (msg.role === "assistant" ? idx : lastIdx),
    -1,
  );

  // Separate pinned messages
  const pinnedMessages = messages.filter((msg) => msg.isPinned);

  const handleScrollToMessage = (messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("highlight-pulse");
      setTimeout(() => element.classList.remove("highlight-pulse"), 2000);
    }
  };

  return (
    <div className="message-list">
      {/* Pinned Messages Section */}
      {pinnedMessages.length > 0 && (
        <div className="pinned-messages-section">
          <div className="pinned-header">
            <BsPinAngleFill size={12} />
            <span>Pinned Messages ({pinnedMessages.length})</span>
          </div>
          {pinnedMessages.map((msg) => (
            <div
              key={`pinned-${msg.id}`}
              className="pinned-item"
              onClick={() => handleScrollToMessage(msg.id)}
            >
              <div className="pinned-item-content">
                {msg.content.slice(0, 100)}...
              </div>
              <button
                className="unpin-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  unpinMessage(msg.id);
                }}
              >
                <BsX size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {messages.map((message, index) => {
        const isLastAssistant = index === lastAssistantIndex;
        const isUserMessage = message.role === "user";

        return (
          <div id={`message-${message.id}`} key={message.id}>
            <MessageBubble
              message={message}
              isLast={index === messages.length - 1}
              isSending={isSending}
              conversationProvider={conversationProvider}
              onRegenerate={isLastAssistant ? regenerateLastMessage : undefined}
              onEdit={isUserMessage ? editAndResend : undefined}
              onPin={pinMessage}
              onUnpin={unpinMessage}
              allowPin={true}
              canRegenerate={isLastAssistant}
              canEdit={isUserMessage}
            />
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
