#!/usr/bin/env python3
"""
Koast brand — motion vocabulary GIF previews.

Generates animated GIF previews of the locked motion vocabulary v1.0:
  - cascade   (active state, ≥32px) — top-down opacity wave, 3s cycle
  - pulse     (active fallback, 16-31px) — whole-mark brightness pulse, 1.6s
  - milestone (deposit, looped preview) — ghost-band drop, 5s cycle
  - hero      (marketing landing only) — continuous cascade, 2.4s no rest

All outputs are 240×240 px, indexed-palette GIFs. Lightweight enough
to share inline (Slack, docs, email) or render anywhere.

Outputs land in /motion-exploration/ alongside motion-vocabulary.html.
"""

import math
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "motion-exploration"

# === BRAND TOKENS ===
SHORE = "#f7f3ec"
DEEP_SEA = "#132e20"

BANDS_5_LIGHT = [
    (4, 27, "#d4eef0"),
    (27, 47, "#a8e0e3"),
    (47, 65, "#4cc4cc"),
    (65, 82, "#2ba2ad"),
    (82, 96, "#0e7a8a"),
]
BANDS_5_DARK = [
    (4, 27, "#d4eef0"),
    (27, 47, "#8ad9dc"),
    (47, 65, "#4cc4cc"),
    (65, 82, "#3aa3aa"),
    (82, 96, "#2e8c95"),
]
BANDS_3_LIGHT = [
    (4, 36, "#d4eef0"),
    (36, 66, "#4cc4cc"),
    (66, 96, "#0e7a8a"),
]
BANDS_3_DARK = [
    (4, 36, "#d4eef0"),
    (36, 66, "#4cc4cc"),
    (66, 96, "#2e8c95"),
]
GHOST_COLOR = "#d4eef0"


def hex_to_rgb(hex_str: str):
    h = hex_str.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def cubic_bezier_y(t: float, p1x: float, p1y: float, p2x: float, p2y: float, iters: int = 24) -> float:
    """Solve cubic-bezier for y at time t in [0,1]."""
    if t <= 0:
        return 0.0
    if t >= 1:
        return 1.0
    lo, hi = 0.0, 1.0
    for _ in range(iters):
        s = (lo + hi) / 2
        x = 3 * (1 - s) ** 2 * s * p1x + 3 * (1 - s) * s ** 2 * p2x + s ** 3
        if x < t:
            lo = s
        else:
            hi = s
    s = (lo + hi) / 2
    return 3 * (1 - s) ** 2 * s * p1y + 3 * (1 - s) * s ** 2 * p2y + s ** 3


# ============================================================
# CASCADE (active) — keyframes:
#   0%, 40%, 65%, 100% { opacity: 1; }
#   50%, 55%           { opacity: 0.55; }
# Stagger: 130ms top-down, cycle: 3.0s
#
# HERO — same gesture, sinusoidal continuous, no rest:
#   opacity oscillates 1.0 → 0.55 → 1.0
# Stagger: -100ms (negative for immediate desync), cycle: 2.4s
# ============================================================

def cascade_band_opacity(t_norm: float) -> float:
    """For a single band's local cycle time (0..1), return its opacity per the keyframe spec."""
    if t_norm <= 0.40 or t_norm >= 0.65:
        return 1.0
    if 0.50 <= t_norm <= 0.55:
        return 0.55
    if 0.40 < t_norm < 0.50:
        local = (t_norm - 0.40) / 0.10
        eased = cubic_bezier_y(local, 0.45, 0, 0.55, 1)
        return 1.0 - eased * 0.45
    # 0.55 < t_norm < 0.65
    local = (t_norm - 0.55) / 0.10
    eased = cubic_bezier_y(local, 0.45, 0, 0.55, 1)
    return 0.55 + eased * 0.45


def hero_band_opacity(t_norm: float) -> float:
    """Continuous sinusoidal cascade, 1.0 ↔ 0.55."""
    return 0.775 + 0.225 * math.cos(2 * math.pi * t_norm)


def render_cascade_frame(t_global: float, bands, bg_hex: str, *, hero: bool = False, size: int = 240, ss: int = 3) -> Image.Image:
    if hero:
        cycle = 2.4
        stagger = -0.10
        opacity_fn = hero_band_opacity
    else:
        cycle = 3.0
        stagger = 0.13
        opacity_fn = cascade_band_opacity

    big = size * ss
    bg_rgb = hex_to_rgb(bg_hex)
    canvas = Image.new("RGB", (big, big), bg_rgb)
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    for i, (y0, y1, color) in enumerate(bands):
        delay = i * stagger
        t_band = ((t_global - delay) % cycle) / cycle
        opacity = opacity_fn(t_band)

        y0_px = int(y0 / 100 * big)
        y1_px = int(y1 / 100 * big)
        cr, cg, cb = hex_to_rgb(color)
        d.rectangle([0, y0_px, big, y1_px], fill=(cr, cg, cb, int(255 * opacity)))

    mask = Image.new("L", (big, big), 0)
    md = ImageDraw.Draw(mask)
    cx = cy = big / 2
    r = big * 0.46
    md.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)

    canvas.paste(layer.convert("RGB"), (0, 0), mask)
    return canvas.resize((size, size), Image.LANCZOS)


# ============================================================
# MILESTONE (deposit) — keyframes:
#   0%, 50%, 100% { transform: translateY(0);    opacity: 0; }
#   68%, 82%      { transform: translateY(23px); opacity: 1; }
# Cycle: 5s, stack shift 18px, ghost shift 23px
# ============================================================

def milestone_state(t_norm: float):
    """Returns (ghost_alpha, ghost_y_off, stack_y_off)."""
    if t_norm < 0.50:
        progress = 0.0
    elif t_norm < 0.68:
        local = (t_norm - 0.50) / 0.18
        progress = cubic_bezier_y(local, 0.4, 0, 0.6, 1)
    elif t_norm < 0.82:
        progress = 1.0
    elif t_norm < 1.00:
        local = (t_norm - 0.82) / 0.18
        progress = 1.0 - cubic_bezier_y(local, 0.4, 0, 0.6, 1)
    else:
        progress = 0.0
    return progress, 23.0 * progress, 18.0 * progress


def render_milestone_frame(t_norm: float, bands, bg_hex: str, size: int = 240, ss: int = 3) -> Image.Image:
    big = size * ss
    bg_rgb = hex_to_rgb(bg_hex)
    ghost_alpha, ghost_y_off, stack_y_off = milestone_state(t_norm)

    layer = Image.new("RGBA", (big, big), bg_rgb + (255,))
    d = ImageDraw.Draw(layer)
    for y0, y1, color in bands:
        y0_px = int((y0 + stack_y_off) / 100 * big)
        y1_px = int((y1 + stack_y_off) / 100 * big)
        d.rectangle([0, y0_px, big, y1_px], fill=color)

    if ghost_alpha > 0.001:
        ghost_layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        gd = ImageDraw.Draw(ghost_layer)
        # Ghost starts at y=-23 (above mark), translates down
        gy0 = int((-23 + ghost_y_off) / 100 * big)
        gy1 = int((0 + ghost_y_off) / 100 * big)
        gr, gg, gb = hex_to_rgb(GHOST_COLOR)
        gd.rectangle([0, gy0, big, gy1], fill=(gr, gg, gb, int(255 * ghost_alpha)))
        layer = Image.alpha_composite(layer, ghost_layer)

    mask = Image.new("L", (big, big), 0)
    md = ImageDraw.Draw(mask)
    cx = cy = big / 2
    r = big * 0.46
    md.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)

    canvas = Image.new("RGB", (big, big), bg_rgb)
    canvas.paste(layer.convert("RGB"), (0, 0), mask)
    return canvas.resize((size, size), Image.LANCZOS)


# ============================================================
# PULSE (small-size active) — whole-mark brightness/saturation
# 1.0 → 1.12 brightness, 1.0 → 1.10 saturation, 1.6s ease-in-out
# ============================================================

def render_pulse_frame(t_norm: float, bands, bg_hex: str, size: int = 240, ss: int = 3) -> Image.Image:
    # Sinusoidal pulse — peak at t_norm=0.5
    bright = 1.0 + 0.06 - 0.06 * math.cos(2 * math.pi * t_norm)
    sat = 1.0 + 0.05 - 0.05 * math.cos(2 * math.pi * t_norm)

    big = size * ss
    bg_rgb = hex_to_rgb(bg_hex)
    layer = Image.new("RGBA", (big, big), bg_rgb + (255,))
    d = ImageDraw.Draw(layer)

    def adjust_color(hex_str: str):
        r, g, b = hex_to_rgb(hex_str)
        # Brightness multiply
        r2 = min(255, int(r * bright))
        g2 = min(255, int(g * bright))
        b2 = min(255, int(b * bright))
        # Saturation: pull from gray
        gray = (r2 + g2 + b2) / 3
        r2 = int(min(255, max(0, gray + (r2 - gray) * sat)))
        g2 = int(min(255, max(0, gray + (g2 - gray) * sat)))
        b2 = int(min(255, max(0, gray + (b2 - gray) * sat)))
        return r2, g2, b2

    for y0, y1, color in bands:
        y0_px = int(y0 / 100 * big)
        y1_px = int(y1 / 100 * big)
        d.rectangle([0, y0_px, big, y1_px], fill=adjust_color(color))

    mask = Image.new("L", (big, big), 0)
    md = ImageDraw.Draw(mask)
    cx = cy = big / 2
    r = big * 0.46
    md.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)

    canvas = Image.new("RGB", (big, big), bg_rgb)
    canvas.paste(layer.convert("RGB"), (0, 0), mask)
    return canvas.resize((size, size), Image.LANCZOS)


# ============================================================
# GIF EXPORT
# ============================================================

def make_gif(frames, out_path: Path, duration_ms: int):
    p_frames = [f.convert("P", palette=Image.ADAPTIVE, colors=128, dither=Image.NONE) for f in frames]
    p_frames[0].save(
        out_path,
        save_all=True,
        append_images=p_frames[1:],
        duration=duration_ms,
        loop=0,
        optimize=True,
        disposal=2,
    )


def gen_cascade(bands, bg_hex, label, out_path, *, hero=False, fps=20):
    cycle_s = 2.4 if hero else 3.0
    n_frames = int(round(cycle_s * fps))
    duration_ms = int(round(1000 / fps))
    frames = [render_cascade_frame(i / fps, bands, bg_hex, hero=hero) for i in range(n_frames)]
    make_gif(frames, out_path, duration_ms)
    print(f"  {out_path.name:36s} {label:24s} {out_path.stat().st_size/1024:6.1f} KB")


def gen_milestone(bands, bg_hex, label, out_path, *, fps=20):
    cycle_s = 5.0
    n_frames = int(round(cycle_s * fps))
    duration_ms = int(round(1000 / fps))
    frames = [render_milestone_frame(i / n_frames, bands, bg_hex) for i in range(n_frames)]
    make_gif(frames, out_path, duration_ms)
    print(f"  {out_path.name:36s} {label:24s} {out_path.stat().st_size/1024:6.1f} KB")


def gen_pulse(bands, bg_hex, label, out_path, *, fps=25):
    cycle_s = 1.6
    n_frames = int(round(cycle_s * fps))
    duration_ms = int(round(1000 / fps))
    frames = [render_pulse_frame(i / n_frames, bands, bg_hex) for i in range(n_frames)]
    make_gif(frames, out_path, duration_ms)
    print(f"  {out_path.name:36s} {label:24s} {out_path.stat().st_size/1024:6.1f} KB")


def main():
    OUT.mkdir(exist_ok=True)
    print("== koast motion vocabulary GIFs (v1.0) ==\n")

    print("[active — cascade · 3s, top-down]")
    gen_cascade(BANDS_5_LIGHT, SHORE,    "active · light", OUT / "motion-cascade-light.gif")
    gen_cascade(BANDS_5_DARK,  DEEP_SEA, "active · dark",  OUT / "motion-cascade-dark.gif")

    print("\n[active small — pulse · 1.6s, brightness]")
    gen_pulse(BANDS_3_LIGHT, SHORE,    "pulse · light", OUT / "motion-pulse-light.gif")
    gen_pulse(BANDS_3_DARK,  DEEP_SEA, "pulse · dark",  OUT / "motion-pulse-dark.gif")

    print("\n[milestone — deposit · 5s, 50% rest]")
    gen_milestone(BANDS_5_LIGHT, SHORE,    "milestone · light", OUT / "motion-milestone-light.gif")
    gen_milestone(BANDS_5_DARK,  DEEP_SEA, "milestone · dark",  OUT / "motion-milestone-dark.gif")

    print("\n[hero — cascade continuous · 2.4s, no rest]")
    gen_cascade(BANDS_5_LIGHT, SHORE,    "hero · light", OUT / "motion-hero-light.gif",  hero=True)
    gen_cascade(BANDS_5_DARK,  DEEP_SEA, "hero · dark",  OUT / "motion-hero-dark.gif",   hero=True)

    print("\ndone.")


if __name__ == "__main__":
    main()
