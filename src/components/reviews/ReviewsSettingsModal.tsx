"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { X } from "lucide-react";

interface RuleForm {
  auto_publish: boolean;
  publish_delay_days: number;
  tone: string;
  target_keywords: string;
  bad_review_delay: boolean;
}

interface ReviewsSettingsModalProps {
  propertyId: string | null;
  propertyName: string;
  open: boolean;
  onClose: () => void;
}

export default function ReviewsSettingsModal({ propertyId, propertyName, open, onClose }: ReviewsSettingsModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<RuleForm>({
    auto_publish: false,
    publish_delay_days: 3,
    tone: "warm",
    target_keywords: "clean, location, comfortable",
    bad_review_delay: true,
  });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const save = async () => {
    if (!propertyId) {
      toast("Pick a property first", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/reviews/rules/${propertyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          target_keywords: form.target_keywords.split(",").map((k) => k.trim()).filter(Boolean),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? `Failed (${res.status})`);
      toast("Review rules saved");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(19,46,32,0.4)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white"
        style={{ borderRadius: 16, boxShadow: "var(--shadow-card)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--dry-sand)" }}>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--golden)" }}>
              Review rules
            </div>
            <div className="text-[14px] font-semibold" style={{ color: "var(--coastal)" }}>
              {propertyName}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings" className="p-1 rounded hover:bg-shore" style={{ color: "var(--tideline)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.auto_publish}
              onChange={(e) => setForm({ ...form, auto_publish: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded"
            />
            <div>
              <p className="text-[13px] font-medium" style={{ color: "var(--coastal)" }}>
                Auto-publish AI drafts
              </p>
              <p className="text-[12px]" style={{ color: "var(--tideline)" }}>
                Coming soon — requires a scheduler worker.
              </p>
            </div>
          </label>

          <div>
            <label className="block text-[13px] font-medium mb-1" style={{ color: "var(--coastal)" }}>
              Tone
            </label>
            <select
              value={form.tone}
              onChange={(e) => setForm({ ...form, tone: e.target.value })}
              className="px-3 py-2 text-[13px] bg-white"
              style={{ border: "1px solid var(--dry-sand)", borderRadius: 8 }}
            >
              <option value="warm">Warm</option>
              <option value="professional">Professional</option>
              <option value="enthusiastic">Enthusiastic</option>
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-medium mb-1" style={{ color: "var(--coastal)" }}>
              Target keywords
            </label>
            <input
              type="text"
              value={form.target_keywords}
              onChange={(e) => setForm({ ...form, target_keywords: e.target.value })}
              placeholder="clean, location, quiet"
              className="w-full px-3 py-2 text-[13px]"
              style={{ border: "1px solid var(--dry-sand)", borderRadius: 8 }}
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--tideline)" }}>
              Naturally woven into AI drafts for SEO.
            </p>
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.bad_review_delay}
              onChange={(e) => setForm({ ...form, bad_review_delay: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded"
            />
            <div>
              <p className="text-[13px] font-medium" style={{ color: "var(--coastal)" }}>
                Delay bad reviews
              </p>
              <p className="text-[12px]" style={{ color: "var(--tideline)" }}>
                Hold negative reviews until the last two hours of the review window.
              </p>
            </div>
          </label>

          <div>
            <label className="block text-[13px] font-medium mb-1" style={{ color: "var(--coastal)" }}>
              Publish delay (days)
            </label>
            <input
              type="number"
              min={1}
              max={13}
              value={form.publish_delay_days}
              onChange={(e) => setForm({ ...form, publish_delay_days: parseInt(e.target.value) || 3 })}
              className="w-24 px-3 py-2 text-[13px]"
              style={{ border: "1px solid var(--dry-sand)", borderRadius: 8 }}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-5" style={{ borderTop: "1px solid var(--dry-sand)" }}>
          <button type="button" onClick={onClose} className="px-4 py-2 text-[12px] font-medium" style={{ color: "var(--tideline)" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !propertyId}
            className="px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
          >
            {saving ? "Saving…" : "Save rules"}
          </button>
        </div>
      </div>
    </div>
  );
}
