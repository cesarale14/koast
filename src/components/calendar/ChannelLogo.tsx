"use client";
import Image from "next/image";

const CODE_TO_LOGO: Record<string, string> = {
  ABB: "/logos/airbnb.svg",
  BDC: "/logos/booking.svg",
  VRBO: "/logos/vrbo.svg",
  DIRECT: "/logos/direct.svg",
};

export function ChannelLogo({ code, size = 18 }: { code: string; size?: number }) {
  const src = CODE_TO_LOGO[code] ?? "/logos/direct.svg";
  return (
    <Image
      src={src}
      alt={`${code} logo`}
      width={size}
      height={size}
      className="rounded-[3px] object-contain"
    />
  );
}
