"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

type PropertyType = "entire_home" | "private_room" | "shared_room";
type PricingMode = "manual" | "review" | "auto";

interface PlatformListing {
  enabled: boolean;
  platform_listing_id: string;
  listing_url: string;
}

interface FormData {
  // Step 1
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  bedrooms: string;
  bathrooms: string;
  max_guests: string;
  property_type: PropertyType;
  // Step 2
  platforms: Record<string, PlatformListing>;
  // Step 3
  base_rate: string;
  min_rate: string;
  max_rate: string;
  min_stay: string;
  pricing_mode: PricingMode;
}

const defaultPlatforms: Record<string, PlatformListing> = {
  airbnb: { enabled: false, platform_listing_id: "", listing_url: "" },
  vrbo: { enabled: false, platform_listing_id: "", listing_url: "" },
  booking_com: { enabled: false, platform_listing_id: "", listing_url: "" },
  direct: { enabled: false, platform_listing_id: "", listing_url: "" },
};

const platformLabels: Record<string, string> = {
  airbnb: "Airbnb",
  vrbo: "VRBO",
  booking_com: "Booking.com",
  direct: "Direct",
};

const steps = ["Property Details", "Platform Listings", "Base Pricing", "Review & Save"];

export default function AddPropertyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormData>({
    name: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    bedrooms: "",
    bathrooms: "",
    max_guests: "",
    property_type: "entire_home",
    platforms: { ...defaultPlatforms },
    base_rate: "",
    min_rate: "",
    max_rate: "",
    min_stay: "1",
    pricing_mode: "manual",
  });

  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updatePlatform = (platform: string, field: keyof PlatformListing, value: string | boolean) => {
    setForm((prev) => ({
      ...prev,
      platforms: {
        ...prev.platforms,
        [platform]: { ...prev.platforms[platform], [field]: value },
      },
    }));
  };

  const canNext = () => {
    if (step === 0) return form.name.trim().length > 0;
    if (step === 2) return form.base_rate.trim().length > 0;
    return true;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const supabase = createClient();

      // Insert property
      const { data: property, error: propError } = await supabase
        .from("properties")
        .insert({
          name: form.name,
          address: form.address || null,
          city: form.city || null,
          state: form.state || null,
          zip: form.zip || null,
          bedrooms: form.bedrooms ? parseInt(form.bedrooms) : null,
          bathrooms: form.bathrooms ? parseFloat(form.bathrooms) : null,
          max_guests: form.max_guests ? parseInt(form.max_guests) : null,
          property_type: form.property_type,
          user_id: (await supabase.auth.getUser()).data.user!.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select("id")
        .single();

      if (propError) throw propError;
      const propertyId = (property as { id: string }).id;

      // Insert listings for enabled platforms
      const enabledPlatforms = Object.entries(form.platforms).filter(([, v]) => v.enabled);
      if (enabledPlatforms.length > 0) {
        await supabase.from("listings").insert(
          enabledPlatforms.map(([platform, data]) => ({
            property_id: propertyId,
            platform,
            platform_listing_id: data.platform_listing_id || null,
            listing_url: data.listing_url || null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          })) as any
        );
      }

      // Generate calendar_rates for next 90 days
      const baseRate = parseFloat(form.base_rate);
      const rateEntries = [];
      for (let i = 0; i < 90; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        rateEntries.push({
          property_id: propertyId,
          date: d.toISOString().split("T")[0],
          base_rate: baseRate,
          applied_rate: baseRate,
          min_stay: parseInt(form.min_stay) || 1,
          is_available: true,
          rate_source: "manual",
        });
      }
      // Insert in batches of 30
      for (let i = 0; i < rateEntries.length; i += 30) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase.from("calendar_rates").insert(rateEntries.slice(i, i + 30) as any);
      }

      toast("Property created successfully!");
      router.push(`/properties/${propertyId}`);
    } catch (err) {
      console.error(err);
      toast("Failed to create property. Please try again.", "error");
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Add Property</h1>
      <p className="text-gray-500 mb-8">Set up a new rental property</p>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                i < step
                  ? "bg-blue-600 text-white"
                  : i === step
                  ? "bg-blue-100 text-blue-700 ring-2 ring-blue-600"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {i < step ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-sm hidden sm:block ${i === step ? "text-gray-900 font-medium" : "text-gray-400"}`}>
              {label}
            </span>
            {i < steps.length - 1 && <div className="w-8 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {/* Step 1: Property Details */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="e.g., Beachfront Villa"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input type="text" value={form.address} onChange={(e) => updateField("address", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input type="text" value={form.city} onChange={(e) => updateField("city", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <input type="text" value={form.state} onChange={(e) => updateField("state", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                <input type="text" value={form.zip} onChange={(e) => updateField("zip", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
                <input type="number" value={form.bedrooms} onChange={(e) => updateField("bedrooms", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" min="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bathrooms</label>
                <input type="number" value={form.bathrooms} onChange={(e) => updateField("bathrooms", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" min="0" step="0.5" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Guests</label>
                <input type="number" value={form.max_guests} onChange={(e) => updateField("max_guests", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" min="1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={form.property_type} onChange={(e) => updateField("property_type", e.target.value as PropertyType)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white">
                  <option value="entire_home">Entire Home</option>
                  <option value="private_room">Private Room</option>
                  <option value="shared_room">Shared Room</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Platform Listings */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 mb-4">
              Toggle platforms where this property is listed. You can add listing IDs now or later.
            </p>
            {Object.entries(form.platforms).map(([platform, data]) => (
              <div key={platform} className={`border rounded-lg p-4 transition-colors ${data.enabled ? "border-blue-200 bg-blue-50/30" : "border-gray-200"}`}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.enabled}
                    onChange={(e) => updatePlatform(platform, "enabled", e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-900">{platformLabels[platform]}</span>
                </label>
                {data.enabled && (
                  <div className="grid grid-cols-2 gap-3 mt-3 ml-7">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Listing ID</label>
                      <input type="text" value={data.platform_listing_id}
                        onChange={(e) => updatePlatform(platform, "platform_listing_id", e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        placeholder="Optional" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Listing URL</label>
                      <input type="url" value={data.listing_url}
                        onChange={(e) => updatePlatform(platform, "listing_url", e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        placeholder="https://..." />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step 3: Base Pricing */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Nightly Rate ($) *</label>
              <input type="number" value={form.base_rate} onChange={(e) => updateField("base_rate", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="150" min="0" step="1" />
              <p className="text-xs text-gray-400 mt-1">This will be applied to all dates for the next 90 days.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Rate ($)</label>
                <input type="number" value={form.min_rate} onChange={(e) => updateField("min_rate", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="100" min="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Rate ($)</label>
                <input type="number" value={form.max_rate} onChange={(e) => updateField("max_rate", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="300" min="0" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Min Stay (nights)</label>
              <input type="number" value={form.min_stay} onChange={(e) => updateField("min_stay", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                min="1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pricing Mode</label>
              <div className="space-y-2">
                {[
                  { value: "manual", label: "Manual", desc: "You set all rates manually" },
                  { value: "review", label: "Review", desc: "Engine suggests, you approve" },
                  { value: "auto", label: "Auto", desc: "Engine sets rates automatically" },
                ].map((mode) => (
                  <label key={mode.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    form.pricing_mode === mode.value ? "border-blue-200 bg-blue-50/30" : "border-gray-200 hover:border-gray-300"
                  }`}>
                    <input type="radio" name="pricing_mode" value={mode.value}
                      checked={form.pricing_mode === mode.value}
                      onChange={(e) => updateField("pricing_mode", e.target.value as PricingMode)}
                      className="mt-0.5 w-4 h-4 text-blue-600 focus:ring-blue-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{mode.label}</p>
                      <p className="text-xs text-gray-500">{mode.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Property</h3>
              <p className="text-lg font-semibold text-gray-900">{form.name}</p>
              {form.address && <p className="text-sm text-gray-500">{form.address}</p>}
              {(form.city || form.state) && (
                <p className="text-sm text-gray-500">{[form.city, form.state, form.zip].filter(Boolean).join(", ")}</p>
              )}
              <div className="flex gap-4 mt-2 text-sm text-gray-500">
                {form.bedrooms && <span>{form.bedrooms} bed</span>}
                {form.bathrooms && <span>{form.bathrooms} bath</span>}
                {form.max_guests && <span>{form.max_guests} guests</span>}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Platforms</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(form.platforms)
                  .filter(([, v]) => v.enabled)
                  .map(([p]) => (
                    <span key={p} className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                      {platformLabels[p]}
                    </span>
                  ))}
                {!Object.values(form.platforms).some((v) => v.enabled) && (
                  <span className="text-sm text-gray-400">No platforms selected</span>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Pricing</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-400">Base Rate</p>
                  <p className="text-sm font-semibold text-gray-900">${form.base_rate}/night</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Min Stay</p>
                  <p className="text-sm font-semibold text-gray-900">{form.min_stay} night{parseInt(form.min_stay) !== 1 ? "s" : ""}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Mode</p>
                  <p className="text-sm font-semibold text-gray-900 capitalize">{form.pricing_mode}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
          <button
            onClick={() => step === 0 ? router.push("/properties") : setStep(step - 1)}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            {step === 0 ? "Cancel" : "Back"}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
              className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Creating..." : "Create Property"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
