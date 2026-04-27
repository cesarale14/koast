"use client";

// Session 8a.1 — context card at the top of every thread.
// Replaces the prior "No messages in this conversation yet" empty
// state for booking-anchored and inquiry threads. The PD-V1 token
// language (--shore-soft, --hairline) keeps it visually distinct
// from chat bubbles — it's an info surface, not a conversation
// participant.

import Image from "next/image";
import { CalendarDays, Users, Hash, MessageCircle } from "lucide-react";
import { PLATFORMS, platformKeyFrom } from "@/lib/platforms";

export interface ConversationContext {
  type: "booking" | "inquiry" | "unknown";
  booking?: {
    id: string;
    guest_name: string | null;
    check_in: string;
    check_out: string;
    num_guests: number | null;
    platform: string;
    ota_reservation_code: string | null;
    total_price: number | null;
    currency: string | null;
  };
  inquiry?: {
    guest_name: string | null;
    first_message_preview: string | null;
  };
}

function shortDateRange(ci: string, co: string): string {
  const a = new Date(ci + "T00:00:00");
  const b = new Date(co + "T00:00:00");
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  if (sameMonth) return `${m(a)} ${a.getDate()}–${b.getDate()}`;
  return `${m(a)} ${a.getDate()} – ${m(b)} ${b.getDate()}`;
}

function nightsBetween(ci: string, co: string): number {
  return Math.max(
    1,
    Math.round(
      (Date.UTC(+co.slice(0, 4), +co.slice(5, 7) - 1, +co.slice(8, 10)) -
        Date.UTC(+ci.slice(0, 4), +ci.slice(5, 7) - 1, +ci.slice(8, 10))) /
        86400000,
    ),
  );
}

function fmtMoney(amount: number | null, currency: string | null): string | null {
  if (amount == null) return null;
  const cur = currency ?? "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `$${Math.round(amount).toLocaleString()}`;
  }
}

export default function ConversationContextCard({ context }: { context: ConversationContext }) {
  if (context.type === "unknown") return null;

  if (context.type === "booking" && context.booking) {
    const b = context.booking;
    const platformKey = platformKeyFrom(b.platform);
    const platform = platformKey ? PLATFORMS[platformKey] : null;
    const nights = nightsBetween(b.check_in, b.check_out);
    const total = fmtMoney(b.total_price, b.currency);

    return (
      <div
        className="rounded-2xl px-5 py-4 mb-5"
        style={{
          background: "var(--shore-soft)",
          border: "1px solid var(--hairline)",
        }}
      >
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] font-bold tracking-[0.08em] uppercase"
              style={{ color: "var(--golden)" }}
            >
              Booking
            </span>
            {platform && (
              <span
                className="inline-flex items-center gap-1 px-1.5 rounded text-[10px] font-semibold"
                style={{ height: 18, backgroundColor: platform.colorLight, color: platform.color }}
              >
                <Image src={platform.icon} alt={platform.name} width={10} height={10} />
                {platform.name}
              </span>
            )}
          </div>
          {total && (
            <span className="text-[13px] font-bold tabular-nums" style={{ color: "var(--coastal)", letterSpacing: "-0.01em" }}>
              {total}
            </span>
          )}
        </div>

        <div className="text-[15px] font-semibold mb-2" style={{ color: "var(--coastal)", letterSpacing: "-0.005em" }}>
          {b.guest_name?.trim() || "Guest"}
        </div>

        <div className="flex items-center gap-4 flex-wrap text-[12px]" style={{ color: "var(--tideline)" }}>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={13} strokeWidth={2} />
            {shortDateRange(b.check_in, b.check_out)} · {nights} night{nights !== 1 ? "s" : ""}
          </span>
          {b.num_guests != null && (
            <span className="inline-flex items-center gap-1.5">
              <Users size={13} strokeWidth={2} />
              {b.num_guests} guest{b.num_guests !== 1 ? "s" : ""}
            </span>
          )}
          {b.ota_reservation_code && (
            <span className="inline-flex items-center gap-1.5 font-mono">
              <Hash size={13} strokeWidth={2} />
              {b.ota_reservation_code}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Inquiry
  const inquiry = context.inquiry;
  if (!inquiry) return null;
  const guest = inquiry.guest_name?.trim() || "Guest";
  const preview = inquiry.first_message_preview?.trim() || null;

  return (
    <div
      className="rounded-2xl px-5 py-4 mb-5"
      style={{
        background: "var(--shore-soft)",
        border: "1px solid var(--hairline)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <MessageCircle size={13} strokeWidth={2} style={{ color: "var(--golden)" }} />
        <span
          className="text-[10px] font-bold tracking-[0.08em] uppercase"
          style={{ color: "var(--golden)" }}
        >
          Inquiry
        </span>
      </div>
      <div className="text-[15px] font-semibold mb-1" style={{ color: "var(--coastal)", letterSpacing: "-0.005em" }}>
        From {guest}
      </div>
      <div className="text-[12px]" style={{ color: "var(--tideline)", lineHeight: 1.5 }}>
        {preview ? (
          preview.length > 240 ? preview.slice(0, 237).trim() + "…" : preview
        ) : (
          "Awaiting first message."
        )}
      </div>
    </div>
  );
}
