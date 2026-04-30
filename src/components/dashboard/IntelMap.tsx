"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState, useMemo } from "react";

interface PropertyPin { id: string; name: string; lat: number; lng: number; occupancy?: number; avgRate?: number; }
interface CompPin { name: string; adr: number; occupancy: number; revpar: number; distanceKm: number; lat?: number; lng?: number; }
interface EventPin { name: string; date: string; venue?: string; attendance?: number; impact: number; lat: number; lng: number; }

interface IntelMapProps {
  properties: PropertyPin[];
  comps: CompPin[];
  events?: EventPin[];
  center: { lat: number; lng: number };
  snapshot?: { market_adr?: number; market_occupancy?: number; market_supply?: number } | null;
  propertyStats?: { avgRate: number; occupancy: number };
}

function FixIcons() {
  const map = useMap();
  useEffect(() => { setTimeout(() => map.invalidateSize(), 100); }, [map]);
  return null;
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions.map(([lat, lng]) => [lat, lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }, [map, positions]);
  return null;
}

function createIcon(color: string, size: number, glow = false) {
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)${glow ? `,0 0 8px ${color}` : ""}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const starIcon = L.divIcon({
  className: "",
  html: `<div style="font-size:18px;text-shadow:0 1px 3px rgba(0,0,0,0.3)">⭐</div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function approximatePosition(cLat: number, cLng: number, distKm: number, idx: number, total: number): [number, number] {
  const bearing = (360 / Math.max(total, 1)) * idx;
  const R = 6371;
  const d = distKm / R;
  const lat1 = (cLat * Math.PI) / 180;
  const lng1 = (cLng * Math.PI) / 180;
  const brng = (bearing * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI];
}

export default function IntelMap({ properties, comps, events = [], center, snapshot, propertyStats }: IntelMapProps) {
  const [layers, setLayers] = useState({ properties: true, comps: true, events: true });

  const propIcon = useMemo(() => createIcon("var(--golden)", 22, true), []);
  const eventIcon = starIcon;

  const allPositions = useMemo((): [number, number][] => {
    const pts: [number, number][] = properties.map((p) => [p.lat, p.lng]);
    return pts.length > 0 ? pts : [[center.lat, center.lng]];
  }, [properties, center]);

  return (
    <div>
      {/* Layer toggles */}
      <div className="flex items-center gap-4 mb-3">
        {[
          { key: "properties" as const, label: "My Properties", color: "var(--golden)" },
          { key: "comps" as const, label: "Competitors", color: "#6b7280" },
          { key: "events" as const, label: "Events", color: "#f59e0b" },
        ].map(({ key, label, color }) => (
          <label key={key} className="flex items-center gap-1.5 cursor-pointer text-xs text-neutral-600">
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={() => setLayers((l) => ({ ...l, [key]: !l[key] }))}
              className="w-3.5 h-3.5 rounded border-neutral-300 text-brand-500 focus:ring-brand-500"
            />
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </label>
        ))}
      </div>

      <div className="h-[500px] rounded-xl overflow-hidden border border-[var(--border)]">
        <MapContainer center={[center.lat, center.lng]} zoom={12} className="h-full w-full" scrollWheelZoom={true}>
          <FixIcons />
          <FitBounds positions={allPositions} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Your properties */}
          {layers.properties && properties.map((p) => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={propIcon}>
              <Popup>
                <div className="text-sm min-w-[180px]">
                  <p className="font-bold text-brand-600">{p.name}</p>
                  <div className="mt-1.5 space-y-0.5 text-neutral-600">
                    {propertyStats && <p>Occupancy: <span className="font-mono font-semibold">{propertyStats.occupancy}%</span></p>}
                    {propertyStats && <p>Avg Rate: <span className="font-mono font-semibold">${propertyStats.avgRate}</span></p>}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Competitors */}
          {layers.comps && comps.map((c, i) => {
            const pos: [number, number] = c.lat && c.lng
              ? [c.lat, c.lng]
              : approximatePosition(center.lat, center.lng, c.distanceKm ?? 2, i, comps.length);
            const adrRatio = Math.min(1, (c.adr ?? 100) / 300);
            const grayShade = Math.round(100 + adrRatio * 80);
            const icon = createIcon(`rgb(${grayShade},${grayShade},${grayShade})`, Math.max(8, Math.round(8 + (c.occupancy / 100) * 8)));
            return (
              <Marker key={i} position={pos} icon={icon}>
                <Popup>
                  <div className="text-sm min-w-[200px]">
                    <p className="font-semibold text-neutral-800">{c.name || "Listing"}</p>
                    <div className="mt-1 space-y-0.5 text-neutral-600">
                      <p>ADR: <span className="font-mono font-semibold">${Math.round(c.adr)}</span></p>
                      <p>Occupancy: <span className="font-mono font-semibold">{Math.round(c.occupancy)}%</span></p>
                      <p>RevPAR: <span className="font-mono font-semibold">${Math.round(c.revpar)}</span></p>
                      {propertyStats && propertyStats.avgRate > 0 && (
                        <p className="pt-1 border-t border-neutral-100 font-medium">
                          {c.adr > propertyStats.avgRate
                            ? <span className="text-amber-600">They charge ${Math.round(c.adr - propertyStats.avgRate)} more</span>
                            : <span className="text-[#1a3a2a]">You charge ${Math.round(propertyStats.avgRate - c.adr)} more</span>}
                        </p>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Events */}
          {layers.events && events.map((e, i) => (
            <Marker key={i} position={[e.lat, e.lng]} icon={eventIcon}>
              <Popup>
                <div className="text-sm min-w-[180px]">
                  <p className="font-semibold text-neutral-800">{e.name}</p>
                  <div className="mt-1 space-y-0.5 text-neutral-600">
                    <p>{new Date(e.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
                    {e.venue && <p>{e.venue}</p>}
                    {e.attendance && e.attendance > 0 && <p>{e.attendance.toLocaleString()} attendees</p>}
                    <p>Demand impact: <span className="font-semibold">{Math.round(e.impact * 100)}%</span></p>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Market stats bar below map */}
      {snapshot && (
        <div className="flex items-center justify-center gap-6 mt-3 text-sm text-neutral-500">
          {snapshot.market_adr && <span>ADR: <strong className="text-neutral-800 font-mono">${Math.round(snapshot.market_adr)}</strong></span>}
          {snapshot.market_occupancy && <span>Occupancy: <strong className="text-neutral-800 font-mono">{Math.round(snapshot.market_occupancy)}%</strong></span>}
          {snapshot.market_supply && <span>Listings: <strong className="text-neutral-800 font-mono">{snapshot.market_supply.toLocaleString()}</strong></span>}
        </div>
      )}
    </div>
  );
}
