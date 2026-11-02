"use client";

import { useEffect, useState } from "react";
import { closeDate, nextCloseDelay } from "@/lib/market/daily-close";

/** 열린 화면도 다음 15:30에 한 번 갱신하고, 절전 복귀 때 누락된 갱신을 보충한다. */
export function useDailyClose() {
  const [date, setDate] = useState(() => closeDate());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      clearTimeout(timer);
      setDate(closeDate());
      timer = setTimeout(schedule, nextCloseDelay() + 1000);
    }
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, []);
  return date;
}
