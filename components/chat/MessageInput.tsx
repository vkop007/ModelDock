"use client";

import { useChatContext } from "@/context/ChatContext";
import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { FiSend, FiLoader } from "react-icons/fi";

export default function MessageInput() {
  const { sendMessage, isSending, activeProvider, sessions, cookieConfigs } =
    useChatContext();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const session = sessions[activeProvider];
  const hasCookies = (cookieConfigs[activeProvider]?.cookies?.length ?? 0) > 0;
  const isDisabled = !hasCookies;

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  const handleSubmit = async () => {
    if (!input.trim() || isSending || isDisabled) return;

    const message = input;
    setInput("");
    await sendMessage(message);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="message-input-container">
      <div className="message-input-wrapper">
        <textarea
          ref={textareaRef}
          className="message-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isDisabled
              ? "Configure cookies in settings to start chatting..."
              : "Type a message..."
          }
          disabled={isSending || isDisabled}
          rows={1}
        />
        <button
          className="send-btn"
          onClick={handleSubmit}
          disabled={!input.trim() || isSending || isDisabled}
        >
          {isSending ? (
            <FiLoader size={20} className="spin" />
          ) : (
            <FiSend size={20} />
          )}
        </button>
      </div>
      <p className="input-hint">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}
