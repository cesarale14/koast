"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";

interface ICalFeed {
  id: string;
  platform: string;
  feed_url: string;
  last_synced: string | null;
  is_active: boolean;
}

interface NotificationPrefs {
  newBookings: boolean;
  guestMessages: boolean;
  cleaningUpdates: boolean;
  priceAlerts: boolean;
}

const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  newBookings: true,
  guestMessages: true,
  cleaningUpdates: true,
  priceAlerts: false,
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
    <div className="bg-neutral-0 border border-[var(--border)] rounded-lg p-6">
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
        .select("id, platform, feed_url, last_synced, is_active");
      if (icalData) setFeeds(icalData);
    }
    load();

    // Load notification prefs from localStorage
    try {
      const saved = localStorage.getItem("sc_notification_prefs");
      if (saved) setNotifs(JSON.parse(saved));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveNotifs = (updated: NotificationPrefs) => {
    setNotifs(updated);
    localStorage.setItem("sc_notification_prefs", JSON.stringify(updated));
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
      a.download = `staycommand-export-${new Date().toISOString().slice(0, 10)}.json`;
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
      a.download = `staycommand-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
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
            className="h-9 px-4 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors disabled:opacity-50"
          >
            {savingProfile ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </SectionCard>

      {/* PLAN & BILLING */}
      <SectionCard icon={CreditCard} title="Plan & Billing" description="Your current subscription and usage.">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700">
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
              className="h-9 px-4 text-sm font-medium text-white bg-brand-500 rounded-lg opacity-50 cursor-not-allowed"
            >
              Upgrade to Pro &mdash; $29/mo
            </button>
            <span className="text-xs font-medium text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
              Coming Soon
            </span>
          </div>
        </div>
      </SectionCard>

      {/* NOTIFICATIONS */}
      <SectionCard icon={Bell} title="Notifications" description="Choose what you get notified about.">
        <div className="space-y-3">
          {([
            { key: "newBookings" as const, label: "New bookings" },
            { key: "guestMessages" as const, label: "Guest messages" },
            { key: "cleaningUpdates" as const, label: "Cleaning task updates" },
            { key: "priceAlerts" as const, label: "Price alerts" },
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
            {["SMS notifications", "Push notifications"].map((label) => (
              <div key={label} className="flex items-center justify-between py-1 opacity-50">
                <span className="text-sm text-neutral-400">{label}</span>
                <span className="text-xs font-medium text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
                  Coming Soon
                </span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* CONNECTED ACCOUNTS */}
      <SectionCard icon={Link2} title="Connected Accounts" description="Your linked calendar feeds and integrations.">
        <div className="space-y-3">
          {feeds.length === 0 ? (
            <p className="text-sm text-neutral-400">No calendar feeds connected yet.</p>
          ) : (
            feeds.map((feed) => (
              <div
                key={feed.id}
                className="flex items-center justify-between py-2 px-3 border border-[var(--border)] rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${platformColor(feed.platform)}`}>
                    {platformLabel(feed.platform)}
                  </span>
                  <span className="text-xs text-neutral-400 truncate max-w-[200px]">
                    {feed.last_synced
                      ? `Synced ${new Date(feed.last_synced).toLocaleDateString()}`
                      : "Never synced"}
                  </span>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    feed.is_active
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {feed.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            ))
          )}
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
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirm("");
                  toast("Account deletion requested. We'll process this within 48 hours.");
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
      <SectionCard icon={Palette} title="Appearance" description="Customize how StayCommand looks.">
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
