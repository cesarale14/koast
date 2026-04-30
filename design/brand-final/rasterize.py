#!/usr/bin/env python3
"""
Koast brand — rasterization pipeline.

Generates all PNG production assets from the Koast brand specification.
Source of truth: /masters/*.svg  (mark-only SVGs are pure shapes,
                                  reproduced here in PIL for pixel-perfect output).

Run from anywhere:
    python3 rasterize.py

Outputs land in their canonical locations under brand-final/.

NOTE ON FONTS
=============
This script tries Plus Jakarta Sans 800 first. If unavailable on the build
host, it falls back to Poppins Bold (visually adjacent geometric sans).
For final-production OG card and app-icon outputs that include the wordmark,
re-run this script on a host where Plus Jakarta Sans is installed:

    pip install --user fonttools
    # download from https://fonts.google.com/specimen/Plus+Jakarta+Sans
    # place TTF at /usr/share/fonts/truetype/plus-jakarta-sans/  or set PJS_PATH below
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MASTERS = ROOT / "masters"
FAVICONS = ROOT / "favicons"
SOCIAL = ROOT / "social"
APPICONS = ROOT / "app-icons"
FALLBACK = ROOT / "fallback"

# === BRAND TOKENS ===
SHORE = "#f7f3ec"
DEEP_SEA = "#132e20"
INK = "#0f1815"

# 5-band gradient — ≥48px
BANDS_5_LIGHT = [
    (4,  27, "#d4eef0"),
    (27, 47, "#a8e0e3"),
    (47, 65, "#4cc4cc"),
    (65, 82, "#2ba2ad"),
    (82, 96, "#0e7a8a"),
]
BANDS_5_DARK = [
    (4,  27, "#d4eef0"),
    (27, 47, "#8ad9dc"),
    (47, 65, "#4cc4cc"),
    (65, 82, "#3aa3aa"),
    (82, 96, "#2e8c95"),
]
# 3-band gradient — <48px
BANDS_3_LIGHT = [
    (4,  36, "#d4eef0"),
    (36, 66, "#4cc4cc"),
    (66, 96, "#0e7a8a"),
]
BANDS_3_DARK = [
    (4,  36, "#d4eef0"),
    (36, 66, "#4cc4cc"),
    (66, 96, "#2e8c95"),
]

# === FONT RESOLUTION ===
def resolve_font(size: int) -> ImageFont.FreeTypeFont:
    """Try Plus Jakarta Sans 800, fall back to Poppins Bold."""
    candidates = [
        "/usr/share/fonts/truetype/plus-jakarta-sans/PlusJakartaSans-ExtraBold.ttf",
        "/usr/share/fonts/truetype/PlusJakartaSans-ExtraBold.ttf",
        os.environ.get("PJS_PATH", ""),
        # Fallback (geometric sans, visually adjacent)
        "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf",
    ]
    for path in candidates:
        if path and os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


# === BANDED CIRCLE PRIMITIVE ===
def banded_circle(size: int, bands, *, transparent_bg=True, supersample=4):
    """
    Draw a banded circle as an RGBA image at `size` x `size` pixels.
    Renders at supersample scale, applies circular alpha mask, downsamples
    for high-quality antialiased edges. Bands are specified in 0-100
    coordinate space (matching the SVG masters).
    """
    big = size * supersample
    # Layer 1: filled bands
    rgb = Image.new("RGB", (big, big), SHORE)
    d = ImageDraw.Draw(rgb)
    for y0, y1, color in bands:
        d.rectangle(
            [0, int(y0 / 100 * big), big, int(y1 / 100 * big)],
            fill=color,
        )
    # Layer 2: alpha mask (filled circle, radius 46 in 0-100 space)
    mask = Image.new("L", (big, big), 0)
    md = ImageDraw.Draw(mask)
    cx = cy = big / 2
    r = big * 0.46
    md.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    # Compose
    out = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    out.paste(rgb, (0, 0), mask)
    if not transparent_bg:
        bg = Image.new("RGB", (big, big), SHORE)
        bg.paste(out, (0, 0), out)
        out = bg.convert("RGBA")
    return out.resize((size, size), Image.LANCZOS)


def banded_circle_on_bg(size: int, bands, bg_color: str, *, padding=0):
    """Banded circle composited onto a solid bg with optional outer padding."""
    canvas = Image.new("RGB", (size, size), bg_color)
    inner = size - 2 * padding
    if inner <= 0:
        return canvas
    mark = banded_circle(inner, bands)
    canvas.paste(mark, (padding, padding), mark)
    return canvas


def rounded_square(size: int, fill: str, radius_pct: float = 0.225):
    """iOS-style rounded square mask. radius_pct is corner radius / size."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_pct)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=fill)
    return img


# === GENERATORS ===
def gen_favicons():
    """Per the size rule: 3-band at <48px, 5-band at ≥48px."""
    print("[favicons]")
    specs = [
        (16,  BANDS_3_LIGHT, "favicon-16.png",          "3-band"),
        (24,  BANDS_3_LIGHT, "favicon-24.png",          "3-band"),
        (32,  BANDS_3_LIGHT, "favicon-32.png",          "3-band"),
        (48,  BANDS_5_LIGHT, "favicon-48.png",          "5-band (transition)"),
        (180, BANDS_5_LIGHT, "apple-touch-icon-180.png","5-band on shore"),
        (192, BANDS_5_LIGHT, "android-chrome-192.png",  "5-band on shore"),
        (512, BANDS_5_LIGHT, "android-chrome-512.png",  "5-band on shore"),
    ]
    for size, bands, fname, note in specs:
        # Apple-touch and android-chrome ship on the shore color (no transparency)
        # so the icon doesn't show OS-rendered bg through edges. Tiny favicons
        # also benefit from a solid bg for legibility on white tabs.
        if size <= 32:
            # transparent bg — browser tab will composite
            img = banded_circle(size, bands)
        else:
            # solid shore bg
            img = banded_circle_on_bg(size, bands, SHORE)
        out = FAVICONS / fname
        img.save(out, "PNG", optimize=True)
        print(f"  {fname:32s} {size:4d}px  {note}")
    # multi-size .ico (16/24/32/48 — common Windows favicon spec)
    ico_path = FAVICONS / "favicon.ico"
    icons = []
    for s in (16, 24, 32, 48):
        b = BANDS_3_LIGHT if s < 48 else BANDS_5_LIGHT
        # ico needs RGBA with bg for solid display in non-transparent contexts
        img = banded_circle(s, b)
        # Composite onto shore so the ico has consistent bg
        bg = Image.new("RGBA", (s, s), (247, 243, 236, 255))
        bg.paste(img, (0, 0), img)
        icons.append(bg)
    icons[0].save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48)],
    )
    print(f"  {'favicon.ico':32s}        multi-size [16,24,32,48]")


def gen_app_icons():
    """iOS rounded square, Android adaptive (fg+bg), Windows tile."""
    print("[app-icons]")

    # iOS — rounded square 1024×1024, banded circle on shore inside
    ios = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    bg_layer = rounded_square(1024, SHORE)
    ios.paste(bg_layer, (0, 0), bg_layer)
    mark = banded_circle(700, BANDS_5_LIGHT)  # ~70% of canvas
    ios.paste(mark, ((1024 - 700) // 2, (1024 - 700) // 2), mark)
    ios.save(APPICONS / "ios-1024.png", "PNG", optimize=True)
    print("  ios-1024.png                     1024×1024  rounded square + 5-band on shore")

    # Android adaptive — foreground 432×432, transparent bg
    fg = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    # Adaptive icons recommend a "safe zone" of 264×264 inside 432×432
    safe = 264
    mark = banded_circle(safe, BANDS_5_LIGHT)
    fg.paste(mark, ((432 - safe) // 2, (432 - safe) // 2), mark)
    fg.save(APPICONS / "android-adaptive-foreground-432.png", "PNG", optimize=True)
    print("  android-adaptive-foreground-432.png  432×432   5-band, transparent bg")

    # Android adaptive — background 432×432, solid shore
    bg = Image.new("RGB", (432, 432), SHORE)
    bg.save(APPICONS / "android-adaptive-background-432.png", "PNG", optimize=True)
    print("  android-adaptive-background-432.png  432×432   shore solid")

    # Windows tile — 310×310, banded circle on deep-sea (matches Win11 dark themes)
    tile = Image.new("RGB", (310, 310), DEEP_SEA)
    mark = banded_circle(220, BANDS_5_DARK)
    tile.paste(mark, ((310 - 220) // 2, (310 - 220) // 2), mark)
    tile.save(APPICONS / "windows-tile-310.png", "PNG", optimize=True)
    print("  windows-tile-310.png             310×310   5-band on deep-sea")


def draw_wordmark(draw: ImageDraw.ImageDraw, x_offset: int, y_baseline: int,
                  font: ImageFont.FreeTypeFont, fill: str, bands,
                  *, image: Image.Image, font_size: int):
    """
    Draws 'Koast' with the banded circle replacing the lowercase o.

    Uses actual font metrics — banded circle is sized + positioned to match
    the real o glyph. With PJ Sans 800 installed it matches PJ Sans' o; with
    Poppins fallback it matches Poppins' o. Result is the same composition
    regardless of which font is rendering.
    """
    ls = -int(font_size * 0.045)  # letter-spacing -0.045em

    # Real font metrics
    ascent, descent = font.getmetrics()
    o_bbox = font.getbbox("o")  # (left, top, right, bottom) from cell top-left
    # o's geometry in absolute pixel space (anchor="ls" at y_baseline)
    # cell top sits at (y_baseline - ascent), so:
    o_top_y = y_baseline - ascent + o_bbox[1]
    o_bottom_y = y_baseline - ascent + o_bbox[3]
    o_h_actual = o_bottom_y - o_top_y
    o_w_actual = o_bbox[2] - o_bbox[0]
    o_cy = (o_top_y + o_bottom_y) // 2
    # Banded circle: use the larger of width/height for full coverage
    circle_size = max(o_w_actual, o_h_actual)

    # Draw "K"
    draw.text((x_offset, y_baseline), "K", font=font, fill=fill, anchor="ls")
    k_w = draw.textlength("K", font=font)

    # Place banded circle where the o would render
    o_x_left = int(x_offset + k_w + ls)
    o_x_centered = o_x_left - (circle_size - o_w_actual) // 2
    o_y_top = o_cy - circle_size // 2

    mark = banded_circle(circle_size, bands)
    image.paste(mark, (o_x_centered, o_y_top), mark)

    # "ast" follows after the o's natural advance + letter-spacing
    ast_x = o_x_left + o_w_actual + ls
    draw.text((ast_x, y_baseline), "ast", font=font, fill=fill, anchor="ls")
    ast_w = draw.textlength("ast", font=font)

    return ast_x + ast_w


def gen_social():
    """OG card 1200×630 + square 1080×1080."""
    print("[social]")

    # OG card 1200×630 — light bg, wordmark + tagline
    img = Image.new("RGB", (1200, 630), SHORE)
    draw = ImageDraw.Draw(img)

    # Wordmark, large
    wm_size = 180
    font = resolve_font(wm_size)
    # Estimate width and center
    # K_w ≈ 0.62em, o ≈ 0.55em, ast_w ≈ 1.0em (a+s+t roughly)
    estimated_w = int(wm_size * (0.62 + 0.55 + 1.0 + 0.045 * -2))
    x_left = (1200 - estimated_w) // 2
    y_baseline = 360
    right_edge = draw_wordmark(
        draw, x_left, y_baseline, font, INK, BANDS_5_LIGHT,
        image=img, font_size=wm_size,
    )

    # Tagline below
    tag = "the AI co-host for short-term rentals."
    tag_font = resolve_font(36)
    tag_w = draw.textlength(tag, font=tag_font)
    draw.text(((1200 - tag_w) // 2, 440), tag, font=tag_font, fill="#4a5552")

    # tiny "koast.com" footer
    foot_font = resolve_font(24)
    foot = "app.koasthq.com"
    foot_w = draw.textlength(foot, font=foot_font)
    draw.text(((1200 - foot_w) // 2, 560), foot, font=foot_font, fill="#6e7976")

    img.save(SOCIAL / "og-card-1200x630.png", "PNG", optimize=True)
    print("  og-card-1200x630.png             1200×630  light bg, 5-band wordmark + tagline")

    # Dark variant
    img_d = Image.new("RGB", (1200, 630), DEEP_SEA)
    draw_d = ImageDraw.Draw(img_d)
    draw_wordmark(
        draw_d, x_left, y_baseline, font, SHORE, BANDS_5_DARK,
        image=img_d, font_size=wm_size,
    )
    draw_d.text(((1200 - tag_w) // 2, 440), tag, font=tag_font, fill="#a8b8b3")
    draw_d.text(((1200 - foot_w) // 2, 560), foot, font=foot_font, fill="#7a8a87")
    img_d.save(SOCIAL / "og-card-1200x630-dark.png", "PNG", optimize=True)
    print("  og-card-1200x630-dark.png        1200×630  dark bg, 5-band wordmark + tagline")

    # Square 1080×1080 — banded circle large + small wordmark
    sq = Image.new("RGB", (1080, 1080), SHORE)
    sq_draw = ImageDraw.Draw(sq)
    mark = banded_circle(560, BANDS_5_LIGHT)
    sq.paste(mark, ((1080 - 560) // 2, 220), mark)
    sq_font = resolve_font(72)
    sq_text = "Koast"
    sq_w = sq_draw.textlength(sq_text, font=sq_font)
    sq_draw.text(((1080 - sq_w) // 2, 870), sq_text, font=sq_font, fill=INK)
    sq.save(SOCIAL / "square-1080x1080.png", "PNG", optimize=True)
    print("  square-1080x1080.png             1080×1080 mark-forward composition")

    # Square dark
    sq_d = Image.new("RGB", (1080, 1080), DEEP_SEA)
    sq_d_draw = ImageDraw.Draw(sq_d)
    mark_d = banded_circle(560, BANDS_5_DARK)
    sq_d.paste(mark_d, ((1080 - 560) // 2, 220), mark_d)
    sq_d_draw.text(((1080 - sq_w) // 2, 870), sq_text, font=sq_font, fill=SHORE)
    sq_d.save(SOCIAL / "square-1080x1080-dark.png", "PNG", optimize=True)
    print("  square-1080x1080-dark.png        1080×1080 dark variant")


def gen_master_pngs():
    """Hi-res PNG masters (mark-only) for design tools that prefer raster."""
    print("[masters PNG previews]")
    for variant, bands_l, bands_d in [
        ("5band", BANDS_5_LIGHT, BANDS_5_DARK),
        ("3band", BANDS_3_LIGHT, BANDS_3_DARK),
    ]:
        for theme, bg, bands in [("light", SHORE, bands_l), ("dark", DEEP_SEA, bands_d)]:
            img = banded_circle_on_bg(1024, bands, bg, padding=0)
            out = MASTERS / f"koast-mark-{variant}-{theme}-1024.png"
            img.save(out, "PNG", optimize=True)
            print(f"  koast-mark-{variant}-{theme}-1024.png  1024×1024 raster preview")


# === MAIN ===
if __name__ == "__main__":
    print(f"== rasterizing Koast brand assets ==")
    print(f"   font in use: {resolve_font(64).path if hasattr(resolve_font(64),'path') else 'default'}")
    print()
    gen_favicons()
    print()
    gen_app_icons()
    print()
    gen_social()
    print()
    gen_master_pngs()
    print()
    print("done.")
