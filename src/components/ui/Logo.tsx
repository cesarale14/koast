"use client";

interface LogoProps {
  variant?: "icon" | "full" | "app";
  size?: number;
  className?: string;
}

function BeaconIcon({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} fill="none">
      <path d="M13 30 L20 14 L27 30" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="10" r="2.5" fill="#10b981" />
      <path d="M15 8 Q20 2 25 8" stroke="#10b981" strokeWidth="1.2" opacity="0.4" strokeLinecap="round" />
    </svg>
  );
}

function BeaconApp({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className}>
      <rect width="48" height="48" rx="12" fill="#10b981" />
      <path d="M15 36 L24 14 L33 36" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="10" r="3" fill="#ffffff" />
      <path d="M18 8 Q24 1 30 8" fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.5" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ variant = "icon", size, className = "" }: LogoProps) {
  if (variant === "app") {
    return <BeaconApp size={size ?? 40} className={className} />;
  }

  if (variant === "icon") {
    return <BeaconIcon size={size ?? 32} className={className} />;
  }

  // variant === "full"
  const iconSize = size ?? 32;
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <BeaconIcon size={iconSize} />
      <span style={{ fontFamily: "var(--font-sans)", fontWeight: 500, fontSize: iconSize * 0.5 }}>
        <span className="text-[#3d6b52]">Stay</span>
        <span className="text-neutral-900">Command</span>
      </span>
    </div>
  );
}
