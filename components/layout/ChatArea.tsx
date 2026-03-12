"use client";

import { useChatContext } from "@/context/ChatContext";
import MessageInput from "../chat/MessageInput";
import UnifiedChatArea from "../chat/UnifiedChatArea";
import ApiDocsView from "../docs/ApiDocsView";

export default function ChatArea() {
  const { activeView } = useChatContext();

  if (activeView === "api-docs") {
    return (
      <main className="chat-area">
        <ApiDocsView />
      </main>
    );
  }

  return (
    <main className="chat-area">
      <UnifiedChatArea />
      <MessageInput />
    </main>
  );
}
