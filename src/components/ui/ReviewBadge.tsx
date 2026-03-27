"use client";

import { useState, useEffect } from "react";

export default function ReviewBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const fetchReviewCount = async () => {
      try {
        const res = await fetch("/api/reviews/pending");
        const d = await res.json();
        setCount((d.needs_approval ?? 0) + (d.needs_review ?? 0));
      } catch {
        /* silent */
      }
    };
    fetchReviewCount();
    const interval = setInterval(fetchReviewCount, 60000);
    return () => clearInterval(interval);
  }, []);

  if (count === 0) return null;

  return (
    <span className="ml-auto px-1.5 py-0.5 text-[10px] bg-brand-500 text-white rounded-full font-medium">
      {count}
    </span>
  );
}
