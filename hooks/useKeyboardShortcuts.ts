"use client";

import { useEffect, useCallback, RefObject } from "react";
import { useChatContext } from "@/context/ChatContext";

interface KeyboardShortcutsOptions {
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  onEditLastMessage?: () => void;
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const { newChat, stopGeneration, isSending, currentConversation } =
    useChatContext();

  const { inputRef, onEditLastMessage } = options;

  // Copy last response to clipboard
  const copyLastResponse = useCallback(() => {
    if (!currentConversation) return;

    const messages = currentConversation.messages;
    // Find the last assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && messages[i].content) {
        navigator.clipboard.writeText(messages[i].content);
        // Could add a toast notification here
        console.log("Copied last response to clipboard");
        return;
      }
    }
  }, [currentConversation]);

  // Focus the input field
  const focusInput = useCallback(() => {
    if (inputRef?.current) {
      inputRef.current.focus();
    }
  }, [inputRef]);

  // Handle global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Don't handle shortcuts when typing in inputs (except specific ones)
      const isTyping =
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA";

      // Cmd+N - New chat (works anywhere)
      if (cmdOrCtrl && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newChat();
        return;
      }

      // Cmd+/ - Focus input (works anywhere)
      if (cmdOrCtrl && e.key === "/") {
        e.preventDefault();
        focusInput();
        return;
      }

      // Cmd+Shift+C - Copy last response (works anywhere except when selecting text)
      if (cmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "c") {
        // Don't override if there's selected text
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;

        e.preventDefault();
        copyLastResponse();
        return;
      }

      // Escape - Stop generation or close modals
      if (e.key === "Escape") {
        if (isSending) {
          e.preventDefault();
          stopGeneration();
          return;
        }
        // Close any open modals/menus - dispatch custom event
        window.dispatchEvent(new Event("close-all-modals"));
        return;
      }

      // Arrow Up in empty input - Edit last message
      if (
        e.key === "ArrowUp" &&
        isTyping &&
        document.activeElement === inputRef?.current
      ) {
        const input = inputRef.current;
        if (input && input.value.trim() === "" && onEditLastMessage) {
          e.preventDefault();
          onEditLastMessage();
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    newChat,
    focusInput,
    copyLastResponse,
    stopGeneration,
    isSending,
    inputRef,
    onEditLastMessage,
  ]);

  return {
    copyLastResponse,
    focusInput,
  };
}
