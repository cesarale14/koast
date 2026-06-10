/**
 * Default notification preferences (user_preferences.preferences).
 *
 * Lives in a plain lib module — NOT in a route.ts — because Next.js App Router
 * route files may only export route handlers (GET/POST/…) + a small set of
 * config fields; any other named export fails `next build`. Both the settings
 * preferences route and the auto-approve route import this.
 */
export const DEFAULT_PREFS = {
  email_new_booking: true,
  email_messages: true,
  email_cleaning: true,
  email_price_alerts: false,
  sms_enabled: false,
  push_enabled: false,
};
