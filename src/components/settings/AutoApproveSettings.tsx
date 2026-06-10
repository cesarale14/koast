"use client";

/**
 * AutoApproveSettings (P2.3) — the per-action-type auto-approve toggles. ALL
 * default OFF: Koast proposes, the host approves. When a toggle is on, a
 * proposal of that action_type executes immediately on creation instead of
 * waiting for approval.
 *
 * OTA-touching actions are HIDDEN while OTA writes are disabled (and the server
 * refuses to enable them) — there are none today (assign_cleaner is internal),
 * but the gate is built for P3+.
 *
 * Self-contained card mirroring the settings page's SectionCard/Toggle style.
 */

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

type Item = {
  actionType: string;
  label: string;
  description: string;
  otaTouching: boolean;
  enabled: boolean;
  disabled: boolean;
};

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
        checked ? "bg-coastal" : "bg-neutral-300"
      } ${disabled ? "opacity-50 cursor-default" : ""}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function AutoApproveSettings() {
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/preferences/auto-approve");
        const d = await res.json().catch(() => ({}));
        if (!cancelled) setItems(Array.isArray(d?.items) ? (d.items as Item[]) : []);
      } catch {
        /* leave empty */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function setOne(actionType: string, enabled: boolean) {
    setSaving(actionType);
    setItems((prev) => prev.map((it) => (it.actionType === actionType ? { ...it, enabled } : it)));
    try {
      const res = await fetch("/api/preferences/auto-approve", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType, enabled }),
      });
      if (!res.ok) {
        setItems((prev) =>
          prev.map((it) => (it.actionType === actionType ? { ...it, enabled: !enabled } : it)),
        );
      }
    } catch {
      setItems((prev) =>
        prev.map((it) => (it.actionType === actionType ? { ...it, enabled: !enabled } : it)),
      );
    }
    setSaving(null);
  }

  // OTA-touching + disabled → hidden while OTA writes are off.
  const visible = items.filter((it) => !(it.otaTouching && it.disabled));

  return (
    <div className="bg-neutral-0 rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-2 mb-1">
        <Zap size={18} className="text-neutral-600" />
        <h2 className="text-lg font-bold text-neutral-800">Automation</h2>
      </div>
      <p className="text-sm text-neutral-500 mb-4">
        Let Koast act on its own for actions you trust. Everything is off by default — Koast
        proposes, you approve.
      </p>
      {!loaded ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-neutral-400">No automatable actions yet.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((it) => (
            <div key={it.actionType} className="flex items-start justify-between gap-4 py-1">
              <div>
                <div className="text-sm font-medium text-neutral-700">{it.label}</div>
                <div className="text-xs text-neutral-500">{it.description}</div>
              </div>
              <Toggle
                checked={it.enabled}
                disabled={it.disabled || saving === it.actionType}
                onChange={(v) => setOne(it.actionType, v)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
