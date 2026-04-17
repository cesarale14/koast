"use client";

import Image from "next/image";
import { Home as HomeIcon } from "lucide-react";
import { PLATFORMS, platformKeyFrom } from "@/lib/platforms";

interface PropertyThumb {
  id: string;
  name: string;
  cover_photo_url?: string | null;
  platforms?: string[];
}

interface PropertyThumbStripProps {
  properties: PropertyThumb[];
  activeId: string;
  onSelect: (id: string) => void;
  stats: { nextCheckIn: string; occupancy: number; avgRate: number };
}

export default function PropertyThumbStrip({
  properties,
  activeId,
  onSelect,
  stats,
}: PropertyThumbStripProps) {
  return (
    <aside
      className="hidden md:flex flex-col flex-shrink-0 w-20 pt-5 items-center bg-white"
      style={{ borderRight: "1px solid var(--dry-sand)" }}
    >
      <div className="flex flex-col gap-[10px] items-center w-full">
        {properties.map((p, i) => {
          const isActive = p.id === activeId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className="relative rounded-xl overflow-visible cursor-pointer transition-all animate-cardReveal"
              style={{
                width: 56,
                height: 56,
                border: isActive ? "2px solid var(--golden)" : "2px solid transparent",
                boxShadow: isActive
                  ? "0 0 0 3px rgba(196,154,90,0.2), 0 2px 8px rgba(0,0,0,0.1)"
                  : "0 1px 4px rgba(0,0,0,0.08)",
                animationDelay: `${80 * i}ms`,
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.transform = "scale(1.05)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.transform = "";
                  e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.08)";
                }
              }}
              title={p.name}
            >
              <div className="w-full h-full rounded-[10px] overflow-hidden bg-dry-sand">
                {p.cover_photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.cover_photo_url}
                    alt={p.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-shell">
                    <HomeIcon size={20} strokeWidth={1.5} />
                  </div>
                )}
              </div>

              {/* Channel badges — bottom right */}
              {p.platforms && p.platforms.length > 0 && (
                <div
                  className="absolute flex gap-[2px]"
                  style={{ bottom: -4, right: -4 }}
                >
                  {p.platforms.map((plat) => {
                    const key = platformKeyFrom(plat);
                    if (!key) return null;
                    const platform = PLATFORMS[key];
                    return (
                      <div
                        key={plat}
                        className="flex items-center justify-center rounded-[4px]"
                        style={{
                          width: 16,
                          height: 16,
                          backgroundColor: platform.color,
                          border: "1.5px solid #fff",
                        }}
                      >
                        <Image
                          src={platform.iconWhite}
                          alt={platform.name}
                          width={10}
                          height={10}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-auto w-full px-2 pb-5 pt-6 flex flex-col items-center">
        <div
          className="text-[9px] font-bold tracking-[0.1em] uppercase mb-2 text-center"
          style={{ color: "var(--golden)" }}
        >
          Quick stats
        </div>
        <div className="w-full space-y-2 text-center">
          <Stat label="Next" value={stats.nextCheckIn} />
          <Stat label="Occ" value={`${stats.occupancy}%`} />
          <Stat label="ADR" value={stats.avgRate > 0 ? `$${stats.avgRate}` : "—"} />
        </div>
      </div>

      <style jsx global>{`
        @keyframes koast-thumb-in {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase" style={{ color: "var(--tideline)" }}>
        {label}
      </div>
      <div
        className="text-[12px] font-bold tabular-nums"
        style={{ color: "var(--coastal)", letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
    </div>
  );
}
