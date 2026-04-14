"use client";

import { useEffect, useState } from "react";

// Animated count-up per DESIGN_SYSTEM.md Section 16. 50 steps over
// `duration` ms, starts after `delay` ms. Returns 0 until the timer
// fires so the UI can render the "before" state immediately.
export function useCountUp(target: number, duration = 1200, delay = 800): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(target) || target === 0) {
      setValue(target || 0);
      return;
    }
    const steps = 50;
    const inc = target / steps;
    let cur = 0;
    let interval: ReturnType<typeof setInterval> | null = null;
    const timeout = setTimeout(() => {
      interval = setInterval(() => {
        cur += inc;
        if ((inc >= 0 && cur >= target) || (inc < 0 && cur <= target)) {
          cur = target;
          if (interval) clearInterval(interval);
        }
        setValue(Math.round(cur * 100) / 100);
      }, duration / steps);
    }, delay);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [target, duration, delay]);

  return value;
}
