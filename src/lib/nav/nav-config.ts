/**
 * Global navigation source — single definition shared by the dashboard
 * sidebar (DesktopSidebar / MobileSidebar in `(dashboard)/layout.tsx`) and
 * the chat drawer's RailNav (`src/components/chat/RailNav.tsx`).
 *
 * Keeping ONE source means the desktop icon rail, the mobile chat drawer,
 * and the legacy inspect-surface sidebar can never drift on which tabs
 * exist or where they point.
 *
 * Nav-blocker fix context (operator msg 3725 / 3727): the chat-primary
 * surface (`/`, `/chat/*`) previously mounted NO persistent global nav —
 * tabs were reachable only via the command palette (⌘K / Search icon).
 * The fix mounts this same nav as a quiet collapsed icon rail on desktop
 * and folds it into the chat hamburger drawer on mobile.
 */

import {
  LayoutDashboard,
  CalendarDays,
  MessageCircle,
  Home,
  DollarSign,
  Star,
  Sparkles,
  TrendingUp,
  GitCompare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { isChatPrimary } from "@/lib/chat/isChatPrimary";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
  badge?: number | null;
}
export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/**
 * The first item is "Home" → `/` (the Today / chat surface). It was
 * "Dashboard" historically; renamed so `/` isn't referred to by two
 * names across the sidebar ("Dashboard") and the command palette
 * ("Chat") — operator msg 3727 label alignment. The command-palette
 * route label (`src/lib/cmdk/static.ts`) is aligned to "Home" in the
 * same pass.
 */
export const navGroups: NavGroup[] = [
  {
    items: [
      { name: "Home", href: "/", icon: LayoutDashboard },
      { name: "Calendar", href: "/calendar", icon: CalendarDays },
      { name: "Messages", href: "/messages", icon: MessageCircle },
    ],
  },
  {
    label: "MANAGE",
    items: [
      { name: "Properties", href: "/properties", icon: Home },
      { name: "Pricing", href: "/pricing", icon: DollarSign },
      { name: "Reviews", href: "/reviews", icon: Star },
      { name: "Turnovers", href: "/turnovers", icon: Sparkles },
    ],
  },
  {
    label: "INSIGHTS",
    items: [
      { name: "Market Intel", href: "/market-intel", icon: TrendingUp },
      { name: "Comp Sets", href: "/comp-sets", icon: GitCompare },
    ],
  },
];

/**
 * Active-state test for a nav item. The Home item (`/`) is active across
 * the WHOLE chat-primary surface (`/` AND `/chat/*`) so the rail
 * highlights Home while the host is in any conversation; every other tab
 * matches by path prefix. Shared so the icon rail, the mobile drawer, and
 * the mobile topbar title all agree on what's active.
 */
export function isNavItemActive(href: string, pathname: string | null): boolean {
  if (href === "/") return isChatPrimary(pathname);
  return !!pathname && pathname.startsWith(href);
}
