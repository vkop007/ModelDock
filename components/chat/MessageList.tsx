"use client";

import { Message, LLMProvider } from "@/types";
import { useEffect, useRef } from "react";
import { useChatContext } from "@/context/ChatContext";
import MessageBubble from "./Message";

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
  const { regenerateLastMessage, editAndResend } = useChatContext();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Find the last assistant message index for regenerate button
  const lastAssistantIndex = messages.reduce(
    (lastIdx, msg, idx) => (msg.role === "assistant" ? idx : lastIdx),
    -1,
  );

  return (
    <div className="message-list">
      {messages.map((message, index) => {
        const isLastAssistant = index === lastAssistantIndex;
        const isUserMessage = message.role === "user";

        return (
          <MessageBubble
            key={message.id}
            message={message}
            isLast={index === messages.length - 1}
            isSending={isSending}
            conversationProvider={conversationProvider}
            onRegenerate={isLastAssistant ? regenerateLastMessage : undefined}
            onEdit={isUserMessage ? editAndResend : undefined}
            canRegenerate={isLastAssistant}
            canEdit={isUserMessage}
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
