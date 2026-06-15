/**
 * Channel-connect feature flags (P7.3).
 *
 * Airbnb new-host connect is DEFERRED for v1. Unlike Booking.com — whose
 * self-service connect scaffolds a Channex property end-to-end on demand
 * (proven path) — Koast has no host-facing Airbnb OAuth flow; Airbnb is assumed
 * pre-connected at the Channex tenant level. Standing up a real fresh-tenant
 * Airbnb OAuth handshake is unproven external provisioning, and a stranger's
 * first five minutes must not ride on it. So v1 onboarding offers iCal (Free)
 * + Booking.com two-way connect; Airbnb connect stays behind this flag (default
 * OFF) until its own focused spike against a test tenant.
 *
 * Flip KOAST_ENABLE_AIRBNB_CONNECT=true in that spike's environment only.
 */
export function isAirbnbConnectEnabled(): boolean {
  return process.env.KOAST_ENABLE_AIRBNB_CONNECT === "true";
}
