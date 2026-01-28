import { useState, useEffect } from "react";
import { getRelativeTime } from "@/lib/utils/time";

/**
 * A hook that returns the relative time string for a given timestamp,
 * with smart update intervals based on how old the timestamp is.
 *
 * - Less than 1 minute: Updates every 10 seconds
 * - Less than 1 hour: Updates every minute
 * - Less than 24 hours: Updates every hour
 * - Older: Updates once a day (effectively static for the session)
 */
export function useSmartRelativeTime(timestamp: number | string | Date) {
  const timestampNum = new Date(timestamp).getTime();
  const [relativeTime, setRelativeTime] = useState(() =>
    getRelativeTime(timestampNum),
  );

  useEffect(() => {
    const calculateDelay = () => {
      const now = Date.now();
      const diffInSeconds = Math.floor((now - timestampNum) / 1000);

      if (diffInSeconds < 60) {
        return 10 * 1000; // Update every 10s if less than a minute old
      } else if (diffInSeconds < 3600) {
        return 60 * 1000; // Update every minute if less than an hour old
      } else if (diffInSeconds < 86400) {
        return 3600 * 1000; // Update every hour if less than a day old
      } else {
        return 86400 * 1000; // Update daily (effectively never for this session)
      }
    };

    const update = () => {
      setRelativeTime(getRelativeTime(timestampNum));
    };

    // Initial update to ensure consistency
    update();

    let timeoutId: NodeJS.Timeout;

    const scheduleUpdate = () => {
      const delay = calculateDelay();
      timeoutId = setTimeout(() => {
        update();
        scheduleUpdate(); // Re-schedule with potentially new delay interval
      }, delay);
    };

    scheduleUpdate();

    return () => clearTimeout(timeoutId);
  }, [timestamp]);

  return relativeTime;
}
