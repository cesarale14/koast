/**
 * Cmd+K — static route + action catalogs.
 *
 * Routes mirror the dashboard sidebar (`(dashboard)/layout.tsx`
 * navGroups) PLUS the chat-primary root `/`. Kept here (not derived
 * from the sidebar config) so the palette is the single nav primitive
 * even when the sidebar dynamically hides items per a host's tab
 * visibility — doctrine point 7 says "one-click reachable from
 * anywhere," not "reachable iff the sidebar shows it today."
 *
 * Actions are the 3 doctrine-aligned shortcuts the operator named in
 * the M13 Phase 1.B brief: new-conversation, add-property, show-today.
 *
 * Re-fanning out for a new route or action: add an entry here, ship.
 * The palette picks it up via the data hook automatically.
 */

import type { CmdKEntry } from "./types";

export const STATIC_ROUTES: CmdKEntry[] = [
  {
    id: "route:/",
    kind: "route",
    label: "Chat",
    hint: "Conversation with Koast",
    keywords: ["chat", "home", "conversation", "koast"],
    href: "/",
  },
  {
    id: "route:/calendar",
    kind: "route",
    label: "Calendar",
    hint: "Bookings + rates by date",
    keywords: ["calendar", "bookings", "month", "dates", "rates"],
    href: "/calendar",
  },
  {
    id: "route:/messages",
    kind: "route",
    label: "Messages",
    hint: "Guest conversations",
    keywords: ["messages", "guests", "inbox", "chat threads"],
    href: "/messages",
  },
  {
    id: "route:/properties",
    kind: "route",
    label: "Properties",
    hint: "Your portfolio",
    keywords: ["properties", "listings", "portfolio", "fleet"],
    href: "/properties",
  },
  {
    id: "route:/pricing",
    kind: "route",
    label: "Pricing",
    hint: "Rate recommendations + signals",
    keywords: ["pricing", "rates", "recommendations", "signals", "rev"],
    href: "/pricing",
  },
  {
    id: "route:/reviews",
    kind: "route",
    label: "Reviews",
    hint: "Guest reviews + responses",
    keywords: ["reviews", "ratings", "responses", "feedback"],
    href: "/reviews",
  },
  {
    id: "route:/turnovers",
    kind: "route",
    label: "Turnovers",
    hint: "Cleaner tasks",
    keywords: ["turnovers", "cleaning", "cleaners", "tasks"],
    href: "/turnovers",
  },
  {
    id: "route:/market-intel",
    kind: "route",
    label: "Market Intel",
    hint: "Demand + occupancy",
    keywords: ["market", "intel", "demand", "occupancy", "adr"],
    href: "/market-intel",
  },
  {
    id: "route:/comp-sets",
    kind: "route",
    label: "Comp Sets",
    hint: "Competitive comparison",
    keywords: ["comp sets", "comps", "competition", "competitors"],
    href: "/comp-sets",
  },
  {
    id: "route:/analytics",
    kind: "route",
    label: "Analytics",
    hint: "Portfolio performance",
    keywords: ["analytics", "performance", "stats"],
    href: "/analytics",
  },
  {
    id: "route:/bookings",
    kind: "route",
    label: "Bookings",
    hint: "Reservation list",
    keywords: ["bookings", "reservations", "stays"],
    href: "/bookings",
  },
  {
    id: "route:/channels",
    kind: "route",
    label: "Channels",
    hint: "Airbnb + Booking.com + direct",
    keywords: ["channels", "airbnb", "booking", "direct", "vrbo", "ota"],
    href: "/channels",
  },
  {
    id: "route:/frontdesk",
    kind: "route",
    label: "Direct Booking",
    hint: "Frontdesk + direct site",
    keywords: ["frontdesk", "direct booking", "website"],
    href: "/frontdesk",
  },
  {
    id: "route:/settings",
    kind: "route",
    label: "Settings",
    hint: "Account + preferences",
    keywords: ["settings", "account", "preferences", "config"],
    href: "/settings",
  },
];

export const STATIC_ACTIONS: CmdKEntry[] = [
  {
    id: "action:new-conversation",
    kind: "action",
    label: "New conversation",
    hint: "Start a fresh chat thread",
    keywords: ["new conversation", "new chat", "new thread", "start"],
    action: "new-conversation",
  },
  {
    id: "action:add-property",
    kind: "action",
    label: "Add property",
    hint: "Import or create a listing",
    keywords: ["add property", "new property", "import listing", "create"],
    href: "/properties/new",
    action: "add-property",
  },
  {
    id: "action:show-today",
    kind: "action",
    label: "Show today",
    hint: "Jump to today on the calendar",
    keywords: ["show today", "today", "now"],
    href: "/calendar",
    action: "show-today",
  },
];
