# Project Overview: Hills of Glory International Christian Center Inc. Website & Admin CMS

This repository contains the official website and Admin CMS for Hills of Glory International Christian Center Inc. The goal is to build a fast, accessible, lightweight, and modern web application with a secure admin dashboard.

---

## 1. Tech Stack
- **Frontend:** Vanilla HTML5, SCSS (Sass), jQuery
- **Backend / Database:** Supabase (JavaScript Client, Database, Auth, Storage)
- **Icons & Fonts:** Strictly Lucide Icons (SVG or webfont) across the entire project. Google Fonts ("Outfit" for brand headings).

---

## 2. Design System & Brand Guidelines

### Color Palette & Theming
- The application must support a seamless Light and Dark mode using CSS custom properties (e.g., `var(--color-bg)`), toggled via a `data-theme` attribute on the `<html>` or `<body>` tag.
- **Aesthetic Core:** The entire website must be colorful, vibrant, and modern. The primary and secondary colors must stand out prominently. Incorporate background blurs and glassmorphic background elements for a layered, tactile feel.
- **Light Mode Background:** Vibrant Modern. Avoid plain white walls. Use warm, breathable base tones and glassmorphic section backgrounds that utilize gentle gradients or low-opacity washes of the primary/secondary colors with background blurs to create depth.
- **Dark Mode Background:** Deep Charcoal (`#121212` or `#18181B`). Avoid pitch black (`#000000`). Use subtle, low-opacity washes of the primary/secondary colors with blurred glassmorphic overlays to create depth.
- **Primary Accent:** Green (`#336303` in light, adjust brightness slightly for dark mode contrast if necessary).
- **Secondary Accent:** Golden Yellow (`#e19d37`).
- **Text Colors:** Dark Charcoal (`#1A1A1A`) for light mode, and Off-White/Soft Gray (`#EAEAEA`) for dark mode readability.

### Typography Rules
- The brand title **"Hills of Glory International Christian Center Inc."** must always use the **Outfit** font family.
- Body text should use a clean, legible sans-serif font (for example, `Outfit`, `Inter`, or `system-ui`).

---

## 3. Design & Skill Instructions

You have access to active skill folders inside `.claude/skills/`. Read the instructions in these folders to guide your work.

### Impeccable Design System
- Path: `.claude/skills/impeccable/`
- Before finishing any UI task, check this folder to fix spacing, color contrast, typography, and card layouts.
- Follow the rules in `.claude/agents/impeccable-finish-reviewer.md` when reviewing completed work.

### Motion & Micro-Interactions (Emil Kowalski)
- Paths: `.claude/skills/emil-design-eng/`, `.claude/skills/animate/`, `.claude/skills/review-animations/`
- **Quality Standard:** Do not use generic, floaty "AI" fades or linear transitions. Animations must feel tactile, deliberate, and premium.
- **Spring Physics:** Apply natural spring physics using CSS custom properties or advanced `cubic-bezier()` timing curves (e.g., `cubic-bezier(0.32, 0.72, 0, 1)` for snappy, frictionless movement).
- **Accessibility:** Always wrap heavy or layout-shifting animations, background videos, and glassmorphic blurs in `@media (prefers-reduced-motion: reduce)` and `@media (prefers-reduced-transparency: reduce)` to prevent motion sickness and ensure legibility for sensitive users. Provide static fallbacks.

### UI Selection & Utilities
- Paths: `.claude/skills/pick-ui-library/`, `.claude/skills/ask-sonner/`
- Check these files when picking component libraries or adding toast notifications.

---

## 4. Architectural & Skill Adaptations for Non-React Stack

### Skill Adaptations
- **Icons:** Use Lucide Icons exclusively for UI icons across public pages and the admin dashboard.
- **Toast Notifications:** Do NOT import React Sonner. Use custom HTML/SCSS toast containers triggered via jQuery or a lightweight vanilla JS library (like Toastify).
- **Animations:** Implement spring physics using standard SCSS keyframes, transition utilities, or `cubic-bezier()` curves instead of Framer Motion.

### Project File Structure & Routing
Stick to this layout for all code and assets. Standard HTML routing with explicit extensions (`.html`) must be used for all links (e.g., `<a href="/about.html">`).
- Public pages: `index.html`, `about.html`, `ministries.html`, `sermons.html`, `events.html`, `lifegroups.html`, `locations.html`, `give.html`, `contact.html`
- Admin portal:
  - `admin/login.html`
  - `admin/dashboard.html`
  - `admin/js/admin-auth.js`
  - `admin/js/admin-cms.js`
- Styling:
  - `scss/main.scss` (imports `_variables.scss`, `_animations.scss`, `_components.scss`, `_layout.scss`, `_admin.scss`)
  - `css/main.css` (compiled output)
- Scripts:
  - `js/supabase-client.js`, `js/main.js`
- Local Media:
  - `images/` (Store all static, hardcoded design assets and poster fallbacks here).
  - `videos/` (Store local, static video files here, such as default hero backgrounds).

### CSS Naming Convention
- Use BEM (Block Element Modifier) for all custom SCSS classes (for example, `.navbar__link--active`, `.card__title`).

### Supabase Setup & Security Rules
- **Authentication:** Admin route protection must check active Supabase Auth user sessions. Unauthenticated users visiting `admin/dashboard.html` must be redirected to `admin/login.html`.
- **Row Level Security (RLS):** Public users have read-only access (`SELECT`) to site content, settings, and public records. Only authenticated admin users can insert, update, or delete records.
- **Database Tables:**
  - `profiles`: Admin user roles and permissions.
  - `church_settings`: Global single-row configuration (main_address, contact_email, contact_phone, bank_details, facebook_url, instagram_url, youtube_url, x_url).
  - `site_content`: Dynamic text blocks and general page settings, including `hero_video_url` for the main landing page.
  - `leadership_team`: Name, role, bio, image_url, sort_order.
  - `ministries`: Name, category (Worship, General, Campus), description, image_url, contact_person, target_school (for campus ministries).
  - `sermons`: Youtube URL, title, speaker, date, description.
  - `lifegroups`: Group name, leader_name, location, meeting_time, contact_info.
  - `locations`: Campus name, location_type (Main, Outreach), address, Google Maps embed link, status.
  - `service_schedules`: Day, time, location_id, service_name.
  - `prayer_requests`: Visitor name, request text, date submitted (public inserts allowed).
  - `ministry_join_requests`: Visitor name, contact info, ministry_of_interest, date submitted (public inserts allowed).
- **Storage Buckets:**
  - `website-images`: Public Supabase bucket for dynamically uploaded content via the CMS (card images, location photos, leadership profiles, ministry images, dynamic hero videos). Static design media belongs in the local `images/` or `videos/` folders.

---

## 5. Coding Rules for AI Assistant

### HTML
- Use semantic HTML5 elements (`<header>`, `<main>`, `<section>`, `<article>`, `<footer>`, `<nav>`).
- Always include standard accessibility attributes (`aria-label`, `alt` tags on images).

### Icons
- **Proportional Sizing:** All Lucide icons must be sized proportionally and consistently relative to their accompanying text. Use `width` and `height` values that scale with the font-size of the surrounding content (e.g., `1em`, `1.2em`, or matching the line-height of the adjacent text). Avoid arbitrary fixed pixel sizes for icons that sit inline with text.

### Sass / CSS
- Write modular Sass files.
- Store color codes, theme settings, and font settings inside Sass variables (`_variables.scss`), and map them to CSS custom properties (`:root` and `[data-theme="dark"]`) to handle real-time theme switching.
- Follow a mobile-first responsive design approach using media queries.
- Respect `prefers-reduced-motion` and `prefers-reduced-transparency` for all non-essential hover, scroll, transition effects, background blurs, and looping videos. Provide graceful static visual fallbacks.

### jQuery & JavaScript
- Keep DOM manipulation light, readable, and well-commented.
- Initialize the Supabase client in `js/supabase-client.js`.
- Never expose sensitive Supabase service-role keys in frontend JavaScript. Only use public anon keys.
- **Dynamic Content Switching:** Use jQuery event listeners to handle UI interactions, such as dynamically displaying `service_schedules` when a user clicks on a specific location or outreach card without reloading the page.
- **Data Pagination & Limits:** When fetching records for `sermons` or `lifegroups`, apply Supabase `.limit()` queries (e.g., load 10 at a time) or implement basic pagination to keep frontend rendering fast as the church grows.
- **Form Spam Prevention:** Implement a honeypot field or basic client-side rate-limiting for the public Prayer Request and Ministry Join forms to prevent bot spam before inserting data into Supabase.
- **Media Optimization:** Admin CMS scripts must enforce client-side file size limits (e.g., Max 2MB for images) for uploads to the Supabase buckets to maintain fast page load speeds. 

### Prohibited Patterns
- **No Heavy Frameworks:** Do NOT introduce React, Vue, Tailwind CSS, or build tools like Vite unless explicitly asked.
- **No Direct Inline Styles:** Keep styling inside `.scss` files.