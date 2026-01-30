"use client";

import { useEffect, useState } from "react";

interface StreamingStatsProps {
  charsReceived: number;
  startTime: number;
  isActive: boolean;
}

export default function StreamingStats({
  charsReceived,
  startTime,
  isActive,
}: StreamingStatsProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (!isActive || !startTime) return;

    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 100);

    return () => clearInterval(interval);
  }, [isActive, startTime]);

  useEffect(() => {
    if (!isActive) {
      setElapsedTime(0);
    }
  }, [isActive]);

  if (!isActive || charsReceived === 0) {
    return null;
  }

  const seconds = elapsedTime / 1000;
  const charsPerSecond = seconds > 0 ? Math.round(charsReceived / seconds) : 0;

  return (
    <div className="streaming-stats">
      <span className="stat-item">
        <span className="stat-value">{charsReceived}</span>
        <span className="stat-label">chars</span>
      </span>
      <span className="stat-divider">•</span>
      <span className="stat-item">
        <span className="stat-value">{seconds.toFixed(1)}s</span>
      </span>
      <span className="stat-divider">•</span>
      <span className="stat-item">
        <span className="stat-value">{charsPerSecond}</span>
        <span className="stat-label">chars/s</span>
      </span>
    </div>
  );
}
