/**
 * Required-capability registry for propose_guest_message (M8 C3 / D9).
 *
 * D9 hybrid open-elicitation onboarding has a structured-fallback path:
 * when the host requests a guest-message draft and Koast is missing a
 * required capability for that property, the loop emits a
 * host_input_needed RefusalEnvelope instead of dispatching the tool.
 *
 * Required-capability hard floor (per conventions v1.6 §2 D9):
 *   1. property name + city + property type (structural, properties table)
 *   2. door/access code (memory_fact: front_door + lock fallback)
 *   3. wifi network + password (memory_fact: wifi)
 *   4. parking instructions (memory_fact: parking)
 *
 * Item 1 reads `properties.name`, `.city`, `.property_type` directly.
 * Items 2-4 read `memory_facts` with entity_type='property' and the
 * matching sub_entity_type. memory_facts vocabulary already supports
 * front_door / lock / wifi / parking — no migration required.
 *
 * Used by:
 *   - src/lib/agent/loop.ts (pre-dispatch intercept, after P4)
 *   - src/lib/agent/sufficiency.ts (rich/lean/thin classifier)
 *
 * Pure data + a small lookup helper that takes a supabase service
 * client. No side effects; no UI; not host-facing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Stable identifiers for each required-capability slot. Used as the
 *  RefusalEnvelope `missing_inputs[]` payload values. */
export type RequiredCapabilityKey =
  | "property_structural"
  | "front_door_access_code"
  | "wifi_network_name"
  | "wifi_password"
  | "parking_instructions";

export interface MissingCapability {
  key: RequiredCapabilityKey;
  /** Voice-doctrine-compliant reason sentence for the host_input_needed
   *  envelope. One sentence, names the gap directly. */
  reason: string;
  /** Host-facing suggestions for what to send back (rendered as italic
   *  bullets in the envelope per F4 renderer). */
  suggested_inputs: string[];
}

/**
 * Voice-doctrine §4.4 host_input_needed copy locked at C3 sign-off
 * (Telegram message 2780). Each entry maps a required-capability slot
 * to its reason + suggestion phrasings. Multi-missing fallbacks
 * concatenate at the call site rather than producing N envelopes.
 */
export const MISSING_CAPABILITY_COPY: Record<RequiredCapabilityKey, MissingCapability> = {
  property_structural: {
    key: "property_structural",
    reason:
      "I'm missing the property type. Is it a house, condo, apartment, or something else?",
    suggested_inputs: ["house", "condo", "apartment", "other"],
  },
  front_door_access_code: {
    key: "front_door_access_code",
    reason:
      "Before I draft check-in messages I need the door code. If it's set per-arrival via lockbox, tell me and I'll note that instead.",
    suggested_inputs: ["Door code", "Or: lockbox per-arrival flag"],
  },
  wifi_network_name: {
    key: "wifi_network_name",
    reason:
      "I'd want the wifi credentials before drafting check-in messages — that's the most-asked guest question.",
    suggested_inputs: ["Network name", "Password"],
  },
  wifi_password: {
    key: "wifi_password",
    reason:
      "I have the wifi network name but not the password — guests will ask for both.",
    suggested_inputs: ["Password"],
  },
  parking_instructions: {
    key: "parking_instructions",
    reason:
      "Guests almost always ask about parking. What's the situation — driveway, street, garage code, paid lot?",
    suggested_inputs: ["Driveway / street / garage code / paid lot"],
  },
};

/**
 * Message-class gate (acceptance fix): the required-capability check is a
 * precondition for CHECK-IN / ARRIVAL-INSTRUCTION drafts ONLY — where the
 * message's job is telling an arriving guest how to get in (door/wifi/parking).
 * It must NEVER fire for a review request, post-checkout follow-up, thank-you,
 * marketing, or general reply — those don't deliver access info. Returns true
 * only when the draft carries check-in / arrival / access-delivery intent.
 */
const CHECKIN_DRAFT_SIGNALS = [
  "check in",
  "check-in",
  "checkin",
  "checking in",
  "when you arrive",
  "upon arrival",
  "on arrival",
  "when you get here",
  "how to get in",
  "getting in",
  "to get in",
  "how to access",
  "to access the",
  "door code",
  "access code",
  "entry code",
  "lockbox",
  "lock box",
  "keypad",
  "key code",
  "the code is",
  "gate code",
  "wifi",
  "wi-fi",
  "where to park",
  "parking is",
  "parking situation",
  "park your",
  "where you can park",
  "arrival instructions",
];

export function isCheckinInstructionDraft(messageText: string): boolean {
  if (!messageText) return false;
  const t = messageText.toLowerCase();
  return CHECKIN_DRAFT_SIGNALS.some((s) => t.includes(s));
}

/** Human-readable label for a capability slot — shown to the host in the
 *  host_input_needed card (never the raw slug). */
export function slotLabel(key: RequiredCapabilityKey): string {
  switch (key) {
    case "property_structural":
      return "Property type";
    case "front_door_access_code":
      return "Door code";
    case "wifi_network_name":
      return "Wifi";
    case "wifi_password":
      return "Wifi password";
    case "parking_instructions":
      return "Parking";
  }
}

export interface CheckRequiredCapabilitiesResult {
  satisfied: boolean;
  missing: MissingCapability[];
  property_id: string;
  property_name: string | null;
}

interface PropertyRow {
  id: string;
  name: string | null;
  city: string | null;
  property_type: string | null;
}

interface MemoryFactRow {
  sub_entity_type: string | null;
  attribute: string;
  value: unknown;
}

function hasNonEmptyString(v: unknown): boolean {
  if (typeof v === "string") return v.trim().length > 0;
  if (v && typeof v === "object") {
    // JSONB value column sometimes wraps strings as {value: "..."} or
    // {text: "..."}; tolerate both.
    const obj = v as Record<string, unknown>;
    if (typeof obj.value === "string") return obj.value.trim().length > 0;
    if (typeof obj.text === "string") return obj.text.trim().length > 0;
  }
  return false;
}

/**
 * Run the structured-fallback check for `propose_guest_message`. Given
 * a hostId + propertyId, return whether the four required capabilities
 * are satisfied, and if not, which are missing.
 *
 * Authorization: caller must verify the property belongs to the host
 * before calling. This helper does the data fetch but does NOT enforce
 * host_id == property.user_id — the loop's existing toolContext.host
 * is the authorization boundary.
 */
export async function checkRequiredCapabilities(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<CheckRequiredCapabilitiesResult> {
  const [
    { data: propRow, error: propErr },
    { data: factRows, error: factErr },
    { data: detailRow },
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, city, property_type")
      .eq("id", propertyId)
      .maybeSingle<PropertyRow>(),
    supabase
      .from("memory_facts")
      .select("sub_entity_type, attribute, value")
      .eq("entity_type", "property")
      .eq("entity_id", propertyId)
      .eq("status", "active")
      .in("sub_entity_type", ["front_door", "lock", "wifi", "parking"])
      .returns<MemoryFactRow[]>(),
    // The read-bridge: the host access-info form writes these; a non-empty
    // column satisfies the capability just as a memory_fact does. Missing-row
    // is normal (property_details ships 0-row) → details stays null.
    supabase
      .from("property_details")
      .select("door_code, smart_lock_instructions, wifi_network, wifi_password, parking_instructions")
      .eq("property_id", propertyId)
      .maybeSingle<PropertyDetailsCaps>(),
  ]);

  if (propErr) {
    throw new Error(`property lookup failed: ${propErr.message}`);
  }
  if (factErr) {
    throw new Error(`memory_facts lookup failed: ${factErr.message}`);
  }
  if (!propRow) {
    throw new Error(`property not found: ${propertyId}`);
  }

  return evaluateCapabilities(propRow, factRows ?? [], detailRow ?? null);
}

/**
 * The capability-relevant columns of property_details. The host's access-info
 * form (/api/properties/[id]/access) writes these, and the agent's draft route
 * already reads them for the actual check-in content — so they ALSO satisfy the
 * capability gate. Without this read-bridge the gate (memory_facts) and the
 * content store (property_details) disagree: a host who filled the form is
 * still nagged "missing check-in details" on Today and the check-in draft gate
 * still fires for info the agent already has.
 */
export interface PropertyDetailsCaps {
  door_code?: string | null;
  smart_lock_instructions?: string | null;
  wifi_network?: string | null;
  wifi_password?: string | null;
  parking_instructions?: string | null;
}

/**
 * Pure-helper version of the capability evaluator. Split out so unit
 * tests can exercise the rule set without a supabase mock — they pass
 * in PropertyRow + MemoryFactRow[] (+ optional PropertyDetailsCaps) fixtures
 * directly. A capability is present if EITHER a memory_fact OR the
 * corresponding property_details column carries it.
 */
export function evaluateCapabilities(
  property: PropertyRow,
  facts: MemoryFactRow[],
  details?: PropertyDetailsCaps | null,
): CheckRequiredCapabilitiesResult {
  const missing: MissingCapability[] = [];

  // #1 structural — only the property_type is checked; name + city are
  // captured at /properties creation and effectively never null in
  // production. property_type is the field that drifts to null when
  // imported from URL parsers that didn't surface it.
  if (!hasNonEmptyString(property.property_type)) {
    missing.push(MISSING_CAPABILITY_COPY.property_structural);
  }

  // Build a quick (sub_entity_type, attribute) → value map.
  const factMap = new Map<string, unknown>();
  for (const f of facts) {
    if (!f.sub_entity_type) continue;
    factMap.set(`${f.sub_entity_type}::${f.attribute}`, f.value);
  }

  // #2 access code — front_door::access_code OR lock::access_code OR
  // front_door::lockbox_flag (the per-arrival lockbox carve-out), OR the
  // property_details door_code / smart_lock_instructions the host form writes.
  const hasFrontDoorCode =
    hasNonEmptyString(factMap.get("front_door::access_code")) ||
    hasNonEmptyString(factMap.get("lock::access_code")) ||
    hasNonEmptyString(factMap.get("front_door::lockbox_flag")) ||
    hasNonEmptyString(details?.door_code) ||
    hasNonEmptyString(details?.smart_lock_instructions);
  if (!hasFrontDoorCode) {
    missing.push(MISSING_CAPABILITY_COPY.front_door_access_code);
  }

  // #3 wifi — both network_name AND password required; report
  // independently so the host knows exactly what's missing.
  const hasWifiNetwork =
    hasNonEmptyString(factMap.get("wifi::network_name")) ||
    hasNonEmptyString(details?.wifi_network);
  const hasWifiPassword =
    hasNonEmptyString(factMap.get("wifi::password")) ||
    hasNonEmptyString(details?.wifi_password);
  if (!hasWifiNetwork) {
    missing.push(MISSING_CAPABILITY_COPY.wifi_network_name);
  } else if (!hasWifiPassword) {
    missing.push(MISSING_CAPABILITY_COPY.wifi_password);
  }

  // #4 parking
  const hasParking =
    hasNonEmptyString(factMap.get("parking::instructions")) ||
    hasNonEmptyString(details?.parking_instructions);
  if (!hasParking) {
    missing.push(MISSING_CAPABILITY_COPY.parking_instructions);
  }

  return {
    satisfied: missing.length === 0,
    missing,
    property_id: property.id,
    property_name: property.name,
  };
}

/**
 * Concatenate multiple `MissingCapability` entries into one
 * host-input-needed RefusalEnvelope payload — voice-doctrine §4.4
 * pattern (one envelope per request, all gaps named together) per C3
 * sign-off R-5.
 */
export function buildMultiMissingEnvelopeText(missing: MissingCapability[]): {
  reason: string;
  missing_inputs: string[];
  suggested_inputs: string[];
} {
  if (missing.length === 0) {
    throw new Error("buildMultiMissingEnvelopeText called with empty list");
  }
  if (missing.length === 1) {
    return {
      reason: missing[0].reason,
      missing_inputs: [slotLabel(missing[0].key)],
      suggested_inputs: missing[0].suggested_inputs,
    };
  }
  // 2+ — concatenate. Keep the multi-missing copy compact and direct,
  // matching §4.4 "one envelope per request". Name what's needed; let
  // the suggested_inputs render the per-slot detail.
  const slotNames = missing.map((m) => slotShortName(m.key));
  const reason =
    "I need a couple of things before drafting — " +
    formatSlotList(slotNames) +
    ". They all come up in almost every check-in.";
  return {
    reason,
    // Human labels (e.g. "Door code", "Wifi", "Parking") — the host sees these
    // in the card, never the raw slugs.
    missing_inputs: missing.map((m) => slotLabel(m.key)),
    suggested_inputs: missing.flatMap((m) => m.suggested_inputs),
  };
}

function slotShortName(key: RequiredCapabilityKey): string {
  switch (key) {
    case "property_structural":
      return "the property type";
    case "front_door_access_code":
      return "the door code";
    case "wifi_network_name":
      return "wifi credentials";
    case "wifi_password":
      return "the wifi password";
    case "parking_instructions":
      return "the parking situation";
  }
}

function formatSlotList(slots: string[]): string {
  if (slots.length === 0) return "";
  if (slots.length === 1) return slots[0];
  if (slots.length === 2) return `${slots[0]} and ${slots[1]}`;
  return `${slots.slice(0, -1).join(", ")}, and ${slots[slots.length - 1]}`;
}
