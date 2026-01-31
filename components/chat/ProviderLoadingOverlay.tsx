"use client";

import { LLMProvider, PROVIDERS } from "@/types";
import Image from "next/image";

interface ProviderLoadingOverlayProps {
  provider: LLMProvider;
  status: string;
}

const getProviderLogo = (provider: LLMProvider, size: number) => {
  const logos: Record<LLMProvider, string> = {
    chatgpt: "/providers/chatgpt_logo.jpeg",
    claude: "/providers/claude_logo.jpeg",
    gemini: "/providers/gemini.jpeg",
    zai: "/providers/zdotai_logo.jpeg",
    grok: "/providers/grok.jpg",
    qwen: "/providers/qwen_logo.jpeg",
    mistral: "/providers/mistralai_logo.jpeg",
    ollama: "/providers/ollama.png",
  };

  return (
    <Image
      src={logos[provider]}
      alt={`${provider} logo`}
      width={size}
      height={size}
      className="loading-provider-logo"
      style={{ borderRadius: "12px", objectFit: "cover" }}
    />
  );
};

export default function ProviderLoadingOverlay({
  provider,
  status,
}: ProviderLoadingOverlayProps) {
  const config = PROVIDERS[provider];

  // Don't show overlay if ready or streaming (active states)
  const shouldShow =
    status === "warming" || status === "idle" || status === "error";

  if (!shouldShow) return null;

  return (
    <div className="provider-loading-overlay">
      <div className="loading-content">
        <div className="logo-pulse-container">
          <div className="pulse-ring"></div>
          {getProviderLogo(provider, 48)}
        </div>
        <div className="loading-text">
          <h3>{config.name}</h3>
          <p>{status === "error" ? "Connection failed" : "Connecting..."}</p>
        </div>
      </div>
    </div>
  );
}
