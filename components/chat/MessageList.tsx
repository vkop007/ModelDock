"use client";

import { Message, LLMProvider } from "@/types";
import { useEffect, useRef } from "react";
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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="message-list">
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id}
          message={message}
          isLast={index === messages.length - 1}
          isSending={isSending}
          conversationProvider={conversationProvider}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
