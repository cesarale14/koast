"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Home, Plus, X, Loader2, ChevronRight, Check, ExternalLink } from "lucide-react";

/* ---------- Types (keep compatible with server page.tsx) ---------- */
interface PropertyData {
  id: string; name: string; address: string | null; city: string | null;
  state: string | null; property_type: string | null; bedrooms: number | null;
  bathrooms: number | null; max_guests: number | null;
  channex_property_id: string | null; cover_photo_url: string | null;
}
interface ChannelRecord { property_id: string; channel_code: string; channel_name: string; status: string; }
interface PropertiesPageProps {
  properties: PropertyData[]; channels: ChannelRecord[];
  bookingCounts: Record<string, number>; occupancy: Record<string, number>;
  nextCheckins: Record<string, { date: string; guest: string | null }>;
}

/* ---------- Constants ---------- */
const PLATFORMS = [
  { code: "ABB", name: "Airbnb", color: "bg-red-500", letter: "A", desc: "Import your Airbnb listing" },
  { code: "BDC", name: "Booking.com", color: "bg-blue-600", letter: "B", desc: "Import from Booking.com" },
  { code: "VRBO", name: "VRBO", color: "bg-purple-600", letter: "V", desc: "Import from VRBO" },
];
type Platform = (typeof PLATFORMS)[0];

const BADGE: Record<string, { label: string; bg: string; text: string }> = {
  ABB: { label: "Airbnb", bg: "bg-red-50", text: "text-red-700" },
  BDC: { label: "Booking.com", bg: "bg-blue-50", text: "text-blue-700" },
  VRBO: { label: "VRBO", bg: "bg-purple-50", text: "text-purple-700" },
  EXP: { label: "Expedia", bg: "bg-yellow-50", text: "text-yellow-700" },
  AGO: { label: "Agoda", bg: "bg-red-50", text: "text-red-700" },
  CTP: { label: "Trip.com", bg: "bg-blue-50", text: "text-blue-700" },
};
const TYPE_LABELS: Record<string, string> = { entire_home: "Entire Home", private_room: "Private Room", shared_room: "Shared Room" };

/* ---------- Helpers ---------- */
async function scaffoldAndGetIframe(force: boolean, channelCode: string) {
  const scaff = await fetch(`/api/properties/auto-scaffold${force ? "?force=true" : ""}`, { method: "POST" });
  if (!scaff.ok) { const d = await scaff.json(); throw new Error(d.error ?? "Failed to set up property"); }
  const s = await scaff.json();
  const tr = await fetch(`/api/channels/token/${s.property_id}`, { method: "POST" });
  if (!tr.ok) { const d = await tr.json(); throw new Error(d.error ?? "Failed to get token"); }
  const td = await tr.json();
  return { propertyId: s.property_id as string, channexId: s.channex_property_id as string, iframeUrl: `${td.iframe_url}&channels=${channelCode}` };
}

/* ---------- Property Card ---------- */
function PropertyCard({ property: p, connectedChannels, bookingCount, occupancy, nextCheckin }: {
  property: PropertyData; connectedChannels: ChannelRecord[];
  bookingCount: number; occupancy: number; nextCheckin: { date: string; guest: string | null } | null;
}) {
  return (
    <Link href={`/properties/${p.id}`} className="bg-neutral-0 rounded-xl border border-[var(--border)] shadow-sm hover:shadow-md transition-all group">
      {p.cover_photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <div className="h-40 rounded-t-xl overflow-hidden"><img src={p.cover_photo_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" /></div>
      ) : (
        <div className="h-40 bg-gradient-to-br from-brand-50 to-brand-100 rounded-t-xl flex items-center justify-center"><Home size={32} className="text-brand-300" strokeWidth={1.5} /></div>
      )}
      <div className="p-5">
        <h3 className="text-lg font-semibold text-neutral-800 group-hover:text-brand-500 transition-colors">{p.name}</h3>
        {(p.city || p.state) && <p className="text-sm text-neutral-500 mt-0.5">{[p.city, p.state].filter(Boolean).join(", ")}</p>}
        <div className="flex items-center gap-3 mt-3 text-xs text-neutral-400">
          {p.property_type && <span>{TYPE_LABELS[p.property_type] ?? p.property_type}</span>}
          {p.bedrooms != null && <span>{p.bedrooms} bed</span>}
          {p.bathrooms != null && <span>{p.bathrooms} bath</span>}
          {p.max_guests != null && <span>{p.max_guests} guests</span>}
        </div>
        <div className="mt-3">
          {connectedChannels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {connectedChannels.map((ch) => {
                const b = BADGE[ch.channel_code];
                return <span key={ch.channel_code} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${b ? `${b.bg} ${b.text}` : "bg-neutral-100 text-neutral-500"}`}>{b?.label ?? ch.channel_name}</span>;
              })}
            </div>
          ) : <span className="text-xs text-neutral-400">No channels connected</span>}
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-100">
          <div><p className="text-xs text-neutral-400">Bookings</p><p className="text-sm font-semibold font-mono text-neutral-800">{bookingCount}</p></div>
          <div><p className="text-xs text-neutral-400">Occupancy</p><p className="text-sm font-semibold font-mono text-neutral-800">{occupancy}%</p></div>
          <div className="text-right"><p className="text-xs text-neutral-400">Next check-in</p>
            <p className="text-sm font-medium text-neutral-700">{nextCheckin ? new Date(nextCheckin.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "\u2014"}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ---------- Iframe bar ---------- */
function IframeBar({ platform, label }: { platform: Platform; label: string }) {
  return (
    <div className="rounded-t-lg bg-emerald-600 px-4 py-2 flex items-center gap-2">
      <div className={`w-6 h-6 rounded ${platform.color} flex items-center justify-center text-white text-[10px] font-bold`}>{platform.letter}</div>
      <span className="text-sm font-medium text-white">{platform.name} &mdash; {label}</span>
    </div>
  );
}

/* ---------- Full-Screen Add Property Modal (5 steps) ---------- */
function AddPropertyModal({ hasExisting, onClose }: { hasExisting: boolean; onClose: (didImport: boolean) => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [scaffoldPropId, setScaffoldPropId] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [mappedListingId, setMappedListingId] = useState<string | null>(null);
  const [listingName, setListingName] = useState("");
  const [listingPhoto, setListingPhoto] = useState<string | null>(null);
  const [editedName, setEditedName] = useState("");
  const [icalUrl, setIcalUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const didImport = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(didImport.current); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const applyScaffold = useCallback((r: { propertyId: string; iframeUrl: string }) => {
    setScaffoldPropId(r.propertyId);
    setIframeUrl(r.iframeUrl);
  }, []);

  // Step 1 -> 2/3: select platform, check connection
  const selectPlatform = useCallback(async (p: Platform) => {
    setPlatform(p); setError(null); setStep(2); setLoading(true);
    setLoadMsg("Checking account status...");
    try {
      const sr = await fetch("/api/channels/status");
      if (!sr.ok) throw new Error("Failed to check channel status");
      const sd = await sr.json();
      const isConnected = sd.connected?.[p.code]?.active ?? false;
      if (isConnected) {
        setLoadMsg("Already connected \u2713");
        await new Promise((r) => setTimeout(r, 800));
      }
      setLoadMsg(isConnected ? "Preparing listing selector..." : `Connecting to ${p.name}...`);
      const r = await scaffoldAndGetIframe(hasExisting, p.code);
      applyScaffold(r);
      setLoading(false);
      if (isConnected) setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed"); setLoading(false);
    }
  }, [hasExisting, applyScaffold]);

  // Step 2 -> 3: after OAuth, advance to mapping
  const advanceToMapping = useCallback(async () => {
    if (scaffoldPropId && iframeUrl) { setStep(3); return; }
    setLoading(true); setLoadMsg("Preparing listing selector...");
    try {
      const r = await scaffoldAndGetIframe(hasExisting, platform?.code ?? "ABB");
      applyScaffold(r); setLoading(false); setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed"); setLoading(false);
    }
  }, [scaffoldPropId, iframeUrl, hasExisting, platform, applyScaffold]);

  // Step 3 -> 4: after mapping, fetch listing details
  const handleMappingDone = useCallback(async () => {
    if (!scaffoldPropId || !platform) return;
    setStep(4); setLoading(true); setLoadMsg("Finding your listing details...");
    try {
      await fetch(`/api/channels/${scaffoldPropId}/refresh`, { method: "POST" });
      const lr = await fetch("/api/channels/listings");
      if (!lr.ok) throw new Error("Failed to fetch listings");
      const ld = await lr.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all = (ld.listings ?? []) as any[];
      const target = all.filter((l: { imported: boolean }) => !l.imported)[0] ?? all[0];
      if (!target) throw new Error("No listing found. Please try the mapping step again.");
      let name = target.listing_name ?? "Imported Property";
      let photo: string | null = null;
      if (platform.code === "ABB" && target.listing_id) {
        try {
          const dr = await fetch(`/api/airbnb/listing-details?listingId=${target.listing_id}`);
          if (dr.ok) { const d = await dr.json(); if (d.name) name = d.short_name ?? d.name; if (d.photo_url) photo = d.photo_url; }
        } catch { /* fallback */ }
      }
      setMappedListingId(String(target.listing_id));
      setListingName(name); setListingPhoto(photo); setEditedName(name); setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch listing details"); setLoading(false);
    }
  }, [scaffoldPropId, platform]);

  // Step 4 -> 5: import property
  const handleImport = useCallback(async () => {
    if (!mappedListingId) return;
    setImporting(true);
    try {
      const res = await fetch("/api/properties/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_ids: [mappedListingId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      if ((data.imported ?? 0) > 0) {
        if (icalUrl.trim()) {
          try {
            const ir = data.results?.find((r: { status: string }) => r.status === "imported");
            if (ir) await fetch("/api/ical/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ property_id: ir.listing_id, url: icalUrl.trim(), platform: platform?.code === "ABB" ? "airbnb" : platform?.code === "BDC" ? "booking_com" : "vrbo" }) });
          } catch { /* best-effort */ }
        }
        didImport.current = true; setImportedCount(data.imported);
        toast("Property imported successfully!"); setStep(5);
      } else throw new Error("No properties imported. The listing may already exist.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed", "error");
    } finally { setImporting(false); }
  }, [mappedListingId, icalUrl, platform, toast]);

  // Reset for "Add Another" -> back to Step 3 with fresh scaffold
  const handleAddAnother = useCallback(() => {
    setScaffoldPropId(null); setIframeUrl(null); setMappedListingId(null);
    setListingName(""); setListingPhoto(null); setEditedName(""); setIcalUrl("");
    setImporting(false); setImportedCount(0); setError(null);
    if (!platform) { setStep(1); return; }
    setStep(3); setLoading(true); setLoadMsg("Preparing listing selector...");
    scaffoldAndGetIframe(true, platform.code).then((r) => {
      applyScaffold(r); setLoading(false);
    }).catch((e) => {
      setError(e instanceof Error ? e.message : "Setup failed"); setLoading(false);
    });
  }, [platform, applyScaffold]);

  const badge = platform ? BADGE[platform.code] : null;
  const iframeStyle = { height: 600, borderRadius: "0 0 8px 8px" } as const;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <button onClick={() => onClose(didImport.current)} className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition-colors"><X size={20} /></button>
          <h1 className="text-lg font-bold text-neutral-800">Add a Property</h1>
        </div>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className={`w-2 h-2 rounded-full ${step >= s ? "bg-brand-500" : "bg-neutral-200"}`} />
          ))}
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          {error ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4"><X size={24} className="text-red-500" /></div>
                <p className="text-sm font-medium text-neutral-800 mb-1">Something went wrong</p>
                <p className="text-xs text-neutral-500 mb-4">{error}</p>
                <button onClick={() => { setError(null); setStep(1); }} className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">Try again</button>
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-32">
              <div className="text-center">
                <Loader2 size={28} className="animate-spin text-brand-500 mx-auto mb-3" />
                <p className="text-sm font-medium text-neutral-600">{loadMsg}</p>
              </div>
            </div>

          ) : step === 1 ? (
            <div>
              <h2 className="text-xl font-bold text-neutral-800 mb-2">Choose a platform</h2>
              <p className="text-sm text-neutral-500 mb-6">Select where your property is listed</p>
              <div className="space-y-3">
                {PLATFORMS.map((p) => (
                  <button key={p.code} onClick={() => selectPlatform(p)}
                    className="w-full flex items-center gap-4 p-5 rounded-xl border border-[var(--border)] bg-white hover:bg-neutral-50 hover:border-neutral-300 transition-all group text-left">
                    <div className={`w-12 h-12 rounded-xl ${p.color} flex items-center justify-center text-white font-bold text-lg shrink-0`}>{p.letter}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-neutral-800">{p.name}</p>
                      <p className="text-xs text-neutral-500">{p.desc}</p>
                    </div>
                    <ChevronRight size={18} className="text-neutral-400 group-hover:text-neutral-600 shrink-0" />
                  </button>
                ))}
                <button disabled className="w-full flex items-center gap-4 p-5 rounded-xl border border-dashed border-neutral-200 bg-neutral-50 text-left opacity-50 cursor-not-allowed">
                  <div className="w-12 h-12 rounded-xl bg-neutral-200 flex items-center justify-center text-neutral-400 font-bold text-lg shrink-0">+</div>
                  <div className="flex-1 min-w-0"><p className="font-semibold text-neutral-400">Add manually</p><p className="text-xs text-neutral-400">Coming soon</p></div>
                </button>
              </div>
            </div>

          ) : step === 2 && platform ? (
            <div>
              <h2 className="text-xl font-bold text-neutral-800 mb-2">Connect your {platform.name} account</h2>
              <p className="text-sm text-neutral-500 mb-6">Authorize {platform.name} access to import your listings</p>
              {iframeUrl && (<>
                <IframeBar platform={platform} label="Connect Account" />
                <iframe src={iframeUrl} className="w-full border border-neutral-200 rounded-b-lg" style={iframeStyle} allow="camera; microphone" title={`Connect ${platform.name}`} />
                <div className="mt-6 flex justify-end">
                  <button onClick={advanceToMapping} className="px-6 py-3 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors">I&apos;ve connected my account</button>
                </div>
              </>)}
            </div>

          ) : step === 3 && platform ? (
            <div>
              <h2 className="text-xl font-bold text-neutral-800 mb-2">Map your listing</h2>
              <div className="bg-neutral-50 rounded-xl p-4 mb-6 space-y-2">
                <p className="text-sm text-neutral-700 font-medium">Follow these steps in the panel below:</p>
                <ol className="text-sm text-neutral-600 space-y-1.5 list-decimal list-inside">
                  <li>Click the <span className="font-semibold">Mapping</span> tab at the top</li>
                  <li>Find the listing you want to add and click <span className="font-semibold">&quot;Not mapped&quot;</span></li>
                  <li>Select <span className="font-semibold">&quot;Entire Home&quot;</span> then <span className="font-semibold">&quot;Best Available Rate&quot;</span></li>
                  <li>Click <span className="font-semibold">Save</span></li>
                </ol>
              </div>
              {iframeUrl && (<>
                <IframeBar platform={platform} label="Map your listing" />
                <iframe src={iframeUrl} className="w-full border border-neutral-200 rounded-b-lg" style={iframeStyle} allow="camera; microphone" title={`Map ${platform.name} listing`} />
              </>)}
              <div className="mt-6 flex justify-end">
                <button onClick={handleMappingDone} className="px-6 py-3 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors">I&apos;ve mapped my listing</button>
              </div>
            </div>

          ) : step === 4 ? (
            <div>
              <h2 className="text-xl font-bold text-neutral-800 mb-2">Confirm your property</h2>
              <p className="text-sm text-neutral-500 mb-6">Review the details below before importing</p>
              <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden max-w-md mx-auto">
                {listingPhoto ? (
                  <div className="h-52 overflow-hidden rounded-t-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={listingPhoto} alt={editedName} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-52 bg-gradient-to-br from-brand-50 to-brand-100 rounded-t-xl flex items-center justify-center"><Home size={40} className="text-brand-300" strokeWidth={1.5} /></div>
                )}
                <div className="p-5 space-y-4">
                  {badge && <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${badge.bg} ${badge.text}`}>{badge.label}</span>}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1">Property Name</label>
                    <input type="text" value={editedName} onChange={(e) => setEditedName(e.target.value)}
                      className="w-full px-3 py-2 text-sm text-neutral-800 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1">iCal Calendar URL <span className="text-neutral-400">(optional)</span></label>
                    <input type="url" value={icalUrl} onChange={(e) => setIcalUrl(e.target.value)} placeholder="Paste your Airbnb calendar export URL"
                      className="w-full px-3 py-2 text-sm text-neutral-800 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 placeholder:text-neutral-300" />
                    <p className="mt-1.5 text-xs text-neutral-400 flex items-center gap-1"><ExternalLink size={10} />How to find this: Airbnb &rarr; Listing &rarr; Calendar &rarr; Export</p>
                  </div>
                  <button onClick={handleImport} disabled={importing || !editedName.trim()}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50">
                    {importing ? <><Loader2 size={16} className="animate-spin" />Importing...</> : "Import Property"}
                  </button>
                </div>
              </div>
            </div>

          ) : step === 5 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6"><Check size={32} className="text-emerald-500" strokeWidth={2.5} /></div>
                <h2 className="text-xl font-bold text-neutral-800 mb-2">Property added!</h2>
                {importedCount > 0 && <p className="text-sm text-neutral-500 mb-6">{importedCount} booking{importedCount !== 1 ? "s" : ""} imported</p>}
                <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden mt-4 mb-8 text-left">
                  {listingPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <div className="h-36 overflow-hidden"><img src={listingPhoto} alt={editedName || listingName} className="w-full h-full object-cover" /></div>
                  ) : (
                    <div className="h-36 bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center"><Home size={28} className="text-brand-300" strokeWidth={1.5} /></div>
                  )}
                  <div className="p-4">
                    <p className="text-sm font-semibold text-neutral-800">{editedName || listingName}</p>
                    {badge && <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-2 ${badge.bg} ${badge.text}`}>{badge.label}</span>}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button onClick={handleAddAnother} className="px-5 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">Add Another Property</button>
                  <button onClick={() => onClose(true)} className="px-5 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 transition-colors">Done</button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ---------- Main Component ---------- */
export default function PropertiesPage({ properties, channels, bookingCounts, occupancy, nextCheckins }: PropertiesPageProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  const chMap = new Map<string, ChannelRecord[]>();
  for (const ch of channels) {
    if (ch.status !== "active") continue;
    if (!chMap.has(ch.property_id)) chMap.set(ch.property_id, []);
    chMap.get(ch.property_id)!.push(ch);
  }

  // Cleanup orphaned scaffolds on mount + when modal closes without completing
  const cleanupScaffolds = useCallback(() => {
    fetch("/api/properties/cleanup-scaffolds", { method: "POST" }).catch(() => {});
  }, []);

  useEffect(() => { cleanupScaffolds(); }, [cleanupScaffolds]);

  const closeModal = useCallback((didImport: boolean) => {
    setShowModal(false);
    if (didImport) {
      router.refresh();
    } else {
      // User cancelled — clean up any orphaned scaffold
      cleanupScaffolds();
    }
  }, [router, cleanupScaffolds]);

  if (properties.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center max-w-lg">
            <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6"><Home size={32} className="text-brand-500" strokeWidth={1.5} /></div>
            <h1 className="text-2xl font-bold text-neutral-800 mb-2">Add your first property</h1>
            <p className="text-neutral-500 mb-8">Import from Airbnb, Booking.com, or VRBO to get started</p>
            <div className="space-y-3 max-w-sm mx-auto mb-8">
              {PLATFORMS.map((p) => (
                <button key={p.code} onClick={() => setShowModal(true)}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-white hover:bg-neutral-50 hover:border-neutral-300 transition-all group text-left">
                  <div className={`w-10 h-10 rounded-lg ${p.color} flex items-center justify-center text-white font-bold text-sm shrink-0`}>{p.letter}</div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-neutral-800">{p.name}</p><p className="text-xs text-neutral-500">{p.desc}</p></div>
                  <ChevronRight size={16} className="text-neutral-400 group-hover:text-neutral-600 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
        {showModal && <AddPropertyModal hasExisting={false} onClose={closeModal} />}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-bold text-neutral-800">Properties</h1>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 transition-colors"><Plus size={16} />Add Property</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {properties.map((prop) => (
          <PropertyCard key={prop.id} property={prop} connectedChannels={chMap.get(prop.id) ?? []}
            bookingCount={bookingCounts[prop.id] ?? 0} occupancy={occupancy[prop.id] ?? 0}
            nextCheckin={nextCheckins[prop.id] ?? null} />
        ))}
      </div>
      {showModal && <AddPropertyModal hasExisting={properties.length > 0} onClose={closeModal} />}
    </div>
  );
}
