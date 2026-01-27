"use client";

import { useChatContext } from "@/context/ChatContext";
import { PROVIDERS, LLMProvider, CookieEntry } from "@/types";
import { useState } from "react";
import {
  FiX,
  FiCheck,
  FiLoader,
  FiAlertCircle,
  FiHelpCircle,
} from "react-icons/fi";
import { SiOpenai, SiGoogle } from "react-icons/si";
import { parseCookiesFromJSON } from "@/lib/storage";

interface CookieModalProps {
  onClose: () => void;
}

export default function CookieModal({ onClose }: CookieModalProps) {
  const { cookieConfigs, setCookies, testConnection, sessions } =
    useChatContext();
  const [activeTab, setActiveTab] = useState<LLMProvider>("chatgpt");
  const [jsonInput, setJsonInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const providerConfig = PROVIDERS[activeTab];
  const currentCookies = cookieConfigs[activeTab]?.cookies || [];
  const session = sessions[activeTab];

  const handleTabChange = (provider: LLMProvider) => {
    setActiveTab(provider);
    setJsonInput("");
    setError(null);
  };

  const handleSave = () => {
    if (!jsonInput.trim()) {
      setError("Please enter cookie JSON");
      return;
    }

    const result = parseCookiesFromJSON(jsonInput);
    if (!result.success) {
      setError(result.error || "Invalid JSON");
      return;
    }

    setCookies(activeTab, result.cookies as CookieEntry[]);
    setJsonInput("");
    setError(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setError(null);

    const success = await testConnection(activeTab);

    if (!success) {
      setError("Connection test failed. Check your cookies.");
    }

    setTesting(false);
  };

  const handleClear = () => {
    setCookies(activeTab, []);
    setJsonInput("");
    setError(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Configure Cookies</h2>
          <button className="close-btn" onClick={onClose}>
            <FiX size={20} />
          </button>
        </div>

        {/* Provider Tabs */}
        <div className="modal-tabs">
          {(Object.keys(PROVIDERS) as LLMProvider[]).map((provider) => {
            const config = PROVIDERS[provider];
            const hasCookies =
              (cookieConfigs[provider]?.cookies?.length ?? 0) > 0;

            return (
              <button
                key={provider}
                className={`modal-tab ${
                  activeTab === provider ? "active" : ""
                }`}
                onClick={() => handleTabChange(provider)}
                style={{ "--tab-color": config.color } as React.CSSProperties}
              >
                {provider === "chatgpt" && <SiOpenai size={16} />}
                {provider === "gemini" && <SiGoogle size={16} />}
                {provider === "claude" && (
                  <span style={{ fontWeight: "bold" }}>A</span>
                )}
                <span>{config.name}</span>
                {hasCookies && <FiCheck size={14} className="tab-check" />}
              </button>
            );
          })}
        </div>

        <div className="modal-content">
          {/* Instructions */}
          <div className="instructions">
            <div className="instruction-header">
              <FiHelpCircle size={16} />
              <span>How to get cookies</span>
            </div>
            <ol>
              <li>
                Open{" "}
                <a
                  href={providerConfig.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {providerConfig.url}
                </a>{" "}
                in your browser
              </li>
              <li>Sign in to your account</li>
              <li>Open Developer Tools (F12) → Application → Cookies</li>
              <li>
                Right-click and copy all cookies as JSON, or export using an
                extension
              </li>
              <li>Paste the JSON below</li>
            </ol>
          </div>

          {/* Current Status */}
          {currentCookies.length > 0 && (
            <div className="cookie-status">
              <div
                className={`status-badge ${
                  session.isConnected ? "connected" : "disconnected"
                }`}
              >
                {session.isConnected ? (
                  <>
                    <FiCheck size={14} />
                    <span>Connected</span>
                  </>
                ) : (
                  <>
                    <FiAlertCircle size={14} />
                    <span>Not tested</span>
                  </>
                )}
              </div>
              <span className="cookie-count">
                {currentCookies.length} cookies saved
              </span>
              <button className="clear-btn" onClick={handleClear}>
                Clear
              </button>
            </div>
          )}

          {/* JSON Input */}
          <div className="input-group">
            <label>Cookie JSON</label>
            <textarea
              className="cookie-input"
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder='Paste your cookies JSON here, e.g.:
[
  {"name": "session", "value": "abc123", "domain": ".openai.com"},
  ...
]'
              rows={8}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="error-message">
              <FiAlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="modal-actions">
            <button className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
            {currentCookies.length > 0 && (
              <button
                className="secondary-btn"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? (
                  <FiLoader size={14} className="spin" />
                ) : (
                  "Test Connection"
                )}
              </button>
            )}
            <button
              className="primary-btn"
              onClick={handleSave}
              disabled={!jsonInput.trim()}
            >
              Save Cookies
            </button>
            <button
              className="secondary-btn"
              onClick={async () => {
                try {
                  setTesting(true);
                  const res = await fetch("/api/cookies/import", {
                    method: "POST",
                    body: JSON.stringify({ provider: activeTab }),
                  });
                  const data = await res.json();
                  if (data.success && data.cookies) {
                    setCookies(activeTab, data.cookies);
                    setError(null);
                    alert(`Successfully imported cookies for ${activeTab}`);
                  } else {
                    setError(data.error || "Failed to import");
                  }
                } catch (e) {
                  setError(String(e));
                } finally {
                  setTesting(false);
                }
              }}
              disabled={testing}
              title="Try to import cookies from default Chrome browser"
              style={{ marginLeft: "8px" }}
            >
              Import from Chrome
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
