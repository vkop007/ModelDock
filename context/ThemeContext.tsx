"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = "llm-chat-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;

    if (stored) {
      setThemeState(stored);
    } else {
      // Check system preference
      const prefersLight = window.matchMedia(
        "(prefers-color-scheme: light)",
      ).matches;
      setThemeState(prefersLight ? "light" : "dark");
    }

    setIsInitialized(true);
  }, []);

  // Apply theme to document
  useEffect(() => {
    if (!isInitialized) return;

    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, isInitialized]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  // Prevent flash of wrong theme
  useEffect(() => {
    if (isInitialized) {
      document.documentElement.style.visibility = "visible";
    } else {
      document.documentElement.style.visibility = "hidden";
    }
  }, [isInitialized]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeContext must be used within a ThemeProvider");
  }
  return context;
}
