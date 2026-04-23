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
import { relations } from "drizzle-orm";

// ==================== Properties ====================

export const properties = pgTable("properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
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
  cleaningTasks: many(cleaningTasks),
  localEvents: many(localEvents),
  guestReviews: many(guestReviews),
  reviewRules: many(reviewRules),
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

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").references(() => bookings.id),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
  platform: text("platform").notNull(),
  direction: text("direction"),
  senderName: text("sender_name"),
  content: text("content").notNull(),
  aiDraft: text("ai_draft"),
  aiDraftStatus: text("ai_draft_status").default("none"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_messages_property_created").on(t.propertyId, t.createdAt),
]);

export const messagesRelations = relations(messages, ({ one }) => ({
  property: one(properties, { fields: [messages.propertyId], references: [properties.id] }),
  booking: one(bookings, { fields: [messages.bookingId], references: [bookings.id] }),
}));

// ==================== Cleaning Tasks ====================

export const cleaningTasks = pgTable("cleaning_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
  bookingId: uuid("booking_id").references(() => bookings.id),
  nextBookingId: uuid("next_booking_id").references(() => bookings.id),
  cleanerId: uuid("cleaner_id"),
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

// ==================== Review Rules ====================

export const reviewRules = pgTable("review_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
  isActive: boolean("is_active").default(true),
  autoPublish: boolean("auto_publish").default(false),
  publishDelayDays: integer("publish_delay_days").default(3),
  tone: text("tone").default("warm"),
  targetKeywords: text("target_keywords").array(),
  badReviewDelay: boolean("bad_review_delay").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_review_rules_property").on(t.propertyId),
]);

export const reviewRulesRelations = relations(reviewRules, ({ one }) => ({
  property: one(properties, { fields: [reviewRules.propertyId], references: [properties.id] }),
}));

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
  aiContext: jsonb("ai_context"),
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

// ==================== Message Templates ====================

export const messageTemplates = pgTable("message_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").references(() => properties.id).notNull(),
  templateType: text("template_type").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  isActive: boolean("is_active").default(true),
  triggerType: text("trigger_type").notNull(),
  triggerDaysOffset: integer("trigger_days_offset").default(0),
  triggerTime: time("trigger_time"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const messageTemplatesRelations = relations(messageTemplates, ({ one }) => ({
  property: one(properties, { fields: [messageTemplates.propertyId], references: [properties.id] }),
}));

// ==================== User Preferences ====================

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey(),
  preferences: jsonb("preferences").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
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
