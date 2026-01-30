"use client";

import { ProviderStatus } from "@/types";

interface ProviderStatusBadgeProps {
  status: ProviderStatus;
  showLabel?: boolean;
}

export default function ProviderStatusBadge({
  status,
  showLabel = true,
}: ProviderStatusBadgeProps) {
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

  const getLabel = () => {
    switch (status) {
      case "ready":
        return "Ready";
      case "warming":
        return "Loading";
      case "streaming":
        return "Live";
      case "error":
        return "Error";
      case "idle":
      default:
        return "Idle";
    }
  };

  const getTitle = () => {
    switch (status) {
      case "ready":
        return "Connected and ready";
      case "warming":
        return "Warming up browser session...";
      case "streaming":
        return "Generating response...";
      case "error":
        return "Connection error";
      case "idle":
      default:
        return "Not connected";
    }
  };

  return (
    <span className={`status-badge ${getStatusClass()}`} title={getTitle()}>
      <span className="status-dot" />
      {showLabel && <span className="status-label">{getLabel()}</span>}
    </span>
  );
}
