"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import {
  User,
  Shield,
  Download,
  Bell,
  CreditCard,
  Link2,
  Palette,
  Lock,
  Check,
  AlertTriangle,
  Cable,
} from "lucide-react";

interface ICalFeed {
  id: string;
  platform: string;
  feed_url: string;
  last_synced: string | null;
  is_active: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties?: any;
}

interface ChannelConnection {
  id: string;
  property_id: string;
  channel_code: string;
  channel_name: string;
  status: string;
  property_name: string;
}

interface NotificationPrefs {
  email_new_booking: boolean;
  email_messages: boolean;
  email_cleaning: boolean;
  email_price_alerts: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
}

const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  email_new_booking: true,
  email_messages: true,
  email_cleaning: true,
  email_price_alerts: false,
  sms_enabled: false,
  push_enabled: false,
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
        checked ? "bg-brand-500" : "bg-neutral-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-neutral-0 rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={18} className="text-neutral-600" />
        <h2 className="text-lg font-bold text-neutral-800">{title}</h2>
      </div>
      <p className="text-sm text-neutral-500 mb-4">{description}</p>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();

  // Profile
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Plan
  const [propertyCount, setPropertyCount] = useState(0);

  // Notifications
  const [notifs, setNotifs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATIONS);

  // Connected accounts
  const [feeds, setFeeds] = useState<ICalFeed[]>([]);
  const [channelConnections, setChannelConnections] = useState<ChannelConnection[]>([]);
  const [syncingChannex, setSyncingChannex] = useState(false);
  const [lastSync, setLastSync] = useState<{ at: string; checked: number; updated: number; inserted: number; cancelled: number } | null>(null);

  // Security
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);

  // Appearance
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");

  // Export
  const [exportingJson, setExportingJson] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setFullName(user.user_metadata?.full_name ?? "");
      setEmail(user.email ?? "");
      setPhone(user.user_metadata?.phone ?? "");

      const { count } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true });
      setPropertyCount(count ?? 0);

      const { data: icalData } = await supabase
        .from("ical_feeds")
        .select("id, platform, feed_url, last_synced, is_active, property_id, properties(name)");
      if (icalData) setFeeds(icalData);

      // Load Channex-connected channels with property name
      const { data: channelData } = await supabase
        .from("property_channels")
        .select("id, property_id, channel_code, channel_name, status, properties(name)")
        .eq("status", "active");
      if (channelData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: ChannelConnection[] = (channelData as any[]).map((r) => ({
          id: r.id,
          property_id: r.property_id,
          channel_code: r.channel_code,
          channel_name: r.channel_name,
          status: r.status,
          property_name: Array.isArray(r.properties) ? r.properties[0]?.name ?? "Property" : r.properties?.name ?? "Property",
        }));
        setChannelConnections(rows);
      }

      // Load notification prefs from database
      try {
        const res = await fetch("/api/settings/preferences");
        if (res.ok) {
          const json = await res.json();
          setNotifs(json.preferences);
        }
      } catch {}
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveNotifs = async (updated: NotificationPrefs) => {
    setNotifs(updated);
    try {
      await fetch("/api/settings/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: updated }),
      });
    } catch {}
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName, phone },
    });
    setSavingProfile(false);
    if (error) {
      toast(error.message, "error");
    } else {
      toast("Profile updated successfully");
    }
  };

  const handleResetPassword = async () => {
    setResettingPassword(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setResettingPassword(false);
    if (error) {
      toast(error.message, "error");
    } else {
      toast("Password reset email sent");
    }
  };

  // Restore last sync timestamp from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("channex-last-sync");
    if (saved) try { setLastSync(JSON.parse(saved)); } catch { /* ignore */ }
  }, []);

  const handleSyncChannex = async () => {
    setSyncingChannex(true);
    try {
      const res = await fetch("/api/channex/sync-bookings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      const checked = data.checked ?? 0;
      const inserted = data.inserted ?? 0;
      const updated = data.updated ?? 0;
      const cancelled = data.cancelled ?? 0;
      const summary = {
        at: data.synced_at ?? new Date().toISOString(),
        checked, updated, inserted, cancelled,
      };
      setLastSync(summary);
      localStorage.setItem("channex-last-sync", JSON.stringify(summary));
      const parts = [`${checked} checked`];
      if (inserted > 0) parts.push(`${inserted} new`);
      if (updated > 0) parts.push(`${updated} updated`);
      if (cancelled > 0) parts.push(`${cancelled} cancelled`);
      toast(`\u2713 Synced: ${parts.join(", ")}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Sync failed", "error");
    } finally {
      setSyncingChannex(false);
    }
  };

  const formatLastSync = (iso: string): string => {
    const then = new Date(iso);
    const ms = Date.now() - then.getTime();
    const mins = Math.round(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return then.toLocaleDateString();
  };

  const handleExportJson = async () => {
    setExportingJson(true);
    try {
      const [{ data: properties }, { data: bookings }] = await Promise.all([
        supabase.from("properties").select("*"),
        supabase.from("bookings").select("*"),
      ]);
      const blob = new Blob(
        [JSON.stringify({ properties, bookings, exportedAt: new Date().toISOString() }, null, 2)],
        { type: "application/json" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `koast-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Export downloaded");
    } catch {
      toast("Export failed", "error");
    }
    setExportingJson(false);
  };

  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const { data: bookings } = await supabase.from("bookings").select("*");
      if (!bookings?.length) {
        toast("No bookings to export", "error");
        setExportingCsv(false);
        return;
      }
      const headers = Object.keys(bookings[0]);
      const rows = bookings.map((b) =>
        headers.map((h) => {
          const val = String(b[h] ?? "");
          return val.includes(",") ? `"${val}"` : val;
        }).join(",")
      );
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `koast-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast("CSV downloaded");
    } catch {
      toast("Export failed", "error");
    }
    setExportingCsv(false);
  };

  const platformLabel = (p: string) =>
    ({ airbnb: "Airbnb", vrbo: "VRBO", booking_com: "Booking.com", direct: "Direct" }[p] ?? p);

  const platformColor = (p: string) =>
    ({
      airbnb: "bg-rose-100 text-rose-700",
      vrbo: "bg-blue-100 text-blue-700",
      booking_com: "bg-indigo-100 text-indigo-700",
      direct: "bg-neutral-100 text-neutral-700",
    }[p] ?? "bg-neutral-100 text-neutral-700");

  const channelCodeToLabel = (code: string, name: string): string => {
    const c = code.toUpperCase();
    if (c === "ABB") return "Airbnb";
    if (c === "BDC") return "Booking.com";
    if (c === "VRBO") return "VRBO";
    return name || code;
  };

  const channelCodeToColor = (code: string): string => {
    const c = code.toUpperCase();
    if (c === "ABB") return "bg-rose-100 text-rose-700";
    if (c === "BDC") return "bg-indigo-100 text-indigo-700";
    if (c === "VRBO") return "bg-blue-100 text-blue-700";
    return "bg-neutral-100 text-neutral-700";
  };

  const featureList = [
    { label: "1 property", included: true },
    { label: "iCal sync", included: true },
    { label: "AI messaging", included: true },
    { label: "Cleaning tasks", included: true },
    { label: "Multi-property", included: false },
    { label: "Channex integration", included: false },
    { label: "Priority support", included: false },
  ];

  const usagePercent = Math.min((propertyCount / 1) * 100, 100);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-neutral-800">Settings</h1>

      {/* PROFILE */}
      <SectionCard icon={User} title="Profile" description="Manage your account information.">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full h-10 px-3 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
            <div className="relative">
              <input
                type="email"
                value={email}
                readOnly
                className="w-full h-10 px-3 pr-10 text-sm border border-[var(--border)] rounded-lg bg-neutral-50 text-neutral-500 cursor-not-allowed"
              />
              <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full h-10 px-3 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors"
              placeholder="+1 (555) 000-0000"
            />
          </div>
          <button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="h-9 px-4 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors disabled:opacity-50"
          >
            {savingProfile ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </SectionCard>

      {/* PLAN & BILLING */}
      <SectionCard icon={CreditCard} title="Plan & Billing" description="Your current subscription and usage.">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-brand-50 text-[var(--positive)]">
              Free
            </span>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-neutral-600">{propertyCount} of 1 properties used</span>
              <span className="text-neutral-400">{usagePercent}%</span>
            </div>
            <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full transition-all duration-500"
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {featureList.map((f) => (
              <div key={f.label} className="flex items-center gap-2 text-sm text-neutral-600">
                {f.included ? (
                  <Check size={14} className="text-brand-500" />
                ) : (
                  <Lock size={14} className="text-neutral-400" />
                )}
                <span className={f.included ? "" : "text-neutral-400"}>{f.label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled
              className="h-9 px-4 text-sm font-semibold text-white bg-brand-500 rounded-lg opacity-50 cursor-not-allowed"
            >
              Upgrade to Pro &mdash; $79/mo
            </button>
            <span className="text-xs font-medium text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
              Coming Soon
            </span>
          </div>
        </div>
      </SectionCard>

      {/* CHANNEL MANAGER (PRO) */}
      <SectionCard icon={Cable} title="Channel Manager" description="Connect to Channex for two-way rate sync, multi-channel distribution, and real-time webhooks.">
        <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
          <div>
            <p className="text-sm font-medium text-neutral-800">Channex Integration</p>
            <p className="text-xs text-neutral-500 mt-0.5">Push rates to Airbnb, Booking.com, VRBO. Sync availability across all platforms.</p>
          </div>
          <a
            href="https://app.channex.io"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm font-semibold text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors flex-shrink-0"
          >
            Open Channex &rarr;
          </a>
        </div>
        <div className="mt-3 p-4 bg-neutral-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-800">Manual Booking Sync</p>
              <p className="text-xs text-neutral-500 mt-0.5">Pull the latest bookings from Channex. Run this if a webhook was missed.</p>
            </div>
            <button
              onClick={handleSyncChannex}
              disabled={syncingChannex}
              className="h-9 px-4 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0 flex items-center gap-2"
            >
              {syncingChannex && (
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              )}
              {syncingChannex ? "Syncing..." : "Sync from Channex"}
            </button>
          </div>
          {lastSync && (
            <div className="mt-3 pt-3 border-t border-neutral-200 flex items-center justify-between text-xs">
              <span className="text-neutral-500">
                Last sync: <span className="font-medium text-neutral-700">{formatLastSync(lastSync.at)}</span>
              </span>
              <span className="text-neutral-500">
                <span className="inline-flex items-center gap-1 text-[var(--positive)] font-medium">
                  <Check size={12} strokeWidth={3} />
                  {lastSync.checked} checked
                </span>
                {lastSync.inserted > 0 && <span className="ml-2">· {lastSync.inserted} new</span>}
                {lastSync.updated > 0 && <span className="ml-2">· {lastSync.updated} updated</span>}
                {lastSync.cancelled > 0 && <span className="ml-2 text-red-600">· {lastSync.cancelled} cancelled</span>}
              </span>
            </div>
          )}
        </div>
        <p className="text-xs text-neutral-400 mt-3">Part of the Pro plan ($79/mo). Includes rate pushing, availability sync, real-time booking webhooks, and guest messaging.</p>
      </SectionCard>

      {/* NOTIFICATIONS */}
      <SectionCard icon={Bell} title="Notifications" description="Choose what you get notified about.">
        <div className="space-y-3">
          {([
            { key: "email_new_booking" as const, label: "New bookings" },
            { key: "email_messages" as const, label: "Guest messages" },
            { key: "email_cleaning" as const, label: "Cleaning task updates" },
            { key: "email_price_alerts" as const, label: "Price alerts" },
          ]).map((item) => (
            <div key={item.key} className="flex items-center justify-between py-1">
              <span className="text-sm text-neutral-700">{item.label}</span>
              <Toggle
                checked={notifs[item.key]}
                onChange={(v) => saveNotifs({ ...notifs, [item.key]: v })}
              />
            </div>
          ))}
          <div className="border-t border-[var(--border)] pt-3 space-y-3">
            {([
              { key: "sms_enabled" as const, label: "SMS notifications" },
              { key: "push_enabled" as const, label: "Push notifications" },
            ]).map((item) => (
              <div key={item.key} className="flex items-center justify-between py-1 opacity-50">
                <span className="text-sm text-neutral-400">{item.label}</span>
                <span className="text-xs font-medium text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
                  Coming Soon
                </span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* CONNECTED ACCOUNTS */}
      <SectionCard icon={Link2} title="Connected Accounts" description="Your linked OTA channels and calendar feeds.">
        <div className="space-y-3">
          {(() => {
            const codeToPlatform: Record<string, string> = { ABB: "airbnb", BDC: "booking_com", VRBO: "vrbo" };
            const covered = new Set(
              channelConnections.map((ch) => `${ch.property_id}:${codeToPlatform[ch.channel_code.toUpperCase()] ?? ch.channel_code.toLowerCase()}`)
            );
            const visibleFeeds = feeds.filter((f) => !covered.has(`${(f as unknown as { property_id: string }).property_id}:${f.platform}`));
            if (channelConnections.length === 0 && visibleFeeds.length === 0) {
              return <p className="text-sm text-neutral-400">No channels connected yet.</p>;
            }
            return (
            <>
              {channelConnections.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-center justify-between py-2 px-3 border border-[var(--border)] rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${channelCodeToColor(ch.channel_code)}`}>
                      {channelCodeToLabel(ch.channel_code, ch.channel_name)}
                    </span>
                    <span className="text-xs font-medium text-neutral-700 truncate max-w-[180px]">
                      {ch.property_name}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      ch.status === "active"
                        ? "bg-brand-50 text-[var(--positive)]"
                        : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {ch.status === "active" ? "Active" : ch.status.charAt(0).toUpperCase() + ch.status.slice(1)}
                  </span>
                </div>
              ))}
              {visibleFeeds.map((feed) => (
                <div
                  key={feed.id}
                  className="flex items-center justify-between py-2 px-3 border border-[var(--border)] rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${platformColor(feed.platform)}`}>
                      {platformLabel(feed.platform)}
                    </span>
                    <span className="text-xs font-medium text-neutral-700 truncate max-w-[150px]">
                      {(Array.isArray(feed.properties) ? feed.properties[0]?.name : feed.properties?.name) ?? "Property"}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {feed.last_synced
                        ? `Synced ${new Date(feed.last_synced).toLocaleDateString()}`
                        : "Never synced"}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      feed.is_active
                        ? "bg-brand-50 text-[var(--positive)]"
                        : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {feed.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              ))}
            </>
            );
          })()}
          <a
            href="/properties"
            className="inline-flex items-center text-sm font-medium text-brand-500 hover:text-brand-600 transition-colors"
          >
            Manage Connections &rarr;
          </a>
        </div>
      </SectionCard>

      {/* SECURITY */}
      <SectionCard icon={Shield} title="Security" description="Manage your password and account access.">
        <div className="space-y-4">
          <button
            onClick={handleResetPassword}
            disabled={resettingPassword}
            className="h-9 px-4 text-sm font-medium text-neutral-700 border border-[var(--border)] hover:border-neutral-300 rounded-lg transition-colors disabled:opacity-50"
          >
            {resettingPassword ? "Sending..." : "Change Password"}
          </button>
          <div className="border-t border-[var(--border)] pt-4">
            <button
              onClick={() => setShowDeleteModal(true)}
              className="h-9 px-4 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition-colors"
            >
              Delete Account
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-neutral-0 rounded-lg p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={20} className="text-red-500" />
              <h3 className="text-lg font-bold text-neutral-800">Delete Account</h3>
            </div>
            <p className="text-sm text-neutral-600 mb-4">
              This action is permanent. Type <strong>DELETE</strong> to confirm.
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="Type DELETE"
              className="w-full h-10 px-3 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirm("");
                }}
                className="h-9 px-4 text-sm font-medium text-neutral-600 border border-[var(--border)] rounded-lg hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={deleteConfirm !== "DELETE"}
                onClick={async () => {
                  try {
                    const res = await fetch("/api/settings/delete-account", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ confirmation: deleteConfirm }),
                    });
                    if (!res.ok) {
                      const data = await res.json();
                      toast(data.error ?? "Deletion failed", "error");
                      return;
                    }
                    await supabase.auth.signOut();
                    router.push("/login");
                  } catch {
                    toast("Deletion failed", "error");
                  } finally {
                    setShowDeleteModal(false);
                    setDeleteConfirm("");
                  }
                }}
                className="h-9 px-4 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete My Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DATA & EXPORT */}
      <SectionCard icon={Download} title="Data & Export" description="Download your data in various formats.">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportJson}
            disabled={exportingJson}
            className="h-9 px-4 text-sm font-medium text-neutral-700 border border-[var(--border)] hover:border-neutral-300 rounded-lg transition-colors disabled:opacity-50"
          >
            {exportingJson ? "Exporting..." : "Export All Data (JSON)"}
          </button>
          <button
            onClick={handleExportCsv}
            disabled={exportingCsv}
            className="h-9 px-4 text-sm font-medium text-neutral-700 border border-[var(--border)] hover:border-neutral-300 rounded-lg transition-colors disabled:opacity-50"
          >
            {exportingCsv ? "Exporting..." : "Export Bookings (CSV)"}
          </button>
        </div>
      </SectionCard>

      {/* APPEARANCE */}
      <SectionCard icon={Palette} title="Appearance" description="Customize how Koast looks.">
        <div className="grid grid-cols-3 gap-3">
          {(["light", "dark", "system"] as const).map((t) => (
            <button
              key={t}
              onClick={() => t !== "dark" && setTheme(t)}
              className={`relative flex flex-col items-center gap-2 p-4 rounded-lg border transition-all ${
                theme === t
                  ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20"
                  : "border-[var(--border)] hover:border-neutral-300"
              } ${t === "dark" ? "cursor-not-allowed" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-lg ${
                  t === "light"
                    ? "bg-white border border-neutral-200"
                    : t === "dark"
                    ? "bg-neutral-800 border border-neutral-700"
                    : "bg-gradient-to-br from-white to-neutral-800 border border-neutral-300"
                }`}
              />
              <span className="text-xs font-medium text-neutral-700 capitalize">{t}</span>
              {t === "dark" && (
                <div className="absolute inset-0 bg-white/60 rounded-lg flex items-center justify-center">
                  <span className="text-xs font-medium text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
                    Coming Soon
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
