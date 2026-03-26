"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface AddressResult {
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: string;
  longitude: string;
  displayName: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
  className?: string;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
  };
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Start typing an address...",
  className = "",
}: AddressAutocompleteProps) {
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search
  const search = useCallback((query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&countrycodes=us&limit=5`,
          { headers: { "User-Agent": "StayCommand/1.0 (contact@luxeshinesolutionsllc.com)" } }
        );
        const data: NominatimResult[] = await res.json();
        setResults(data);
        setOpen(data.length > 0);
        setActiveIdx(-1);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 300);
  }, []);

  const handleInput = (val: string) => {
    onChange(val);
    search(val);
  };

  const selectResult = (r: NominatimResult) => {
    const addr = r.address;
    const street = [addr.house_number, addr.road].filter(Boolean).join(" ");
    const result: AddressResult = {
      address: street,
      city: addr.city ?? addr.town ?? addr.village ?? "",
      state: addr.state ?? "",
      zip: addr.postcode ?? "",
      latitude: r.lat,
      longitude: r.lon,
      displayName: r.display_name,
    };
    onChange(street);
    onSelect(result);
    setOpen(false);
    setResults([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      selectResult(results[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={className || "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"}
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      )}

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.length === 0 && !loading ? (
            <div className="px-3 py-2 text-sm text-gray-400">No addresses found</div>
          ) : (
            results.map((r, i) => (
              <div
                key={i}
                onClick={() => selectResult(r)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`px-3 py-2 text-sm cursor-pointer ${
                  i === activeIdx ? "bg-blue-50 text-blue-900" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {r.display_name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
