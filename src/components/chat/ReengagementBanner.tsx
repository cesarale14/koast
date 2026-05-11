"use client";

/**
 * ReengagementBanner — M8 C3 / D11 idle re-engagement.
 *
 * Renders a subdued one-line banner above the chat scroll area when
 * /api/onboarding/idle-status reports should_reengage=true (host hasn't
 * sent a turn in ≥24h AND sufficiency is not rich AND no cooldown
 * active). The endpoint writes the 7-day cooldown marker on the same
 * GET, so a refresh in the same window doesn't re-fire.
 *
 * Voice doctrine §2.1.4 onboarding warmer-than-steady calibration:
 *   "Want to keep going where we left off, or jump to something else?"
 *
 * Banner dismisses on first user send (consumer toggles `hidden`) and
 * does not return until the next 24h+ idle window post-cooldown.
 */

import { useEffect, useState } from "react";

interface IdleStatus {
  hours_since_last_turn: number | null;
  should_reengage: boolean;
  should_silent_complete: boolean;
  reengagement_cooldown_active: boolean;
}

export function ReengagementBanner({ hidden = false }: { hidden?: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/idle-status", {
          credentials: "include",
        });
        if (!res.ok || !alive) return;
        const json = (await res.json()) as IdleStatus;
        if (!alive) return;
        if (json.should_reengage) setShow(true);
      } catch {
        // Non-critical; banner just doesn't appear.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!show || hidden) return null;

  return (
    <div
      role="status"
      style={{
        padding: "10px 16px",
        background: "var(--shore-soft)",
        borderBottom: "1px solid var(--hairline)",
        color: "var(--coastal)",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      Want to keep going where we left off, or jump to something else?
    </div>
  );
}
