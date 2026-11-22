# Design System: U-Pack for Trading — Crystal Architectural Gallery

## 1. Visual Theme & Atmosphere
A luminous, architectural industrial glass showroom inspired by Swiss exhibition design and commercial studio photography. The atmosphere is **crisp, daylight-bright, high-agency, and tactile** — calibrated at **Density 5 (Balanced Wholesale Scannability)**, **Variance 7 (Confident Asymmetric Split & Bento Rhythm)**, and **Motion 7 (GSAP 3D Depth Choreography & Tactile Card Tricks)**.

Instead of dark-mode tropes or artificial 3D product renders, real KRNO disposable food-service packaging photography leads every viewport. Luminous cyclorama surfaces let crisp typography, subtle hairline structures, and adaptive dark/light studio plinths frame every cup, dessert tray, cake box, and meal container with museum-grade clarity.

## 2. Color Palette & Roles
Every foreground/background pair is mathematically verified to meet or exceed WCAG 2.1 AA (`≥ 4.5:1` text, `≥ 3.0:1` UI boundaries/focus indicators). Pure `#000000` is never used; obsidian charcoal anchors dark accents.

- **Architectural Daylight Mist** (`#F5F7FA`) — Primary page canvas background across Hero, Catalog, Dessert Spotlight, and Clients sections.
- **Porcelain Studio White** (`#FFFFFF`) — Elevated card fills, floating navigation glass base, light product photo plinths, and full-color client logo medallions.
- **Obsidian Charcoal Ink** (`#0D0F14`) — Primary display headlines, card titles, primary text (`19.17:1` AAA on white), and dark-section footer/wholesale grounds.
- **Obsidian Plinth Deep** (`#050608`) — Adaptive inset studio plinth reserved strictly for clear PET and dark-studio product photographs so transparent packaging gleams without boxy seams.
- **Slate Architectural Ink** (`#4B5366`) — Secondary copy, technical specifications, and metadata labels (`7.70:1` AAA on white, `7.18:1` on daylight mist).
- **Silver Studio Muted** (`#A1A8B8`) — Secondary text on Obsidian `#0D0F14` dark bands (`8.10:1` AAA).
- **Machined Hairline Border** (`#E2E6EF`) — 1px structural grid borders, card framing, and table dividers; interactive form controls use **Architectural Steel** (`#747D91`, `3.95:1` non-text contrast).
- **U-Pack Signal Crimson** (`#C61D2A`, hover `#A61520`) — Singular brand accent derived directly from U-Pack's emblem (`U`); drives active navigation pills, Dessert Spotlight accents, interactive border-glow spotlights, flying `+1 Box` feedback, and keyboard focus rings (`5.82:1` white text on crimson). On dark surfaces, **Luminous Crimson** (`#F2525E`, `5.6:1`) is used for small text and rings.
- **WhatsApp Forest Emerald** (`#127A3E`, hover `#0D6130`) — Dedicated conversion fill for every **Order on WhatsApp (`01055400404`)** button (`5.41:1` AA white text; hover `7.58:1` AAA). Never place white text on `#25D366` (use `#25D366` exclusively for vector glyph accents on Obsidian dark surfaces).
- **Semantic Material Tints** (paired with explicit text codes, never color-only):
  - `PET`: `#0B5B8A` on `#E8F4FB` (`6.52:1`)
  - `PP`: `#1D2433` on `#ECEFF4` (`13.47:1`)
  - `PS`: `#6D3B09` on `#FDF3E7` (`8.40:1`)
  - `Wood / Paper / Mixed`: `#14532D` on `#EAF7EE` (`8.26:1`)

## 3. Typography Rules
Locale-split Google Fonts keep payloads minimal and eliminate generic defaults:
- **English Display (`/en`)**: **Bricolage Grotesque** (`600, 700, 800`) — expressive neo-grotesque architectural voice, tight tracking (`-0.03em`), controlled fluid scale (`clamp(2.35rem, 4.8vw, 4.4rem)`), balanced line wraps (`text-wrap: balance`).
- **English Body & UI (`/en`)**: **Manrope** (`400, 500, 600, 700`) — clean humanist readability (`1rem` mobile floor, `leading-[1.6]`, `65ch` prose cap, `tabular-nums` on every box count and spec).
- **Arabic Display (`/ar`)**: **Alexandria** (`600, 700, 800`) — Egyptian-crafted geometric Arabic display voice with crisp modern proportions, normal letter spacing (never negative tracking on Arabic), `leading-[1.22]`.
- **Arabic Body & UI (`/ar`)**: **Tajawal** (`400, 500, 700`) — ultra-clean contemporary Arabic UI face tuned for dense wholesale specs (`leading-[1.72]`).
- **Technical SKU & Measurement Mono (EN & AR)**: **JetBrains Mono** (`500`) wrapped inside `<bdi dir="ltr">` strictly for SKU codes (`UK-92-16`, `RLB-1`) and millimeter dimensions — **never** used as decorative eyebrows.
- **Headline Inline Visual Punctuation**: The Home Hero headline uses a signature pill-framed real packaging visual tucked inline between display words on desktop, collapsing cleanly below on mobile with zero overlapping text.

## 4. Component Stylings
- **Floating Glass Navigation Bar**: Translucent porcelain pill (`rgba(255, 255, 255, 0.88)` + `backdrop-filter: blur(14px)` + `1px solid #E2E6EF`) floating cleanly at the top with U-Pack's circular emblem, **`KRNO Distributor` / `موزع KRNO`** lockup, prominent **Dessert / الحلويات** nav link, instant EN ↔ AR path-preserving switcher, direct `01055400404` call pill, and Quote Bag trigger with live box counter.
- **Buttons**: Tactile push feedback (`active:scale-[0.98]`), `12px` radius, `min-h-11` (`44px+`) touch target, zero neon outer glows. Primary conversion actions use WhatsApp Forest Emerald (`#127A3E`); brand emphasis uses Signal Crimson (`#C61D2A`); secondary utilities use Obsidian Ink outline (`#0D0F14`) or crisp porcelain ghost fills.
- **Product Gallery Cards (`.card-3d-trick`)**: Generously rounded `18px` porcelain frames (`#FFFFFF`) with `1px solid #E2E6EF` machined borders and whisper-soft neutral shadows. Each card houses an **adaptive inset studio plinth** (`.plinth-dark` `#050608` for dark-studio PET/PS photography; `.plinth-light` `#FFFFFF` for light-studio PP/Sushi/Bowl/Cutlery photography), **Sold by Box** badge, transparent **Lid Policy** status pill (*"Cups Only — Lids Sold Separately"* on all cups, *"Built-in Hinged Lid"*, *"Container + Lid Included"*, or *"Lid Sold in Matching Box"*), 1-tap variant pills, technical SKU/Lid strip, primary **Order on WhatsApp** CTA, and **`+ Add Box`** button.
- **Inputs & Filters**: Visible labels (or screen-reader labels paired with explicit search icon & clear button), `10px` radius, `#747D91` border, Signal Crimson focus ring (`0 0 0 3px rgba(198,29,42,0.16)`).
- **Client Medallion Wall ("Our Clients / عملاؤنا")**: All 9 exact Egyptian F&B clients displayed simultaneously in a proud 3×3 porcelain card grid (`#FFFFFF`, uniform well padding, `object-contain`, zero grayscale/invert/crop).
- **Slide-Over Quote Bag Drawer**: Enters from inline-end (`right` LTR, `left` RTL) with faster exit than entrance, box quantity steppers, separate lid box items clearly labeled, optional business name & Egyptian governorate inputs, and 1-tap multi-SKU WhatsApp composer to `01055400404`.

## 5. Layout Principles
- **Grid-First Asymmetric Architecture**: Split-screen asymmetric Hero (`1.05fr / 0.95fr`), curated **Dessert Collection / قسم الحلويات** Home spotlight with interactive sub-tabs, Bento category gateway, and responsive 3-column desktop / 2-column tablet / 1-column mobile product grids.
- **Zero Spatial Collisions**: No text overlapping images, no nested cards, generous vertical rhythm (`clamp(3.5rem, 6.5vw, 6rem)`), `min-h-[100dvh]` instead of `100vh`, `scroll-padding-top: 6rem`, and 100% CSS logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`) for effortless LTR/RTL parity.
- **Brand Copy Lock**: Strictly **`KRNO Distributor`** (EN) / **`موزع KRNO`** (AR) everywhere (never "Official Egypt Distributor"). Zero Foam products or mentions anywhere. Unified **`01055400404`** for Calls & WhatsApp, both company emails (`Khodeirmostafa80@gmail.com` & `soliman.lashien@gmail.com`), and Nationwide Egypt Delivery.

## 6. Motion & Interaction (GSAP + Hardware-Accelerated CSS 3D)
Real product photography paired with GSAP 3.13 (`ScrollTrigger`, `gsap.quickTo`) and GPU-composited `transform`/`opacity` animations — **zero Three.js 3D product studio models**:
1. **Multi-Plane Hero 3D Depth Collage** (`[data-hero-3d-stage]`): Pointer-tracked `±5.5°` tilt with real U-Pack showcase photos floating across distinct `translateZ` depth planes and gentle perpetual float (paused offscreen, on hidden tab, and under reduced motion).
2. **Card Tricks Engine** (`[data-trick-card]`): Desktop `±6.5°` cursor tilt (`gsap.quickTo` + elastic `pointerleave` reset), diagonal prismatic glass sheen (`--sheen-x`, `--sheen-y`), magnetic crimson 1px border spotlight (`--glow-x`, `--glow-y`), 3D `translateZ` media pop, 3D Y-axis **Peek Inside** flip (`[data-peek-btn]`) for Group A open-interior photos, sliding active tab rail (`[data-pill-rail]`), animated box-count metric pop, and flying `+1 Box` micro-burst toward the Quote Bag trigger.
3. **Scroll & Accessibility Discipline**: `ScrollTrigger.batch('[data-reveal-card]', { batchMax: 8 })` with `opacity: 1` static HTML default (crawlers & no-JS render 100% visible), reactive `matchMedia('(prefers-reduced-motion: reduce)')` listener disabling spatial transforms while preserving instant legible state feedback, and full RTL directional mirroring (`dir = rtl ? -1 : 1`).

## 7. Anti-Patterns (Strictly Banned)
- No emojis anywhere (crisp inline Phosphor + WhatsApp SVGs exclusively).
- No `Inter`, `Space Grotesk`, `Playfair Display`, `Outfit`, `DM Sans`, `IBM Plex`, or `Cairo`.
- No Three.js 3D product viewer / fake 3D models.
- No "Official Egypt Distributor" / "Official Distributor" / "الموزع الرسمي" wording.
- No Foam products or foam references.
- No claiming lids are included inside cold/dessert/sauce cup boxes (cups are sold separately from lid boxes).
- No pure black (`#000000`), no neon/purple glows, no gradient headline text, no eyebrows/kickers above headings, no "Scroll to explore" filler, no Arabic `SplitText` char splitting, no fabricated street addresses/hours/metrics, no external Amazon hotlinks, no grayscaled/cropped client logos.
