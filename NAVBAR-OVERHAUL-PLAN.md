# Navbar Visual Overhaul — Design Specification & Implementation Plan

**Scope:** Public-site sticky header (`<header class="navbar">`) across all 11 HTML pages,
the modernized dark-mode toggle switch, and the hero compensation required by the taller header.

**Stack constraints (AGENTS.md):** Vanilla SCSS → compiled `css/main.css`, jQuery/vanilla JS
(`js/main.js`), Lucide icons, no new libraries, BEM naming, theme via `data-theme` on `<html>`,
spring easings only, `prefers-reduced-motion`/`prefers-reduced-transparency` respected.

---

## 1. Current-State Audit (baseline)

### 1.1 HTML (identical header on every page, e.g. `index.html:27-65`)
- `<header class="navbar" role="banner">` → `.container.navbar__container`
- `.navbar__brand` — logo `images/hills.svg` + `.navbar__title` containing
  `HILLS OF GLORY` and `<span>International Christian Center</span>`
- `nav#navbarNav.navbar__nav` — 8 `.navbar__link` entries (Home, About, Ministries,
  Discipleship, Events, Church, Give, Contact)
- `.navbar__actions` — `#navLiveButton` (desktop-only, hidden until live),
  `label.theme-switch` (checkbox `#themeToggle` + sun/moon Lucide icons), `#mobileMenuToggle`
- Heroes: `index.html` uses `.hero` (100dvh video); the other 10 pages use `.page-hero` (50vh)

### 1.2 SCSS (`scss/_layout.scss`)
| Selector | Current behavior |
|---|---|
| `.navbar` (8-47) | `position: sticky; top: 0; z-index: 1000`. Height **100px** + `margin-bottom: -100px` (overlap technique). Transparent, no blur, no border, no shadow. Transitioned with `--transition-base` (280ms). |
| `.navbar.is-scrolled` (26-34) | Height **76px**, `margin-bottom: 0`, `background: var(--color-glass)`, `backdrop-filter: blur(20px)`, **`border-bottom: 1px solid var(--color-border)`** (must be REMOVED per spec), shadow `0 10px 30px -10px rgba(0,0,0,0.1)`. |
| ≤960px (36-46, 139-174) | Header 76px + `-76px` margin. Nav becomes a dropdown anchored `top: 100%` with `background: var(--color-surface-solid)` (white in light) but **links stay white with pill backgrounds → latent legibility bug** (white-on-white in light mode). No shadow on mobile. |
| `.navbar__container` (49-69) | Gapped `--space-md` / `--space-lg` (≥961px), padding `0.75rem 0` → `0` when scrolled. |
| `.navbar__brand` (71-77) | Text-shadow `0 2px 8px rgba(0,0,0,0.3)`. |
| `.navbar__title` (87-126) | Outfit 900, `1.25rem`, **white**. `<span>` `0.72rem`, white. |
| `.navbar__link` (178-247) | White text, **translucent white pill** (`background rgba(255,255,255,.15)`, `backdrop-filter blur(10px)`, border `rgba(255,255,255,.25)`), padding `0.6rem 1.2rem`. Scrolled: pill removed but border stays `transparent`. Dark mode adds black-ish pills (228-241). Pill backgrounds must go entirely. |
| `.navbar__link--active::after` (211-225) | Bottom underline 16px wide × **2.5px**, **white**. Must become thicker + **gold**. |
| `.theme-switch*` (250-358) | 64×32 track, 24px knob sliding 32px, sun/moon icons, glassy label pill. Functional but dated (flat knob, `--transition-fast` linear-ish, input `display:none` → **not keyboard-focusable**). |
| `.hero` (466-475) / `.page-hero` (491-546) | `min-height: 100dvh` / `50vh`, padding `--space-4xl` (96px) top/bottom. Not compensated for a taller header. |
| `.navbar__actions` | **No CSS rule exists** — relies on flex layout of container. |

### 1.3 JS (`js/main.js`)
- `24-64` Theme logic: reads `localStorage('theme')`, defaults `light`, sets `data-theme` on
  `<html>`, syncs `#themeToggle.checked` + `data-theme-active` on the label.
- `160-175` Scroll: rAF-throttled `navbar.classList.toggle('is-scrolled', window.scrollY > 24)`.
  **Not invoked on initial load** → reloading mid-page leaves the header in the transparent
  default state (bug to fix).

---

## 2. Design Specification

### 2.1 State model
Two mutually exclusive states, driven by the existing `.is-scrolled` class:

1. **Default / Top** — transparent header, taller, floating over the hero.
2. **Scrolled / Sticky** — compact glassmorphic bar pinned to the viewport top.

All properties interpolate between states via a dedicated spring-ish transition
(`--transition-nav`, ~420ms `cubic-bezier(0.22, 1, 0.36, 1)`). Height, margins, paddings,
gaps, colors, background, backdrop blur, and shadow are all transitioned — nothing snaps.

### 2.2 Geometry & overlap
| Property | Default | Scrolled | Mobile ≤960px (both states) |
|---|---|---|---|
| Header height | **120px** | **72px** | 72px → 64px scrolled |
| Overlap margin | `margin-bottom: -120px` | `margin-bottom: 0` | `-72px` → `0` |
| Container padding | `0.9rem 0 0` (top-weighted) | `0` | `0.4rem 0` |

- Overlap technique is preserved: `position: sticky; top: 0; z-index: 1000` plus negative
  bottom margin so the hero slides under the transparent bar.
- **Hero compensation:** add `padding-top: calc(120px + var(--space-lg))` to `.hero` and
  `.page-hero` so centered content clears the bar, and bump minimum height so the hero still
  fills/reads tall: `.hero { min-height: calc(100dvh + 60px) }`, `.page-hero { min-height: calc(50vh + 60px) }`.
- Heights are tokens (`--nav-height`, `--nav-height-scrolled`) so they stay in sync between
  `.navbar`, the negative margin, the hero padding, and the mobile dropdown `max-height`.

### 2.3 Default state (top of page)
- Header: fully **transparent**, no blur, no border, no shadow.
- Brand: white `HILLS OF GLORY` + white subtitle, kept `text-shadow` for video legibility.
- Nav links: **no background, no border, no backdrop-filter** in either theme. All text white
  with a subtle `text-shadow`. Tighter gutters (`gap: 0.15rem`, `padding: 0.55rem 0.75rem`).
- Active link: gold underline accent, see 2.6.
- Theme switch + Live button: keep lightweight translucent-white glass pills on the hero.

### 2.4 Scrolled state (sticky)
- **Light mode**
  - Bar: **whitish translucent tint** `rgba(255, 255, 255, 0.78)` + `blur(20px) saturate(1.6)`,
    **no bottom border**, soft layered shadow for contrast
    (e.g. `0 12px 32px -16px rgba(28,25,23,0.28), 0 2px 8px -2px rgba(28,25,23,0.08)`).
  - `HILLS OF GLORY` → **`#245c52`** (matches footer brand color).
  - `INTERNATIONAL CHRISTIAN CENTER` → **grey** `#57534E`.
  - Nav links → **`#1a3a0e`**; hover deepens to `#224402` with a green underline.
  - Active underline stays **gold**.
  - Drop the text-shadows (no longer needed on glass).
- **Dark mode**
  - Bar: **dark-mode glass** `rgba(22, 24, 26, 0.78)` + `blur(20px) saturate(1.3)`,
    **no bottom border**, deep shadow `0 12px 32px -16px rgba(0,0,0,0.7)`.
  - Typography **retains the white Default-state colors** — no spilling of light-mode colors
    into dark. Links hover to pure white, underline keeps gold (`--color-secondary` dark).

### 2.5 Modernized dark-mode toggle switch
Keep the accessible native checkbox + Lucide sun/moon (project icon rule). Modernize:

- **Knob:** 22px circle on a 56×28 track; travels with a spring overshoot curve
  `cubic-bezier(0.34, 1.56, 0.64, 1)` (~340ms) — tactile, not linear. Knob gets a real
  gradient + drop shadow.
- **Track:** inset shadow for depth; in dark (checked) it fills with a subtle charcoal
  gradient; in light, a faint sunlit tint. Optional brand accent: checked track uses a
  `linear-gradient(90deg, var(--color-primary), var(--color-secondary))` wash at low alpha.
- **Icons:** sun `#F7BA6B` tint, moon `#E2E8F0` tint; cross-fade on toggle (dynamic text color,
  static — no icon swap needed).
- **States:**
  - Top-of-page: white-glass pill matching the links.
  - Scrolled light: white-glass pill, `--color-border-hover` border, soft shadow.
  - Scrolled dark: `rgba(255,255,255,0.08)` glass, `rgba(255,255,255,0.16)` border.
- **Accessibility:** the checkbox must remain **focusable** (currently `display:none` kills it).
  Switch to `position: absolute; opacity: 0;` + `:focus-visible` ring on the label
  (`outline: 2px solid var(--color-secondary); outline-offset: 3px`).
- **Reduced motion:** knob/transition tokens flatten to `0.01ms` via the existing
  `prefers-reduced-motion` override; **reduced transparency:** track+bar fall back to solid
  `--color-surface-solid` via the existing global override.

### 2.6 Active-link indicator
- `.navbar__link--active::after`: **height 3.5px** (up from 2.5px), **color `var(--color-secondary)`**
  (gold `#e19d37` / dark `#F59E0B`), width 20px, rounded, with a faint gold glow
  `box-shadow: 0 0 10px rgba(var(--color-secondary-rgb), 0.55)`.
- Give every link a hidden underline affordance on `::after` so hover reveals a growing,
  color-context-aware underline (white on hero, leaf-green in light scrolled, gold for active).
  Hidden on mobile dropdown.

### 2.7 Mobile (≤960px)
- Header keeps overlap at top (72px bar) and transitions to the same theme-aware glass at
  64px when scrolled.
- **Fix the latent white-on-white bug:** the dropdown panel is `--color-surface-solid`; links
  inside it must use `var(--color-text)` (theme-aware), transparent backgrounds, no
  text-shadow. Active page highlighted with a `3px var(--color-secondary)` left border.
- Dropdown `max-height: calc(100dvh - 64px)` to track the scrolled bar height.
- Theme switch stays visible in the actions cluster at all times.

### 2.8 Motion & interaction summary
- All state transitions: `--transition-nav` (420ms, `cubic-bezier(0.22,1,0.36,1)`).
- Knob: spring overshoot `--transition-knob` (340ms).
- Hover (desktop): underline reveal only — **no backgrounds**, `translateY(-1px)` optional.
- Scroll events stay rAF-throttled + passive.
- `prefers-reduced-motion`: all of the above collapse to ~0ms; states still swap instantly.

---

## 3. Technical Implementation Plan

### 3.1 `scss/_variables.scss`
Add to `:root` (and values mirrored for dark where theme-aware):
```scss
--transition-nav: 420ms cubic-bezier(0.22, 1, 0.36, 1);
--transition-knob: 340ms cubic-bezier(0.34, 1.56, 0.64, 1);
--nav-height: 120px;
--nav-height-scrolled: 72px;
--nav-glass: rgba(255, 255, 255, 0.78);          // light scrolled tint
--nav-glass-dark: rgba(22, 24, 26, 0.78);          // dark scrolled tint
--nav-shadow-scrolled: 0 12px 32px -16px rgba(28, 25, 23, 0.28), 0 2px 8px -2px rgba(28, 25, 23, 0.08);
--nav-shadow-scrolled-dark: 0 12px 32px -16px rgba(0, 0, 0, 0.7), 0 2px 8px -2px rgba(0, 0, 0, 0.4);
--nav-brand-color-scrolled: #245c52;
--nav-brand-sub-color-scrolled: #57534E;
--nav-link-color-scrolled: #1a3a0e;
```
In `[data-theme="dark"]`: `--nav-glass: var(--nav-glass-dark)`; `--nav-shadow-scrolled: var(--nav-shadow-scrolled-dark)`.
Add `--transition-nav` / `--transition-knob` to the existing `prefers-reduced-motion` `:root` block (set to `0.01ms`).

### 3.2 `scss/_layout.scss`
Rewrite the navbar block. Key changes per area:

1. `.navbar` — height `var(--nav-height)`, `margin-bottom: calc(-1 * var(--nav-height))`,
   `border-bottom: none`, swap all transitions to `var(--transition-nav)`, add `will-change` off.
2. `.navbar.is-scrolled` — height `var(--nav-height-scrolled)`, `margin-bottom: 0`,
   `background-color: var(--nav-glass)`, `backdrop-filter: blur(20px) saturate(1.6)`,
   `border-bottom: none`, `box-shadow: var(--nav-shadow-scrolled)`.
3. `.navbar__container` — default `padding: 0.9rem 0 0`; scrolled `padding: 0`.
4. `.navbar__title` — base white; add theme-scoped scrolled rules:
   `[data-theme='light'] .navbar.is-scrolled .navbar__title { color: var(--nav-brand-color-scrolled); }`
   and for its `span`: `var(--nav-brand-sub-color-scrolled)`.
5. `.navbar__link` — **strip all pill styling** (background/border/backdrop-filter) in both
   themes; `color: #fff`, `text-shadow: 0 1px 3px rgba(0,0,0,0.25)`, `padding: 0.55rem 0.75rem`.
   Scrolled (`navbar.is-scrolled`): remove text-shadow, `padding: 0.45rem 1rem`.
   Light scrolled: `[data-theme='light'] .navbar.is-scrolled .navbar__link { color: var(--nav-link-color-scrolled); }`.
   Dark scrolled: inherit white (no override).
6. Underline affordance: shared `::after` (hidden, `transform: scaleX(0)`, gold/context color),
   active overrides to full + `--color-secondary` + glow. Delete the old `--active::after` block.
7. `.theme-switch*` — replace with the 2.5 spec: 56×28 track, 22px knob, spring knob transition,
   focusable checkbox (`position:absolute; opacity:0`), `:focus-within`/`:focus-visible` ring,
   theme-scoped scrolled glass states.
8. `.navbar__actions` — `display: flex; align-items: center; gap: var(--space-sm);`
9. Mobile block — keep dropdown mechanics; panel links use `var(--color-text)`; active gets a
   gold left-border; dropdown `max-height: calc(100dvh - var(--nav-height-scrolled))`.
10. `.hero` / `.page-hero` — `padding-top: calc(var(--nav-height) + var(--space-lg))`;
    `min-height: calc(100dvh + 60px)` / `calc(50vh + 60px)`.
11. `#navLiveButton` — in scrolled light, adopt `--color-surface` glass/`--color-border-hover`
    border so it matches the bar.

### 3.3 `js/main.js`
Replace the scroll block (160-175) with:
```js
const NAV_SCROLL_THRESHOLD = 48;
function syncNavbarState() {
  navbar.classList.toggle('is-scrolled', window.scrollY > NAV_SCROLL_THRESHOLD);
}
syncNavbarState();                                  // fixes reload-mid-page default state
window.addEventListener('scroll', function () {
  if (!ticking) {
    window.requestAnimationFrame(function () {
      syncNavbarState();
      ticking = false;
    });
    ticking = true;
  }
}, { passive: true });
```
No changes to theme logic. Optionally sync `aria-checked` on `#themeToggle` in `applyTheme`
(checkbox `checked` already reflects state; add `role="switch"` + `aria-checked` wiring if desired).

### 3.4 HTML (all 11 pages)
- No structural markup changes required.
- Optional a11y: add `role="switch"` and `aria-checked` handling for `#themeToggle`;
  `theme-switch__input` CSS change (opacity, not `display:none`) keeps it focusable with zero HTML churn.

### 3.5 Build & verification
1. Compile: `npx sass scss/main.scss css/main.css --no-source-map --style=compressed`
   (only the benign pre-existing `darken()` deprecation at `_components.scss:2513` is expected; do not widen scope).
2. `node --check js/main.js`.
3. Grep compiled CSS for `--nav-glass`, `.navbar.is-scrolled`, gold active rule to confirm output.
4. Manual QA matrix (below).

### 3.6 Manual QA checklist
- [ ] Top of page: transparent 120px bar over hero video on `index.html` and over `.page-hero`
      on the 10 sub-pages; hero content clears the bar.
- [ ] Scroll: bar compacts to 72px glass without bottom border; reverts to transparent at top.
- [ ] Light mode scrolled: whitish glass, brand `#245c52`, subtitle grey, links `#1a3a0e`, soft shadow.
- [ ] Dark mode scrolled: dark glass, no border, all white text preserved; knob + switch glass.
- [ ] Toggle: knob springs (overshoot), sun/moon cross-fade, `localStorage` persists, reload mid-page header state correct.
- [ ] Mobile ≤960px: dropdown panel links legible in light + dark; active page gold left-border;
      scroll-glass applies; theme switch remains reachable.
- [ ] `prefers-reduced-motion: reduce` → instant state swaps, no knob bounce.
- [ ] `prefers-reduced-transparency: reduce` → solid fallback bar, switch track solid.
- [ ] Keyboard: `Tab` reaches the toggle (focus ring visible), `Space` toggles theme.
- [ ] No horizontal overflow; no layout jump between states (height transitions smooth).

---

## 4. Edge cases & out of scope

- **Latin-cased brand on narrow screens:** subtitle `white-space: nowrap` + ellipsis already
  handle compression below 480px; keep.
- **Live button visibility:** unaffected; only its scrolled-glass styling changes.
- **Admin pages:** out of scope (admin has its own `theme-toggle` in `admin/js/admin-ui.js`).
- **No HTML restructuring** of the nav list; no icon library changes.

## 5. Suggested task order
1. `_variables.scss` tokens → 2. `_layout.scss` navbar/container/links →
3. theme switch modernization → 4. hero compensation → 5. mobile dropdown legibility fix →
6. `js/main.js` scroll init + threshold → 7. compile SCSS, `node --check`, grep verification →
8. browser QA matrix.