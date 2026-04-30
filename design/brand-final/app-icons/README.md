# Koast — App icons

Native app icons for iOS, Android, and Windows. All use the 5-band variant on the brand-appropriate substrate.

## Files

| File | Spec | Purpose |
| --- | --- | --- |
| `ios-1024.png` | 1024×1024, ~22.5% rounded corners | iOS App Store + iPad icon |
| `android-adaptive-foreground-432.png` | 432×432, 264px safe zone, transparent | Android adaptive icon foreground layer |
| `android-adaptive-background-432.png` | 432×432, solid shore #f7f3ec | Android adaptive icon background layer |
| `windows-tile-310.png` | 310×310, 5-band on deep sea | Windows Start tile |

## Specifications

### iOS (`ios-1024.png`)
Apple supplies the corner mask at runtime, but we ship a pre-rounded 22.5% radius for App Store Connect submissions and design previews. Banded circle at 700×700 (~68% canvas) on a shore #f7f3ec rounded square.

### Android adaptive icons
Android's adaptive system composites a 432×432 foreground over a 432×432 background, then masks to shape (circle/squircle/rounded-square depending on launcher). Foreground content must stay inside a 264×264 central safe zone — devices may apply scale and rotation effects to the rest. Our foreground is the 5-band banded circle at 264×264. Background is solid shore.

### Windows tile (`windows-tile-310.png`)
Default medium tile size for Win11 Start. Banded circle (5-band, dark palette) at 220×220 on deep sea #132e20 to harmonize with Win11's typically dark Start surface.

## Manifest references

```json
// PWA manifest.json
{
  "icons": [
    { "src": "/android-chrome-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/android-chrome-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/android-adaptive-foreground-432.png", "sizes": "432x432", "purpose": "maskable" }
  ]
}
```

```xml
<!-- browserconfig.xml for Windows tiles -->
<browserconfig><msapplication><tile>
  <square310x310logo src="/windows-tile-310.png"/>
  <TileColor>#132e20</TileColor>
</tile></msapplication></browserconfig>
```

To regenerate: `python3 ../rasterize.py` from the brand-final root.
