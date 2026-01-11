"use client";

import { Streamdown } from "streamdown";
import { useState, useEffect } from "react";

interface StreamdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

export function StreamdownRenderer({
  content,
  isStreaming = false,
}: StreamdownRendererProps) {
  const [displayedContent, setDisplayedContent] = useState(
    isStreaming ? "" : content
  );

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedContent(content);
      return;
    }

    // Check if content was reset (e.g. new message or error retry)
    if (content.length < displayedContent.length) {
      setDisplayedContent(content);
      return;
    }

    const interval = setInterval(() => {
      setDisplayedContent((current: string) => {
        if (current.length >= content.length) {
          return current;
        }

        const remaining = content.length - current.length;
        // Speed up if we fall too far behind
        const step = remaining > 50 ? 5 : remaining > 20 ? 2 : 1;

        return content.slice(0, current.length + step);
      });
    }, 15); // Update every 15ms for smooth 60fps-ish feel

    return () => clearInterval(interval);
  }, [content, isStreaming]);

  return (
    <div className="streamdown-wrapper">
      <Streamdown
        mode={isStreaming ? "streaming" : "static"}
        shikiTheme={["one-dark-pro", "one-dark-pro"]}
      >
        {isStreaming ? displayedContent : content}
      </Streamdown>
    </div>
  );
}
