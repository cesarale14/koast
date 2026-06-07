"use client";

// Logo — thin wrapper over the canonical KoastMark (the teal layered-bands
// circle, single source of truth in src/components/chat/KoastMark.tsx). The
// old "beacon" mark (teal triangle/peak) was retired here during the logo
// unification so the whole app renders the same mark as the chat shell +
// marketing surfaces.
import { KoastMark } from "@/components/chat/KoastMark";

interface LogoProps {
  variant?: "icon" | "full" | "app";
  size?: number;
  className?: string;
}

export default function Logo({ variant = "icon", size, className = "" }: LogoProps) {
  const markSize = size ?? (variant === "app" ? 40 : 32);

  if (variant === "full") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <KoastMark size={markSize} />
        <span
          className="text-ink"
          style={{ fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: markSize * 0.62, letterSpacing: "-0.045em", lineHeight: 1 }}
        >
          Koast
        </span>
      </div>
    );
  }

  return <KoastMark size={markSize} className={className} />;
}
