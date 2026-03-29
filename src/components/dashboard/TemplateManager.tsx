"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_ONBOARDING_TEMPLATES,
  type DefaultTemplate,
} from "@/lib/onboarding/default-templates";
import { ChevronDown, ChevronUp, RotateCcw, Eye } from "lucide-react";

interface Template {
  id: string;
  property_id: string;
  template_type: string;
  subject: string;
  body: string;
  is_active: boolean;
  trigger_type: string;
  trigger_days_offset: number;
  trigger_time: string;
}

interface TemplateManagerProps {
  templates: Template[];
  properties: { id: string; name: string }[];
}

const TEMPLATE_LABELS: Record<string, string> = {
  booking_confirmation: "Booking Confirmation",
  pre_arrival: "Pre-Arrival",
  checkin_instructions: "Check-in Instructions",
  welcome: "Welcome Message",
  midstay_checkin: "Mid-Stay Check-in",
  checkout_reminder: "Checkout Reminder",
  thank_you: "Thank You",
  review_request: "Review Request",
};

const TRIGGER_LABELS: Record<string, string> = {
  on_booking: "When booked",
  before_checkin: "Before check-in",
  on_checkin: "On check-in day",
  after_checkin: "After check-in",
  before_checkout: "Before checkout",
  on_checkout: "On checkout day",
  after_checkout: "After checkout",
};

const PREVIEW_VALUES: Record<string, string> = {
  "{guest_name}": "Sarah",
  "{property_name}": "Beachfront Villa",
  "{check_in}": "Mar 15, 2026",
  "{check_out}": "Mar 20, 2026",
  "{checkin_time}": "3:00 PM",
  "{checkout_time}": "11:00 AM",
  "{door_code}": "1234#",
  "{wifi_network}": "BeachVilla-WiFi",
  "{wifi_password}": "welcome2026",
  "{parking_instructions}": "Driveway on the left, spot #1",
  "{house_rules}": "No smoking\nNo parties\nQuiet hours: 10 PM - 8 AM",
  "{special_instructions}": "The pool heater is on a timer — it runs 8 AM to 10 PM.",
  "{emergency_contact}": "555-123-4567",
};

function fillPreview(body: string): string {
  let result = body;
  for (const [key, val] of Object.entries(PREVIEW_VALUES)) {
    result = result.replaceAll(key, val);
  }
  return result;
}

const inputClass =
  "w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none text-sm";

export default function TemplateManager({ templates: initialTemplates, properties }: TemplateManagerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const [selectedProperty, setSelectedProperty] = useState(properties[0]?.id ?? "");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const propertyTemplates = useMemo(
    () => initialTemplates.filter((t) => t.property_id === selectedProperty),
    [initialTemplates, selectedProperty]
  );

  // Build a merged list: existing templates + defaults for missing types
  const allTemplates = useMemo(() => {
    const existing = new Map(propertyTemplates.map((t) => [t.template_type, t]));
    return DEFAULT_ONBOARDING_TEMPLATES.map((def: DefaultTemplate) => {
      const ex = existing.get(def.templateType);
      return {
        id: ex?.id ?? null,
        template_type: def.templateType,
        subject: ex?.subject ?? def.subject,
        body: ex?.body ?? def.body,
        is_active: ex?.is_active ?? false,
        trigger_type: ex?.trigger_type ?? def.triggerType,
        trigger_days_offset: ex?.trigger_days_offset ?? def.triggerDaysOffset,
        trigger_time: ex?.trigger_time ?? def.triggerTime,
        exists: !!ex,
      };
    });
  }, [propertyTemplates]);

  const toggleActive = async (templateType: string, currentActive: boolean, templateId: string | null) => {
    setSaving(templateType);
    try {
      if (templateId) {
        const { error } = await supabase
          .from("message_templates")
          .update({ is_active: !currentActive })
          .eq("id", templateId);
        if (error) throw error;
      } else {
        // Create the template from defaults
        const def = DEFAULT_ONBOARDING_TEMPLATES.find((d) => d.templateType === templateType);
        if (!def) return;
        const { error } = await supabase.from("message_templates").insert({
          property_id: selectedProperty,
          template_type: def.templateType,
          subject: def.subject,
          body: def.body,
          is_active: true,
          trigger_type: def.triggerType,
          trigger_days_offset: def.triggerDaysOffset,
          trigger_time: def.triggerTime,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        if (error) throw error;
      }
      toast(currentActive ? "Template deactivated" : "Template activated");
      router.refresh();
    } catch {
      toast("Failed to update template", "error");
    } finally {
      setSaving(null);
    }
  };

  const saveBody = async (templateType: string, templateId: string | null) => {
    const newBody = editingBody[templateType];
    if (newBody === undefined) return;
    setSaving(templateType);
    try {
      if (templateId) {
        const { error } = await supabase
          .from("message_templates")
          .update({ body: newBody })
          .eq("id", templateId);
        if (error) throw error;
      } else {
        const def = DEFAULT_ONBOARDING_TEMPLATES.find((d) => d.templateType === templateType);
        if (!def) return;
        const { error } = await supabase.from("message_templates").insert({
          property_id: selectedProperty,
          template_type: def.templateType,
          subject: def.subject,
          body: newBody,
          is_active: true,
          trigger_type: def.triggerType,
          trigger_days_offset: def.triggerDaysOffset,
          trigger_time: def.triggerTime,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        if (error) throw error;
      }
      setEditingBody((prev) => {
        const next = { ...prev };
        delete next[templateType];
        return next;
      });
      toast("Template saved!");
      router.refresh();
    } catch {
      toast("Failed to save template", "error");
    } finally {
      setSaving(null);
    }
  };

  const resetToDefault = async (templateType: string, templateId: string | null) => {
    const def = DEFAULT_ONBOARDING_TEMPLATES.find((d) => d.templateType === templateType);
    if (!def) return;
    setSaving(templateType);
    try {
      if (templateId) {
        const { error } = await supabase
          .from("message_templates")
          .update({ body: def.body, subject: def.subject })
          .eq("id", templateId);
        if (error) throw error;
      }
      setEditingBody((prev) => {
        const next = { ...prev };
        delete next[templateType];
        return next;
      });
      toast("Reset to default");
      router.refresh();
    } catch {
      toast("Failed to reset template", "error");
    } finally {
      setSaving(null);
    }
  };

  if (properties.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-neutral-500">Add a property first to manage templates.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Property selector */}
      {properties.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-neutral-600">Property:</label>
          <select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className={`${inputClass} max-w-xs bg-neutral-0`}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Template list */}
      <div className="space-y-2">
        {allTemplates.map((t) => {
          const isExpanded = expanded === t.template_type;
          const isPreviewing = previewing === t.template_type;
          const currentBody = editingBody[t.template_type] ?? t.body;
          const hasEdits = editingBody[t.template_type] !== undefined;
          const triggerLabel = TRIGGER_LABELS[t.trigger_type] ?? t.trigger_type;
          const offsetLabel =
            t.trigger_days_offset !== 0
              ? ` (${Math.abs(t.trigger_days_offset)}d ${t.trigger_days_offset < 0 ? "before" : "after"})`
              : "";

          return (
            <div
              key={t.template_type}
              className={`border rounded-lg transition-colors ${
                t.is_active
                  ? "border-[var(--border)] bg-neutral-0"
                  : "border-neutral-200 bg-neutral-50 opacity-70"
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  onClick={() => setExpanded(isExpanded ? null : t.template_type)}
                  className="flex items-center gap-2 flex-1 text-left"
                >
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-neutral-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-neutral-400" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-neutral-800">
                      {TEMPLATE_LABELS[t.template_type] ?? t.template_type}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {triggerLabel}{offsetLabel} at {t.trigger_time}
                    </p>
                  </div>
                </button>

                {/* Active toggle */}
                <button
                  onClick={() => toggleActive(t.template_type, t.is_active, t.id)}
                  disabled={saving === t.template_type}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                    t.is_active ? "bg-brand-500" : "bg-neutral-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
                      t.is_active ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Expanded body */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-neutral-100 space-y-3">
                  {/* Edit / Preview toggle */}
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => setPreviewing(isPreviewing ? null : t.template_type)}
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                        isPreviewing
                          ? "bg-brand-50 text-brand-600"
                          : "bg-neutral-100 text-neutral-500 hover:text-neutral-700"
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      {isPreviewing ? "Editing" : "Preview"}
                    </button>
                    <button
                      onClick={() => resetToDefault(t.template_type, t.id)}
                      disabled={saving === t.template_type}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-500 hover:text-neutral-700 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset to Default
                    </button>
                  </div>

                  {isPreviewing ? (
                    <pre className="text-sm text-neutral-700 whitespace-pre-wrap font-[var(--font-nunito),sans-serif] leading-relaxed bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                      {fillPreview(currentBody)}
                    </pre>
                  ) : (
                    <textarea
                      value={currentBody}
                      onChange={(e) =>
                        setEditingBody((prev) => ({ ...prev, [t.template_type]: e.target.value }))
                      }
                      className={`${inputClass} min-h-[160px] resize-y font-mono text-xs`}
                    />
                  )}

                  {hasEdits && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => saveBody(t.template_type, t.id)}
                        disabled={saving === t.template_type}
                        className="px-4 py-1.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
                      >
                        {saving === t.template_type ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        onClick={() =>
                          setEditingBody((prev) => {
                            const next = { ...prev };
                            delete next[t.template_type];
                            return next;
                          })
                        }
                        className="px-4 py-1.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
                      >
                        Discard
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
