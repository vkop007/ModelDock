"use client";

import { useChatContext } from "@/context/ChatContext";
import { PROVIDERS } from "@/types";
import MessageList from "../chat/MessageList";
import MessageInput from "../chat/MessageInput";
import Image from "next/image";
import { FiMessageCircle } from "react-icons/fi";

import UnifiedChatArea from "../chat/UnifiedChatArea";

export default function ChatArea() {
  const {
    currentConversation,
    activeProvider,
    sessions,
    isSending,
    isUnifiedMode,
  } = useChatContext();

  // Always return UnifiedChatArea, ignoring activeProvider single-view logic
  return (
    <main className="chat-area">
      <UnifiedChatArea />
      <MessageInput />
    </main>
  );
}
