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
  FiMic,
  FiMicOff,
} from "react-icons/fi";
import Image from "next/image";
import { PROVIDERS, LLMProvider } from "@/types";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

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
    isUnifiedMode,
    broadcastMessage,
    setCookies,
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

  // Voice input
  const {
    transcript,
    interimTranscript,
    isListening,
    isSupported: isVoiceSupported,
    error: voiceError,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({ continuous: false, interimResults: true });

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
    ) {
      return;
    }

    // Removed /login and /import slash commands as they are no longer needed
    // UI prompts handle this now.

    if (isDisabled) return;

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

    // Always broadcast in the new unified-only architecture
    await broadcastMessage(message, base64Images);
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

  // Handle voice input
  const handleVoiceToggle = () => {
    if (!isVoiceSupported) {
      alert(
        "Voice input is not supported in your browser. Please use Chrome, Edge, or Safari.",
      );
      return;
    }

    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      startListening();
    }
  };

  // Voice command detector and processor
  const processVoiceCommand = useCallback(
    (
      text: string,
    ): { shouldKeep: boolean; newText: string; action?: () => void } => {
      const lowerText = text.toLowerCase().trim();

      // Command: Send message
      if (lowerText.includes("send message") || lowerText.includes("send it")) {
        return {
          shouldKeep: false,
          newText: text.replace(/send (message|it)/gi, "").trim(),
          action: () => {
            setTimeout(() => handleSubmit(), 100);
          },
        };
      }

      // Command: New line
      if (lowerText.includes("new line") || lowerText.includes("newline")) {
        return {
          shouldKeep: true,
          newText: text.replace(/new ?line/gi, "\n"),
        };
      }

      // Command: Delete last word
      if (lowerText.includes("delete last word")) {
        return {
          shouldKeep: false,
          newText: "",
          action: () => {
            setInput((prev) => {
              const words = prev.trim().split(/\s+/);
              words.pop();
              return words.join(" ") + (words.length > 0 ? " " : "");
            });
          },
        };
      }

      // Command: Clear all
      if (
        lowerText.includes("clear all") ||
        lowerText.includes("clear everything")
      ) {
        return {
          shouldKeep: false,
          newText: "",
          action: () => {
            setInput("");
            setSelectedImages([]);
          },
        };
      }

      // No command detected, return text as-is
      return { shouldKeep: true, newText: text };
    },
    [handleSubmit],
  );

  // Update input field in real-time as transcript changes
  useEffect(() => {
    if (transcript) {
      const result = processVoiceCommand(transcript);

      if (result.shouldKeep && result.newText) {
        setInput((prev) => prev + result.newText + " ");
      }

      // Execute command action if present
      if (result.action) {
        result.action();
      }

      resetTranscript();
    }
  }, [transcript, resetTranscript, processVoiceCommand]);

  const showImageUpload =
    activeProvider === "chatgpt" || activeProvider === "gemini";

  return (
    <div className="message-input-container">
      <div
        className={`message-input-wrapper ${
          selectedImages.length > 0 ? "has-images" : ""
        }`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Image Previews - Inside the input box like ChatGPT */}
        {selectedImages.length > 0 && (
          <div className="image-previews-inline">
            {selectedImages.map((file, index) => (
              <div key={index} className="image-preview-item-inline">
                <img
                  src={URL.createObjectURL(file)}
                  alt="preview"
                  className="image-preview-img-inline"
                />
                <div className="image-preview-actions">
                  <button
                    className="image-action-btn"
                    onClick={() => removeImage(index)}
                    title="Remove image"
                  >
                    <FiX size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="input-row">
          <textarea
            ref={textareaRef}
            className="message-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isDisabled
                ? "Configure cookies in settings to start chatting..."
                : "Broadcast message to all active providers..."
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

          {/* Voice Input Button */}
          <button
            className={`send-btn voice-btn ${isListening ? "listening" : ""}`}
            onClick={handleVoiceToggle}
            disabled={isSending || isDisabled}
            title={isListening ? "Stop recording" : "Voice input"}
            style={{
              marginRight: "8px",
              backgroundColor: isListening ? "#ef4444" : "transparent",
              color: isListening ? "white" : "inherit",
              animation: isListening ? "pulse 1.5s infinite" : "none",
            }}
          >
            {isListening ? <FiMicOff size={18} /> : <FiMic size={18} />}
          </button>

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
    </div>
  );
}
