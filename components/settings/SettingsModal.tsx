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
  FiKey,
  FiMessageSquare,
} from "react-icons/fi";
import { SiOpenai, SiGoogle } from "react-icons/si";
import { parseCookiesFromJSON } from "@/lib/storage";

interface SettingsModalProps {
  onClose: () => void;
}

type SettingsTab = "cookies" | "instructions";

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const {
    cookieConfigs,
    systemInstructions,
    setCookies,
    setSystemInstructions,
    testConnection,
    sessions,
  } = useChatContext();

  const [activeProvider, setActiveProvider] = useState<LLMProvider>("chatgpt");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("cookies");
  const [jsonInput, setJsonInput] = useState("");
  const [instructionsInput, setInstructionsInput] = useState(
    systemInstructions["chatgpt"]?.instructions || "",
  );
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [applyingInstructions, setApplyingInstructions] = useState(false);
  const [instructionsSuccess, setInstructionsSuccess] = useState(false);

  const providerConfig = PROVIDERS[activeProvider];
  const currentCookies = cookieConfigs[activeProvider]?.cookies || [];
  const session = sessions[activeProvider];
  const currentInstructions =
    systemInstructions[activeProvider]?.instructions || "";

  // Check if provider supports system instructions (ChatGPT, Claude, Gemini, Grok, and Qwen)
  const supportsInstructions =
    activeProvider === "chatgpt" ||
    activeProvider === "claude" ||
    activeProvider === "gemini" ||
    activeProvider === "grok" ||
    activeProvider === "qwen";

  const handleProviderChange = (provider: LLMProvider) => {
    setActiveProvider(provider);
    setJsonInput("");
    setInstructionsInput(systemInstructions[provider]?.instructions || "");
    setError(null);
    setInstructionsSuccess(false);
  };

  const handleSaveCookies = () => {
    if (!jsonInput.trim()) {
      setError("Please enter cookie JSON");
      return;
    }

    const result = parseCookiesFromJSON(jsonInput);
    if (!result.success) {
      setError(result.error || "Invalid JSON");
      return;
    }

    setCookies(activeProvider, result.cookies as CookieEntry[]);
    setJsonInput("");
    setError(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setError(null);

    const success = await testConnection(activeProvider);

    if (!success) {
      setError("Connection test failed. Check your cookies.");
    }

    setTesting(false);
  };

  const handleClearCookies = () => {
    setCookies(activeProvider, []);
    setJsonInput("");
    setError(null);
  };

  const handleApplyInstructions = async () => {
    if (!instructionsInput.trim()) {
      setError("Please enter system instructions");
      return;
    }

    setApplyingInstructions(true);
    setError(null);
    setInstructionsSuccess(false);

    try {
      const cookies = cookieConfigs[activeProvider]?.cookies || [];

      const response = await fetch("/api/settings/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: activeProvider,
          instructions: instructionsInput.trim(),
          cookies,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSystemInstructions(activeProvider, instructionsInput.trim());
        setInstructionsSuccess(true);
        setTimeout(() => setInstructionsSuccess(false), 3000);
      } else {
        setError(data.error || "Failed to apply instructions");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setApplyingInstructions(false);
    }
  };

  const handleClearInstructions = async () => {
    setApplyingInstructions(true);
    setError(null);

    try {
      const cookies = cookieConfigs[activeProvider]?.cookies || [];

      // Call API with empty instructions to trigger delete
      const response = await fetch("/api/settings/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: activeProvider,
          instructions: "", // Empty string triggers delete all
          cookies,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setInstructionsInput("");
        setSystemInstructions(activeProvider, "");
        setInstructionsSuccess(true);
        setTimeout(() => setInstructionsSuccess(false), 3000);
      } else {
        setError(data.error || "Failed to clear instructions");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setApplyingInstructions(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal settings-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Settings</h2>
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
                  activeProvider === provider ? "active" : ""
                }`}
                onClick={() => handleProviderChange(provider)}
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

        {/* Settings Type Tabs */}
        <div className="settings-type-tabs">
          <button
            className={`settings-type-tab ${
              settingsTab === "cookies" ? "active" : ""
            }`}
            onClick={() => {
              setSettingsTab("cookies");
              setError(null);
            }}
          >
            <FiKey size={16} />
            <span>Cookies</span>
          </button>
          <button
            className={`settings-type-tab ${
              settingsTab === "instructions" ? "active" : ""
            }`}
            onClick={() => {
              setSettingsTab("instructions");
              setError(null);
            }}
            disabled={!supportsInstructions}
            title={
              !supportsInstructions
                ? "System instructions not yet supported for this provider"
                : undefined
            }
          >
            <FiMessageSquare size={16} />
            <span>System Instructions</span>
            {!supportsInstructions && (
              <span className="coming-soon-badge">Soon</span>
            )}
          </button>
        </div>

        <div className="modal-content">
          {/* Cookies Tab */}
          {settingsTab === "cookies" && (
            <>
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
                  <button className="clear-btn" onClick={handleClearCookies}>
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
                  onClick={handleSaveCookies}
                  disabled={!jsonInput.trim()}
                >
                  Save Cookies
                </button>
              </div>
            </>
          )}

          {/* System Instructions Tab */}
          {settingsTab === "instructions" && (
            <>
              {supportsInstructions ? (
                <>
                  {/* Instructions Info */}
                  <div className="instructions">
                    <div className="instruction-header">
                      <FiHelpCircle size={16} />
                      <span>About System Instructions</span>
                    </div>
                    <p>
                      System instructions let you customize how{" "}
                      {providerConfig.name} responds. These will be applied to
                      your ChatGPT account&apos;s &quot;Custom
                      instructions&quot; in the Personalization settings.
                    </p>
                  </div>

                  {/* Current Status */}
                  {currentInstructions && (
                    <div className="cookie-status">
                      <div className="status-badge connected">
                        <FiCheck size={14} />
                        <span>Instructions saved</span>
                      </div>
                      <button
                        className="clear-btn"
                        onClick={handleClearInstructions}
                        disabled={applyingInstructions}
                      >
                        {applyingInstructions ? "Clearing..." : "Clear"}
                      </button>
                    </div>
                  )}

                  {/* Instructions Input */}
                  <div className="input-group">
                    <label>Custom Instructions</label>
                    <textarea
                      className="cookie-input instructions-input"
                      value={instructionsInput}
                      onChange={(e) => setInstructionsInput(e.target.value)}
                      placeholder="Enter your custom instructions for how ChatGPT should respond. For example:

• You are professional, speaking in Hinglish as spoken in Delhi streets.
• Always provide concise answers.
• Use code examples when relevant."
                      rows={10}
                    />
                  </div>

                  {/* Success Message */}
                  {instructionsSuccess && (
                    <div className="success-message">
                      <FiCheck size={14} />
                      <span>Instructions applied successfully!</span>
                    </div>
                  )}

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
                    <button
                      className="primary-btn"
                      onClick={handleApplyInstructions}
                      disabled={
                        !instructionsInput.trim() || applyingInstructions
                      }
                    >
                      {applyingInstructions ? (
                        <>
                          <FiLoader size={14} className="spin" />
                          <span>Applying...</span>
                        </>
                      ) : (
                        "Apply Instructions"
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="coming-soon-container">
                  <FiMessageSquare size={48} />
                  <h3>Coming Soon</h3>
                  <p>
                    System instructions for {providerConfig.name} are not yet
                    supported. We&apos;re starting with ChatGPT and will add
                    support for other providers soon.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
