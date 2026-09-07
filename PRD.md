# Product Requirements Document (PRD)

## Project Title
Hills of Glory International Christian Center Inc. Website & Admin CMS

---

## 1. Executive Summary
The goal of this project is to build a fast, accessible, and modern web application for Hills of Glory International Christian Center Inc. The site must break away from "bland corporate white" and deliver a vibrant, colorful, visually rich experience with premium, tactile animations, background blurs, and glassmorphic designs.

The project includes two main parts:
1. **Public Website:** A welcoming front door for visitors and church members.
2. **Admin CMS (Content Management System):** A secure dashboard for church admins to update website content, dynamic settings, service schedules, sermons, and Lifegroups without editing code.

---

## 2. Target Audience
- **First-time Visitors:** People looking for service times, church locations, beliefs, ministries, and Lifegroups.
- **Church Members:** Members watching sermons, checking upcoming events, and submitting prayer or ministry join requests.
- **Church Admins:** Staff who manage website text, images, videos, church schedules, and global settings.

---

## 3. Core Features & Scope

### Public Website Pages
1. **Global Header & Footer**
   - **Header:** Main navigation links and a Theme Toggle (a sleek, animated sun/moon icon) allowing users to manually switch between Light and Dark mode.
   - **Footer:** Dynamic contact information, quick links, and Social Media links (Facebook, Instagram, YouTube, X/Twitter) fetched from the database.

2. **Home Page (`index.html`)**
   - Hero section with a colorful, vibrant design, overlaying a muted, autoplayed, and looped background video. Provide a static poster image fallback.
   - Dynamic service schedule section.
   - Featured cards with customizable images and text.
   - Latest sermon video player.

3. **About Us Page (`about.html`)**
   - Mission, vision, and statement of belief.
   - Dynamic Leadership and pastoral team cards pulled from the database.

4. **Ministries Page (`ministries.html`)**
   - Dedicated sections for **Worship Team**, general **Ministries**, and **Campus Ministries**.
   - Visually engaging descriptions and photos for each ministry branch.
   - **"Join a Ministry" Form:** A dedicated form allowing visitors to submit their name, contact info, and select which ministry they are interested in joining.

5. **Lifegroups Page (`lifegroups.html`)**
   - Directory of Bible study groups (Lifegroups).
   - Filters for meeting locations, days, and group types.

6. **Sermons & Media Page (`sermons.html`)**
   - List of sermons pulled from Supabase.
   - Embedded YouTube video players and sermon descriptions.

7. **Locations & Services Page (`locations.html`)**
   - Interactive list featuring the main church campus and all outreaches (daughter churches).
   - Properly grouped and visually structured (e.g., separating the Main Campus from Outreaches in pleasing glassmorphic UI cards).
   - **Dynamic Schedules:** Clicking on a specific location or outreach card dynamically reveals its associated service schedules and meeting times.

8. **Contact & Prayer Request Page (`contact.html`)**
   - Contact details populated from church settings and an online prayer request form.

9. **Giving Page (`give.html`)**
   - Information on tithes, offerings, and dynamic bank details fetched from the database.

---

### Admin CMS Features (`admin/dashboard.html`)
An authenticated area restricted to authorized church administrators.

1. **Authentication**
   - Secure admin login using Supabase Auth (Email and Password).

2. **Church Settings & Contact Manager**
   - Update global church contact info (Main church address, email, phone number).
   - Update bank details and giving instructions (populates the giving page).
   - **Manage Social Media Links:** Input URLs for the church's official social media accounts (Facebook, Instagram, YouTube, X) to dynamically populate the public footer.
   - **Manage Site Video:** Update the hero video URL for the home page.

3. **Leadership & Pastoral Team Manager**
   - Add/edit/delete leadership profiles (name, role, bio).
   - Upload and crop profile pictures.

4. **Ministries & Campus Ministries Manager**
   - Add/edit/delete ministries and assign categories (Worship, General, Campus).
   - Set contact persons and target schools/universities for campus ministries.
   - Upload ministry feature images.

5. **Locations & Outreaches Manager**
   - Add new main campuses or outreaches (daughter churches).
   - Assign a location type (Main vs. Outreach) to control frontend organization.
   - Manage associated service schedules and times under each specific location.

6. **Lifegroups Manager**
   - Add, edit, or remove Bible study groups (group name, leader name, schedule, location, contact details).

7. **Sermons & Video Manager**
   - Add new sermons with YouTube link, title, speaker name, date, and description.
   - Edit or delete past video entries.

8. **Prayer & Ministry Requests Viewer**
   - View submitted prayer requests from visitors.
   - View submissions from the "Join a Ministry" form to follow up with interested volunteers.

---

## 4. Technical & Design Requirements

### Design & UX Quality
- **Vibrant Aesthetic:** Move completely away from plain white backgrounds. Utilize warm undertones, bright primary (Green) and secondary (Golden Yellow) accents, glassmorphic UI components, and rich background blurs to create a vibrant, lively feel in both themes.
- **Dark Mode Support:** Full system-preference detection (`prefers-color-scheme`) paired with a manual user override that saves the preference to `localStorage`.
- **Premium Interactions:** UI elements must react instantly and organically using custom spring physics and tailored `cubic-bezier` transition curves. Avoid generic animations.
- **Accessibility Integration:** Respect `prefers-reduced-motion` and `prefers-reduced-transparency` by gracefully falling back to static visual states (disabling background videos, heavy animations, and expensive CSS blurs).

### Stack & UI Libraries
- **Frontend:** HTML5, SCSS (Sass), jQuery
- **Icon Library:** Strictly Tabler Icons (SVG or webfont)
- **Backend & Database:** Supabase (Database, Auth, and File Storage for uploaded images/videos)

### Database Tables (Supabase)
- `profiles`: Admin user roles and permissions.
- `church_settings`: Global configuration (address, email, phone, bank_details, facebook_url, instagram_url, youtube_url, x_url).
- `site_content`: Dynamic text blocks and general page settings, including `hero_video_url`.
- `leadership_team`: Name, role, bio, image_url, sort_order.
- `ministries`: Name, category, description, image_url, contact_person, target_school.
- `sermons`: Youtube URL, title, speaker, date, description.
- `lifegroups`: Group name, leader_name, location, meeting_time, contact_info.
- `locations`: Campus name, location_type, address, Google Maps embed link, status.
- `service_schedules`: Day, time, location_id, service_name.
- `prayer_requests`: Visitor name, request text, date submitted.
- `ministry_join_requests`: Visitor name, email/phone, ministry_of_interest, status, date submitted.

### Storage Management
- **Local Folders (`images/` and `videos/`):** Store all hardcoded, non-dynamic site design assets and static poster fallbacks here.
- **Supabase Storage (`website-images` bucket):** A public bucket reserved for admin-uploaded dynamic content (card images, location photos, leadership profiles, dynamic background videos, ministry images).

---

## 5. Non-Functional Requirements
- **Ease of Use:** Simple admin interface designed for non-technical users.
- **Fast Loading:** Efficient file uploads with client-side size limits enforced before upload. Use poster image fallbacks for background videos.
- **Security:** Strict Supabase Row Level Security (RLS) rules so only logged-in admins can edit data. Forms must include basic spam prevention (honeypots or rate-limiting).
- **Accessibility:** Ensure semantic HTML5, aria labels, and respect for visual media queries to disable heavy UI effects for sensitive users.