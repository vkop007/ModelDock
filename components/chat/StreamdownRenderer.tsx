"use client";

import { Streamdown } from "streamdown";

interface StreamdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

export function StreamdownRenderer({
  content,
  isStreaming = false,
}: StreamdownRendererProps) {
  return (
    <div className="streamdown-wrapper">
      <Streamdown
        mode={isStreaming ? "streaming" : "static"}
        shikiTheme={["one-dark-pro", "one-dark-pro"]}
      >
        {content}
      </Streamdown>
    </div>
  );
}
