"use client";

import { ChatProvider } from "@/context/ChatContext";
import Sidebar from "@/components/layout/Sidebar";
import ChatArea from "@/components/layout/ChatArea";

export default function Home() {
  return (
    <ChatProvider>
      <div className="app-container">
        <Sidebar />
        <ChatArea />
      </div>
    </ChatProvider>
  );
}
