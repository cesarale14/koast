"use client";
import Image from "next/image";
import { PLATFORMS, platformKeyFrom } from "@/lib/platforms";

export function ChannelLogo({ code, size = 18 }: { code: string; size?: number }) {
  const key = platformKeyFrom(code) ?? "direct";
  const platform = PLATFORMS[key];
  return (
    <Image
      src={platform.tile}
      alt={`${platform.name} logo`}
      width={size}
      height={size}
      className="rounded-[3px] object-contain"
    />
  );
}
