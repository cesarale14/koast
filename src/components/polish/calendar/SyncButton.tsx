"use client";

/**
 * SyncButton — manual sync trigger for the Calendar toolbar. Four
 * states (idle / pending / syncing / error). The Session 5a scope
 * ships the visual shell; real queued-push semantics (auto-sync +
 * revert window) land in Session 5d.
 */

import { useState } from "react";
import { Check, RefreshCw, AlertTriangle } from "lucide-react";

type State = "idle" | "pending" | "syncing" | "error";

interface Props {
  state: State;
  pendingCount?: number;
  failedCount?: number;
  totalChannels?: number;
  onSync?: () => Promise<void> | void;
  onRetry?: () => Promise<void> | void;
}

export default function SyncButton({
  state,
  pendingCount = 0,
  failedCount = 0,
  totalChannels = 0,
  onSync,
  onRetry,
}: Props) {
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (state === "error") await onRetry?.();
      else await onSync?.();
    } finally {
      setBusy(false);
    }
  };

  const spec = (() => {
    if (state === "syncing" || busy) {
      return {
        label: totalChannels > 0 ? `Syncing to ${totalChannels} channel${totalChannels === 1 ? "" : "s"}…` : "Syncing…",
        bg: "var(--coastal)",
        fg: "var(--shore)",
        icon: <RefreshCw size={14} className="animate-spin" />,
        disabled: true,
      } as const;
    }
    if (state === "error") {
      return {
        label: `${failedCount} of ${totalChannels} failed · Retry`,
        bg: "rgba(196,64,64,0.1)",
        fg: "var(--coral-reef)",
        icon: <AlertTriangle size={14} />,
        disabled: false,
      } as const;
    }
    if (state === "pending" && pendingCount > 0) {
      return {
        label: `Sync ${pendingCount} change${pendingCount === 1 ? "" : "s"}`,
        bg: "var(--golden)",
        fg: "var(--deep-sea)",
        icon: <RefreshCw size={14} />,
        disabled: false,
      } as const;
    }
    return {
      label: "All synced",
      bg: "transparent",
      fg: "var(--tideline)",
      icon: <Check size={14} />,
      disabled: true,
    } as const;
  })();

  return (
    <button
      type="button"
      onClick={go}
      disabled={spec.disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 32,
        padding: "0 12px",
        borderRadius: 999,
        border: "1px solid var(--dry-sand)",
        background: spec.bg,
        color: spec.fg,
        fontSize: 12,
        fontWeight: 600,
        cursor: spec.disabled ? "default" : "pointer",
        transition: "background-color 180ms ease, color 180ms ease",
      }}
    >
      {spec.icon}
      <span>{spec.label}</span>
    </button>
  );
}
