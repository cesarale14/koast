"use client";

/**
 * HandwrittenGreeting — port of the Claude Design handoff component.
 *
 * Two lines of Fraunces with expressive axes ("opsz" 144, "SOFT" 100,
 * "WONK" 1) revealed left-to-right via a clip-path sweep. A golden
 * pen-tip dot trails the reveal edge. Not true stroke-by-stroke
 * SVG — the effect comes from clip-path + variable font axes giving
 * Fraunces a hand-lettered cadence at large sizes.
 *
 * Animation plays once per browser session. The session gate uses
 * sessionStorage("koast:greeting-animated"); prefers-reduced-motion
 * users see the final state instantly.
 */

import { useEffect, useMemo, useRef, useState } from "react";

interface HandwrittenGreetingProps {
  timeOfDay: "morning" | "afternoon" | "evening";
  name: string;
  status: string;
}

const DISPLAY_BASE: React.CSSProperties = {
  fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
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

export default function HandwrittenGreeting({ timeOfDay, name, status }: HandwrittenGreetingProps) {
  const line1 = `${greetingPrefix(timeOfDay)}, ${name}.`;
  const line2 = status;

  // Compute the initial animate state once; we want SSR + first client
  // paint to agree, and we want the animation to play exactly once per
  // browser session.
  const [animate, setAnimate] = useState<boolean>(false);
  const [fontsReady, setFontsReady] = useState<boolean>(false);

  const l1Ref = useRef<HTMLDivElement | null>(null);
  const l2Ref = useRef<HTMLDivElement | null>(null);
  const pen1Ref = useRef<HTMLDivElement | null>(null);
  const pen2Ref = useRef<HTMLDivElement | null>(null);

  // First client render — decide whether to animate.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const already = sessionStorage.getItem("koast:greeting-animated") === "1";
    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shouldAnimate = !already && !reducedMotion;
    setAnimate(shouldAnimate);
    if (shouldAnimate) {
      sessionStorage.setItem("koast:greeting-animated", "1");
    }
  }, []);

  // Wait for Fraunces to load before measuring widths — otherwise the
  // pen dot lands on the wrong x when the fallback font has different
  // metrics.
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
    const p1 = pen1Ref.current;
    const p2 = pen2Ref.current;
    if (!l1 || !l2) return;

    // Prime clip + pen positions.
    [l1, l2].forEach((el) => {
      el.style.transition = "none";
      el.style.clipPath = "inset(-15% 100% -15% 0)";
    });
    [p1, p2].forEach((el) => {
      if (!el) return;
      el.style.transition = "none";
      el.style.opacity = "0";
      el.style.left = "0px";
    });
    // Force reflow so the next frame picks up the primed styles.
    void l1.offsetWidth;

    const frame = requestAnimationFrame(() => {
      l1.style.transition = "clip-path 1.6s cubic-bezier(0.33, 1, 0.68, 1)";
      l1.style.clipPath = "inset(-15% 0% -15% 0)";
      if (p1) {
        p1.style.transition = "left 1.6s cubic-bezier(0.33, 1, 0.68, 1), opacity 0.3s";
        p1.style.opacity = "1";
        p1.style.left = l1.offsetWidth + "px";
      }
    });

    const t2 = window.setTimeout(() => {
      if (!l2) return;
      l2.style.transition = "clip-path 1.8s cubic-bezier(0.33, 1, 0.68, 1)";
      l2.style.clipPath = "inset(-15% 0% -15% 0)";
      if (p2) {
        p2.style.transition = "left 1.8s cubic-bezier(0.33, 1, 0.68, 1), opacity 0.3s";
        p2.style.opacity = "1";
        p2.style.left = l2.offsetWidth + "px";
      }
    }, 900);

    const t3 = window.setTimeout(() => {
      if (p1) p1.style.opacity = "0";
      if (p2) p2.style.opacity = "0";
    }, 3100);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [animate, fontsReady]);

  // Pen dot styling — matches handoff: 5px golden with ambient glow,
  // vertically centered on each line's x-height baseline.
  const penBaseStyle: React.CSSProperties = useMemo(
    () => ({
      position: "absolute",
      top: "55%",
      width: 5,
      height: 5,
      borderRadius: "50%",
      background: "var(--golden)",
      boxShadow: "0 0 10px rgba(196,154,90,0.8)",
      transform: "translate(-2.5px, -50%)",
      pointerEvents: "none",
      opacity: 0,
    }),
    []
  );

  // When animation is NOT running we render lines fully-visible
  // (clip-path inset-zero) so SSR, reduced-motion, and second-visit
  // renders all show the final state immediately.
  const restingClip = animate ? "inset(-15% 100% -15% 0)" : "inset(-15% 0% -15% 0)";

  return (
    <div style={{ paddingTop: 2 }} aria-label={`${line1} ${line2}`}>
      <div style={{ position: "relative", display: "inline-block", marginBottom: 4 }}>
        <div
          ref={l1Ref}
          style={{
            ...DISPLAY_BASE,
            fontSize: 72,
            letterSpacing: "-0.025em",
            color: "var(--deep-sea)",
            clipPath: restingClip,
          }}
        >
          {line1}
        </div>
        <div ref={pen1Ref} style={penBaseStyle} />
      </div>
      <div style={{ display: "block" }}>
        <div style={{ position: "relative", display: "inline-block" }}>
          <div
            ref={l2Ref}
            style={{
              ...DISPLAY_BASE,
              fontStyle: "italic",
              fontSize: 56,
              letterSpacing: "-0.02em",
              color: "var(--tideline)",
              lineHeight: 1.05,
              clipPath: restingClip,
            }}
          >
            {line2}
          </div>
          <div ref={pen2Ref} style={penBaseStyle} />
        </div>
      </div>
    </div>
  );
}
