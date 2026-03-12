"use client";

import { useEffect, useRef } from "react";
import { ChatProvider, useChatContext } from "@/context/ChatContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { FolderProvider } from "@/context/FolderContext";
import { VoiceProvider } from "@/context/VoiceContext";
import Sidebar from "@/components/layout/Sidebar";
import ChatArea from "@/components/layout/ChatArea";
import GlobalSearch from "@/components/chat/GlobalSearch";
import CookiePrompt from "@/components/settings/CookiePrompt";

function AppContent() {
  const { isFocusMode, isSidebarCollapsed, showApiDocsView } =
    useChatContext();
  const hasAppliedInitialViewRef = useRef(false);

  useEffect(() => {
    if (hasAppliedInitialViewRef.current || typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    if (url.searchParams.get("view") === "api-docs") {
      showApiDocsView();
      url.searchParams.delete("view");
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, "", nextUrl || "/");
    }

    hasAppliedInitialViewRef.current = true;
  }, [showApiDocsView]);

  return (
    <div className={`app-container ${isFocusMode ? "focus-mode" : ""}`}>
      <div
        className={`sidebar-wrapper ${isFocusMode ? "hidden" : ""} ${
          isSidebarCollapsed ? "collapsed" : ""
        }`}
      >
        <Sidebar />
      </div>
      <ChatArea />
      <GlobalSearch />
      <CookiePrompt />
    </div>
  );
}

export default function Home() {
  return (
    <ThemeProvider>
      <FolderProvider>
        <ChatProvider>
          <VoiceProvider>
            <AppContent />
          </VoiceProvider>
        </ChatProvider>
      </FolderProvider>
    </ThemeProvider>
  );
}
