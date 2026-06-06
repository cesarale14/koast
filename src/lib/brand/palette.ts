/**
 * BRAND_PALETTE — JS mirror of the cool-teal design tokens in
 * `src/app/globals.css` (the `--koast-*` ramp + legacy aliases).
 *
 * WHY THIS EXISTS: Canvas 2D (`ctx.fillStyle`/`ctx.strokeStyle`) and a
 * handful of chart libraries can't resolve CSS custom properties, so they
 * need literal hex. Anything that paints to <canvas> or passes a raw color
 * to a chart prop reads from here instead of inlining a hex literal.
 *
 * KEEP IN SYNC with globals.css. If a token value changes there, change it
 * here too. (Brand recolor 2026-06-06: forest-green → cool-teal.)
 */
export const BRAND_PALETTE = {
  // Cool-teal ramp (light → deep)
  shoreMist: "#d4eef0", // --koast-shore-mist (band 1, blueish-white)
  shoal: "#a8e0e3", // --koast-shoal (band 2)
  tide: "#4cc4cc", // --koast-tide (band 3, BRAND PRIMARY)
  reef: "#2ba2ad", // --koast-reef (band 4)
  trench: "#0e7a8a", // --koast-trench (band 5, deep-teal)

  // Substrate
  shore: "#f7f3ec", // --shore (light bg)
  deepSea: "#0a262c", // --deep-sea (cool near-black dark substrate)
  white: "#ffffff",

  // Text / ink
  ink: "#0f1815", // --koast-ink (primary text)
  ink2: "#4a5552", // --koast-ink-2 (secondary text)
  ink3: "#6e7976", // --koast-ink-3 (tertiary / labels / muted)
  rule: "#ede7db", // --dry-sand (hairline / grid lines)

  // Status (success stays green; warning amber; error red)
  success: "#1a7a5a", // --lagoon
  warning: "#d4960b", // --amber-tide
  error: "#c44040", // --coral-reef

  // Gold — reserved for primary CTA + logo glow only
  gold: "#c49a5a", // --golden
} as const;

export type BrandPalette = typeof BRAND_PALETTE;
