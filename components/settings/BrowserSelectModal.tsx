"use client";

import { useState, useEffect } from "react";
import {
  FiCheck,
  FiLoader,
  FiX,
  FiChevronRight,
  FiGlobe,
} from "react-icons/fi";
import {
  SiGooglechrome,
  SiBrave,
  SiVivaldi,
  SiOpera,
  SiFirefox,
} from "react-icons/si";

interface DetectedBrowser {
  id: string;
  name: string;
  installed: boolean;
  cookiePath: string;
  icon: string;
}

interface BrowserSelectModalProps {
  onClose: () => void;
  onImportComplete: (results: Record<string, any[]>) => void;
}

// Browser icon mapping
function getBrowserIcon(icon: string, size: number = 24) {
  switch (icon) {
    case "chrome":
      return <SiGooglechrome size={size} />;
    case "edge":
      return (
        <span
          style={{
            fontSize: size * 0.8,
            fontWeight: "bold",
            fontFamily: "system-ui",
            color: "#0078D4",
          }}
        >
          E
        </span>
      );
    case "brave":
      return <SiBrave size={size} />;
    case "vivaldi":
      return <SiVivaldi size={size} />;
    case "opera":
      return <SiOpera size={size} />;
    case "firefox":
      return <SiFirefox size={size} />;
    case "arc":
      return (
        <span
          style={{
            fontSize: size,
            fontWeight: "bold",
            fontFamily: "system-ui",
          }}
        >
          A
        </span>
      );
    case "chromium":
      return <SiGooglechrome size={size} style={{ opacity: 0.7 }} />;
    default:
      return <FiGlobe size={size} />;
  }
}

// Browser color mapping
function getBrowserColor(icon: string): string {
  switch (icon) {
    case "chrome":
      return "#4285F4";
    case "edge":
      return "#0078D4";
    case "brave":
      return "#FB542B";
    case "vivaldi":
      return "#EF3939";
    case "opera":
      return "#FF1B2D";
    case "arc":
      return "#7B61FF";
    case "chromium":
      return "#4587F4";
    case "firefox":
      return "#FF7139";
    default:
      return "#888";
  }
}

export default function BrowserSelectModal({
  onClose,
  onImportComplete,
}: BrowserSelectModalProps) {
  const [browsers, setBrowsers] = useState<DetectedBrowser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBrowser, setSelectedBrowser] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect browsers on mount
  useEffect(() => {
    async function detectBrowsers() {
      try {
        const res = await fetch("/api/browsers/detect");
        const data = await res.json();

        if (data.success && data.browsers) {
          setBrowsers(data.browsers);
          // Auto-select first browser if only one
          if (data.browsers.length === 1) {
            setSelectedBrowser(data.browsers[0].id);
          }
        } else {
          setError("Failed to detect browsers");
        }
      } catch (e) {
        setError("Error detecting browsers");
      } finally {
        setLoading(false);
      }
    }

    detectBrowsers();
  }, []);

  const handleImport = async () => {
    if (!selectedBrowser) return;

    setImporting(true);
    setError(null);

    try {
      const res = await fetch("/api/cookies/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "all", browser: selectedBrowser }),
      });
      const data = await res.json();

      if (data.success && data.cookies) {
        onImportComplete(data.cookies);
        onClose();
      } else {
        setError(data.error || "Failed to import cookies");
      }
    } catch (e) {
      setError("Error importing cookies");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="browser-select-overlay" onClick={onClose}>
      <div
        className="browser-select-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="header-content">
            <h2>Select Your Browser</h2>
            <p className="subtitle">
              Choose which browser to import cookies from
            </p>
          </div>
          <button className="close-btn" onClick={onClose}>
            <FiX size={20} />
          </button>
        </div>

        <div className="modal-content">
          {loading ? (
            <div className="loading-state">
              <FiLoader className="spin" size={32} />
              <span>Detecting installed browsers...</span>
            </div>
          ) : browsers.length === 0 ? (
            <div className="empty-state">
              <FiGlobe size={48} />
              <h3>No Browsers Found</h3>
              <p>
                Could not detect any Chromium-based browsers. Please make sure
                you have Chrome, Edge, Brave, or another Chromium browser
                installed.
              </p>
            </div>
          ) : (
            <div className="browser-grid">
              {browsers.map((browser) => (
                <button
                  key={browser.id}
                  className={`browser-card ${
                    selectedBrowser === browser.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedBrowser(browser.id)}
                  style={
                    {
                      "--browser-color": getBrowserColor(browser.icon),
                    } as React.CSSProperties
                  }
                >
                  <div className="browser-icon">
                    {getBrowserIcon(browser.icon, 32)}
                  </div>
                  <div className="browser-info">
                    <span className="browser-name">{browser.name}</span>
                    <span className="browser-status">Ready to import</span>
                  </div>
                  {selectedBrowser === browser.id && (
                    <div className="check-icon">
                      <FiCheck size={18} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="error-message">
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="import-btn"
            onClick={handleImport}
            disabled={!selectedBrowser || importing}
          >
            {importing ? (
              <>
                <FiLoader className="spin" size={16} />
                <span>Importing...</span>
              </>
            ) : (
              <>
                <span>Import All Cookies</span>
                <FiChevronRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>

      <style jsx>{`
        .browser-select-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          backdrop-filter: blur(4px);
          animation: fadeIn 0.2s ease-out;
        }

        .browser-select-modal {
          background: linear-gradient(180deg, #1e1e1e 0%, #161616 100%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          width: 480px;
          max-width: 90vw;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow:
            0 20px 50px rgba(0, 0, 0, 0.5),
            0 0 0 1px rgba(255, 255, 255, 0.05);
          animation: slideUp 0.3s ease-out;
        }

        .modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 24px 24px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .header-content h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #fff;
        }

        .subtitle {
          margin: 4px 0 0;
          font-size: 14px;
          color: #888;
        }

        .close-btn {
          background: rgba(255, 255, 255, 0.05);
          border: none;
          border-radius: 8px;
          padding: 8px;
          color: #888;
          cursor: pointer;
          transition: all 0.2s;
        }

        .close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .modal-content {
          flex: 1;
          padding: 20px 24px;
          overflow-y: auto;
        }

        .loading-state,
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 40px 20px;
          text-align: center;
          color: #888;
        }

        .empty-state h3 {
          margin: 8px 0 0;
          color: #ddd;
        }

        .empty-state p {
          margin: 0;
          font-size: 14px;
          line-height: 1.5;
        }

        .browser-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .browser-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .browser-card:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.12);
        }

        .browser-card.selected {
          background: rgba(16, 185, 129, 0.1);
          border-color: #10b981;
          box-shadow: 0 0 0 1px #10b981;
        }

        .browser-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          color: var(--browser-color);
        }

        .browser-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .browser-name {
          font-size: 15px;
          font-weight: 500;
          color: #fff;
        }

        .browser-status {
          font-size: 13px;
          color: #888;
        }

        .check-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background: #10b981;
          border-radius: 50%;
          color: #fff;
        }

        .error-message {
          margin-top: 16px;
          padding: 12px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: #ef4444;
          font-size: 14px;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.2);
        }

        .cancel-btn {
          padding: 10px 20px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #ccc;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cancel-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .import-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border: none;
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .import-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        }

        .import-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
