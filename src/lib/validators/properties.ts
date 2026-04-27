import { z } from "zod";

/**
 * propertyUpdateSchema — body schema for `PUT /api/properties/[propertyId]`.
 *
 * The property `id` is URL-scoped, never accepted in the body.
 * Server-side fields (`user_id`, `created_at`, `updated_at`, `channex_property_id`,
 * `default_cleaner_id`, `reviews_last_synced_at`, `messages_last_synced_at`)
 * are not part of the host-editable surface and are intentionally absent.
 */
export const propertyUpdateSchema = z.object({
  name: z.string().trim().min(1, "Required").max(200, "Too long"),
  address: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.string().trim().max(60).nullable().optional(),
  zip: z.string().trim().max(20).nullable().optional(),
  latitude: z
    .number()
    .finite()
    .min(-90, "Must be between -90 and 90")
    .max(90, "Must be between -90 and 90")
    .nullable()
    .optional(),
  longitude: z
    .number()
    .finite()
    .min(-180, "Must be between -180 and 180")
    .max(180, "Must be between -180 and 180")
    .nullable()
    .optional(),
  bedrooms: z.number().int("Must be a whole number").min(0).max(50).optional(),
  bathrooms: z
    .number()
    .multipleOf(0.5, "Must be in 0.5 increments")
    .min(0)
    .max(50)
    .optional(),
  max_guests: z.number().int("Must be a whole number").min(1).max(100).optional(),
  property_type: z.enum(["entire_home", "private_room", "shared_room"]).optional(),
});

export type PropertyUpdateInput = z.infer<typeof propertyUpdateSchema>;

/**
 * Convert zod issues into the single-string-per-field shape that
 * Koast UI components (FormControls TextInput, PricingTab FieldNumeric)
 * already render. First issue per field wins.
 */
export function flattenFieldErrors(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map((p) => String(p)).join(".");
    if (!key) continue;
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
