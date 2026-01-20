"use client";

import { useChatContext } from "@/context/ChatContext";
import { useState, useRef, useEffect, KeyboardEvent, useCallback } from "react";
import {
  FiSend,
  FiChevronDown,
  FiCheck,
  FiImage,
  FiX,
  FiPaperclip,
  FiSquare,
} from "react-icons/fi";
import Image from "next/image";
import { PROVIDERS, LLMProvider } from "@/types";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

// Logo paths for each provider
const PROVIDER_LOGOS: Record<LLMProvider, string> = {
  chatgpt: "/providers/chatgpt_logo.jpeg",
  claude: "/providers/claude_logo.jpeg",
  gemini: "/providers/gemini.jpeg",
  zai: "/providers/zdotai_logo.jpeg",
  grok: "/providers/grok.jpg",
  qwen: "/providers/qwen_logo.jpeg",
  mistral: "/providers/mistralai_logo.jpeg",
  ollama: "/providers/ollama.png",
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
    stopGeneration,
    currentConversation,
    editAndResend,
  } = useChatContext();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showModelMenu, setShowModelMenu] = useState(false);

  const session = sessions[activeProvider];
  const hasCookies = (cookieConfigs[activeProvider]?.cookies?.length ?? 0) > 0;
  const isDisabled = !hasCookies;
  const activeConfig = PROVIDERS[activeProvider];
  const modelButtonRef = useRef<HTMLButtonElement>(null);

  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit last user message callback for keyboard shortcut
  const handleEditLastMessage = useCallback(() => {
    if (!currentConversation) return;
    const messages = currentConversation.messages;
    // Find the last user message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        // Put the content in the input for editing
        setInput(messages[i].content);
        textareaRef.current?.focus();
        return;
      }
    }
  }, [currentConversation]);

  // Initialize keyboard shortcuts
  useKeyboardShortcuts({
    inputRef: textareaRef,
    onEditLastMessage: handleEditLastMessage,
  });

  // Listen for close-all-modals event
  useEffect(() => {
    const handleCloseModals = () => {
      setShowModelMenu(false);
    };
    window.addEventListener("close-all-modals", handleCloseModals);
    return () =>
      window.removeEventListener("close-all-modals", handleCloseModals);
  }, []);

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

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSubmit = async () => {
    if (
      (!input.trim() && selectedImages.length === 0) ||
      isSending ||
      isDisabled
    )
      return;

    const message = input;
    const imagesToUpload = [...selectedImages];

    setInput("");
    setSelectedImages([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Convert images to base64
    const base64Images = await Promise.all(
      imagesToUpload.map((file) => convertFileToBase64(file)),
    );

    await sendMessage(message, base64Images);
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isDisabled) return;

    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/"),
    );

    if (files.length > 0) {
      setSelectedImages((prev) => [...prev, ...files]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter((file) =>
        file.type.startsWith("image/"),
      );
      setSelectedImages((prev) => [...prev, ...files]);
    }
    // Reset inputs
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const showImageUpload =
    activeProvider === "chatgpt" || activeProvider === "gemini";

  return (
    <div className="message-input-container">
      {/* Image Previews */}
      {selectedImages.length > 0 && (
        <div className="image-previews">
          {selectedImages.map((file, index) => (
            <div key={index} className="image-preview-item">
              <img
                src={URL.createObjectURL(file)}
                alt="preview"
                className="image-preview-img"
              />
              <button
                className="remove-image-btn"
                onClick={() => removeImage(index)}
              >
                <FiX size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={`message-input-wrapper ${
          selectedImages.length > 0 ? "has-images" : ""
        }`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
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
              : selectedImages.length > 0
                ? "Describe this image..."
                : `Message ${activeConfig.name}...`
          }
          disabled={isSending || isDisabled}
          rows={1}
        />

        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*"
          multiple
          style={{ display: "none" }}
        />

        {/* Generate Image Button (Only for supported providers) */}
        {(activeProvider === "chatgpt" || activeProvider === "gemini") && (
          <button
            className="send-btn"
            onClick={handleImageGeneration}
            disabled={!input.trim() || isSending || isDisabled}
            title="Generate Image"
            style={{
              marginRight: "4px",
              backgroundColor: "transparent",
              color: input.trim() ? activeConfig.color : "inherit",
              border: "1px solid",
              borderColor: input.trim() ? activeConfig.color : "#404040",
            }}
          >
            <FiImage size={18} />
          </button>
        )}

        {/* Upload Image Button (Only if supported) */}
        {showImageUpload && (
          <button
            className="send-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || isDisabled}
            title="Upload Image"
            style={{
              marginRight: "8px",
              backgroundColor: "transparent",
              color: "inherit",
            }}
          >
            <FiPaperclip size={18} />
          </button>
        )}

        {isSending ? (
          <button
            className="send-btn stop-btn"
            onClick={stopGeneration}
            title="Stop generating"
            style={{ backgroundColor: "#ef4444", color: "white" }}
          >
            <FiSquare size={18} />
          </button>
        ) : (
          <button
            className="send-btn"
            onClick={handleSubmit}
            disabled={
              (!input.trim() && selectedImages.length === 0) || isDisabled
            }
            style={
              (input.trim() || selectedImages.length > 0) && !isDisabled
                ? { backgroundColor: activeConfig.color, color: "white" }
                : {}
            }
          >
            <FiSend size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
