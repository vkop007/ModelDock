"use client";

import { useChatContext } from "@/context/ChatContext";
import { useState, useRef, useEffect, KeyboardEvent } from "react";
import {
  FiSend,
  FiLoader,
  FiChevronDown,
  FiCheck,
  FiImage,
} from "react-icons/fi";
import Image from "next/image";
import { PROVIDERS, LLMProvider } from "@/types";

// Logo paths for each provider
const PROVIDER_LOGOS: Record<LLMProvider, string> = {
  chatgpt: "/providers/chatgpt_logo.jpeg",
  claude: "/providers/claude_logo.jpeg",
  gemini: "/providers/gemini.jpeg",
  zai: "/providers/zdotai_logo.jpeg",
  grok: "/providers/grok.jpg",
  qwen: "/providers/qwen_logo.jpeg",
  mistral: "/providers/mistralai_logo.jpeg",
};

// Helper function to get proper logo for each provider
const getProviderLogo = (provider: LLMProvider, size: number) => {
  return (
    <Image
      src={PROVIDER_LOGOS[provider]}
      alt={`${PROVIDERS[provider].name} logo`}
      width={size}
      height={size}
      style={{ borderRadius: "4px", objectFit: "cover" }}
    />
  );
};

export default function MessageInput() {
  const {
    sendMessage,
    isSending,
    activeProvider,
    sessions,
    cookieConfigs,
    setProvider,
    generateImage,
  } = useChatContext();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showModelMenu, setShowModelMenu] = useState(false);

  const session = sessions[activeProvider];
  const hasCookies = (cookieConfigs[activeProvider]?.cookies?.length ?? 0) > 0;
  const isDisabled = !hasCookies;
  const activeConfig = PROVIDERS[activeProvider];
  const modelButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  // Auto-focus on mount
  useEffect(() => {
    if (textareaRef.current && !isDisabled) {
      textareaRef.current.focus();
    }
  }, [isDisabled]);

  // Click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modelButtonRef.current &&
        !modelButtonRef.current.contains(event.target as Node) &&
        !document.getElementById("model-menu")?.contains(event.target as Node)
      ) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = async () => {
    if (!input.trim() || isSending || isDisabled) return;

    const message = input;
    setInput("");
    await sendMessage(message);
  };

  const handleImageGeneration = async () => {
    if (!input.trim() || isSending || isDisabled) return;

    const prompt = input;
    setInput("");
    await generateImage(prompt);
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
        <div className="model-selector-inline">
          <button
            ref={modelButtonRef}
            className="model-selector-btn-inline"
            onClick={() => setShowModelMenu(!showModelMenu)}
            style={{
              borderColor: showModelMenu ? activeConfig.color : "transparent",
              color: activeConfig.color,
            }}
          >
            {getProviderLogo(activeProvider, 14)}
            <span>{activeConfig.name}</span>
            <FiChevronDown
              size={14}
              style={{
                transform: showModelMenu ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            />
          </button>

          {showModelMenu && (
            <div id="model-menu" className="model-menu">
              {(Object.keys(PROVIDERS) as LLMProvider[]).map((provider) => {
                const config = PROVIDERS[provider];
                const isActive = activeProvider === provider;
                const hasCookies =
                  (cookieConfigs[provider]?.cookies?.length ?? 0) > 0;

                return (
                  <button
                    key={provider}
                    className={`model-menu-item ${isActive ? "active" : ""}`}
                    onClick={() => {
                      setProvider(provider);
                      setShowModelMenu(false);
                    }}
                  >
                    <div
                      className="model-icon-wrapper"
                      style={{ color: config.color }}
                    >
                      {getProviderLogo(provider, 16)}
                    </div>
                    <div className="model-info">
                      <span className="model-name">{config.name}</span>
                      <span className="model-status">
                        {hasCookies ? "Ready" : "Not Configured"}
                      </span>
                    </div>
                    {isActive && <FiCheck size={16} className="check-icon" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <textarea
          ref={textareaRef}
          className="message-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isDisabled
              ? "Configure cookies in settings to start chatting..."
              : `Message ${activeConfig.name}...`
          }
          disabled={isSending || isDisabled}
          rows={1}
        />
        <button
          className="send-btn"
          onClick={handleImageGeneration}
          disabled={
            !input.trim() ||
            isSending ||
            isDisabled ||
            activeProvider !== "chatgpt"
          }
          title="Generate Image (ChatGPT only)"
          // Use a different color or style to distinguish
          style={{
            marginRight: "8px",
            backgroundColor: "transparent",
            color:
              input.trim() && activeProvider === "chatgpt"
                ? activeConfig.color
                : "inherit",
            border: "1px solid",
            borderColor:
              input.trim() && activeProvider === "chatgpt"
                ? activeConfig.color
                : "#404040",
          }}
        >
          <FiImage size={20} />
        </button>
        <button
          className="send-btn"
          onClick={handleSubmit}
          disabled={!input.trim() || isSending || isDisabled}
          style={
            input.trim() && !isSending && !isDisabled
              ? { backgroundColor: activeConfig.color, color: "white" }
              : {}
          }
        >
          {isSending ? (
            <FiLoader size={20} className="spin" />
          ) : (
            <FiSend size={20} />
          )}
        </button>
      </div>
    </div>
  );
}
