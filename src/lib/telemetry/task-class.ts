/**
 * task-class — pure pathname → task_class bucketing for
 * host_surface_telemetry (M13 Phase 1.A STEP 4).
 *
 * Buckets inspect-mode pathnames into one of the controlled-vocabulary
 * task_class values so cross-host analysis can reason about intent
 * without exposing raw paths. Pure function: no side effects, no
 * dependency on Next.js, fully unit-testable.
 *
 * SSR-safe.
 *
 * Returns null when the pathname is chat-primary (no inspect task), so
 * callers can short-circuit the telemetry endpoint without sending a
 * row tagged with the wrong intent.
 */

import type { HostSurfaceTelemetryTaskClass } from "@/lib/db/schema";
import { isChatPrimary } from "@/lib/chat/isChatPrimary";

export function taskClassForPathname(
  pathname: string | null | undefined,
): HostSurfaceTelemetryTaskClass | null {
  if (!pathname) return "other";
  if (isChatPrimary(pathname)) return null;

  // Bulk-operate surfaces — multi-row edit, push, apply across many rows.
  if (pathname === "/calendar") return "bulk_operate";
  if (pathname === "/pricing") return "bulk_operate";

  // Visual-survey surfaces — map/chart/grid layouts the host scans.
  if (pathname === "/market-intel") return "visual_survey";
  if (pathname === "/comp-sets") return "visual_survey";
  if (pathname === "/analytics") return "visual_survey";
  if (pathname === "/nearby-listings") return "visual_survey";

  // Scan surfaces — list views the host reads through.
  if (pathname === "/messages") return "scan";
  if (pathname === "/reviews") return "scan";
  if (pathname === "/turnovers") return "scan";
  if (pathname === "/bookings") return "scan";
  if (pathname === "/properties") return "scan";
  if (pathname.startsWith("/properties/")) return "scan";
  if (pathname.startsWith("/channels/sync-log")) return "scan";

  // Config surfaces — host adjusts settings / wires integrations.
  if (pathname === "/settings") return "config";
  if (pathname === "/onboarding") return "config";
  if (pathname.startsWith("/channels")) return "config";
  if (pathname.startsWith("/certification")) return "config";
  if (pathname === "/frontdesk") return "config";

  // External-link landing pages.
  if (pathname === "/login") return "external_link";
  if (pathname === "/signup") return "external_link";

  return "other";
}
