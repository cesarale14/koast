# Platform Icons Reference

## File Structure
```
public/icons/platforms/
  airbnb.svg            # Bélo symbol, coral #FF385C (for light bg)
  airbnb-white.svg      # Bélo symbol, white (for dark/colored bg)
  airbnb-tile.svg       # Coral square with white Bélo (for badges)
  booking-com.svg       # B+dot mark, navy #003580 (for light bg)
  booking-com-white.svg # B+dot mark, white (for dark/colored bg)
  booking-com-tile.svg  # Navy square with white B+dot (for badges)
  vrbo.svg              # VRBO wordmark, blue #3145F5 (NEED SVG - only PNG available)
  koast-tile.svg        # Golden square with deep-sea K (for direct booking badge)
```

## Platform Config (TypeScript)
```ts
export const PLATFORMS = {
  airbnb: {
    name: 'Airbnb',
    color: '#FF385C',
    colorLight: 'rgba(255,56,92,0.1)',  // for pills/badges on light bg
    icon: '/icons/platforms/airbnb.svg',
    iconWhite: '/icons/platforms/airbnb-white.svg',
    tile: '/icons/platforms/airbnb-tile.svg',
  },
  booking_com: {
    name: 'Booking.com',
    color: '#003580',
    colorLight: 'rgba(0,53,128,0.1)',
    icon: '/icons/platforms/booking-com.svg',
    iconWhite: '/icons/platforms/booking-com-white.svg',
    tile: '/icons/platforms/booking-com-tile.svg',
  },
  vrbo: {
    name: 'VRBO',
    color: '#3145F5',
    colorLight: 'rgba(49,69,245,0.1)',
    icon: '/icons/platforms/vrbo.svg',
    iconWhite: '/icons/platforms/vrbo-white.svg',
    tile: '/icons/platforms/vrbo-tile.svg',
  },
  google: {
    name: 'Google',
    color: '#4285F4',
    colorLight: 'rgba(66,133,244,0.1)',
    icon: '/icons/platforms/google.svg',
    iconWhite: '/icons/platforms/google-white.svg',
    tile: '/icons/platforms/google-tile.svg',
  },
  direct: {
    name: 'Direct',
    color: '#c49a5a',
    colorLight: 'rgba(196,154,90,0.1)',
    icon: '/icons/platforms/koast-tile.svg',
    iconWhite: '/icons/platforms/koast-tile.svg',
    tile: '/icons/platforms/koast-tile.svg',
  },
} as const;

export type PlatformKey = keyof typeof PLATFORMS;
```

## Usage by Context

### Booking bar (inside dark #222 bar)
- Size: 20px circle
- Use: `iconWhite` version inside a circle with `platform.color` background
```tsx
<div className="w-5 h-5 rounded-full flex items-center justify-center"
  style={{ background: PLATFORMS[platform].color }}>
  <img src={PLATFORMS[platform].iconWhite} className="w-3 h-3" />
</div>
```

### Property card channel badge (on property photo)
- Size: 26px rounded square
- Use: `tile` version with glassmorphism
```tsx
<div className="w-[26px] h-[26px] rounded-[7px] overflow-hidden"
  style={{ backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)' }}>
  <img src={PLATFORMS[platform].tile} className="w-full h-full" />
</div>
```

### Property list thumbnail badge (small corner badge)
- Size: 16px rounded square
- Use: `tile` version
```tsx
<div className="w-4 h-4 rounded overflow-hidden border-[1.5px] border-white">
  <img src={PLATFORMS[platform].tile} className="w-full h-full" />
</div>
```

### Rate panel channel header
- Size: 22px rounded square
- Use: `tile` version
```tsx
<div className="w-[22px] h-[22px] rounded-[6px] overflow-hidden">
  <img src={PLATFORMS[platform].tile} className="w-full h-full" />
</div>
```

### Platform pill (inline with text)
- Size: 10px icon height
- Use: `icon` (colored) version inside a tinted pill
```tsx
<span className="h-4 rounded px-[6px] inline-flex items-center gap-1 text-[10px] font-semibold"
  style={{
    background: PLATFORMS[platform].colorLight,
    color: PLATFORMS[platform].color,
  }}>
  <img src={PLATFORMS[platform].icon} className="w-[10px] h-[10px]" />
  {PLATFORMS[platform].name}
</span>
```

### Conversation list avatar badge
- Size: 18px rounded square
- Use: `tile` version with white border
```tsx
<div className="absolute -bottom-[2px] -right-[2px] w-[18px] h-[18px] rounded-[5px] overflow-hidden border-2 border-white">
  <img src={PLATFORMS[platform].tile} className="w-full h-full" />
</div>
```

## VRBO Note
VRBO logo is currently PNG only (vrbo-logo.png). Need to source or trace an SVG version.
The VRBO wordmark uses a custom typeface with striped/lined effect in #3145F5 blue.
For small icon contexts, use a simplified "V" lettermark in the brand blue until proper SVG is available.

## Rules
- NEVER use colored circles with letters as platform logos
- NEVER generate approximations of platform logos with SVG paths
- ALWAYS use the actual brand SVG files from this directory
- The `tile` variants (colored bg + white icon) are the most versatile — use them as default
- The `icon` variants (colored icon, transparent bg) are for platform pills on light backgrounds
- The `iconWhite` variants are for use on dark or colored backgrounds
