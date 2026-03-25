"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

interface CompMapProps {
  center: { lat: number; lng: number };
  propertyName: string;
  comps: {
    comp_name: string | null;
    comp_listing_id: string | null;
    comp_adr: number | null;
    comp_occupancy: number | null;
    comp_revpar: number | null;
    distance_km: number | null;
    lat?: number;
    lng?: number;
  }[];
  medianOccupancy: number;
}

// Fix Leaflet default icon issue in Next.js
function FixIcons() {
  const map = useMap();
  useEffect(() => {
    // Force map to recalculate size after mount
    setTimeout(() => map.invalidateSize(), 100);
  }, [map]);
  return null;
}

function createIcon(color: string, size: number = 12) {
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Approximate position from distance + bearing
function approximatePosition(
  centerLat: number,
  centerLng: number,
  distanceKm: number,
  index: number,
  total: number
): [number, number] {
  const bearing = (360 / total) * index;
  const R = 6371;
  const d = distanceKm / R;
  const lat1 = (centerLat * Math.PI) / 180;
  const lng1 = (centerLng * Math.PI) / 180;
  const brng = (bearing * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI];
}

export default function CompMap({ center, propertyName, comps, medianOccupancy }: CompMapProps) {
  const propertyIcon = createIcon("#3b82f6", 20);

  return (
    <div className="h-[400px] rounded-lg overflow-hidden border border-gray-200">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={12}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <FixIcons />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Your property */}
        <Marker position={[center.lat, center.lng]} icon={propertyIcon}>
          <Popup>
            <div className="text-sm">
              <p className="font-semibold text-blue-700">{propertyName}</p>
              <p className="text-gray-500">Your Property</p>
            </div>
          </Popup>
        </Marker>

        {/* Comp markers */}
        {comps.map((comp, i) => {
          const pos: [number, number] = comp.lat && comp.lng
            ? [comp.lat, comp.lng]
            : approximatePosition(
                center.lat,
                center.lng,
                comp.distance_km ?? 2,
                i,
                comps.length
              );

          const occ = comp.comp_occupancy ?? 0;
          const color = occ >= medianOccupancy ? "#10b981" : "#ef4444";
          const icon = createIcon(color, 12);

          const compName = comp.comp_name ?? "Listing";
          const airbnbUrl = comp.comp_listing_id
            ? `https://www.airbnb.com/rooms/${comp.comp_listing_id}`
            : null;

          return (
            <Marker key={i} position={pos} icon={icon}>
              <Popup>
                <div className="text-sm min-w-[180px]">
                  <p className="font-semibold text-gray-900">{compName}</p>
                  <div className="mt-1 space-y-0.5 text-gray-600">
                    <p>ADR: <span className="font-medium">${Math.round(comp.comp_adr ?? 0)}</span></p>
                    <p>Occupancy: <span className="font-medium">{Math.round(occ)}%</span></p>
                    <p>RevPAR: <span className="font-medium">${Math.round(comp.comp_revpar ?? 0)}</span></p>
                    {comp.distance_km != null && (
                      <p>Distance: <span className="font-medium">{comp.distance_km} km</span></p>
                    )}
                  </div>
                  {airbnbUrl && (
                    <a
                      href={airbnbUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-2 text-xs text-blue-600 hover:underline"
                    >
                      View on Airbnb →
                    </a>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
