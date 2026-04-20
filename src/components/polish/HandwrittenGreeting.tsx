"use client";

/**
 * HandwrittenGreeting — port of the Claude Design handoff component.
 *
 * Two lines of Fraunces with expressive axes ("opsz" 144, "SOFT" 100,
 * "WONK" 1) revealed left-to-right via a clip-path sweep. The effect
 * comes from clip-path + variable font axes giving Fraunces a hand-
 * lettered cadence at large sizes.
 *
 * Animation plays on every mount. `prefers-reduced-motion` users see
 * the final state instantly.
 */

import { useEffect, useRef, useState } from "react";

interface HandwrittenGreetingProps {
  timeOfDay: "morning" | "afternoon" | "evening";
  name: string;
  status: string;
  compact?: boolean;
}

// Explicitly target the Google Fonts @import family (loaded in
// globals.css) rather than the next/font CSS variable — the @import
// version exposes the opsz/SOFT/WONK axes required by the handoff.
const DISPLAY_BASE: React.CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontWeight: 400,
  fontVariationSettings: '"opsz" 144, "SOFT" 100, "WONK" 1',
  lineHeight: 1,
  whiteSpace: "nowrap",
  display: "inline-block",
};

function greetingPrefix(tod: "morning" | "afternoon" | "evening"): string {
  if (tod === "morning") return "Good morning";
  if (tod === "afternoon") return "Good afternoon";
  return "Good evening";
}

export default function HandwrittenGreeting({ timeOfDay, name, status, compact = false }: HandwrittenGreetingProps) {
  const line1 = `${greetingPrefix(timeOfDay)}, ${name}.`;
  const line2 = status;
  const line1Size = compact ? 34 : 72;
  const line2Size = compact ? 24 : 56;

  const [animate, setAnimate] = useState<boolean>(false);
  const [fontsReady, setFontsReady] = useState<boolean>(false);

  const l1Ref = useRef<HTMLDivElement | null>(null);
  const l2Ref = useRef<HTMLDivElement | null>(null);

  // First client render — decide whether to animate.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setAnimate(!reducedMotion);
  }, []);

  // Wait for Fraunces to load before priming the animation so the
  // clip rects size against the real glyph widths.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const fontFaceSet = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (fontFaceSet?.ready) {
      let cancelled = false;
      fontFaceSet.ready.then(() => {
        if (!cancelled) setFontsReady(true);
      });
      return () => {
        cancelled = true;
      };
    }
    setFontsReady(true);
  }, []);

  // Run the reveal animation when enabled + fonts loaded.
  useEffect(() => {
    if (!animate || !fontsReady) return;
    const l1 = l1Ref.current;
    const l2 = l2Ref.current;
    if (!l1 || !l2) return;

    // Prime clip positions.
    [l1, l2].forEach((el) => {
      el.style.transition = "none";
      el.style.clipPath = "inset(-15% 100% -15% 0)";
    });
    // Force reflow so the next frame picks up the primed styles.
    void l1.offsetWidth;

    const frame = requestAnimationFrame(() => {
      l1.style.transition = "clip-path 1.6s cubic-bezier(0.33, 1, 0.68, 1)";
      l1.style.clipPath = "inset(-15% 0% -15% 0)";
    });

    const t2 = window.setTimeout(() => {
      if (!l2) return;
      l2.style.transition = "clip-path 1.8s cubic-bezier(0.33, 1, 0.68, 1)";
      l2.style.clipPath = "inset(-15% 0% -15% 0)";
    }, 900);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(t2);
    };
  }, [animate, fontsReady]);

  // When animation is NOT running we render lines fully-visible so
  // SSR and reduced-motion both show the final state immediately.
  const restingClip = animate ? "inset(-15% 100% -15% 0)" : "inset(-15% 0% -15% 0)";

  return (
    <div style={{ paddingTop: 2 }} aria-label={`${line1} ${line2}`}>
      <div style={{ display: "inline-block", marginBottom: 4 }}>
        <div
          ref={l1Ref}
          style={{
            ...DISPLAY_BASE,
            fontSize: line1Size,
            letterSpacing: "-0.025em",
            color: "var(--deep-sea)",
            clipPath: restingClip,
          }}
        >
          {line1}
        </div>
      </div>
      <div style={{ display: "block" }}>
        <div style={{ display: "inline-block" }}>
          <div
            ref={l2Ref}
            style={{
              ...DISPLAY_BASE,
              fontStyle: "italic",
              fontSize: line2Size,
              letterSpacing: "-0.02em",
              color: "var(--tideline)",
              lineHeight: 1.05,
              clipPath: restingClip,
            }}
          >
            {line2}
          </div>
        </div>
      </div>
    </div>
  );
}
