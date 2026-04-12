"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import AddressAutocomplete from "@/components/ui/AddressAutocomplete";
import {
  DEFAULT_ONBOARDING_TEMPLATES,
  type DefaultTemplate,
} from "@/lib/onboarding/default-templates";
import {
  Building2,
  Calendar,
  Wifi,
  MessageSquare,
  Check,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Home,
  Link as LinkIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STEPS = ["Welcome", "Property", "Calendar", "Details", "Messages", "Done"];

const PLATFORM_HELP: Record<string, string> = {
  airbnb:
    "Open Airbnb \u2192 Calendar \u2192 Availability \u2192 Export Calendar \u2192 Copy the iCal link",
  vrbo: "Open VRBO \u2192 Calendar \u2192 Import/Export \u2192 Copy the export URL",
  booking_com:
    "Rates & Availability \u2192 Sync calendars \u2192 Export \u2192 Copy the iCal URL",
};

const PLATFORM_LABELS: Record<string, string> = {
  airbnb: "Airbnb",
  vrbo: "VRBO",
  booking_com: "Booking.com",
};

const PLATFORM_COLORS: Record<string, string> = {
  airbnb: "border-[#FF5A5F] bg-[#FF5A5F]/5 text-[#FF5A5F]",
  vrbo: "border-[#3B5998] bg-[#3B5998]/5 text-[#3B5998]",
  booking_com: "border-[#003580] bg-[#003580]/5 text-[#003580]",
};

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

/* ------------------------------------------------------------------ */
/*  Shared input class                                                 */
/* ------------------------------------------------------------------ */

const inputClass =
  "w-full h-10 px-3 text-sm border border-[var(--border)] rounded-lg bg-neutral-0 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [path, setPath] = useState<"ical" | "manual" | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // --- Property form ---
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [maxGuests, setMaxGuests] = useState(4);
  const [propertyType, setPropertyType] = useState("entire_home");
  const [latitude, setLatitude] = useState<string | null>(null);
  const [longitude, setLongitude] = useState<string | null>(null);

  // --- iCal form ---
  const [icalPlatform, setIcalPlatform] = useState("airbnb");
  const [icalUrl, setIcalUrl] = useState("");
  const [icalResult, setIcalResult] = useState<{
    bookings: number;
    blocked: number;
  } | null>(null);
  const [icalLoading, setIcalLoading] = useState(false);
  const [icalError, setIcalError] = useState("");

  // --- Property details ---
  const [wifiNetwork, setWifiNetwork] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [doorCode, setDoorCode] = useState("");
  const [parkingInstructions, setParkingInstructions] = useState("");
  const [houseRules, setHouseRules] = useState(
    "No smoking\nNo parties\nQuiet hours: 10 PM - 8 AM\nPlease remove shoes indoors"
  );
  const [emergencyContact, setEmergencyContact] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");

  // --- Templates ---
  const [templateStates, setTemplateStates] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        DEFAULT_ONBOARDING_TEMPLATES.map((t) => [t.templateType, true])
      )
  );
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Step navigation helpers                                          */
  /* ---------------------------------------------------------------- */

  const canNext = (): boolean => {
    if (step === 0) return path !== null;
    if (step === 1) return name.trim().length > 0;
    return true;
  };

  const goNext = () => {
    // Skip calendar step for manual path
    if (step === 0 && path === "manual") {
      setStep(1);
      return;
    }
    if (step === 1 && path === "manual") {
      // Skip step 2 (calendar) -> go to details
      handleCreateProperty().then((ok) => ok && setStep(3));
      return;
    }
    if (step === 1 && path === "ical") {
      handleCreateProperty().then((ok) => ok && setStep(2));
      return;
    }
    setStep((s) => s + 1);
  };

  const goBack = () => {
    if (step === 3 && path === "manual") {
      setStep(1);
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  };

  /* ---------------------------------------------------------------- */
  /*  Handlers                                                         */
  /* ---------------------------------------------------------------- */

  const handleCreateProperty = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check free tier limit (1 property)
      const { count } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if ((count ?? 0) >= 1) {
        toast("Free plan limited to 1 property. Upgrade to Pro.", "error");
        return false;
      }

      const { data, error } = await supabase
        .from("properties")
        .insert({
          name: name.trim(),
          address: address || null,
          city: city || null,
          state: state || null,
          zip: zip || null,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          bedrooms,
          bathrooms,
          max_guests: maxGuests,
          property_type: propertyType,
          user_id: user.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select("id")
        .single();

      if (error) throw error;
      setPropertyId((data as { id: string }).id);
      toast("Property created!");
      return true;
    } catch (err) {
      console.error(err);
      toast("Failed to create property. Please try again.", "error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleTestIcal = async () => {
    if (!icalUrl || !propertyId) return;
    setIcalLoading(true);
    setIcalError("");
    setIcalResult(null);
    try {
      const res = await fetch("/api/ical/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: propertyId,
          feed_url: icalUrl,
          platform: icalPlatform,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        setIcalResult({
          bookings: d.bookings_found ?? 0,
          blocked: d.blocked_dates ?? 0,
        });
      } else {
        setIcalError(d.error ?? "Invalid calendar URL");
      }
    } catch {
      setIcalError("Connection failed. Please check the URL.");
    } finally {
      setIcalLoading(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!propertyId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("property_details").upsert(
        {
          property_id: propertyId,
          wifi_network: wifiNetwork || null,
          wifi_password: wifiPassword || null,
          door_code: doorCode || null,
          parking_instructions: parkingInstructions || null,
          house_rules: houseRules || null,
          emergency_contact: emergencyContact || null,
          special_instructions: specialInstructions || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        { onConflict: "property_id" }
      );
      if (error) throw error;
      toast("Details saved!");
      setStep(4);
    } catch (err) {
      console.error(err);
      toast("Failed to save details.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTemplates = async () => {
    if (!propertyId) return;
    setSaving(true);
    try {
      const active = DEFAULT_ONBOARDING_TEMPLATES.filter(
        (t) => templateStates[t.templateType]
      );
      if (active.length > 0) {
        const { error } = await supabase.from("message_templates").insert(
          active.map((t) => ({
            property_id: propertyId,
            template_type: t.templateType,
            subject: t.subject,
            body: t.body,
            is_active: true,
            trigger_type: t.triggerType,
            trigger_days_offset: t.triggerDaysOffset,
            trigger_time: t.triggerTime,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          })) as any
        );
        if (error) throw error;
        toast("Templates saved!");
      } else {
        toast("No templates activated — you can set these up later in Messages");
      }
      setStep(5);
    } catch (err) {
      console.error(err);
      toast("Failed to save templates.", "error");
    } finally {
      setSaving(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Progress bar                                                     */
  /* ---------------------------------------------------------------- */

  const progressPercent = Math.round((step / (STEPS.length - 1)) * 100);

  const renderProgress = () => (
    <div className="mb-8">
      {/* Step labels */}
      <div className="flex items-center justify-between mb-2">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`text-xs font-medium ${
              i <= step ? "text-brand-600" : "text-neutral-400"
            } ${i === 0 || i === STEPS.length - 1 ? "" : "hidden sm:block"}`}
          >
            {label}
          </div>
        ))}
      </div>
      {/* Bar */}
      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500 rounded-full transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Step 0 : Welcome                                                 */
  /* ---------------------------------------------------------------- */

  const renderWelcome = () => (
    <div className="text-center py-8">
      {/* Logo */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <div className="w-3 h-3 rounded-full bg-brand-500" />
        <span className="text-xl font-bold text-neutral-800 tracking-tight">
          StayCommand
        </span>
      </div>

      <h1 className="text-2xl font-bold text-neutral-800 mb-2">
        Welcome to StayCommand
      </h1>
      <p className="text-neutral-500 mb-10 max-w-md mx-auto">
        Let&apos;s get your first property set up in 5 minutes. How would you
        like to start?
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
        {/* iCal path */}
        <button
          onClick={() => setPath("ical")}
          className={`p-5 rounded-lg border-2 text-left transition-all ${
            path === "ical"
              ? "border-brand-500 bg-brand-50/50 ring-1 ring-brand-200"
              : "border-[var(--border)] hover:border-neutral-300"
          }`}
        >
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
              path === "ical"
                ? "bg-brand-100 text-brand-600"
                : "bg-neutral-100 text-neutral-400"
            }`}
          >
            <LinkIcon className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-neutral-800 mb-1">
            I have an Airbnb/VRBO listing
          </p>
          <p className="text-xs text-neutral-500">
            Import bookings from your existing calendar
          </p>
        </button>

        {/* Manual path */}
        <button
          onClick={() => setPath("manual")}
          className={`p-5 rounded-lg border-2 text-left transition-all ${
            path === "manual"
              ? "border-brand-500 bg-brand-50/50 ring-1 ring-brand-200"
              : "border-[var(--border)] hover:border-neutral-300"
          }`}
        >
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
              path === "manual"
                ? "bg-brand-100 text-brand-600"
                : "bg-neutral-100 text-neutral-400"
            }`}
          >
            <Building2 className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-neutral-800 mb-1">
            I want to add manually
          </p>
          <p className="text-xs text-neutral-500">
            Set up a new property from scratch
          </p>
        </button>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Step 1 : Property basics                                         */
  /* ---------------------------------------------------------------- */

  const renderProperty = () => (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-4 h-4 text-brand-500" />
          <h2 className="text-lg font-bold text-neutral-800">
            Property Details
          </h2>
        </div>
        <p className="text-sm text-neutral-500">
          Tell us about your rental property.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Property Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="e.g., Beachfront Villa"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Address
        </label>
        <AddressAutocomplete
          value={address}
          onChange={setAddress}
          onSelect={(r) => {
            setAddress(r.address);
            setCity(r.city);
            setState(r.state);
            setZip(r.zip);
            setLatitude(r.latitude);
            setLongitude(r.longitude);
          }}
          placeholder="Start typing an address..."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            City
          </label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            State
          </label>
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            ZIP
          </label>
          <input
            type="text"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Bedrooms
          </label>
          <input
            type="number"
            value={bedrooms}
            onChange={(e) => setBedrooms(Number(e.target.value))}
            className={inputClass}
            min="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Bathrooms
          </label>
          <input
            type="number"
            value={bathrooms}
            onChange={(e) => setBathrooms(Number(e.target.value))}
            className={inputClass}
            min="0"
            step="0.5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Max Guests
          </label>
          <input
            type="number"
            value={maxGuests}
            onChange={(e) => setMaxGuests(Number(e.target.value))}
            className={inputClass}
            min="1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Type
          </label>
          <select
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
            className={inputClass}
          >
            <option value="entire_home">Entire Home</option>
            <option value="private_room">Private Room</option>
            <option value="shared_room">Shared Room</option>
          </select>
        </div>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Step 2 : Connect Calendar                                        */
  /* ---------------------------------------------------------------- */

  const renderCalendar = () => (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-4 h-4 text-brand-500" />
          <h2 className="text-lg font-bold text-neutral-800">
            Connect Calendar
          </h2>
        </div>
        <p className="text-sm text-neutral-500">
          Import your existing bookings via iCal.
        </p>
      </div>

      {/* Platform selector */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-2">
          Select Platform
        </label>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setIcalPlatform(key);
                setIcalResult(null);
                setIcalError("");
              }}
              className={`p-3 rounded-lg border-2 text-center text-sm font-medium transition-all ${
                icalPlatform === key
                  ? PLATFORM_COLORS[key]
                  : "border-[var(--border)] text-neutral-500 hover:border-neutral-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Per-platform instructions */}
      <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
        <p className="text-xs text-neutral-600">
          <span className="font-medium">How to find your iCal URL:</span>{" "}
          {PLATFORM_HELP[icalPlatform]}
        </p>
      </div>

      {/* URL input + test button */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Calendar URL
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={icalUrl}
            onChange={(e) => {
              setIcalUrl(e.target.value);
              setIcalResult(null);
              setIcalError("");
            }}
            className={`flex-1 ${inputClass}`}
            placeholder="https://www.airbnb.com/calendar/ical/..."
          />
          <button
            onClick={handleTestIcal}
            disabled={icalLoading || !icalUrl.trim()}
            className="px-4 py-2 text-sm font-medium bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {icalLoading ? "Testing..." : "Test Connection"}
          </button>
        </div>
      </div>

      {/* Success */}
      {icalResult && (
        <div className="flex items-center gap-2 p-3 bg-[#eef5f0] border border-[#d5e8da] rounded-lg">
          <Check className="w-4 h-4 text-[#1a3a2a] flex-shrink-0" />
          <p className="text-sm text-[#1a3a2a]">
            Calendar connected! Found{" "}
            <span className="font-semibold">{icalResult.bookings}</span>{" "}
            booking{icalResult.bookings !== 1 ? "s" : ""} and{" "}
            <span className="font-semibold">{icalResult.blocked}</span> blocked
            date{icalResult.blocked !== 1 ? "s" : ""}.
          </p>
        </div>
      )}

      {/* Error */}
      {icalError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{icalError}</p>
        </div>
      )}

      {/* Add another platform hint */}
      {icalResult && (
        <p className="text-xs text-neutral-400">
          You can add more calendars later from the property settings page.
        </p>
      )}
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Step 3 : Property Details                                        */
  /* ---------------------------------------------------------------- */

  const renderDetails = () => (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Wifi className="w-4 h-4 text-brand-500" />
          <h2 className="text-lg font-bold text-neutral-800">
            Guest Information
          </h2>
        </div>
        <p className="text-sm text-neutral-500">
          These details are auto-filled in your message templates.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            WiFi Network
          </label>
          <input
            type="text"
            value={wifiNetwork}
            onChange={(e) => setWifiNetwork(e.target.value)}
            className={inputClass}
            placeholder="MyWiFi"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            WiFi Password
          </label>
          <input
            type="text"
            value={wifiPassword}
            onChange={(e) => setWifiPassword(e.target.value)}
            className={inputClass}
            placeholder="password123"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Door / Lock Code
          </label>
          <input
            type="text"
            value={doorCode}
            onChange={(e) => setDoorCode(e.target.value)}
            className={inputClass}
            placeholder="1234#"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Emergency Contact
          </label>
          <input
            type="text"
            value={emergencyContact}
            onChange={(e) => setEmergencyContact(e.target.value)}
            className={inputClass}
            placeholder="555-123-4567"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Parking Instructions
        </label>
        <input
          type="text"
          value={parkingInstructions}
          onChange={(e) => setParkingInstructions(e.target.value)}
          className={inputClass}
          placeholder="Driveway on the left, spots #1 and #2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          House Rules
        </label>
        <textarea
          value={houseRules}
          onChange={(e) => setHouseRules(e.target.value)}
          className={`${inputClass} min-h-[100px] resize-y`}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Special Instructions
        </label>
        <textarea
          value={specialInstructions}
          onChange={(e) => setSpecialInstructions(e.target.value)}
          className={`${inputClass} min-h-[60px] resize-y`}
          placeholder="Any additional info for guests..."
        />
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Step 4 : Message Templates                                       */
  /* ---------------------------------------------------------------- */

  const toggleTemplate = (type: string) => {
    setTemplateStates((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const renderTemplates = () => (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-4 h-4 text-brand-500" />
          <h2 className="text-lg font-bold text-neutral-800">
            Message Templates
          </h2>
        </div>
        <p className="text-sm text-neutral-500">
          We&apos;ve prepared 8 automated messages for the full guest journey.
          Toggle any you don&apos;t need.
        </p>
      </div>

      <div className="space-y-2">
        {DEFAULT_ONBOARDING_TEMPLATES.map((t: DefaultTemplate) => {
          const isActive = templateStates[t.templateType] ?? true;
          const isExpanded = expandedTemplate === t.templateType;
          const triggerLabel =
            TRIGGER_LABELS[t.triggerType] ?? t.triggerType;
          const offsetLabel =
            t.triggerDaysOffset !== 0
              ? ` (${Math.abs(t.triggerDaysOffset)}d ${
                  t.triggerDaysOffset < 0 ? "before" : "after"
                })`
              : "";

          return (
            <div
              key={t.templateType}
              className={`border rounded-lg transition-colors ${
                isActive
                  ? "border-[var(--border)] bg-neutral-0"
                  : "border-neutral-200 bg-neutral-50 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  onClick={() =>
                    setExpandedTemplate(isExpanded ? null : t.templateType)
                  }
                  className="flex items-center gap-2 flex-1 text-left"
                >
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-neutral-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-neutral-400" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-neutral-800">
                      {TEMPLATE_LABELS[t.templateType] ?? t.templateType}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {triggerLabel}
                      {offsetLabel} at {t.triggerTime}
                    </p>
                  </div>
                </button>

                {/* Active toggle */}
                <button
                  onClick={() => toggleTemplate(t.templateType)}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                    isActive ? "bg-brand-500" : "bg-neutral-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
                      isActive ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {isExpanded && (
                <div className="px-4 pb-3 border-t border-neutral-100">
                  <pre className="text-xs text-neutral-600 whitespace-pre-wrap mt-2 font-[var(--font-nunito),sans-serif] leading-relaxed">
                    {t.body}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Step 5 : Done                                                    */
  /* ---------------------------------------------------------------- */

  const renderDone = () => {
    const checks = [
      { label: "Property created", icon: Building2, done: !!propertyId },
      {
        label: "Calendar connected",
        icon: Calendar,
        done: path === "ical" && icalResult !== null,
      },
      {
        label: "Guest details saved",
        icon: Wifi,
        done: !!(wifiNetwork || doorCode),
      },
      {
        label: "Message templates configured",
        icon: MessageSquare,
        done: Object.values(templateStates).some(Boolean),
      },
    ];

    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-8 h-8 text-brand-500" />
        </div>

        <h2 className="text-2xl font-bold text-neutral-800 mb-2">
          You&apos;re all set!
        </h2>
        <p className="text-neutral-500 mb-8 max-w-md mx-auto">
          Your property is ready to go. Here&apos;s what we set up:
        </p>

        <div className="max-w-sm mx-auto space-y-3 text-left mb-10">
          {checks.map((c) => (
            <div
              key={c.label}
              className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-neutral-0"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  c.done
                    ? "bg-brand-100 text-brand-600"
                    : "bg-neutral-100 text-neutral-400"
                }`}
              >
                {c.done ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <c.icon className="w-4 h-4" />
                )}
              </div>
              <span
                className={`text-sm ${
                  c.done
                    ? "text-neutral-800 font-medium"
                    : "text-neutral-400"
                }`}
              >
                {c.label}
              </span>
              {c.done && (
                <Check className="w-4 h-4 text-brand-500 ml-auto" />
              )}
            </div>
          ))}
        </div>

        <button
          onClick={() => router.push("/")}
          className="px-8 py-3 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 transition-colors inline-flex items-center gap-2"
        >
          <Home className="w-4 h-4" />
          Go to Dashboard
        </button>
      </div>
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  const renderStep = () => {
    switch (step) {
      case 0:
        return renderWelcome();
      case 1:
        return renderProperty();
      case 2:
        return renderCalendar();
      case 3:
        return renderDetails();
      case 4:
        return renderTemplates();
      case 5:
        return renderDone();
      default:
        return null;
    }
  };

  // Step-specific action buttons for the footer
  const renderFooter = () => {
    // No footer on welcome or done
    if (step === 0) {
      return (
        <div className="flex justify-center mt-8">
          <button
            onClick={goNext}
            disabled={!canNext()}
            className="px-8 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
          >
            Get Started
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      );
    }

    if (step === 5) return null;

    // Step 3 (details) has custom save handler
    if (step === 3) {
      return (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-neutral-100">
          <button
            onClick={goBack}
            className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-800 transition-colors inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep(4)}
              className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleSaveDetails}
              disabled={saving}
              className="px-6 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
            >
              {saving ? "Saving..." : "Save & Continue"}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }

    // Step 4 (templates) has custom save handler
    if (step === 4) {
      return (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-neutral-100">
          <button
            onClick={goBack}
            className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-800 transition-colors inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={handleSaveTemplates}
            disabled={saving}
            className="px-6 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
          >
            {saving ? "Saving..." : "Save Templates & Finish"}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      );
    }

    // Default: generic back/next
    return (
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-neutral-100">
        <button
          onClick={goBack}
          className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-800 transition-colors inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-3">
          {step === 2 && path === "manual" && (
            <button
              onClick={() => setStep(3)}
              className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Skip
            </button>
          )}
          <button
            onClick={goNext}
            disabled={!canNext() || saving}
            className="px-6 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
          >
            {saving ? "Saving..." : "Continue"}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {renderProgress()}

      <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6 sm:p-8">
        {renderStep()}
        {renderFooter()}
      </div>
    </div>
  );
}
