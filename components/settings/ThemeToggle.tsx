"use client";

import React from "react";
import { useThemeContext } from "@/context/ThemeContext";
import { FiSun, FiMoon } from "react-icons/fi";

interface ThemeToggleProps {
  variant?: "toggle" | "options";
  className?: string;
}

export default function ThemeToggle({
  variant = "toggle",
  className = "",
}: ThemeToggleProps) {
  const { theme, toggleTheme, setTheme } = useThemeContext();

  if (variant === "options") {
    return (
      <div className={`settings-theme-options ${className}`}>
        <button
          className={`theme-option ${theme === "dark" ? "active" : ""}`}
          onClick={() => setTheme("dark")}
          aria-label="Switch to dark theme"
        >
          <div className="theme-option-preview">
            <div className="theme-preview-dark" />
          </div>
          <FiMoon size={14} className="theme-option-icon" />
          <span className="theme-option-label">Dark</span>
        </button>
        <button
          className={`theme-option ${theme === "light" ? "active" : ""}`}
          onClick={() => setTheme("light")}
          aria-label="Switch to light theme"
        >
          <div className="theme-option-preview">
            <div className="theme-preview-light" />
          </div>
          <FiSun size={14} className="theme-option-icon" />
          <span className="theme-option-label">Light</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`theme-toggle-container ${className}`}>
      <FiMoon size={18} className="theme-toggle-icon" />
      <button
        className="theme-toggle"
        data-theme={theme}
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      >
        <span className="theme-toggle-thumb">
          {theme === "dark" ? <FiMoon size={12} /> : <FiSun size={12} />}
        </span>
      </button>
      <FiSun size={18} className="theme-toggle-icon" />
    </div>
  );
}

// Also export a standalone toggle button for use in headers/toolbars
export function ThemeToggleButton({
  showLabel = false,
}: {
  showLabel?: boolean;
}) {
  const { theme, toggleTheme } = useThemeContext();

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle-btn"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Current: ${theme} theme - Click to switch`}
    >
      {theme === "dark" ? <FiSun size={18} /> : <FiMoon size={18} />}
      {showLabel && <span>{theme === "dark" ? "Light" : "Dark"}</span>}
    </button>
  );
}
