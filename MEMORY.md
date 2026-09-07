# Hills of Glory ICC — Project Memory

_Last updated: 2026-09-06 (session 3)_

## 1. Current Progress

Site build complete; Phases 1–5 done. All 11 public pages + admin CMS built, SCSS
compiles, JS reconciled with DOM IDs. Database schema has been consolidated into a
canonical `supabase/schema.sql` plus a `004_fixes.sql` migration for the live DB.

Still blocked on the same thing: **no Supabase Auth admin user exists**, so no CMS
write path can be tested. `supabase/seed_admin.sql` now automates that step (looks
the auth user up by email — no UUID to copy).

Recent branding + content work (session 3) wrapped: two new public pages
(`discipleship.html`, `hla.html`) are live, `index.html` was restructured with
"God's Purpose" and "Prayer of Acceptance" sections, `Sermons` was dropped from nav,
`Locations` was renamed to `Outreaches`, and the `Apply Now` button text was
globally swapped to `Enroll Now`.

## 2. Key Decisions

- `is_admin()` SECURITY DEFINER avoids RLS recursion. Do not inline the subquery
  back into a policy.
- Admin seeding is manual via SQL Editor; no service-role key in the repo.
- `profiles.id` is a FK to `auth.users(id)` with **no default** — a random default
  UUID could never match `auth.uid()`, which silently locked out the CMS.
- Supabase SDK loads synchronously in `<head>`; a bare `supabase` global is exposed
  for the admin scripts.
- Spring easing only; no gradient text; no side-tab borders.
- Ministry categories: Worship/General/Campus. Lifegroup types: men/women/youth/children.
- Settings save is an UPDATE, never an INSERT. `church_settings` is pinned to the
  constant id `00000000-0000-0000-0000-000000000001` by a CHECK constraint (see
  `005`), which with the primary key makes "at most one row" a DB invariant and
  makes `upsert` on that id safe. The old BEFORE INSERT trigger that raised
  `P0001 Only one row allowed` is dropped by `005`.
- `events.html` is static (no events table).
- Lifegroup filtering is **server-side** (`.eq('group_type', …)`), not card hiding —
  with pagination, client-side hiding and the page count disagree.
- Pagination asks for `PAGE_SIZE + 1` rows via `.range()` to detect "has more"
  without a second count query.
- `church_settings.hero_video_url` is the live column; `site_content.hero_video_url`
  is unused (kept only because the PRD names it).

### Branding & Typography (session 3)

- **"HILLS OF GLORY" text** in header and footer uses **Outfit ExtraBold 800**,
  uppercase, bolder weight — applied across all 13 HTML files.
- **navbar__title color** set to teal `#1d4a43`.
- **Brand icon:** `hills.svg` replaces `hills_ic.png` everywhere (public pages,
  admin pages, and new `hla.html`).
- **Default theme:** light mode. System-preference media query is ignored on first
  visit; the dark-mode toggle persists the user's choice via the `data-theme`
  attribute on `<html>`.
- **Color palette** unchanged on paper: primary green `#336303`, secondary golden
  yellow `#e19d37`, dark-mode charcoal `#121212`/`#18181B`, text `#1A1A1A` (light)
  and `#EAEAEA` (dark). All applied via CSS custom properties.
- **Aesthetic direction:** minimalist. Avoid card overuse; lean on typography,
  whitespace, and glassmorphic section backgrounds for hierarchy.
- **Button text:** `Enroll Now` replaces `Apply Now` globally.

### Navigation Changes (session 3)

- `Sermons` link removed from navbar + footer (page file retained but orphaned).
- `Locations` → `Outreaches` in navbar and footer.
- `Discipleship` link added to navbar + footer (points to `discipleship.html`).
- `js/main.js` mobile-menu logic reworked:
  - Click-**outside** closes the menu (was backdrop-only).
  - Body **scroll lock** engaged while menu is open (was none).
  - `Escape` key closes the menu.
  - `.navbar__backdrop` removed entirely; navbar has **no shadow** on mobile.
  - Desktop dark-mode toggle positioned far-right with adequate left margin.
- `login.html` → `admin/` global refactor: all 10 public HTML files + 2 admin files
  updated so auth links point to `admin/index.html`.

### New Pages (session 3)

- `discipleship.html` — 5-point numbered "God's Purpose" list, "Prayer of
  Acceptance" with "Find Your Lifegroup" CTA, and `Enroll Now` buttons.
- `hla.html` — HLA (Hills of Glory Academy) logo + a 4-image gallery
  (`images/hla-*.webp`).

### New `index.html` Sections (session 3)

- **"God's Purpose"** — 5-point numbered list describing the church's vision.
- **"Prayer of Acceptance"** — prayer of salvation text + "What's Next Step"
  subsection + "Find Your Lifegroup" CTA button.
- **Relocated CTA cards** — the three "Join a Lifegroup" cards were moved out of
  their old hero-area spot and into the Prayer of Acceptance section as a natural
  follow-up to the salvation prayer.

## 3. Completed Items (Done)

### Earlier sessions

- Phase 1 + 2 complete (DB, RLS fixed, migrations 001/002/003 ran; public inserts 201).
- All 11 public pages rewritten (design system, consistent header/footer, correct IDs).
- Admin pages rewritten (`admin/index.html` = login; dashboard with sidebar, cards,
  theme toggle, mobile backdrop).
- SCSS rebuilt; `css/main.css` compiled clean; filters/accordion/toast/video-modal +
  admin components added.
- `js/main.js` reconciled; `js/supabase-client.js` race fixed; `admin/js/admin-ui.js`
  added; navigation guard + module-scope loaders restored; settings uses UPDATE by id.

### Session 2 (schema consolidation)

- **Schema consolidated.** `supabase/schema.sql` is now the canonical source of
  truth (supersedes 001+002+003), fully idempotent and re-runnable.
  `supabase/004_fixes.sql` migrates the existing DB to match.
  `supabase/seed_admin.sql` bootstraps the admin. `supabase/README.md` says which
  to run. 001–003 kept as history.
- **Schema fixes folded in:** profiles→auth.users FK; admin DELETE on
  `prayer_requests`; admin UPDATE+DELETE on `ministry_join_requests` (the `status`
  column was previously unwritable); least-privilege GRANTs replacing 003's
  `GRANT ALL … TO anon`; missing `site_content` updated_at trigger; storage bucket
  2 GB → 50 MB + MIME allowlist (no SVG); guarded seeds so re-runs don't trip the
  single-row trigger; indexes for the paginated queries.
- **Fixed two invalid CSS declarations.** `rgba(var(--color-primary), …)` cannot
  work — Sass passes `var()` through and the browser rejects `rgba(#hex, alpha)`.
  Added `--color-primary-rgb` channel triplets (light + dark) and switched
  `.section-badge` border and `.form__input:hover` border-color to use them.
- **Added `[hidden] { display: none !important }`** to the base reset — `.btn`'s
  `display: inline-flex` was beating the UA stylesheet, so a `hidden` button
  would still have rendered.
- **Pagination on sermons and lifegroups** (`PAGE_SIZE = 9`), with a Load more
  button, spinner state, fixed button width, and a request-generation token so a
  filter change mid-flight can't be swallowed or overwritten by a stale reply.
- **Hero video:** `npm run optimize:video` / `:webm` / `:poster` added.
  `index.html` now lists `hero.webm` → `hero.mp4` → original as `<source>`
  fallbacks, so it self-heals once the derivatives exist.
- Fixed broken `images/worship.png` reference in `sermons.html` → `images/music2.png`.
- **Fixed the settings-save 400 (P0001).** Root cause was variable shadowing, not
  SQL: `admin-cms.js` had two `loadSettings` functions, and under `'use strict'`
  the inner one (line 230, the only place `settingsRowId` was ever assigned) was
  block-scoped to `if (settingsForm) {…}`. `initCMSData()` called the
  module-level one instead, so `settingsRowId` stayed `null` and every save took
  the INSERT branch. Deleted the shadowed loader and `settingsRowId`; the save is
  now a single `.upsert({ id: SETTINGS_ID, ...payload })` against the singleton
  id, with P0001 / 23514 / 42501 mapped to actionable toast messages
  (unmigrated DB / id mismatch / not an admin).
- **Added `005_settings_singleton.sql`** — retires the single-row trigger in
  favour of a constant PK + CHECK. `schema.sql` and `supabase/README.md` updated
  to match. The settings form now depends on it having been run.

### Session 3 (branding + content restructure)

- **Brand icon deployed** — `hills.svg` replaces `hills_ic.png` across all 13 HTML
  files (10 public + 2 admin + `hla.html`).
- **Typography locked** — `Outfit ExtraBold 800`, uppercase for "HILLS OF GLORY"
  in header and footer; `navbar__title` color set to `#1d4a43`.
- **Theme defaulting** — light mode is the default; system preference is not
  honoured on first visit. Dark-mode toggle persists via `data-theme`.
- **Navigation refactored** — `Sermons` removed; `Locations` → `Outreaches`;
  `Discipleship` added (all nav + footer).
- **`login.html` → `admin/` refactor** — all 10 public HTML files + 2 admin files
  updated to point at `admin/index.html`.
- **Navbar behaviour fixed** — click-outside closes menu; body scroll lock on
  open; Escape closes; `.navbar__backdrop` removed; no mobile shadow; desktop
  toggle positioned far-right.
- **Video modal overflow fixed** — viewport constraints + `overflow-x: hidden` on
  `html`/`body`; static poster fallback for reduced-motion users.
- **Broken image links replaced** — 5 missing references mapped to existing
  assets (e.g. `images/worship.png` → `images/music2.png` in `sermons.html`).
- **Button text global swap** — `Apply Now` → `Enroll Now` everywhere.
- **`discipleship.html` created** — "God's Purpose" 5-point numbered list,
  "Prayer of Acceptance" with "Find Your Lifegroup" CTA, `Enroll Now` buttons.
- **`hla.html` created** — HLA logo + 4-image gallery (`images/hla-*.webp`).
- **`index.html` restructured** — "God's Purpose" and "Prayer of Acceptance"
  sections added; "Join a Lifegroup" CTA cards relocated into Prayer of
  Acceptance.
- **Mobile HLA logo padding fixed** at 640 px / 480 px breakpoints.
- **SCSS compiled cleanly.** `node --check` on `js/main.js` pending.

## 4. Next Steps (To-Do)

1. **Run `npm run build:css`** — confirm a fresh compile of `css/main.css` matches
   all hand-edits from sessions 2 + 3.
2. **Run `node --check`** on `js/main.js` — the session-3 pagination/mobile-menu
   rewrite was not syntax-verified yet.
3. **Run `supabase/005_settings_singleton.sql` — now a hard prerequisite.** The
   settings form saves via `.upsert({ id: SETTINGS_ID, ... })`, which only works
   once that migration has pinned the row to the constant id. Order:
   `004_fixes.sql` (read its section 1 first — it contains a DELETE on
   `profiles`) → `005_settings_singleton.sql` → `seed_admin.sql`.
4. Uncomment section 8 of `004_fixes.sql` to clear the 2 `__conn_test__` rows.
5. **Re-verify mobile responsiveness** of the new God's Purpose + Prayer of
   Acceptance sections, and the relocated Lifegroup CTA cards.
6. **Test full CMS CRUD + storage uploads** with the admin session.
7. Run `npm run optimize:video` (needs ffmpeg) — the hero video is still 43 MB.
8. `git init` — this is not a repo yet, so there's no rollback before deploy.
9. Deploy to hosting.

## 5. Known Gaps (not yet addressed)

- The CMS can set `church_settings.hero_video_url`, but `index.html` hardcodes the
  video path — nothing reads that column on the public site.
- `admin/js/admin-cms.js` lifegroups/sermons lists are still `.limit(10)` with no
  pagination (admin-side only; the public pages are done).
- `sermons.html` has an inline `style="text-align: center;"`, which AGENTS.md
  prohibits.
- `TASKS.md` checkboxes are all still unticked despite Phases 1–5 being complete.
- **CTA flow wiring:** the "Find Your Lifegroup" button in Prayer of Acceptance
  → `lifegroups.html` redirect is in place, but the end-to-end funnel (Prayer of
  Acceptance → "What's Next Step" → Find Your Lifegroup → filter by
  `group_type` on the destination page) has not been user-tested.
- No service-role key in the repo; admin seeding requires manual SQL Editor
  execution — the CMS write path stays untestable until that's done.

(End of file)
