"use client";

import { useChatContext } from "@/context/ChatContext";
import { useVoiceSettings } from "@/context/VoiceContext";
import { PROVIDERS, LLMProvider, CookieEntry } from "@/types";
import { useState, useEffect } from "react";
import {
  FiX,
  FiCheck,
  FiLoader,
  FiAlertCircle,
  FiHelpCircle,
  FiKey,
  FiMessageSquare,
  FiMic,
  FiVolume2,
  FiVolumeX,
  FiPlay,
  FiSettings,
} from "react-icons/fi";
import { SiOpenai, SiGoogle } from "react-icons/si";
import { parseCookiesFromJSON } from "@/lib/storage";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";

interface SettingsModalProps {
  onClose: () => void;
}

type SettingsTab = "cookies" | "instructions" | "voice";

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const {
    cookieConfigs,
    systemInstructions,
    setCookies,
    setSystemInstructions,
    testConnection,
    sessions,
  } = useChatContext();

  const {
    // Speech Recognition Settings
    speechRecognitionEnabled,
    setSpeechRecognitionEnabled,
    speechRecognitionLanguage,
    setSpeechRecognitionLanguage,
    // Text-to-Speech Settings
    textToSpeechEnabled,
    setTextToSpeechEnabled,
    textToSpeechAutoPlay,
    setTextToSpeechAutoPlay,
    textToSpeechVoiceURI,
    setTextToSpeechVoiceURI,
    textToSpeechRate,
    setTextToSpeechRate,
    textToSpeechPitch,
    setTextToSpeechPitch,
    textToSpeechVolume,
    setTextToSpeechVolume,
    resetToDefaults,
  } = useVoiceSettings();

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

  // TTS for voice preview
  const {
    isSupported: isTTSSupported,
    voices,
    speak,
    stop,
  } = useTextToSpeech();

  // Listen for Escape key to close modal
  useEffect(() => {
    const handleCloseModals = () => onClose();
    window.addEventListener("close-all-modals", handleCloseModals);
    return () =>
      window.removeEventListener("close-all-modals", handleCloseModals);
  }, [onClose]);

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

  const handleVoicePreview = () => {
    if (!isTTSSupported) return;
    speak("This is a preview of the text-to-speech voice.", "preview");
  };

  // Language options for speech recognition
  const languageOptions = [
    { code: "en-US", label: "English (US)" },
    { code: "en-GB", label: "English (UK)" },
    { code: "es-ES", label: "Spanish" },
    { code: "fr-FR", label: "French" },
    { code: "de-DE", label: "German" },
    { code: "it-IT", label: "Italian" },
    { code: "pt-BR", label: "Portuguese (Brazil)" },
    { code: "zh-CN", label: "Chinese (Simplified)" },
    { code: "zh-TW", label: "Chinese (Traditional)" },
    { code: "ja-JP", label: "Japanese" },
    { code: "ko-KR", label: "Korean" },
    { code: "ru-RU", label: "Russian" },
    { code: "hi-IN", label: "Hindi" },
  ];

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
                } ${settingsTab === "voice" ? "voice-tab" : ""}`}
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
            <span>Instructions</span>
            {!supportsInstructions && (
              <span className="coming-soon-badge">Soon</span>
            )}
          </button>
          <button
            className={`settings-type-tab ${
              settingsTab === "voice" ? "active" : ""
            }`}
            onClick={() => {
              setSettingsTab("voice");
              setError(null);
            }}
          >
            <FiMic size={16} />
            <span>Voice</span>
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
                      your ChatGPT account's "Custom instructions" in the
                      Personalization settings.
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
                    supported. We're starting with ChatGPT and will add support
                    for other providers soon.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Voice Settings Tab */}
          {settingsTab === "voice" && (
            <>
              {/* Speech Recognition Section */}
              <div className="voice-section">
                <div className="voice-section-header">
                  <FiMic size={20} />
                  <h3>Speech Recognition</h3>
                </div>

                <div className="setting-row">
                  <div className="setting-label">
                    <span>Enable Voice Input</span>
                    <span className="setting-description">
                      Use microphone to speak your messages
                    </span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={speechRecognitionEnabled}
                      onChange={(e) =>
                        setSpeechRecognitionEnabled(e.target.checked)
                      }
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="setting-row">
                  <div className="setting-label">
                    <span>Language</span>
                    <span className="setting-description">
                      Select your speaking language
                    </span>
                  </div>
                  <select
                    className="select-input"
                    value={speechRecognitionLanguage}
                    onChange={(e) =>
                      setSpeechRecognitionLanguage(e.target.value)
                    }
                  >
                    {languageOptions.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Text-to-Speech Section */}
              <div className="voice-section">
                <div className="voice-section-header">
                  <FiVolume2 size={20} />
                  <h3>Text-to-Speech</h3>
                </div>

                <div className="setting-row">
                  <div className="setting-label">
                    <span>Enable TTS</span>
                    <span className="setting-description">
                      Read AI responses aloud
                    </span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={textToSpeechEnabled}
                      onChange={(e) => setTextToSpeechEnabled(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="setting-row">
                  <div className="setting-label">
                    <span>Auto-play Responses</span>
                    <span className="setting-description">
                      Automatically read AI responses when received
                    </span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={textToSpeechAutoPlay}
                      onChange={(e) =>
                        setTextToSpeechAutoPlay(e.target.checked)
                      }
                      disabled={!textToSpeechEnabled}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {isTTSSupported && voices.length > 0 && (
                  <div className="setting-row">
                    <div className="setting-label">
                      <span>Voice</span>
                      <span className="setting-description">
                        Select a voice for TTS
                      </span>
                    </div>
                    <select
                      className="select-input"
                      value={textToSpeechVoiceURI || ""}
                      onChange={(e) =>
                        setTextToSpeechVoiceURI(e.target.value || null)
                      }
                      disabled={!textToSpeechEnabled}
                    >
                      <option value="">Default</option>
                      {voices.map((voice) => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name} ({voice.lang})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Voice Preview */}
                {isTTSSupported && (
                  <div className="setting-row">
                    <div className="setting-label">
                      <span>Preview</span>
                      <span className="setting-description">
                        Test your voice settings
                      </span>
                    </div>
                    <button
                      className="secondary-btn"
                      onClick={handleVoicePreview}
                      disabled={!textToSpeechEnabled}
                    >
                      <FiPlay size={14} />
                      <span>Play Preview</span>
                    </button>
                  </div>
                )}

                {/* Rate Slider */}
                <div className="setting-row">
                  <div className="setting-label">
                    <span>Speed</span>
                    <span className="setting-description">
                      {textToSpeechRate.toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={textToSpeechRate}
                    onChange={(e) =>
                      setTextToSpeechRate(parseFloat(e.target.value))
                    }
                    className="range-input"
                    disabled={!textToSpeechEnabled}
                  />
                </div>

                {/* Pitch Slider */}
                <div className="setting-row">
                  <div className="setting-label">
                    <span>Pitch</span>
                    <span className="setting-description">
                      {textToSpeechPitch.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={textToSpeechPitch}
                    onChange={(e) =>
                      setTextToSpeechPitch(parseFloat(e.target.value))
                    }
                    className="range-input"
                    disabled={!textToSpeechEnabled}
                  />
                </div>

                {/* Volume Slider */}
                <div className="setting-row">
                  <div className="setting-label">
                    <span>Volume</span>
                    <span className="setting-description">
                      {Math.round(textToSpeechVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={textToSpeechVolume}
                    onChange={(e) =>
                      setTextToSpeechVolume(parseFloat(e.target.value))
                    }
                    className="range-input"
                    disabled={!textToSpeechEnabled}
                  />
                </div>
              </div>

              {/* Reset to Defaults */}
              <div className="modal-actions">
                <button className="secondary-btn" onClick={resetToDefaults}>
                  <FiSettings size={14} />
                  <span>Reset to Defaults</span>
                </button>
                <button className="primary-btn" onClick={onClose}>
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
