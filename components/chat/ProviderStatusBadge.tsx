"use client";

import { ProviderStatus } from "@/types";

interface ProviderStatusBadgeProps {
  status: ProviderStatus;
  size?: "sm" | "md";
}

export default function ProviderStatusBadge({
  status,
  size = "sm",
}: ProviderStatusBadgeProps) {
  const sizeClass = size === "sm" ? "status-badge-sm" : "status-badge-md";

  const getStatusClass = () => {
    switch (status) {
      case "ready":
        return "status-ready";
      case "warming":
        return "status-warming";
      case "streaming":
        return "status-streaming";
      case "error":
        return "status-error";
      case "idle":
      default:
        return "status-idle";
    }
  };

  const getTitle = () => {
    switch (status) {
      case "ready":
        return "Connected";
      case "warming":
        return "Warming up...";
      case "streaming":
        return "Generating response...";
      case "error":
        return "Connection error";
      case "idle":
      default:
        return "Idle";
    }
  };

  return (
    <span
      className={`status-badge ${sizeClass} ${getStatusClass()}`}
      title={getTitle()}
    >
      <span className="status-dot" />
    </span>
  );
}
