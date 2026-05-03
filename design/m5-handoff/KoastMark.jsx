/* global React */
/**
 * KoastMark — banded-circle mark + Koast wordmark.
 *
 * Single source of truth for the mark in product code. Renders the canonical
 * geological band proportions (y=4/27/47/65/82, h=23/20/18/17/14 in viewBox-100).
 *
 *   <KoastMark size={96} state="idle" theme="light" />
 *   <KoastMark size={32} state="active" />              // auto-picks pulse fallback
 *   <KoastMark size={120} state="milestone" />
 *   <KoastWordmark size={48} state="hero" theme="dark" />
 *
 * size:  pixel size of the banded circle
 *        ≥48  → 5-band variant
 *        16-47→ 3-band variant
 *        <16  → caller should use <KoastWordmark variant="only"> instead
 *
 * state: 'idle' (default static), 'active' (cascade), 'milestone' (deposit),
 *        'hero' (continuous cascade — marketing landing only)
 *
 * theme: 'light' (default) or 'dark' — affects band 4-5 only.
 *
 * Requires `koast-mark.css` to be loaded for the animations.
 */

const _bandsLight = [
  { cls: "b1", y:  4, h: 23, fill: "#d4eef0" },  // shore mist
  { cls: "b2", y: 27, h: 20, fill: "#a8e0e3" },  // shoal
  { cls: "b3", y: 47, h: 18, fill: "#4cc4cc" },  // tide
  { cls: "b4", y: 65, h: 17, fill: "#2ba2ad" },  // reef
  { cls: "b5", y: 82, h: 14, fill: "#0e7a8a" },  // trench
];
const _bandsDark = [
  { cls: "b1", y:  4, h: 23, fill: "#d4eef0" },
  { cls: "b2", y: 27, h: 20, fill: "#8ad9dc" },
  { cls: "b3", y: 47, h: 18, fill: "#4cc4cc" },
  { cls: "b4", y: 65, h: 17, fill: "#3aa3aa" },
  { cls: "b5", y: 82, h: 14, fill: "#2e8c95" },
];
const _3bandLight = [
  { y:  4, h: 32, fill: "#d4eef0" },
  { y: 36, h: 30, fill: "#4cc4cc" },
  { y: 66, h: 30, fill: "#0e7a8a" },
];
const _3bandDark = [
  { y:  4, h: 32, fill: "#d4eef0" },
  { y: 36, h: 30, fill: "#4cc4cc" },
  { y: 66, h: 30, fill: "#2e8c95" },
];

let _kmIdSeed = 0;
const _useKmId = () => {
  const ref = React.useRef(null);
  if (ref.current == null) ref.current = `k-mark-clip-${++_kmIdSeed}`;
  return ref.current;
};

function KoastMark({ size = 96, state = "idle", theme = "light", className = "", style }) {
  const clipId = _useKmId();
  const useFive = size >= 48;
  const isSmall = size < 32;
  const sizeAttr = isSmall ? "small" : "normal";

  // Milestone always uses 5-band (it has a ghost band that drops in)
  const renderState = state;
  const useFiveForRender = useFive || state === "milestone";

  const bands = useFiveForRender
    ? (theme === "dark" ? _bandsDark : _bandsLight)
    : (theme === "dark" ? _3bandDark : _3bandLight);

  return React.createElement(
    "span",
    {
      className: `k-mark ${className}`.trim(),
      "data-state": renderState,
      "data-size": sizeAttr,
      "data-theme": theme,
      style: { display: "inline-block", lineHeight: 0, ...style },
    },
    React.createElement(
      "svg",
      {
        width: size,
        height: size,
        viewBox: "0 0 100 100",
        role: "img",
        "aria-label": "Koast",
      },
      React.createElement(
        "defs",
        null,
        React.createElement(
          "clipPath",
          { id: clipId },
          React.createElement("circle", { cx: 50, cy: 50, r: 46 })
        )
      ),
      // Milestone needs a ghost band rendered ABOVE the stack and the stack wrapped in <g class="stack">
      renderState === "milestone"
        ? React.createElement(
            "g",
            { clipPath: `url(#${clipId})` },
            React.createElement("rect", {
              className: "ghost",
              x: 0, y: -23, width: 100, height: 23, fill: "#d4eef0",
            }),
            React.createElement(
              "g",
              { className: "stack" },
              bands.map((b, i) =>
                React.createElement("rect", {
                  key: i,
                  className: b.cls || "",
                  x: 0, y: b.y, width: 100, height: b.h, fill: b.fill,
                })
              )
            )
          )
        : React.createElement(
            "g",
            { className: "bands", clipPath: `url(#${clipId})` },
            bands.map((b, i) =>
              React.createElement("rect", {
                key: i,
                className: b.cls || "",
                x: 0, y: b.y, width: 100, height: b.h, fill: b.fill,
              })
            )
          )
    )
  );
}

/**
 * KoastWordmark — full "Koast" wordmark with banded-o.
 * size = font-size in px. Auto-picks 5-band / 3-band / wordmark-only per the size rule.
 */
function KoastWordmark({ size = 48, state = "idle", theme = "light", variant, className = "", style }) {
  // variant 'only' = wordmark with regular o (no banded mark) — sub-16px / mono contexts
  const useOnly = variant === "only" || size < 16;
  const oSize = Math.round(size * 0.55); // matches lowercase o optical width per spec
  const ink = theme === "dark" ? "#f7f3ec" : "#0f1815";

  return React.createElement(
    "span",
    {
      className: `k-wordmark ${className}`.trim(),
      style: {
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
        fontWeight: 800,
        letterSpacing: "-0.045em",
        lineHeight: 1,
        color: ink,
        fontSize: size,
        display: "inline-flex",
        alignItems: "center",
        whiteSpace: "nowrap",
        ...style,
      },
    },
    "K",
    useOnly
      ? "o"
      : React.createElement(KoastMark, {
          size: oSize,
          state,
          theme,
          className: "k-o-mark",
          style: { margin: "0 -0.02em", verticalAlign: "middle" },
        }),
    "ast"
  );
}

if (typeof window !== "undefined") {
  Object.assign(window, { KoastMark, KoastWordmark });
}
