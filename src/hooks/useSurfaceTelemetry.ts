"use client";

/**
 * useSurfaceTelemetry — client batcher for host_surface_telemetry
 * (M13 Phase 1.A STEP 4; operator msg 3518 A5 binding).
 *
 * Lifecycle:
 *   - Mount: emits a chat_view OR inspect_view event for the current
 *     pathname (depending on isChatPrimary). If transitioning into an
 *     inspect surface, also emits inspect_entry with entry_trigger
 *     (default 'self_navigated'; agent-offered overrides via the
 *     ref-based set-trigger helper before the next navigation).
 *   - On pathname change: emits a corresponding event for the new
 *     pathname.
 *   - Batches events in a small in-memory queue + flushes every
 *     FLUSH_INTERVAL_MS, on visibility hidden, and on unmount. Uses
 *     navigator.sendBeacon when available (survives page unload).
 *
 * Privacy invariant (CLAUDE.md R5 firewall contract): the endpoint
 * derives host_id server-side from the authenticated session. The
 * client only sends event fields. There is NO client-side aggregation
 * across hosts.
 *
 * Trigger override:
 *   When the agent surfaces a navchip and the host follows it, the
 *   surface-mounted code calls `setNextEntryTrigger("agent_offered_navchip")`
 *   on the same hook instance before navigation. The next inspect_entry
 *   emitted carries that value; the override is one-shot and resets to
 *   'self_navigated' on consumption.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isChatPrimary } from "@/lib/chat/isChatPrimary";
import { taskClassForPathname } from "@/lib/telemetry/task-class";
import type {
  HostSurfaceTelemetryEntryTrigger,
  HostSurfaceTelemetryEventKind,
  HostSurfaceTelemetryTaskClass,
} from "@/lib/db/schema";

const FLUSH_INTERVAL_MS = 30 * 1000; // 30s
const MAX_QUEUE = 50;

type ClientEvent = {
  session_id: string;
  event_kind: HostSurfaceTelemetryEventKind;
  pathname: string;
  task_class: HostSurfaceTelemetryTaskClass | null;
  entry_trigger: HostSurfaceTelemetryEntryTrigger | null;
  context: Record<string, unknown>;
  ts: string;
};

/**
 * Module-level session id (per page-load). Generated lazily so SSR
 * doesn't reference crypto. Persists across all useSurfaceTelemetry
 * mounts on the same page.
 */
let _sessionId: string | null = null;
function getSessionId(): string {
  if (_sessionId === null) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      _sessionId = crypto.randomUUID();
    } else {
      _sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }
  return _sessionId;
}

/**
 * Module-level next-entry-trigger override. Set by callers before a
 * navigation; consumed (reset to null) on the next inspect_entry emission.
 */
let _nextEntryTrigger: HostSurfaceTelemetryEntryTrigger | null = null;

export function setNextEntryTrigger(
  trigger: HostSurfaceTelemetryEntryTrigger | null,
): void {
  _nextEntryTrigger = trigger;
}

/**
 * Module-level queue + scheduling state, shared across mounts to avoid
 * losing events when a component re-mounts during navigation.
 */
const _queue: ClientEvent[] = [];
let _flushTimer: ReturnType<typeof setInterval> | null = null;
let _mountedCount = 0;

async function flushQueue(): Promise<void> {
  if (_queue.length === 0) return;
  const batch = _queue.splice(0, _queue.length);
  try {
    const body = JSON.stringify({ events: batch });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/telemetry/surface", blob);
      if (ok) return;
      // sendBeacon refused (queue full / oversized) — fall through to fetch.
    }
    await fetch("/api/telemetry/surface", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      // keepalive lets the request survive page unload in modern browsers
      keepalive: true,
    });
  } catch {
    // Silent fail; telemetry must never break the surface.
  }
}

function enqueue(event: ClientEvent): void {
  if (_queue.length >= MAX_QUEUE) {
    // Drop oldest to make room — telemetry is best-effort.
    _queue.shift();
  }
  _queue.push(event);
}

export function useSurfaceTelemetry(): void {
  const pathname = usePathname();
  const lastPathnameRef = useRef<string | null>(null);

  // Emit on pathname change (and initial mount).
  useEffect(() => {
    if (!pathname) return;
    if (lastPathnameRef.current === pathname) return;
    const previousPathname = lastPathnameRef.current;
    lastPathnameRef.current = pathname;

    const onChat = isChatPrimary(pathname);
    const baseEvent = {
      session_id: getSessionId(),
      pathname,
      ts: new Date().toISOString(),
    };

    if (onChat) {
      enqueue({
        ...baseEvent,
        event_kind: "chat_view",
        task_class: null,
        entry_trigger: null,
        context: {},
      });
    } else {
      // First emit inspect_entry (one-shot navigation event) if we
      // arrived from chat-primary or a different inspect pathname.
      const isEntryEvent =
        previousPathname === null ||
        previousPathname !== pathname;
      if (isEntryEvent) {
        const trigger: HostSurfaceTelemetryEntryTrigger =
          _nextEntryTrigger ?? "self_navigated";
        _nextEntryTrigger = null;
        enqueue({
          ...baseEvent,
          event_kind: "inspect_entry",
          task_class: taskClassForPathname(pathname),
          entry_trigger: trigger,
          context: previousPathname
            ? { from_pathname: previousPathname }
            : {},
        });
      }
      // Then emit inspect_view (heartbeat-style for occupancy duration).
      enqueue({
        ...baseEvent,
        event_kind: "inspect_view",
        task_class: taskClassForPathname(pathname),
        entry_trigger: null,
        context: {},
      });
    }
  }, [pathname]);

  // Lifecycle: flush timer + visibility-hidden flush + unmount flush.
  // Module-level shared so multiple mounts don't multiply work.
  useEffect(() => {
    _mountedCount += 1;
    if (_flushTimer === null) {
      _flushTimer = setInterval(() => {
        void flushQueue();
      }, FLUSH_INTERVAL_MS);
    }

    const onVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        void flushQueue();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      _mountedCount -= 1;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      // Best-effort flush on unmount; if other mounts remain, the timer
      // keeps running for them.
      if (_mountedCount === 0 && _flushTimer !== null) {
        clearInterval(_flushTimer);
        _flushTimer = null;
        void flushQueue();
      }
    };
  }, []);
}
