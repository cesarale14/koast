"use client";
import { useState, useCallback, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Home, Plus, X, Loader2, ChevronRight, Check } from "lucide-react";

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
type ModalStep = "choose" | "connect" | "confirm" | "success";
interface ImportedListing { listing_id: string; name: string; photo_url: string | null; }

const BADGE: Record<string, { label: string; bg: string; text: string }> = {
  ABB: { label: "Airbnb", bg: "bg-red-50", text: "text-red-700" },
  BDC: { label: "Booking.com", bg: "bg-blue-50", text: "text-blue-700" },
  VRBO: { label: "VRBO", bg: "bg-purple-50", text: "text-purple-700" },
  EXP: { label: "Expedia", bg: "bg-yellow-50", text: "text-yellow-700" },
  AGO: { label: "Agoda", bg: "bg-red-50", text: "text-red-700" },
  CTP: { label: "Trip.com", bg: "bg-blue-50", text: "text-blue-700" },
};
const TYPE_LABELS: Record<string, string> = { entire_home: "Entire Home", private_room: "Private Room", shared_room: "Shared Room" };

/* ---------- Spinner helper ---------- */
function Spin({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="text-center">
        <Loader2 size={28} className="animate-spin text-brand-500 mx-auto mb-3" />
        <p className="text-sm font-medium text-neutral-600">{text}</p>
      </div>
    </div>
  );
}

/* ---------- Step 1: Choose Platform ---------- */
function StepChoose({ onSelect }: { onSelect: (p: Platform) => void }) {
  return (
    <div className="p-6">
      <h2 className="text-lg font-bold text-neutral-800 mb-1">Add a property</h2>
      <p className="text-sm text-neutral-500 mb-6">Choose a platform to import from</p>
      <div className="space-y-3">
        {PLATFORMS.map((p) => (
          <button key={p.code} onClick={() => onSelect(p)}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-[var(--border)] bg-neutral-0 hover:bg-neutral-50 hover:border-neutral-300 transition-all group text-left">
            <div className={`w-10 h-10 rounded-full ${p.color} flex items-center justify-center text-white font-bold text-sm shrink-0`}>{p.letter}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-neutral-800">Connect {p.name}</p>
              <p className="text-xs text-neutral-500">{p.desc}</p>
            </div>
            <ChevronRight size={16} className="text-neutral-400 group-hover:text-neutral-600 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Step 2: Connect / Map via iframe ---------- */
function StepConnect({ platform, hasExisting, onComplete, onError }: {
  platform: Platform; hasExisting: boolean;
  onComplete: (propertyId: string) => void; onError: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadMsg, setLoadMsg] = useState("Checking account status...");
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; ran.current = true;
    let off = false;
    (async () => {
      try {
        const sr = await fetch("/api/channels/status");
        if (!sr.ok) throw new Error("Failed to check channel status");
        const sd = await sr.json();
        const isConn = sd.connected?.[platform.code]?.active ?? false;
        if (off) return; setConnected(isConn);
        setLoadMsg(isConn ? "Preparing listing selector..." : `Connecting to ${platform.name}...`);
        const scaff = await fetch(`/api/properties/auto-scaffold${hasExisting ? "?force=true" : ""}`, { method: "POST" });
        if (!scaff.ok) { const d = await scaff.json(); throw new Error(d.error ?? "Failed to set up property"); }
        const s = await scaff.json(); if (off) return; setPropertyId(s.property_id);
        const tr = await fetch(`/api/channels/token/${s.property_id}`, { method: "POST" });
        if (!tr.ok) { const d = await tr.json(); throw new Error(d.error ?? "Failed to get token"); }
        const td = await tr.json(); if (off) return;
        setIframeUrl(`${td.iframe_url}&channels=${platform.code}`);
        setLoading(false);
      } catch (e) { if (!off) onError(e instanceof Error ? e.message : "Setup failed"); }
    })();
    return () => { off = true; };
  }, [platform, hasExisting, onError]);

  if (loading) return <Spin text={loadMsg} />;
  return (
    <div className="flex flex-col" style={{ minHeight: 500 }}>
      <div className="px-6 pt-5 pb-3">
        <h3 className="text-base font-semibold text-neutral-800 mb-1">
          {connected ? "Select a listing to import" : `Connect your ${platform.name} account`}
        </h3>
        <p className="text-xs text-neutral-500">
          {connected
            ? "Select one of your listings on the left and map it to the room type on the right. Click Save when done."
            : `Authorize ${platform.name} access, then map a listing to your property. Click Save in the iframe when done.`}
        </p>
      </div>
      <div className="mx-4 rounded-t-lg bg-emerald-600 px-4 py-2 flex items-center gap-2">
        <div className={`w-6 h-6 rounded ${platform.color} flex items-center justify-center text-white text-[10px] font-bold`}>{platform.letter}</div>
        <span className="text-sm font-medium text-white">{platform.name} &mdash; Map your listing</span>
      </div>
      {iframeUrl && (
        <div className="mx-4 flex-1">
          <iframe src={iframeUrl} className="w-full border-0 rounded-b-lg" style={{ height: 600 }} allow="camera; microphone" title={`Connect ${platform.name}`} />
        </div>
      )}
      <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] mt-4">
        <p className="text-xs text-neutral-500">Complete the mapping above, then continue</p>
        <button onClick={() => propertyId && onComplete(propertyId)}
          className="px-5 py-2.5 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
          I&apos;ve completed the setup
        </button>
      </div>
    </div>
  );
}

/* ---------- Step 3: Confirm Import ---------- */
function StepConfirm({ propertyId, platform, onImported, onError }: {
  propertyId: string; platform: Platform;
  onImported: (l: ImportedListing) => void; onError: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [listing, setListing] = useState<{ id: string; name: string; photo: string | null } | null>(null);
  const [editName, setEditName] = useState("");
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; ran.current = true;
    let off = false;
    (async () => {
      try {
        await fetch(`/api/channels/${propertyId}/refresh`, { method: "POST" });
        const lr = await fetch("/api/channels/listings");
        if (!lr.ok) throw new Error("Failed to fetch listings");
        const ld = await lr.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const all = (ld.listings ?? []) as any[];
        const target = all.filter((l: { imported: boolean }) => !l.imported)[0] ?? all[0];
        if (!target) { if (!off) onError("No listing found. Please try the mapping step again."); return; }
        let name = target.listing_name ?? "Imported Property";
        let photo: string | null = null;
        if (platform.code === "ABB" && target.listing_id) {
          try {
            const dr = await fetch(`/api/airbnb/listing-details?listingId=${target.listing_id}`);
            if (dr.ok) { const d = await dr.json(); if (d.name) name = d.name; if (d.photo_url) photo = d.photo_url; }
          } catch { /* fallback */ }
        }
        if (off) return;
        setListing({ id: String(target.listing_id), name, photo }); setEditName(name); setLoading(false);
      } catch (e) { if (!off) onError(e instanceof Error ? e.message : "Failed to fetch listing details"); }
    })();
    return () => { off = true; };
  }, [propertyId, platform, onError]);

  const handleImport = useCallback(async () => {
    if (!listing) return; setImporting(true);
    try {
      const r = await fetch("/api/properties/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listing_ids: [listing.id] }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Import failed");
      if ((d.imported ?? 0) > 0) { toast("Property imported successfully!"); onImported({ listing_id: listing.id, name: editName, photo_url: listing.photo }); }
      else throw new Error("No properties imported. The listing may already exist.");
    } catch (e) { toast(e instanceof Error ? e.message : "Import failed", "error"); setImporting(false); }
  }, [listing, editName, toast, onImported]);

  if (loading) return <Spin text="Fetching your listing details..." />;
  if (!listing) return null;
  return (
    <div className="p-6">
      <h3 className="text-lg font-bold text-neutral-800 mb-1">Confirm your property</h3>
      <p className="text-sm text-neutral-500 mb-6">Review the details below before importing</p>
      <div className="bg-neutral-0 rounded-xl border border-[var(--border)] overflow-hidden max-w-md mx-auto">
        {listing.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <div className="h-48 overflow-hidden"><img src={listing.photo} alt={editName} className="w-full h-full object-cover" /></div>
        ) : (
          <div className="h-48 bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center"><Home size={40} className="text-brand-300" strokeWidth={1.5} /></div>
        )}
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Property Name</label>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 text-sm text-neutral-800 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
          </div>
          <button onClick={handleImport} disabled={importing || !editName.trim()}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50">
            {importing ? <><Loader2 size={16} className="animate-spin" />Importing...</> : "Import Property"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Step 4: Success ---------- */
function StepSuccess({ listing, onAddAnother, onDone }: { listing: ImportedListing; onAddAnother: () => void; onDone: () => void }) {
  return (
    <div className="flex items-center justify-center py-16 px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <Check size={32} className="text-emerald-500" strokeWidth={2.5} />
        </div>
        <h3 className="text-xl font-bold text-neutral-800 mb-2">Property added!</h3>
        <div className="bg-neutral-0 rounded-xl border border-[var(--border)] overflow-hidden mt-6 mb-8 text-left">
          {listing.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <div className="h-32 overflow-hidden"><img src={listing.photo_url} alt={listing.name} className="w-full h-full object-cover" /></div>
          ) : (
            <div className="h-32 bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center"><Home size={28} className="text-brand-300" strokeWidth={1.5} /></div>
          )}
          <div className="p-4">
            <p className="text-sm font-semibold text-neutral-800">{listing.name}</p>
            <p className="text-xs text-neutral-500 mt-0.5">Bookings will sync automatically</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button onClick={onAddAnother} className="px-5 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">Add another property</button>
          <button onClick={onDone} className="px-5 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 transition-colors">Done</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Add Property Modal ---------- */
function AddPropertyModal({ hasExisting, onClose }: { hasExisting: boolean; onClose: (didImport: boolean) => void }) {
  const [step, setStep] = useState<ModalStep>("choose");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [propId, setPropId] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportedListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const didImport = useRef(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(didImport.current); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const reset = useCallback(() => { setPlatform(null); setPropId(null); setImported(null); setError(null); setStep("choose"); }, []);
  const onSelect = useCallback((p: Platform) => { setPlatform(p); setError(null); setStep("connect"); }, []);
  const onConnected = useCallback((pid: string) => { setPropId(pid); setStep("confirm"); }, []);
  const onImported = useCallback((l: ImportedListing) => { setImported(l); didImport.current = true; setStep("success"); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => onClose(didImport.current)} />
      <div className="relative bg-neutral-0 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col overflow-y-auto">
        <button onClick={() => onClose(didImport.current)} className="absolute top-4 right-4 z-10 p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition-colors"><X size={18} /></button>
        {error ? (
          <div className="flex items-center justify-center py-24 px-6">
            <div className="text-center">
              <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4"><X size={24} className="text-red-500" /></div>
              <p className="text-sm font-medium text-neutral-800 mb-1">Something went wrong</p>
              <p className="text-xs text-neutral-500 mb-4">{error}</p>
              <button onClick={reset} className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">Try again</button>
            </div>
          </div>
        ) : step === "choose" ? (
          <StepChoose onSelect={onSelect} />
        ) : step === "connect" && platform ? (
          <StepConnect platform={platform} hasExisting={hasExisting} onComplete={onConnected} onError={setError} />
        ) : step === "confirm" && platform && propId ? (
          <StepConfirm propertyId={propId} platform={platform} onImported={onImported} onError={setError} />
        ) : step === "success" && imported ? (
          <StepSuccess listing={imported} onAddAnother={reset} onDone={() => onClose(true)} />
        ) : null}
      </div>
    </div>
  );
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

/* ---------- Main Component ---------- */
export default function PropertiesPage({ properties, channels, bookingCounts, occupancy, nextCheckins }: PropertiesPageProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [, startTransition] = useTransition();

  const chMap = new Map<string, ChannelRecord[]>();
  for (const ch of channels) {
    if (ch.status !== "active") continue;
    if (!chMap.has(ch.property_id)) chMap.set(ch.property_id, []);
    chMap.get(ch.property_id)!.push(ch);
  }
  const closeModal = useCallback((didImport: boolean) => {
    setShowModal(false);
    if (didImport) startTransition(() => { router.refresh(); });
  }, [router]);

  if (properties.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center max-w-lg">
            <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6"><Home size={32} className="text-brand-500" strokeWidth={1.5} /></div>
            <h1 className="text-2xl font-bold text-neutral-800 mb-2">Connect your first property</h1>
            <p className="text-neutral-500 mb-8">Import from Airbnb, Booking.com, or VRBO to get started</p>
            <button onClick={() => setShowModal(true)} className="px-6 py-3 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors shadow-sm">
              <span className="flex items-center gap-2"><Plus size={18} />Add Property</span>
            </button>
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
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 transition-colors">
          <Plus size={16} />Add Property
        </button>
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
