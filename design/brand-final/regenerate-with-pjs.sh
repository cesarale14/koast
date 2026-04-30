#!/usr/bin/env bash
#
# Koast brand — Plus Jakarta Sans bootstrap + PNG regeneration
#
# Run this ONCE on the VPS after unpacking the brand-final zip.
# It installs Plus Jakarta Sans 800 system-wide, then re-runs rasterize.py
# so OG cards and any wordmark-bearing PNG outputs use the correct font.
#
# Why: this zip ships with PNGs rasterized against Poppins Bold (geometric
# fallback) because PJ Sans wasn't available in the build environment.
# Visually adjacent but not the locked brand font. This script fixes that
# in one step on any host with internet access.
#
# Usage:
#   cd ~/koast/design/brand-final
#   bash regenerate-with-pjs.sh
#
# Requires: sudo, curl OR wget, fontconfig (fc-cache), python3 + Pillow.
#

set -euo pipefail

PJS_DIR="/usr/share/fonts/truetype/plus-jakarta-sans"
PJS_FILE="${PJS_DIR}/PlusJakartaSans-ExtraBold.ttf"

# Plus Jakarta Sans is a variable font on Google Fonts. We try several known
# stable mirrors; first one that succeeds wins.
SOURCES=(
  # fontsource (npm cdn — typically fast and reliable)
  "https://cdn.jsdelivr.net/npm/@fontsource/plus-jakarta-sans@5.0.20/files/plus-jakarta-sans-latin-800-normal.ttf"
  # Google Fonts raw (variable font — works as ExtraBold via wght axis)
  "https://github.com/google/fonts/raw/main/ofl/plusjakartasans/PlusJakartaSans%5Bwght%5D.ttf"
  # fontsource alternate path
  "https://cdn.jsdelivr.net/gh/fontsource/font-files@main/fonts/google/plus-jakarta-sans/files/plus-jakarta-sans-latin-800-normal.ttf"
)

say() { printf "\033[1;36m›\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m!\033[0m %s\n" "$*" >&2; }
ok()  { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
die() { printf "\033[1;31m✗\033[0m %s\n" "$*" >&2; exit 1; }

# === 1. Check if PJ Sans is already installed ===
if [[ -f "$PJS_FILE" ]]; then
  ok "Plus Jakarta Sans ExtraBold already installed at $PJS_FILE"
  REINSTALL=0
else
  REINSTALL=1
fi

# === 2. Install if needed ===
if [[ $REINSTALL -eq 1 ]]; then
  say "Installing Plus Jakarta Sans ExtraBold..."

  # Need a downloader
  if command -v curl >/dev/null 2>&1; then
    DL="curl -sSL --fail --max-time 60 -o"
  elif command -v wget >/dev/null 2>&1; then
    DL="wget -q --timeout=60 -O"
  else
    die "Need either curl or wget. Install with: sudo apt-get install -y curl"
  fi

  # Need write access to system fonts
  if [[ ! -d "$PJS_DIR" ]]; then
    sudo mkdir -p "$PJS_DIR" || die "Failed to create $PJS_DIR (need sudo)"
  fi

  TMP_FILE="$(mktemp --suffix=.ttf)"
  trap 'rm -f "$TMP_FILE"' EXIT

  SUCCESS=0
  for url in "${SOURCES[@]}"; do
    say "Trying: $url"
    if $DL "$TMP_FILE" "$url" 2>/dev/null && [[ -s "$TMP_FILE" ]]; then
      # Verify it's actually a TTF (first 4 bytes should be 0x00010000 or "OTTO" or "true")
      if file "$TMP_FILE" 2>/dev/null | grep -qiE "TrueType|OpenType|Spline Font"; then
        ok "Downloaded valid font from $url"
        SUCCESS=1
        break
      else
        warn "Downloaded file is not a valid TTF — trying next source"
      fi
    else
      warn "Download failed — trying next source"
    fi
  done

  if [[ $SUCCESS -eq 0 ]]; then
    die "All download sources failed. Install manually: download Plus Jakarta Sans ExtraBold from https://fonts.google.com/specimen/Plus+Jakarta+Sans, place TTF at $PJS_FILE, then re-run this script."
  fi

  sudo mv "$TMP_FILE" "$PJS_FILE" || die "Failed to install font (need sudo)"
  sudo chmod 644 "$PJS_FILE"
  trap - EXIT

  say "Refreshing font cache..."
  sudo fc-cache -fv >/dev/null 2>&1 || warn "fc-cache failed (font may still work)"
  ok "Plus Jakarta Sans ExtraBold installed at $PJS_FILE"
fi

# === 3. Verify Python + Pillow ===
say "Checking Python environment..."
if ! command -v python3 >/dev/null 2>&1; then
  die "python3 not found. Install with: sudo apt-get install -y python3 python3-pil"
fi

if ! python3 -c "from PIL import Image, ImageFont" 2>/dev/null; then
  warn "Pillow not installed. Installing..."
  if command -v pip3 >/dev/null 2>&1; then
    pip3 install --break-system-packages Pillow 2>/dev/null || sudo apt-get install -y python3-pil
  else
    sudo apt-get install -y python3-pil || die "Failed to install Pillow"
  fi
fi
ok "Python environment ready"

# === 4. Verify PJ Sans is loadable by Pillow ===
say "Verifying Pillow can load Plus Jakarta Sans..."
if python3 -c "from PIL import ImageFont; ImageFont.truetype('$PJS_FILE', 48)" 2>/dev/null; then
  ok "Pillow loads PJ Sans correctly"
else
  die "Pillow cannot load $PJS_FILE — file may be corrupt"
fi

# === 5. Run rasterize.py ===
say "Regenerating PNG outputs with Plus Jakarta Sans..."
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

if [[ ! -f rasterize.py ]]; then
  die "rasterize.py not found in $SCRIPT_DIR — run from the brand-final directory"
fi

python3 rasterize.py
echo
ok "PNG regeneration complete with Plus Jakarta Sans baked in."
echo
echo "  Verify by opening:"
echo "    social/og-card-1200x630.png"
echo "    social/square-1080x1080.png"
echo "  The wordmark should now be Plus Jakarta Sans 800, not Poppins."
echo
