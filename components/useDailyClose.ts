"use client";

import { useEffect, useState } from "react";
import { closeDate, nextCloseDelay, nextUsRefreshDelay, usRefreshDate } from "@/lib/market/daily-close";

/** Refresh once per close boundary; catch up when returning from sleep. */
export function useDailyClose(includeUs = false) {
  const key = () => includeUs ? `${closeDate()}/${usRefreshDate()}` : closeDate();
  const [date, setDate] = useState(key);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      clearTimeout(timer);
      setDate(includeUs ? `${closeDate()}/${usRefreshDate()}` : closeDate());
      const delay = includeUs ? Math.min(nextCloseDelay(), nextUsRefreshDelay()) : nextCloseDelay();
      timer = setTimeout(schedule, delay + 1000);
    }
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [includeUs]);
  return date;
}
