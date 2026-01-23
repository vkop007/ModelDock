"use client";

import { Streamdown } from "streamdown";
import { useState, useEffect, useRef } from "react";

interface StreamdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

export function StreamdownRenderer({
  content,
  isStreaming = false,
}: StreamdownRendererProps) {
  const [displayedContent, setDisplayedContent] = useState(
    isStreaming ? "" : content,
  );
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

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

    // Use requestAnimationFrame for smoother animation
    const animate = (timestamp: number) => {
      // Throttle to ~60fps (roughly every 16ms)
      if (timestamp - lastUpdateRef.current < 12) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      lastUpdateRef.current = timestamp;

      setDisplayedContent((current: string) => {
        if (current.length >= content.length) {
          return current;
        }

        const remaining = content.length - current.length;

        // Adaptive step size for natural feel:
        // - Large gaps: catch up quickly (code blocks, etc)
        // - Small gaps: slow reveal for conversational text
        let step = 1;
        if (remaining > 100) {
          step = Math.min(remaining / 10, 20); // Rapid catch-up
        } else if (remaining > 50) {
          step = 3;
        } else if (remaining > 20) {
          step = 2;
        }

        return content.slice(0, current.length + Math.ceil(step));
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [content, isStreaming]);

  // Sync displayed content when streaming ends
  useEffect(() => {
    if (!isStreaming && displayedContent !== content) {
      setDisplayedContent(content);
    }
  }, [isStreaming, content, displayedContent]);

  return (
    <div className="streamdown-wrapper">
      <Streamdown
        mode={isStreaming ? "streaming" : "static"}
        shikiTheme={["github-dark", "github-light"]}
      >
        {isStreaming ? displayedContent : content}
      </Streamdown>
    </div>
  );
}
