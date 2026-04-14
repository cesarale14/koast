"use client";

import { useEffect, useRef } from "react";

interface DailyPoint {
  date: string;
  label: string;
  revenue: number;
}

interface RevenueChartProps {
  data: DailyPoint[];
  // Animation start delay from mount — matches the dashboard entrance
  // choreography (chart card appears at ~850ms, line draws at ~900ms).
  delay?: number;
}

// Animated, Canvas-drawn revenue chart per DESIGN_SYSTEM.md Section 16.
// Lagoon line (#1a7a5a) with gradient area fill, dry-sand grid lines,
// tideline labels. No chart library — all rAF. Redraws on resize.
export default function RevenueChart({ data, delay = 900 }: RevenueChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const hasRevenue = data.length > 0 && data.some((d) => d.revenue > 0);
    if (!hasRevenue) return;

    const DURATION = 1500;
    const MAX = Math.max(...data.map((d) => d.revenue), 1) * 1.1;
    const PAD_L = 44, PAD_R = 12, PAD_T = 14, PAD_B = 28;

    const render = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, rect.width * dpr);
      canvas.height = Math.max(1, rect.height * dpr);
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;
      const cw = w - PAD_L - PAD_R;
      const ch = h - PAD_T - PAD_B;

      const getX = (i: number) => PAD_L + (i / Math.max(1, data.length - 1)) * cw;
      const getY = (v: number) => PAD_T + ch - (v / MAX) * ch;

      const tick = (ts: number) => {
        if (startRef.current == null) startRef.current = ts + delay;
        const elapsed = ts - startRef.current;
        const progress = Math.max(0, Math.min(1, elapsed / DURATION));

        ctx.clearRect(0, 0, w, h);

        // Grid lines + y-axis labels
        ctx.strokeStyle = "#ede7db"; // dry-sand
        ctx.lineWidth = 0.5;
        ctx.font = "10px 'Plus Jakarta Sans', system-ui, sans-serif";
        ctx.fillStyle = "#3d6b52"; // tideline
        ctx.textAlign = "right";
        for (let i = 0; i < 5; i++) {
          const y = PAD_T + (ch / 4) * i;
          ctx.beginPath();
          ctx.moveTo(PAD_L, y);
          ctx.lineTo(w - PAD_R, y);
          ctx.stroke();
          const val = Math.round(MAX - (MAX / 4) * i);
          const label = val >= 1000 ? `$${(val / 1000).toFixed(0)}k` : `$${val}`;
          ctx.fillText(label, PAD_L - 6, y + 3);
        }

        // X-axis labels — five evenly spaced ticks
        ctx.textAlign = "center";
        const tickIdxs = [0, Math.floor(data.length * 0.25), Math.floor(data.length * 0.5), Math.floor(data.length * 0.75), data.length - 1];
        for (const i of tickIdxs) {
          if (i >= 0 && i < data.length) {
            ctx.fillText(data[i].label, getX(i), h - 10);
          }
        }

        const pts = Math.max(2, Math.floor(progress * data.length));

        if (pts >= 2) {
          // Area fill
          ctx.beginPath();
          ctx.moveTo(getX(0), getY(data[0].revenue));
          for (let i = 1; i < pts; i++) ctx.lineTo(getX(i), getY(data[i].revenue));
          ctx.lineTo(getX(pts - 1), PAD_T + ch);
          ctx.lineTo(getX(0), PAD_T + ch);
          ctx.closePath();
          const grad = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + ch);
          grad.addColorStop(0, "rgba(26,122,90,0.15)");
          grad.addColorStop(1, "rgba(26,122,90,0.01)");
          ctx.fillStyle = grad;
          ctx.fill();

          // Line
          ctx.beginPath();
          ctx.moveTo(getX(0), getY(data[0].revenue));
          for (let i = 1; i < pts; i++) ctx.lineTo(getX(i), getY(data[i].revenue));
          ctx.strokeStyle = "#1a7a5a"; // lagoon
          ctx.lineWidth = 2;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.stroke();

          // Leading dot — 4px lagoon fill with 2px white core
          const lastI = pts - 1;
          const dotX = getX(lastI);
          const dotY = getY(data[lastI].revenue);
          ctx.beginPath();
          ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#1a7a5a";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(dotX, dotY, 2, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
        }

        if (progress < 1) {
          frameRef.current = requestAnimationFrame(tick);
        }
      };

      startRef.current = null;
      frameRef.current = requestAnimationFrame(tick);
    };

    render();

    // Redraw on resize — Canvas needs a fresh coordinate space
    const onResize = () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      // Skip the entrance delay on resize — jump straight to end state
      startRef.current = null;
      render();
    };
    window.addEventListener("resize", onResize);

    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [data, delay]);

  const hasRevenue = data.length > 0 && data.some((d) => d.revenue > 0);
  if (!hasRevenue) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-tideline">Revenue data will appear once bookings sync</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
