"use client";

import { ChatProvider } from "@/context/ChatContext";
import Sidebar from "@/components/layout/Sidebar";
import ChatArea from "@/components/layout/ChatArea";
import GlobalSearch from "@/components/chat/GlobalSearch";

export default function Home() {
  return (
    <ChatProvider>
      <div className="app-container">
        <Sidebar />
        <ChatArea />
        <GlobalSearch />
      </div>
    </ChatProvider>
  );
}
