import {
  pgTable,
  uuid,
  text,
  decimal,
  date,
  boolean,
  timestamp,
  jsonb,
  integer,
  time,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
// M10 Phase D STEP 6 (S3): typed JSONB envelope column on messages.
// Import-direction note: db schema → agent envelope schema is one-way (the
// envelope schema is Zod-only, no DB deps, so no circularity).
import type { AgentTextOutput } from "@/lib/agent/schemas/agent-text-output";

// ==================== Properties ====================

export const properties = pgTable("properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  // M13 agenda — IANA timezone (e.g. 'America/New_York'). Nullable; the agenda
  // windows each property's "today" in its own tz and SKIPS null-tz properties
  // (never UTC-fallback). New-property auto-defaulting is deferred.
  timezone: text("timezone"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  bedrooms: integer("bedrooms"),
  bathrooms: decimal("bathrooms", { precision: 3, scale: 1 }),
  maxGuests: integer("max_guests"),
  propertyType: text("property_type"),
  amenities: jsonb("amenities").default([]),
  photos: jsonb("photos").default([]),
  coverPhotoUrl: text("cover_photo_url"),
  channexPropertyId: text("channex_property_id"),
  defaultCleanerId: uuid("default_cleaner_id"),
  reviewsLastSyncedAt: timestamp("reviews_last_synced_at", { withTimezone: true }),
  messagesLastSyncedAt: timestamp("messages_last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_properties_user").on(t.userId),
  uniqueIndex("idx_properties_channex_id").on(t.channexPropertyId),
]);

export const propertiesRelations = relations(properties, ({ many }) => ({
  listings: many(listings),
  bookings: many(bookings),
  calendarRates: many(calendarRates),
  marketComps: many(marketComps),
  marketSnapshots: many(marketSnapshots),
  messages: many(messages),
  messageThreads: many(messageThreads),
  cleaningTasks: many(cleaningTasks),
  localEvents: many(localEvents),
  guestReviews: many(guestReviews),
  // reviewRules relation removed M9 Phase G E3 (table dropped 20260517030000);
  // review preferences live at memory_facts entity_type='host' + sub_entity_type='reviews'.
}));

// ==================== Listings ====================

export const listings = pgTable("listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
  platform: text("platform").notNull(),
  platformListingId: text("platform_listing_id"),
  channexRoomId: text("channex_room_id"),
  listingUrl: text("listing_url"),
  status: text("status").default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_listings_property").on(t.propertyId),
]);

export const listingsRelations = relations(listings, ({ one }) => ({
  property: one(properties, { fields: [listings.propertyId], references: [properties.id] }),
}));

// ==================== Bookings ====================

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
  listingId: uuid("listing_id").references(() => listings.id),
  platform: text("platform").notNull(),
  platformBookingId: text("platform_booking_id"),
  channexBookingId: text("channex_booking_id"),
  // Session 6.3 — Channex-feed-sourced columns. Populated by the
  // webhook handler + booking_sync.py polling path. Reviews join on
  // ota_reservation_code (HM-code for Airbnb, numeric for BDC).
  otaReservationCode: text("ota_reservation_code"),
  guestFirstName: text("guest_first_name"),
  guestLastName: text("guest_last_name"),
  revisionNumber: integer("revision_number"),
  source: text("source").default("ical"),
  guestName: text("guest_name"),
  guestEmail: text("guest_email"),
  guestPhone: text("guest_phone"),
  checkIn: date("check_in").notNull(),
  checkOut: date("check_out").notNull(),
  numGuests: integer("num_guests"),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }),
  currency: text("currency").default("USD"),
  status: text("status").default("confirmed"),
  notes: text("notes"),
  reviewSolicitationSent: boolean("review_solicitation_sent").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_bookings_property_checkin").on(t.propertyId, t.checkIn),
  // PG-PARTIAL-FIX (2026-04-26): the live constraint is named
  // bookings_channex_booking_id_key (full UNIQUE, no WHERE),
  // replacing the original partial idx_bookings_channex_booking_id
  // from migration 002. Drizzle's uniqueIndex() without .where()
  // generates a non-partial index, so this declaration matches the
  // current DB shape — same name preserved for continuity. See
  // koast-development/conventions.md "Database conventions —
  // partial indexes" for why partial UNIQUE breaks PostgREST upserts.
  uniqueIndex("idx_bookings_channex_booking_id").on(t.channexBookingId),
]);

export const bookingsRelations = relations(bookings, ({ one }) => ({
  property: one(properties, { fields: [bookings.propertyId], references: [properties.id] }),
  listing: one(listings, { fields: [bookings.listingId], references: [listings.id] }),
}));

// ==================== Calendar Rates ====================

export const calendarRates = pgTable("calendar_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
  date: date("date").notNull(),
  baseRate: decimal("base_rate", { precision: 10, scale: 2 }),
  suggestedRate: decimal("suggested_rate", { precision: 10, scale: 2 }),
  appliedRate: decimal("applied_rate", { precision: 10, scale: 2 }),
  minStay: integer("min_stay").default(1),
  isAvailable: boolean("is_available").default(true),
  rateSource: text("rate_source").default("manual"),
  factors: jsonb("factors"),
  // Per-channel rate overrides. NULL for base/engine rates, populated
  // (e.g. 'BDC', 'VRBO') for channel-specific rate overrides that live
  // alongside the base row.
  channelCode: text("channel_code"),
  channexRatePlanId: text("channex_rate_plan_id"),
  lastPushedAt: timestamp("last_pushed_at", { withTimezone: true }),
  lastChannexRate: decimal("last_channex_rate", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_calendar_rates_property_date").on(t.propertyId, t.date),
]);

export const calendarRatesRelations = relations(calendarRates, ({ one }) => ({
  property: one(properties, { fields: [calendarRates.propertyId], references: [properties.id] }),
}));

// ==================== Market Comps ====================

export const marketComps = pgTable("market_comps", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
  compListingId: text("comp_listing_id"),
  compName: text("comp_name"),
  compBedrooms: integer("comp_bedrooms"),
  compAdr: decimal("comp_adr", { precision: 10, scale: 2 }),
  compOccupancy: decimal("comp_occupancy", { precision: 5, scale: 2 }),
  compRevpar: decimal("comp_revpar", { precision: 10, scale: 2 }),
  distanceKm: decimal("distance_km", { precision: 5, scale: 2 }),
  photoUrl: text("photo_url"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  lastSynced: timestamp("last_synced", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_market_comps_property").on(t.propertyId),
]);

export const marketCompsRelations = relations(marketComps, ({ one }) => ({
  property: one(properties, { fields: [marketComps.propertyId], references: [properties.id] }),
}));

// ==================== Market Snapshots ====================

export const marketSnapshots = pgTable("market_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
  snapshotDate: date("snapshot_date").notNull(),
  marketAdr: decimal("market_adr", { precision: 10, scale: 2 }),
  marketOccupancy: decimal("market_occupancy", { precision: 5, scale: 2 }),
  marketRevpar: decimal("market_revpar", { precision: 10, scale: 2 }),
  marketSupply: integer("market_supply"),
  marketDemandScore: decimal("market_demand_score", { precision: 5, scale: 2 }),
  dataSource: text("data_source").default("airroi"),
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_market_snapshots_property_date").on(t.propertyId, t.snapshotDate),
]);

export const marketSnapshotsRelations = relations(marketSnapshots, ({ one }) => ({
  property: one(properties, { fields: [marketSnapshots.propertyId], references: [properties.id] }),
}));

// ==================== Messages ====================

// MSG-S1 — message_threads is the parent, messages is the leaf.
// Channel-asymmetric booking link: BDC threads carry channex_booking_id;
// AirBNB threads only carry ota_message_thread_id and resolve via the
// RDX-3 join key. See docs/MESSAGING_DESIGN.md §3.
export const messageThreads = pgTable("message_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  channexThreadId: text("channex_thread_id").notNull(),
  channexChannelId: text("channex_channel_id"),
  channexBookingId: text("channex_booking_id"),
  otaMessageThreadId: text("ota_message_thread_id"),
  channelCode: text("channel_code").notNull(),               // 'abb' | 'bdc'
  providerRaw: text("provider_raw").notNull(),               // 'AirBNB' | 'BookingCom'
  title: text("title"),
  lastMessagePreview: text("last_message_preview"),
  lastMessageReceivedAt: timestamp("last_message_received_at", { withTimezone: true }),
  messageCount: integer("message_count").notNull().default(0),
  unreadCount: integer("unread_count").notNull().default(0),
  isClosed: boolean("is_closed").notNull().default(false),
  status: text("status").notNull().default("active"),        // active | archived | no_reply_needed
  threadKind: text("thread_kind").notNull().default("message"), // message | inquiry | reservation_request
  meta: jsonb("meta"),
  channexInsertedAt: timestamp("channex_inserted_at", { withTimezone: true }),
  channexUpdatedAt: timestamp("channex_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_message_threads_channex_id").on(t.channexThreadId),
  index("idx_message_threads_property_last").on(t.propertyId, t.lastMessageReceivedAt),
  index("idx_message_threads_booking").on(t.bookingId),
]);

export const messageThreadsRelations = relations(messageThreads, ({ one, many }) => ({
  property: one(properties, { fields: [messageThreads.propertyId], references: [properties.id] }),
  booking: one(bookings, { fields: [messageThreads.bookingId], references: [bookings.id] }),
  messages: many(messages),
}));

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").references(() => bookings.id),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
  threadId: uuid("thread_id").references(() => messageThreads.id, { onDelete: "cascade" }),
  channexMessageId: text("channex_message_id"),
  otaMessageId: text("ota_message_id"),
  platform: text("platform").notNull(),
  direction: text("direction"),
  sender: text("sender"),                                    // raw 'guest' | 'property' | 'system'
  senderName: text("sender_name"),
  content: text("content").notNull(),
  attachments: jsonb("attachments").notNull().default([]),
  channexMeta: jsonb("channex_meta"),
  aiDraft: text("ai_draft"),
  // Session 8a: renamed from ai_draft_status. Union now covers AI-generated
  // drafts AND template-rendered drafts produced by messaging_executor.py.
  // Values: none | generated | sent | draft_pending_approval | discarded
  draftStatus: text("draft_status").default("none"),
  // M10 Phase D STEP 6 (S3): D22 AgentTextOutput envelope per draft.
  // Nullable PERMANENT per phase-d-ultraplan §3.6 (M3-outcome-3-family 2nd
  // instance after notifications.host_id): historical drafts predate envelope
  // (NULL by nature); new drafts populate at STEP 7 (/api/messages/draft);
  // UI displays at STEP 8 (display-on-presence). NOT NULL DB constraint
  // deferred — app-level enforcement on new rows.
  envelope: jsonb("envelope").$type<AgentTextOutput>(),
  readAt: timestamp("read_at", { withTimezone: true }),
  channexInsertedAt: timestamp("channex_inserted_at", { withTimezone: true }),
  channexUpdatedAt: timestamp("channex_updated_at", { withTimezone: true }),
  // Slice 2 — outbound three-stage write columns. NULL until used.
  hostSendSubmittedAt: timestamp("host_send_submitted_at", { withTimezone: true }),
  hostSendChannexAckedAt: timestamp("host_send_channex_acked_at", { withTimezone: true }),
  hostSendOtaConfirmedAt: timestamp("host_send_ota_confirmed_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  // Agent loop v1 — actor attribution per migration 20260501040000.
  // actor_kind names INTERNAL-side actors only — those who act on
  // Koast's behalf. Values: 'host' | 'agent' | 'cleaner' | 'cohost' | 'system'.
  // Guest-side rows (sender='guest') intentionally have actor_kind NULL
  // because the guest is the external party Koast communicates WITH,
  // not an internal actor. The sender column already distinguishes
  // property-side from guest-side. actor_kind='agent' doubles as the
  // voice-extraction-exclusion flag. See `MessagesActorKind` type
  // exported below.
  actorId: uuid("actor_id"),
  actorKind: text("actor_kind"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_messages_property_created").on(t.propertyId, t.createdAt),
  index("idx_messages_thread_inserted").on(t.threadId, t.channexInsertedAt),
  uniqueIndex("idx_messages_channex_id").on(t.channexMessageId),
  // Partial index — excludes inbound/unattributed rows naturally.
  index("idx_messages_actor_voice_filter").on(t.actorKind, t.sender),
  index("idx_messages_actor_id").on(t.actorId),
]);

/**
 * Controlled vocabulary for `messages.actor_kind`. Mirrors the CHECK
 * constraint in migration 20260501040000. Exported so callers can
 * type-check actor attribution at the application layer; the column
 * itself is `text` per the codebase's no-pgEnum convention.
 *
 * NULL is also valid (the column is nullable) and represents
 * external-actor or unattributed rows; use `MessagesActorKind | null`
 * where appropriate.
 */
export type MessagesActorKind =
  | "host"      // The authenticated user (or, post-multi-user, the primary owner of the property)
  | "agent"     // An autonomous Koast generation (template executor, future agent draft autosend)
  | "cleaner"   // A cleaner taking action via the cleaner-token landing page
  | "cohost"    // Future multi-user: co-host actor distinct from the primary host
  | "system";   // Platform-generated rows (booking confirmations, etc.)

export const messagesRelations = relations(messages, ({ one }) => ({
  property: one(properties, { fields: [messages.propertyId], references: [properties.id] }),
  booking: one(bookings, { fields: [messages.bookingId], references: [bookings.id] }),
  thread: one(messageThreads, { fields: [messages.threadId], references: [messageThreads.id] }),
}));

// ==================== Message Automation Firings — REMOVED (P6) ====================
// Retired with the message_templates feature; table dropped (20260507020000).
// AI messaging (the draft pipeline) is the successor — no template-automation layer.

// ==================== Cleaning Tasks ====================

export const cleaningTasks = pgTable("cleaning_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
  bookingId: uuid("booking_id").references(() => bookings.id),
  nextBookingId: uuid("next_booking_id").references(() => bookings.id),
  // TURN-S1a — FK fix. Migration 001:158 declared this REFERENCES
  // auth.users; migration 20260426050000 corrects it to cleaners(id)
  // with ON DELETE SET NULL. Drizzle's references() callback resolves
  // the cleaners table at runtime, so the forward declaration to
  // schema.ts:502 below works.
  cleanerId: uuid("cleaner_id").references(() => cleaners.id, { onDelete: "set null" }),
  status: text("status").default("pending"),
  scheduledDate: date("scheduled_date").notNull(),
  scheduledTime: time("scheduled_time"),
  checklist: jsonb("checklist").default([]),
  photos: jsonb("photos").default([]),
  notes: text("notes"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cleanerToken: text("cleaner_token"),
  reminderSent: boolean("reminder_sent").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_cleaning_tasks_property_date").on(t.propertyId, t.scheduledDate),
  uniqueIndex("idx_cleaning_tasks_token").on(t.cleanerToken),
]);

export const cleaningTasksRelations = relations(cleaningTasks, ({ one }) => ({
  property: one(properties, { fields: [cleaningTasks.propertyId], references: [properties.id] }),
}));

/**
 * cleaning_tasks.status — mirrors the DB CHECK in 001_initial_schema.sql:159
 * (`status IN ('pending','assigned','in_progress','completed','issue')`). Per the
 * CLAUDE.md CHECK-constrained-text-column convention, app callers that branch on
 * status get compile-time enforcement matching the database constraint. There is
 * deliberately no 'cancelled' member — a cancelled booking hard-deletes its
 * UNSTARTED turnover task (P1.1 `teardownTaskOnCancel`) rather than introducing a
 * soft-cancel state.
 */
export type CleaningTaskStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "completed"
  | "issue";

// ==================== Review Rules (DROPPED) ====================
// M9 Phase G E3 (v2.6): review_rules table dropped via migration
// 20260517030000_drop_review_rules.sql. Review preferences migrated to
// memory_facts (entity_type='host' + sub_entity_type='reviews'). Helpers
// at src/lib/memory/review-preferences.ts. Per-property → per-host
// architectural change per Q-G2 locus shift. (M10 Phase G H1: backup
// table review_rules_backup_phase_g dropped via
// 20260524010000_drop_review_rules_backup_phase_g.sql — rollback window
// long expired; zero readers.)

// ==================== Guest Reviews ====================

export const guestReviews = pgTable("guest_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable to match DB: incoming Channex reviews may not have a
  // matching local booking via ota_reservation_id.
  bookingId: uuid("booking_id").references(() => bookings.id),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
  direction: text("direction"),
  guestName: text("guest_name"),
  draftText: text("draft_text"),
  finalText: text("final_text"),
  starRating: integer("star_rating").default(5),
  recommendGuest: boolean("recommend_guest").default(true),
  privateNote: text("private_note"),
  incomingText: text("incoming_text"),
  incomingRating: decimal("incoming_rating", { precision: 2, scale: 1 }),
  incomingDate: timestamp("incoming_date", { withTimezone: true }),
  responseDraft: text("response_draft"),
  responseFinal: text("response_final"),
  responseSent: boolean("response_sent").default(false),
  status: text("status").default("pending"),
  scheduledPublishAt: timestamp("scheduled_publish_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  isBadReview: boolean("is_bad_review").default(false),
  // RDX-4 decomposed source-of-truth columns. is_bad_review stays
  // for one release cycle; remove in tech-debt cleanup.
  isLowRating: boolean("is_low_rating").default(false).notNull(),
  isFlaggedByHost: boolean("is_flagged_by_host").default(false).notNull(),
  // Session 6.7 — Channex /reviews `attributes.is_hidden`. True while
  // the 14-day mutual-disclosure window is open. Sync extracts every
  // iteration; classifier guards is_low_rating on it so pre-disclosure
  // reviews (rating=0 sentinel) never get the "Bad review" tag.
  isHidden: boolean("is_hidden").default(false).notNull(),
  aiContext: jsonb("ai_context"),
  // Session 6 sync columns
  channexReviewId: text("channex_review_id"),
  privateFeedback: text("private_feedback"),
  subratings: jsonb("subratings"),
  // Session 6.1c — Channex's ota_reservation_id stamped at sync time
  // (Airbnb HM-code or BDC numeric). Used by read paths to resolve
  // the matching booking without re-fetching from Channex.
  otaReservationCode: text("ota_reservation_code"),
  // Session 6.3 — manual override for historical reviews whose
  // booking has aged out of Channex's /bookings window. Resolver
  // precedence: override > booking > review > platform fallback.
  guestNameOverride: text("guest_name_override"),
  // Session 6.2 — three-stage guest_review submission tracking.
  // submitted_at: host clicked Submit. channex_acked_at: Channex 200.
  // airbnb_confirmed_at: verified that Airbnb actually accepted (via
  // subsequent sync match against reply.guest_review). The split
  // exists because Channex validates shape only — see channex-expert
  // known-quirks.md.
  guestReviewSubmittedAt: timestamp("guest_review_submitted_at", { withTimezone: true }),
  guestReviewChannexAckedAt: timestamp("guest_review_channex_acked_at", { withTimezone: true }),
  guestReviewAirbnbConfirmedAt: timestamp("guest_review_airbnb_confirmed_at", { withTimezone: true }),
  guestReviewPayload: jsonb("guest_review_payload"),
  // Session 6.5 — Channex's two-sided-review submission deadline. NULL
  // when not yet synced. Consumers derive is_expired at read time
  // against now() rather than caching a stale boolean.
  expiredAt: timestamp("expired_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_guest_reviews_property").on(t.propertyId),
  index("idx_guest_reviews_status").on(t.status),
]);

export const guestReviewsRelations = relations(guestReviews, ({ one }) => ({
  property: one(properties, { fields: [guestReviews.propertyId], references: [properties.id] }),
  booking: one(bookings, { fields: [guestReviews.bookingId], references: [bookings.id] }),
}));

// ==================== Pricing Outcomes ====================

export const pricingOutcomes = pgTable("pricing_outcomes", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
  date: date("date").notNull(),
  suggestedRate: decimal("suggested_rate", { precision: 10, scale: 2 }),
  appliedRate: decimal("applied_rate", { precision: 10, scale: 2 }),
  rateSource: text("rate_source"),
  wasBooked: boolean("was_booked").default(false),
  bookingId: uuid("booking_id").references(() => bookings.id),
  actualRevenue: decimal("actual_revenue", { precision: 10, scale: 2 }),
  bookedAt: timestamp("booked_at", { withTimezone: true }),
  daysBeforeCheckin: integer("days_before_checkin"),
  marketAdr: decimal("market_adr", { precision: 10, scale: 2 }),
  marketOccupancy: decimal("market_occupancy", { precision: 5, scale: 2 }),
  demandScore: decimal("demand_score", { precision: 5, scale: 2 }),
  compMedianAdr: decimal("comp_median_adr", { precision: 10, scale: 2 }),
  signals: jsonb("signals"),
  revenueVsSuggested: decimal("revenue_vs_suggested", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_pricing_outcomes_property_date").on(t.propertyId, t.date),
  index("idx_pricing_outcomes_booked").on(t.wasBooked, t.date),
]);

// ==================== Local Events ====================

export const localEvents = pgTable("local_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").references(() => properties.id),
  eventName: text("event_name").notNull(),
  eventDate: date("event_date").notNull(),
  venueName: text("venue_name"),
  eventType: text("event_type"),
  estimatedAttendance: integer("estimated_attendance"),
  demandImpact: decimal("demand_impact", { precision: 3, scale: 2 }),
  source: text("source").default("ticketmaster"),
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_local_events_property_date").on(t.propertyId, t.eventDate),
  index("idx_local_events_date").on(t.eventDate),
]);

export const localEventsRelations = relations(localEvents, ({ one }) => ({
  property: one(properties, { fields: [localEvents.propertyId], references: [properties.id] }),
}));

// ==================== Leads ====================

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  bedrooms: integer("bedrooms"),
  currentRate: decimal("current_rate", { precision: 10, scale: 2 }),
  estimatedOpportunity: decimal("estimated_opportunity", { precision: 10, scale: 2 }),
  marketAdr: decimal("market_adr", { precision: 10, scale: 2 }),
  source: text("source").default("revenue_check"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ==================== Revenue Checks ====================

export const revenueChecks = pgTable("revenue_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  ipAddress: text("ip_address"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  bedrooms: integer("bedrooms"),
  currentRate: decimal("current_rate", { precision: 10, scale: 2 }),
  resultJson: jsonb("result_json"),
  leadId: uuid("lead_id").references(() => leads.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_revenue_checks_ip").on(t.ipAddress, t.createdAt),
]);

// ==================== iCal Feeds ====================

export const icalFeeds = pgTable("ical_feeds", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
  platform: text("platform").notNull(),
  feedUrl: text("feed_url").notNull(),
  platformListingId: text("platform_listing_id"),
  isActive: boolean("is_active").default(true),
  lastSynced: timestamp("last_synced", { withTimezone: true }),
  lastError: text("last_error"),
  syncCount: integer("sync_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex("idx_ical_feeds_property_platform").on(t.propertyId, t.platform),
  index("idx_ical_feeds_active").on(t.isActive),
]);

export const icalFeedsRelations = relations(icalFeeds, ({ one }) => ({
  property: one(properties, { fields: [icalFeeds.propertyId], references: [properties.id] }),
}));

// ==================== Cleaners ====================

export const cleaners = pgTable("cleaners", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_cleaners_user").on(t.userId),
]);

// ==================== Cleaner Push Subscriptions (TURN-S2-send) ====================
// Web-push subscriptions for the cleaner PWA. Service-role access only
// (RLS enabled, no policies). Migration 20260608010000.
export const cleanerPushSubscriptions = pgTable("cleaner_push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  cleanerId: uuid("cleaner_id").notNull().references(() => cleaners.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_cleaner_push_subscriptions_cleaner").on(t.cleanerId),
]);

// ==================== SMS Log ====================

export const smsLog = pgTable("sms_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  cleanerId: uuid("cleaner_id"),
  cleaningTaskId: uuid("cleaning_task_id"),
  phoneTo: text("phone_to").notNull(),
  messageBody: text("message_body").notNull(),
  twilioSid: text("twilio_sid"),
  status: text("status").default("sent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_sms_log_user").on(t.userId),
  index("idx_sms_log_task").on(t.cleaningTaskId),
]);

// ==================== Notifications ====================

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  // M10 Phase C STEP 6 (M3): owning-host attribution. Nullable PERMANENT
  // for historical rows (recipient is cleaner.name or "host" literal,
  // neither derivable to a host). NOT NULL deferred / abandoned per
  // Q-M3-a; new-row enforcement is app-level (STEP 7 threads host_id
  // through storeNotification + 4 notify* callers). FK to auth.users(id)
  // enforced at the SQL layer (migration 20260521190000) — Drizzle can't
  // reference the auth schema, matches the user_id pattern on properties /
  // sms_log / host_state.
  hostId: uuid("host_id"),
  type: text("type").notNull(),
  recipient: text("recipient"),
  message: text("message").notNull(),
  channel: text("channel").default("console"),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ==================== Property Details ====================

export const propertyDetails = pgTable("property_details", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").references(() => properties.id).notNull().unique(),
  wifiNetwork: text("wifi_network"),
  wifiPassword: text("wifi_password"),
  doorCode: text("door_code"),
  smartLockInstructions: text("smart_lock_instructions"),
  checkinTime: time("checkin_time").default("15:00"),
  checkoutTime: time("checkout_time").default("11:00"),
  parkingInstructions: text("parking_instructions"),
  houseRules: text("house_rules"),
  localRecommendations: text("local_recommendations"),
  emergencyContact: text("emergency_contact"),
  specialInstructions: text("special_instructions"),
  customFields: jsonb("custom_fields").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const propertyDetailsRelations = relations(propertyDetails, ({ one }) => ({
  property: one(properties, { fields: [propertyDetails.propertyId], references: [properties.id] }),
}));

// ==================== Message Templates — REMOVED (P6) ====================
// Feature retired; tables message_templates + message_automation_firings were
// dropped (20260507020000). AI messaging (the draft pipeline) is the successor.

// ==================== User Preferences (REMOVED) ====================
// The `user_preferences` table was deliberately dropped (migration
// 20260507020000_drop_deprecated_config_tables); its only reader was
// isAutoApproveEnabled, fixed in P6.2 (H3.1) to not query the phantom table.
// Declaration removed to keep the Drizzle ↔ DB diff clean. A future per-host
// auto-approve preference home should use host_state or a fresh table.

// ==================== Host State (M8 Phase G C4) ====================
//
// Per-host UI/inspection state. One row per host; upserted by the
// audit-drawer mark-seen endpoint and by future host-scoped UI state
// surfaces. RLS enforces auth.uid() = host_id.
//
// Phase G ships last_seen_inspect_at only. Future columns
// (welcome_seen, dismissed_banners, last_seen_pricing_at, etc.) land
// here without new tables. Migration: 20260511010000.

export const hostState = pgTable("host_state", {
  hostId: uuid("host_id").primaryKey(),
  lastSeenInspectAt: timestamp("last_seen_inspect_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ==================== Property Channels ====================

export const propertyChannels = pgTable("property_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  channexChannelId: text("channex_channel_id").notNull(),
  channelCode: text("channel_code").notNull(),
  channelName: text("channel_name").notNull(),
  status: text("status").notNull().default("active"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_property_channels_property").on(t.propertyId),
  uniqueIndex("idx_property_channels_unique").on(t.propertyId, t.channexChannelId),
]);

export const propertyChannelsRelations = relations(propertyChannels, ({ one }) => ({
  property: one(properties, { fields: [propertyChannels.propertyId], references: [properties.id] }),
}));

// ==================== Channex Room Types ====================

export const channexRoomTypes = pgTable("channex_room_types", {
  id: text("id").primaryKey(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  channexPropertyId: text("channex_property_id").notNull(),
  title: text("title").notNull(),
  countOfRooms: integer("count_of_rooms").default(1),
  occAdults: integer("occ_adults").default(2),
  occChildren: integer("occ_children").default(0),
  cachedAt: timestamp("cached_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_channex_room_types_property").on(t.propertyId),
]);

export const channexRoomTypesRelations = relations(channexRoomTypes, ({ one }) => ({
  property: one(properties, { fields: [channexRoomTypes.propertyId], references: [properties.id] }),
}));

// ==================== Channex Rate Plans ====================

export const channexRatePlans = pgTable("channex_rate_plans", {
  id: text("id").primaryKey(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  roomTypeId: text("room_type_id").notNull(),
  title: text("title").notNull(),
  sellMode: text("sell_mode").default("per_room"),
  currency: text("currency").default("USD"),
  rateMode: text("rate_mode").default("manual"),
  cachedAt: timestamp("cached_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_channex_rate_plans_property").on(t.propertyId),
]);

export const channexRatePlansRelations = relations(channexRatePlans, ({ one }) => ({
  property: one(properties, { fields: [channexRatePlans.propertyId], references: [properties.id] }),
}));

// ==================== Channex Webhook Log ====================
//
// Inbound Channex webhook event log. The table was created in production via
// the Studio SQL editor before the migrations directory was tracking schema
// faithfully; supabase/migrations/20260407040000_recovery_schema_drift.sql
// (D1) creates the 12-column base shape, and
// 20260407050000_channex_revision_polling.sql adds revision_id. The Drizzle
// declaration below describes the final 13-column shape.
//
// Writers: src/app/api/webhooks/channex/route.ts (every inbound webhook).
// Readers: /channels/sync-log surface (the single host-facing audit feed).
//
// RLS: enabled in the database (see migration 20260407040000); policy
// "Users can view own webhook logs" lives in 20260408010000_fix_rls_policies.sql.

export const channexWebhookLog = pgTable("channex_webhook_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type"),
  bookingId: text("booking_id"),
  channexPropertyId: text("channex_property_id"),
  guestName: text("guest_name"),
  checkIn: text("check_in"),
  checkOut: text("check_out"),
  payload: jsonb("payload"),
  actionTaken: text("action_taken"),
  ackSent: boolean("ack_sent").default(false),
  ackResponse: text("ack_response"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  // Added by 20260407050000_channex_revision_polling.sql for dedup between
  // webhook + the polling worker.
  revisionId: text("revision_id"),
}, (t) => [
  index("idx_webhook_log_revision_id").on(t.revisionId),
]);

// ==================== Guests ====================

export const guests = pgTable("guests", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostId: uuid("host_id").notNull(),
  displayName: text("display_name"),
  firstSeenBookingId: uuid("first_seen_booking_id").references(() => bookings.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_guests_host").on(t.hostId),
  index("idx_guests_first_seen_booking").on(t.firstSeenBookingId),
]);

export const guestsRelations = relations(guests, ({ one, many }) => ({
  firstSeenBooking: one(bookings, { fields: [guests.firstSeenBookingId], references: [bookings.id] }),
  memoryFacts: many(memoryFacts),
}));

// ==================== Memory Facts ====================
//
// The Tier 1 memory schema. Mirrors the pricing_rules.source +
// inferred_from JSONB precedent established by migration
// 20260418000000. See docs/architecture/agent-loop-v1-design.md §6.

export const memoryFacts = pgTable("memory_facts", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostId: uuid("host_id").notNull(),
  // entity_type values: 'host' | 'property' | 'guest' | 'vendor' | 'booking'
  // CHECK constraint lives in the migration.
  entityType: text("entity_type").notNull(),
  // Polymorphic reference; type-discriminated by entity_type. Not enforced
  // as FK because cross-table polymorphism is expensive in Postgres.
  entityId: uuid("entity_id").notNull(),
  // sub_entity_type is a controlled vocabulary CHECK-constrained at the
  // DB level (see migration 20260501010000). The TS-side typed union is
  // exported as `MemoryFactSubEntityType` below — callers should narrow
  // to that type rather than passing arbitrary strings. The column
  // itself is text per the codebase's no-pgEnum convention.
  // sub_entity_id is a free-text disambiguator (e.g., 'primary_router'
  // when sub_entity_type='wifi'). Will become a typed uuid + FK in a
  // future migration when sub-entity tables ship.
  subEntityType: text("sub_entity_type"),
  subEntityId: text("sub_entity_id"),
  guestId: uuid("guest_id").references(() => guests.id, { onDelete: "set null" }),
  attribute: text("attribute").notNull(),
  // JSONB so values can be text, numeric, or structured.
  value: jsonb("value").notNull(),
  // source values: 'host_taught' | 'inferred' | 'observed'
  source: text("source").notNull(),
  confidence: decimal("confidence", { precision: 3, scale: 2 }).notNull().default("1.00"),
  // learned_from JSONB shape varies by source; see migration comment.
  learnedFrom: jsonb("learned_from").notNull().default({}),
  // status values: 'active' | 'superseded' | 'deprecated'
  status: text("status").notNull().default("active"),
  // Self-FK for supersession history walk.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supersededBy: uuid("superseded_by").references((): any => memoryFacts.id, { onDelete: "set null" }),
  // D7 supersession reason discriminator (Phase A migration
  // 20260507010000). NULL for M6-era rows pre-D7; 'outdated' for facts
  // replaced because they're no longer true; 'incorrect' for facts
  // replaced because the prior extraction was wrong (M9 calibration
  // substrate reads this as an extraction-error signal). DB-level
  // CHECK enforces values; TS union exported below as
  // MemorySupersessionReason.
  supersessionReason: text("supersession_reason"),
  learnedAt: timestamp("learned_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_memory_facts_active_entity").on(t.entityType, t.entityId, t.status),
  index("idx_memory_facts_sub_entity").on(t.entityType, t.entityId, t.subEntityType, t.subEntityId, t.attribute),
  index("idx_memory_facts_host_learned").on(t.hostId, t.learnedAt),
  index("idx_memory_facts_guest").on(t.guestId),
  index("idx_memory_facts_superseded_by").on(t.supersededBy),
]);

export const memoryFactsRelations = relations(memoryFacts, ({ one }) => ({
  guest: one(guests, { fields: [memoryFacts.guestId], references: [guests.id] }),
  // supersededBy self-relation intentionally omitted from Drizzle's
  // relations() helper: cyclic self-references confuse some Drizzle
  // tooling. Walk the chain manually via id lookups.
}));

/**
 * Controlled vocabulary for `memory_facts.sub_entity_type`. Mirrors the
 * CHECK constraint in migration 20260501010000. The vocabulary is
 * intentionally narrow at v1; future migrations expand it as new
 * sub-entity types prove out (the agent extraction pipeline
 * canonicalizes input to this set).
 *
 * NULL is valid and means the fact is scoped to the entity as a whole
 * with no sub-entity narrowing.
 */
export type MemoryFactSubEntityType =
  | "front_door"
  | "lock"
  | "parking"
  | "wifi"
  | "hvac"
  | "kitchen_appliances"
  | "voice" // M9 Phase E D25 — voice_mode lives at entity_type='host' / sub_entity_type='voice' (migration 20260515220000)
  | "reviews"; // M9 Phase G E3 — review preferences live at entity_type='host' / sub_entity_type='reviews' (migration 20260517020000; review_rules table dropped at 20260517030000)

/**
 * Controlled vocabulary for `memory_facts.entity_type` and
 * `memory_facts.source` and `memory_facts.status`. The DB-level CHECK
 * constraints are the canonical source of truth; these types mirror
 * them for the application layer.
 */
export type MemoryFactEntityType = "host" | "property" | "guest" | "vendor" | "booking";
export type MemoryFactSource = "host_taught" | "inferred" | "observed";
export type MemoryFactStatus = "active" | "superseded" | "deprecated";
export type MemorySupersessionReason = "outdated" | "incorrect";

// ==================== Agent Conversations ====================

export const agentConversations = pgTable("agent_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostId: uuid("host_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastTurnAt: timestamp("last_turn_at", { withTimezone: true }).notNull().defaultNow(),
  // status values: 'active' | 'closed' | 'error'
  status: text("status").notNull().default("active"),
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // M13 D1 soft-delete: NULL = live; non-NULL = soft-deleted. Filtered from
  // every conversation read via the notDeleted() helper in
  // src/lib/agent/conversation.ts (enforced by scripts/conversation-reads-guard.sh).
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  index("idx_agent_conversations_host_recent").on(t.hostId, t.lastTurnAt),
  index("idx_agent_conversations_host_status").on(t.hostId, t.status),
  // Partial recency index over LIVE rows only — the rail's hot path.
  index("idx_agent_conversations_host_active")
    .on(t.hostId, t.lastTurnAt)
    .where(sql`${t.deletedAt} IS NULL`),
]);

export const agentConversationsRelations = relations(agentConversations, ({ many }) => ({
  turns: many(agentTurns),
  artifacts: many(agentArtifacts),
}));

// ==================== Agent Turns ====================

export const agentTurns = pgTable("agent_turns", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => agentConversations.id, { onDelete: "cascade" }),
  turnIndex: integer("turn_index").notNull(),
  // role values: 'user' | 'assistant'
  role: text("role").notNull(),
  contentText: text("content_text"),
  // Array of tool call records when role='assistant' and tools were
  // invoked. Shape per call documented in the migration.
  toolCalls: jsonb("tool_calls"),
  // Array of artifact emission references: [{ "artifact_id": "..." }, ...]
  artifacts: jsonb("artifacts"),
  // Refusal-fallback metadata when the assistant turn produced a
  // structured refusal: { "reason": "...", "missing_data": "...", "next_step": "..." }
  refusal: jsonb("refusal"),
  // Generative-UI render payload (Phase A): typed, host-facing, READ-ONLY
  // structured render for the chat surface (v1: agenda). One per turn; mirrors
  // the `refusal` column pattern (turn-level typed JSONB, NOT an agent_artifacts
  // row). NULL = prose-only turn. Migration 20260531030000.
  render: jsonb("render"),
  modelId: text("model_id"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  cacheReadTokens: integer("cache_read_tokens"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_agent_turns_conversation").on(t.conversationId, t.turnIndex),
  uniqueIndex("idx_agent_turns_conversation_turn_index").on(t.conversationId, t.turnIndex),
]);

export const agentTurnsRelations = relations(agentTurns, ({ one, many }) => ({
  conversation: one(agentConversations, { fields: [agentTurns.conversationId], references: [agentConversations.id] }),
  artifacts: many(agentArtifacts),
}));

// ==================== Agent Artifacts ====================

export const agentArtifacts = pgTable("agent_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => agentConversations.id, { onDelete: "cascade" }),
  turnId: uuid("turn_id").notNull().references(() => agentTurns.id, { onDelete: "cascade" }),
  // Matches an entry in the artifact registry. v1: 'property_knowledge_confirmation'.
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  // state values: 'emitted' | 'confirmed' | 'edited' | 'dismissed'
  state: text("state").notNull().default("emitted"),
  committedAt: timestamp("committed_at", { withTimezone: true }),
  // commit_metadata shape varies by kind. For property_knowledge_confirmation:
  //   { "memory_fact_id": "...", "edited_payload": { ... } | null }
  commitMetadata: jsonb("commit_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_agent_artifacts_conversation").on(t.conversationId, t.createdAt),
  index("idx_agent_artifacts_turn").on(t.turnId),
  index("idx_agent_artifacts_pending").on(t.conversationId, t.createdAt),
]);

export const agentArtifactsRelations = relations(agentArtifacts, ({ one }) => ({
  conversation: one(agentConversations, { fields: [agentArtifacts.conversationId], references: [agentConversations.id] }),
  turn: one(agentTurns, { fields: [agentArtifacts.turnId], references: [agentTurns.id] }),
}));

// ==================== Agent Audit Log ====================
//
// The unified action audit feed. See migration 20260501030000 for the
// full design rationale.

export const agentAuditLog = pgTable("agent_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostId: uuid("host_id").notNull(),
  actionType: text("action_type").notNull(),
  payload: jsonb("payload").notNull(),
  // source values: 'frontend_api' | 'agent_artifact' | 'agent_tool' | 'worker'
  source: text("source").notNull(),
  // actor_kind values: 'host' | 'agent' | 'worker' | 'system'
  actorKind: text("actor_kind").notNull(),
  actorId: uuid("actor_id"),
  // autonomy_level values: 'silent' | 'confirmed' | 'blocked'
  autonomyLevel: text("autonomy_level").notNull(),
  // outcome values: 'succeeded' | 'failed' | 'pending'
  outcome: text("outcome").notNull(),
  context: jsonb("context").notNull().default({}),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_agent_audit_log_host_recent").on(t.hostId, t.createdAt),
  index("idx_agent_audit_log_action_type").on(t.actionType, t.createdAt),
  index("idx_agent_audit_log_failures").on(t.createdAt),
  index("idx_agent_audit_log_source").on(t.source, t.createdAt),
]);

// Typed unions mirroring CHECK constraints on the agent loop tables.
// Per CLAUDE.md "CHECK-constrained text columns convention": every
// CHECK-constrained text column gets a matching typed union so the
// application layer enforces the same vocabulary at compile time.

export type AgentAuditLogSource =
  | "frontend_api"
  | "agent_artifact"
  | "agent_tool"
  | "worker";

export type AgentAuditLogActorKind = "host" | "agent" | "worker" | "system";

export type AgentAuditLogAutonomyLevel = "silent" | "confirmed" | "blocked";

export type AgentAuditLogOutcome = "succeeded" | "failed" | "pending";

export type AgentConversationStatus = "active" | "closed" | "error";

export type AgentTurnRole = "user" | "assistant";

export type AgentArtifactState =
  | "emitted"
  | "confirmed"
  | "edited"
  | "dismissed";

// ==================== Proposals (Koast v1 P2.3) ====================
//
// The agent's host-surface suggestions (built now, emitted by the agent's
// hands in P3). A proposal targets a property and is host-readable; the host
// approves/dismisses. Approval executes through the SAME named internal action
// the manual UI uses (no agent side-doors) + writes an agent_audit_log row.
// Distinct from agent_artifacts (conversation-turn-scoped in-chat gated-tool
// artifacts) — proposals are surfaced on Today / the bell / inline in chat.
// Host-scoped: RLS host_id=auth.uid() (SELECT-only; writes via service_role).
//
// Migration 20260610020000_proposals.sql.

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: uuid("host_id").notNull(),
    propertyId: uuid("property_id").notNull(),
    actionType: text("action_type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    rationale: text("rationale"),
    // status CHECK ('pending'|'approved'|'dismissed'|'executed'|'failed'). Mirrored by ProposalStatus.
    status: text("status").notNull().default("pending"),
    // created_by CHECK ('agent'|'host'|'worker'|'system'). Mirrors AgentAuditLogActorKind.
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    result: jsonb("result"),
  },
  (t) => [
    index("idx_proposals_host_status").on(t.hostId, t.status),
    index("idx_proposals_property").on(t.propertyId),
    index("idx_proposals_host_created").on(t.hostId, t.createdAt),
  ],
);

/**
 * Controlled vocabulary for `proposals.status` (mirrors the CHECK).
 *   - 'pending'   — awaiting the host
 *   - 'approved'  — host approved; execution in flight (async/auto-approve path)
 *   - 'executed'  — the action ran
 *   - 'failed'    — execution errored (stays actionable; re-approvable)
 *   - 'dismissed' — host rejected (zero side effects)
 */
export type ProposalStatus =
  | "pending"
  | "approved"
  | "dismissed"
  | "executed"
  | "failed";

/** `proposals.created_by` — same vocabulary as agent_audit_log.actor_kind. */
export type ProposalCreatedBy = AgentAuditLogActorKind;

// ==================== Host Notifications (Koast v1 P2.4) ====================
//
// The curated host-facing in-app feed behind the bell (per-item read_at +
// deep-link payload). DISTINCT from `notifications` (outbound SMS/email audit
// log) and unified_audit_feed (the deep operational ledger). Host-scoped: RLS
// host_id=auth.uid() (SELECT-only; writes via service_role).
//
// Migration 20260610030000_host_notifications.sql. (The partial unread index
// idx_host_notifications_unread is DB-only — Drizzle's index() can't express
// the WHERE read_at IS NULL clause; this Drizzle def maps the table + the
// recent index only.)

export const hostNotifications = pgTable(
  "host_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: uuid("host_id").notNull(),
    // type CHECK ('cleaning_completed'|'booking_new'|'booking_cancelled'|'proposal_created'|'push_delivery_failure'). Mirrored by HostNotificationType.
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_host_notifications_recent").on(t.hostId, t.createdAt)],
);

/** Controlled vocabulary for `host_notifications.type` (mirrors the CHECK). */
export type HostNotificationType =
  | "cleaning_completed"
  | "booking_new"
  | "booking_cancelled"
  | "proposal_created"
  | "push_delivery_failure";

// ==================== Host Action Patterns (M11 Phase B item 1 — F8) ====================
//
// Per agent-loop-v1-design.md §7.3 + M11 Phase B STEP 2 reconciliation.
// Light fingerprint of host responses to agent-proposed actions. Subject
// = host (calibration target). Originating actor implicit (agent at v1).
// Pattern-match index for Phase 2+ calibration logic. Full audit lives
// in agent_audit_log (optional join via agent_audit_log_id).
//
// Migration 20260525080000_host_action_patterns.sql.

export const hostActionPatterns = pgTable(
  "host_action_patterns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: uuid("host_id").notNull(),
    actionType: text("action_type").notNull(),
    // outcome values: 'confirmed' | 'modified' | 'dismissed' | 'silent'
    // CHECK constraint enforced at DB. Controlled vocabulary mirrored
    // at type level via HostActionPatternOutcome below.
    outcome: text("outcome").notNull(),
    payloadSummary: jsonb("payload_summary").notNull().default({}),
    agentAuditLogId: uuid("agent_audit_log_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_host_action_patterns_lookup").on(t.hostId, t.actionType, t.createdAt),
  ],
);

/**
 * Controlled vocabulary for `host_action_patterns.outcome`. Mirrors the
 * CHECK constraint at the database layer per the M1 typed-union convention
 * for CHECK-constrained text columns.
 *
 *   - 'confirmed' — host approved an agent artifact unchanged
 *   - 'modified'  — host edited then approved (M7 D38 edit path)
 *   - 'dismissed' — host rejected (artifact state='dismissed')
 *   - 'silent'    — autonomous (Phase 2+; dead-value at v1)
 */
export type HostActionPatternOutcome =
  | "confirmed"
  | "modified"
  | "dismissed"
  | "silent";

// ==================== host_surface_telemetry (M13 Phase 1.A STEP 4) ====================
// Per operator msg 3518 A5 binding: surface-occupancy + navigation
// telemetry with entry_trigger making the chat-primary inversion thesis
// falsifiable. Subject = host (per-host private; cross-host aggregation
// MUST pass through future anonymization VIEW per CLAUDE.md R5 firewall
// contract).
//
// Migration 20260526221659_host_surface_telemetry.sql.

export const hostSurfaceTelemetry = pgTable(
  "host_surface_telemetry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: uuid("host_id").notNull(),
    sessionId: text("session_id").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    // event_kind values: 'chat_view' | 'inspect_view' | 'inspect_entry'
    //                   | 'fluidity_measurement' (M13 Phase 1.B)
    // CHECK constraint enforced at DB. Controlled vocabulary mirrored
    // at type level via HostSurfaceTelemetryEventKind below.
    eventKind: text("event_kind").notNull(),
    pathname: text("pathname").notNull(),
    // task_class values: 'scan' | 'bulk_operate' | 'visual_survey' |
    // 'config' | 'external_link' | 'other' | null. Navigation-only;
    // null on perf rows.
    taskClass: text("task_class"),
    // entry_trigger values: 'agent_offered_navchip' | 'self_navigated' | null
    // (null on chat_view / inspect_view; carries value on inspect_entry).
    entryTrigger: text("entry_trigger"),
    // M13 Phase 1.B — fluidity extension (additive migration
    // 20260528001210_host_surface_telemetry_fluidity.sql). On perf rows
    // (event_category='perf'): latency_ms + budget_class are required
    // at application layer. On navigation rows: both NULL.
    latencyMs: decimal("latency_ms"),
    budgetClass: text("budget_class"),
    // M13 Phase 1.B — discriminator. NOT NULL DEFAULT 'navigation'
    // (existing rows backfilled to 'navigation' on migration).
    eventCategory: text("event_category").notNull().default("navigation"),
    context: jsonb("context").notNull().default({}),
  },
  (t) => [
    index("idx_host_surface_telemetry_host_ts").on(t.hostId, t.ts),
    index("idx_host_surface_telemetry_event_kind").on(t.eventKind, t.ts),
    // Perf-class analyzer query path — partial index on event_category='perf'
    // keeps the rollup query fast as data accumulates. Mirrored from the
    // migration's CREATE INDEX idx_host_surface_telemetry_perf.
    index("idx_host_surface_telemetry_perf").on(
      t.hostId,
      t.eventCategory,
      t.budgetClass,
    ),
  ],
);

/**
 * Controlled vocabulary for `host_surface_telemetry.event_kind`.
 *   - 'chat_view'      — host is on chat-primary
 *   - 'inspect_view'   — host is on an inspect surface (periodic heartbeat)
 *   - 'inspect_entry'  — transition into an inspect surface (carries entry_trigger)
 */
export type HostSurfaceTelemetryEventKind =
  | "chat_view"
  | "inspect_view"
  | "inspect_entry"
  | "fluidity_measurement";

/**
 * M13 Phase 1.B controlled vocabulary for
 * `host_surface_telemetry.budget_class`. Each value names a discrete
 * fluidity budget the perceived-action contract makes auditable. See
 * scripts/fluidity-budgets.json for the budget values (this enum
 * names the keys; the manifest names the values).
 */
export type HostSurfaceTelemetryBudgetClass =
  | "property_focus"
  | "chat_start_of_stream"
  | "cmd_k_first_result"
  | "route_nav"
  | "perceived_action";

/**
 * M13 Phase 1.B controlled vocabulary for
 * `host_surface_telemetry.event_category`. The discriminator that
 * separates navigation telemetry (existing) from fluidity telemetry
 * (new) so the analyzer query path doesn't conflate them.
 */
export type HostSurfaceTelemetryEventCategory = "navigation" | "perf";

/**
 * Controlled vocabulary for `host_surface_telemetry.task_class`. Buckets
 * inspect intent for analysis. Null when event_kind ∈ {chat_view}.
 */
export type HostSurfaceTelemetryTaskClass =
  | "scan"
  | "bulk_operate"
  | "visual_survey"
  | "config"
  | "external_link"
  | "other";

/**
 * Controlled vocabulary for `host_surface_telemetry.entry_trigger`.
 * Falsifiability of the chat-primary inversion thesis (operator msg 3518 A5):
 *   - 'agent_offered_navchip' — agent surfaced a navchip; host followed
 *   - 'self_navigated'        — host went to inspect without an agent prompt
 */
export type HostSurfaceTelemetryEntryTrigger =
  | "agent_offered_navchip"
  | "self_navigated";

/**
 * Controlled vocabulary for `user_subscriptions.status` (P5 Stripe billing).
 * Mirrors the DB CHECK constraint (migration 20260612010000_billing_stripe) +
 * Stripe's subscription.status values; null when the host has never subscribed.
 * The CHECK-constrained-column convention: this union is the application-layer
 * mirror of the database-layer enforcement.
 */
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

/** Resolved feature plan (not stored — derived from tier/comped/status). */
export type BillingPlan = "free" | "pro";
