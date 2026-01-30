"use client";

import { useChatContext } from "@/context/ChatContext";
import { useState, useEffect } from "react";
import {
  FiAlertCircle,
  FiCheck,
  FiLoader,
  FiX,
  FiChevronRight,
} from "react-icons/fi";
import { SiGoogle, SiOpenai } from "react-icons/si";
import { PROVIDERS } from "@/types";
import BrowserSelectModal from "./BrowserSelectModal";

export default function CookiePrompt() {
  const {
    activeProvider,
    showCookiePrompt,
    setShowCookiePrompt,
    setCookies,
    cookieConfigs,
  } = useChatContext();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBrowserSelect, setShowBrowserSelect] = useState(false);

  // Double check if we actually have cookies (in case they were added in background)
  useEffect(() => {
    if ((cookieConfigs[activeProvider]?.cookies?.length ?? 0) > 0) {
      if (showCookiePrompt) setShowCookiePrompt(false);
    }
  }, [cookieConfigs, activeProvider, showCookiePrompt, setShowCookiePrompt]);

  if (!showCookiePrompt) return null;

  if ((cookieConfigs[activeProvider]?.cookies?.length ?? 0) > 0) {
    return null;
  }

  const config = PROVIDERS[activeProvider];

  // Calculate all missing providers for display
  const missingProviders = (
    Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[]
  )
    .filter((p) => (cookieConfigs[p]?.cookies?.length ?? 0) === 0)
    .map((p) => PROVIDERS[p].name);

  // Format list: "ChatGPT, Gemini, and Claude"
  const missingString =
    missingProviders.length > 0
      ? missingProviders.length === 1
        ? missingProviders[0]
        : missingProviders.slice(0, -1).join(", ") +
          " and " +
          missingProviders[missingProviders.length - 1]
      : config.name;

  // Handle import complete from browser select modal
  const handleImportComplete = (results: Record<string, any[]>) => {
    Object.entries(results).forEach(([provider, cookies]) => {
      // @ts-ignore
      setCookies(provider as any, cookies as any);
    });
    setShowCookiePrompt(false);
    window.location.reload();
  };

  const handleSelectBrowser = () => {
    setShowBrowserSelect(true);
  };

  const handleDismiss = () => {
    setShowCookiePrompt(false);
  };

  return (
    <>
      {showBrowserSelect ? (
        <BrowserSelectModal
          onClose={() => setShowBrowserSelect(false)}
          onImportComplete={handleImportComplete}
        />
      ) : (
        <div className="cookie-prompt-overlay" onClick={handleDismiss}>
          <div
            className="cookie-prompt-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="prompt-header">
              <div className="prompt-title">
                <FiAlertCircle className="prompt-icon" />
                <span>Missing Cookies</span>
              </div>
              <button className="close-btn" onClick={handleDismiss}>
                <FiX />
              </button>
            </div>

            <div className="prompt-content">
              <p>
                No cookies found for <strong>{missingString}</strong>.
              </p>
              <p className="subtext">
                Import cookies from your browser to start chatting immediately.
              </p>

              {error && <div className="error-msg">{error}</div>}
            </div>

            <div className="prompt-actions">
              <button className="dismiss-btn" onClick={handleDismiss}>
                Dismiss
              </button>
              <button
                className="import-btn"
                onClick={handleSelectBrowser}
                style={{ backgroundColor: config.color }}
              >
                <span>Select Browser</span>
                <FiChevronRight size={16} />
              </button>
            </div>
          </div>

          <style jsx>{`
            .cookie-prompt-overlay {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background-color: rgba(0, 0, 0, 0.5);
              display: flex;
              align-items: center;
              justify-content: center;
              z-index: 9999;
              backdrop-filter: blur(2px);
            }

            .cookie-prompt-modal {
              background-color: #1a1a1a;
              border: 1px solid #333;
              border-radius: 12px;
              width: 400px;
              max-width: 90vw;
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
              overflow: hidden;
              animation: slideUp 0.3s ease-out;
            }

            .prompt-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 16px;
              border-bottom: 1px solid #333;
              background-color: #222;
            }

            .prompt-title {
              display: flex;
              align-items: center;
              gap: 10px;
              font-weight: 600;
              color: #fff;
            }

            .prompt-icon {
              color: #eab308;
              font-size: 20px;
            }

            .close-btn {
              background: none;
              border: none;
              color: #888;
              cursor: pointer;
              font-size: 18px;
              padding: 4px;
            }

            .close-btn:hover {
              color: #fff;
            }

            .prompt-content {
              padding: 20px;
              color: #ddd;
            }

            .subtext {
              font-size: 0.9em;
              color: #aaa;
              margin-top: 8px;
            }

            .error-msg {
              margin-top: 12px;
              color: #ef4444;
              font-size: 0.9em;
              background: rgba(239, 68, 68, 0.1);
              padding: 8px;
              border-radius: 4px;
            }

            .prompt-actions {
              padding: 16px;
              display: flex;
              justify-content: flex-end;
              gap: 12px;
              background-color: #222;
              border-top: 1px solid #333;
            }

            .dismiss-btn {
              background: transparent;
              border: 1px solid #444;
              color: #ccc;
              padding: 8px 16px;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
            }

            .dismiss-btn:hover {
              background: #333;
              color: #fff;
            }

            .import-btn {
              display: flex;
              align-items: center;
              gap: 8px;
              border: none;
              color: #fff;
              padding: 8px 16px;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
            }

            .import-btn:disabled {
              opacity: 0.7;
              cursor: not-allowed;
            }

            .spin {
              animation: spin 1s linear infinite;
            }

            @keyframes spin {
              from {
                transform: rotate(0deg);
              }
              to {
                transform: rotate(360deg);
              }
            }

            @keyframes slideUp {
              from {
                opacity: 0;
                transform: translateY(20px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
