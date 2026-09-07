# Development Tasks

## Phase 1: Project Setup and Configuration
- [ ] Create the project folder and define the directory structure.
- [ ] Configure standard local development server routing.
- [ ] Create `images` and `videos` folders for static design media. 
- [ ] Create all necessary empty HTML files for public pages (`index.html`, `about.html`, `ministries.html`, `sermons.html`, `events.html`, `lifegroups.html`, `locations.html`, `give.html`, `contact.html`).
- [ ] Create the `admin/` folder and its related files (`login.html`, `dashboard.html`).
- [ ] Setup the `scss/` folder and map vibrant Light and Dark mode colors, glassmorphic styles, spring curves, and fonts to CSS custom properties in `_variables.scss`.
- [ ] Create remaining SCSS partials (`_animations.scss`, `_base.scss`, `_layout.scss`, `_components.scss`, `_admin.scss`).
- [ ] Configure SCSS compiler (VS Code Live Sass Compiler or NPM script).
- [ ] Initialize Supabase project in the Supabase dashboard.
- [ ] Add the Supabase CDN link and create `js/supabase-client.js` with the public anon key.

## Phase 2: Database and Security
- [ ] Create the `church_settings` (including `x_url`), `site_content` (including `hero_video_url`), and `leadership_team` tables and apply Row Level Security (RLS) rules.
- [ ] Create the `ministries` table and apply RLS rules.
- [ ] Create the `locations` and `service_schedules` tables and apply RLS rules.
- [ ] Create the `lifegroups` and `sermons` tables and apply RLS rules.
- [ ] Create the `prayer_requests` and `ministry_join_requests` tables (allow public inserts) and apply RLS rules.
- [ ] Set up the `website-images` storage bucket for public reading and admin-only uploads (for dynamic media like leadership profiles, background videos, and location photos).
- [ ] Create an initial Admin user account in Supabase Authentication. *(Script: `npm run seed:admin`)*
- [ ] Run the SQL migrations in the Supabase dashboard SQL Editor and configure real keys in `js/supabase-client.js`.

## Phase 3: Public Website UI Development
- [ ] Build the global Header layout, incorporating smooth, spring-based scroll or hover interactions, glassmorphic backgrounds, and add a Dark Mode toggle button.
- [ ] Build the global Footer layout, including dynamic contact details and Tabler Icons for Facebook, Instagram, YouTube, and X.
- [ ] Write jQuery logic in `js/main.js` to handle theme toggling, respect system defaults, and save user preference to `localStorage`.
- [ ] Implement mobile menu toggle using jQuery with a snappy, non-linear transition.
- [ ] Build the Home Page (`index.html`) layout. Include a vibrant, colorful Hero section featuring a muted, autoplayed, looped video background (with a static poster image fallback from `images/`).
- [ ] Build the About Us Page (`about.html`), incorporating the Statement of Belief and mapping out dynamic leadership cards.
- [ ] Build the Ministries Page (`ministries.html`) with dedicated sections for Worship Team, Ministries, and Campus Ministries.
- [ ] Build the "Join a Ministry" form UI with interactive, tactile input focus states.
- [ ] Build the Locations and Services Page (`locations.html`), ensuring Main Campus and Outreaches (daughter churches) are grouped properly.
- [ ] Design the UI interaction to dynamically display service schedules when a user clicks a location, using a premium expanding animation.
- [ ] Build the Lifegroups Directory (`lifegroups.html`) with basic UI filters.
- [ ] Build the Sermons Page (`sermons.html`) with YouTube video embed placeholders.
- [ ] Build the Giving Page (`give.html`) with dynamic bank details and donation options.
- [ ] Build the Contact Page (`contact.html`) with the Prayer Request form UI.
- [ ] Build the Events Page (`events.html`).
- [ ] Review all pages against the design guidelines to verify spacing, contrast, vibrant colors, glassmorphic rendering, natural spring motion, Dark Mode legibility, and compliance with `prefers-reduced-motion` and `prefers-reduced-transparency`.

## Phase 4: Admin CMS Development
- [ ] Build the Admin Login Page (`admin/login.html`).
- [ ] Write authentication logic in `admin/js/admin-auth.js` to log users in and protect the dashboard.
- [ ] Build the Admin Dashboard UI (`admin/dashboard.html`) using Tabler Icons for the sidebar menu.
- [ ] Create the "Church Settings" module (Update global address, email, phone, bank details, site hero video URL, and social media URLs including X).
- [ ] Create the "Manage Leadership" module (Upload pictures, add names/roles/bios).
- [ ] Create the "Manage Ministries" module (Handle Worship, General, and Campus categories with contact persons and target schools).
- [ ] Create the "Manage Locations and Services" module, including a toggle/select field for "Main Campus" vs "Outreach" and their specific schedules.
- [ ] Create the "Manage Lifegroups" module (Set leaders and contact details).
- [ ] Create the "Manage Sermons" module (Add, edit, delete YouTube links and details).
- [ ] Create the "View Requests" module to read submissions from visitors for both prayer and ministry join forms.
- [ ] Add custom SCSS/HTML Toast notifications for success and error messages on admin actions.
- [ ] Implement client-side optimization in Admin CMS scripts (enforce file size limits before uploading media to Supabase).

## Phase 5: Integration and Data Fetching
- [ ] Write jQuery logic to fetch `church_settings` and populate the global footer, Contact Page, Give Page, and hero video configuration.
- [ ] Fetch and render `leadership_team` profiles dynamically on the About Us Page.
- [ ] Fetch and render `ministries` (grouped by category) on the Ministries Page.
- [ ] Fetch and render locations on the Locations Page, and write jQuery logic to dynamically fetch/display `service_schedules` by `location_id` when a card is clicked.
- [ ] Fetch and render active Lifegroups on the Lifegroups Page (apply Supabase `.limit()` queries for basic pagination).
- [ ] Fetch and render recent sermons on the Home Page and Sermons Page (apply `.limit()` queries).
- [ ] Connect the Prayer Request and "Join a Ministry" forms to insert data into their respective tables, implementing honeypot fields or basic rate-limiting to prevent bot spam.

## Phase 6: Final Review and Launch
- [ ] Test website responsiveness across mobile, tablet, and desktop screens.
- [ ] Test Admin CMS login and comprehensive CRUD data entry.
- [ ] Verify that all internal links use standard paths and extensions explicitly.
- [ ] Check console for JavaScript errors or failed network requests.
- [ ] Verify animations run smoothly and gracefully degrade for users with reduced motion or transparency preferences.
- [ ] Deploy the static site files to a hosting provider (like Vercel, Netlify, or GitHub Pages).