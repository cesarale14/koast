/**
 * describeHostNotification — the pure mapping from a curated host_notifications
 * row to its bell-row presentation: a title, an optional sub-line, and the href
 * the host lands on when they tap it. Extracted from NotificationBell so it's
 * node-testable (no React) — the bell's ACTIONABILITY is part of the
 * agent→host visibility path: a proposal the agent creates must not only land
 * in the feed, it must deep-link the host to a surface where they can act on it.
 *
 * The `href` is the contract the visibility-path test pins: proposal_created
 * routes to "/" (the Today home, where TodaySuggests renders the approvable
 * ProposalCard). Change the approval surface → change it here, and the test
 * holds the bell to it.
 */

import { firstNameOf } from "@/components/chat/blocks/format";
import type { NormalizedHostNotification } from "@/lib/notifications/host-feed";

export interface HostNotificationDisplay {
  title: string;
  sub?: string;
  href: string;
}

export function describeHostNotification(n: NormalizedHostNotification): HostNotificationDisplay {
  const p = n.payload ?? {};
  const prop = (p.propertyName as string) ?? "a property";
  switch (n.type) {
    case "cleaning_completed": {
      const c = Number(p.photoCount ?? 0);
      return {
        title: `Cleaning done at ${prop}`,
        sub: c > 0 ? `${c} photo${c > 1 ? "s" : ""} to review` : undefined,
        href: "/",
      };
    }
    case "booking_new":
      return {
        title: `New booking${p.guestName ? ` — ${firstNameOf(p.guestName as string)}` : ""}`,
        sub: p.checkIn ? `${p.checkIn} → ${p.checkOut}` : undefined,
        href: "/calendar",
      };
    case "booking_cancelled":
      return {
        title: `Booking cancelled${p.guestName ? ` — ${firstNameOf(p.guestName as string)}` : ""}`,
        sub: p.checkIn ? `${p.checkIn} → ${p.checkOut}` : undefined,
        href: "/calendar",
      };
    case "proposal_created":
      return {
        title: "Koast has a suggestion",
        sub: (p.rationale as string) ?? undefined,
        // The Today home: TodaySuggests renders the approvable card here.
        href: "/",
      };
    case "push_delivery_failure":
      return {
        title: `Couldn't reach ${(p.cleanerName as string) ?? "the cleaner"}`,
        sub: `The dispatch for ${prop} didn't go through`,
        href: "/turnovers",
      };
    default:
      return { title: "Update", href: "/" };
  }
}

/**
 * The window event TodaySuggests listens for to refetch its pending list
 * immediately — fired when a proposal-related notification is opened (so a bell
 * deep-link refreshes the suggests surface even when the host is already on "/",
 * where router.push("/") would be a no-op). A plain Event name, shared so the
 * emitter and the listener can't drift.
 */
export const PROPOSALS_CHANGED_EVENT = "koast:proposals-changed";
