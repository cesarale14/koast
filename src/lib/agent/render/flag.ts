/**
 * The render-system deploy flag — read LIVE, per request, in ONE place.
 *
 * KOAST_ENABLE_RENDER_AGENDA gates two things that MUST agree: whether
 * render_agenda is exposed to the model (the per-request tools array) and
 * whether the prompt advertises it + carries the when-to-card rule. Both read
 * through this single function, per request, so neither can freeze at
 * module-load nor diverge from the other.
 *
 * The bug this replaces: render_agenda was conditionally REGISTERED at
 * tools/index.ts module top-level (evaluated once, frozen at build/cold-start)
 * while the prompt gate read live — so prod advertised a tool the registry
 * never added. Now registration is unconditional and EXPOSURE is gated here,
 * live, exactly like the prompt.
 */
export function isRenderAgendaEnabled(): boolean {
  return process.env.KOAST_ENABLE_RENDER_AGENDA === "1";
}
