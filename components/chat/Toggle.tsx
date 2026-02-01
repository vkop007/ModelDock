"use client";

import React from "react";

interface ToggleProps {
  enabled: boolean;
  onChange: () => void;
  title?: string;
  className?: string;
}

export default function Toggle({
  enabled,
  onChange,
  title,
  className = "",
}: ToggleProps) {
  return (
    <button
      className={`toggle-switch ${enabled ? "enabled" : "disabled"} ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      title={title}
      aria-pressed={enabled}
    >
      <span className="toggle-switch-thumb" />
    </button>
  );
}
