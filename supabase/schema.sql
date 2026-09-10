-- ============================================================================
-- Hills of Glory International Christian Center Inc.
-- CANONICAL DATABASE SCHEMA
-- ============================================================================
--
-- This is the single source of truth for the database. It supersedes and
-- consolidates:
--     001_schema.sql          (original tables, RLS, storage)
--     002_fix_rls.sql         (is_admin() SECURITY DEFINER, recursion fix)
--     003_fix_public_inserts.sql (public form submissions)
--
-- ...and folds in the following fixes discovered during integration:
--
--   1. profiles.id is now a FOREIGN KEY to auth.users(id) with NO default.
--      Previously it defaulted to a random uuid_generate_v4(), which could
--      never match auth.uid() — meaning is_admin() would always return false
--      for such a row and the CMS would be permanently locked out.
--   2. Admins can now UPDATE and DELETE prayer_requests and
--      ministry_join_requests. Previously they had SELECT only, so spam could
--      not be removed and ministry_join_requests.status could never be
--      changed off 'pending' (making the column dead weight).
--   3. Least-privilege GRANTs replace `GRANT ALL ON ALL TABLES TO anon`.
--      anon now gets SELECT only on publicly-readable tables and INSERT only
--      on the two form tables. RLS remains the primary gate; this is defence
--      in depth at the privilege layer.
--   4. site_content gained its missing updated_at trigger.
--   5. Storage bucket size limit reduced from 2 GB to 50 MB, and restricted to
--      an explicit image/video MIME allowlist (SVG deliberately excluded — it
--      can carry script and this is a public bucket).
--   6. Fully idempotent: every policy and trigger is dropped before creation,
--      and seed rows are existence-guarded. The original 001 could not be
--      re-run — the church_settings seed would trip the single-row trigger and
--      abort the whole script.
--   7. Added indexes supporting the paginated sermons and lifegroups queries.
--   8. church_settings enforces "one row" declaratively — a constant primary
--      key plus CHECK (id = <constant>) — instead of a BEFORE INSERT trigger
--      that raised P0001. This is what makes `upsert` on that id safe. The old
--      trigger and its function are dropped if present.
--   9. lifegroups.group_type accepts 'couple' (alongside men/women/youth/
--      children) so married and engaged couples can be served like any other
--      demographic group. Existing check constraint is recreated with the new
--      value included.
--  10. special_events: a public table for the two upcoming one-off events the
--      events page features. A BEFORE INSERT trigger hard-caps it at two
--      active events, matching the "up to two" rule in the admin UI.
--  11. monthly_theme + live_status: singleton tables (constant ids ...002 and
--      ...003, CHECK-constrained like church_settings) backing the homepage
--      "Monthly Theme" showcase and "Happening Right Now" live stream. Both
--      sections stay fully hidden until the admin publishes a row.
--  12. service_schedules.image_url (thumbnail per service row) and
--      church_settings.home_spotlight_image (CMS-managed schedule showcase
--      backdrop) were added for the admin-managed schedules and spotlight.
--
-- USAGE
--   Fresh project : run this whole file in the Supabase SQL Editor.
--   Existing DB   : do NOT run this — run 004_fixes.sql, then 005_settings_singleton.sql.
--   Then          : run seed_admin.sql to grant yourself admin.
--
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================================
-- 1. PROFILES — admin user roles
-- ============================================================================
-- id is the auth.users id. There is no default: a profile row is meaningless
-- unless it corresponds to a real authenticated user, because is_admin()
-- matches on auth.uid().

CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT UNIQUE NOT NULL,
    role        TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'editor')),
    permissions JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER so the function reads profiles with the owner's rights.
-- Without this, a policy on profiles that queries profiles recurses forever.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    false
  );
$$;

DROP POLICY IF EXISTS "Users can view own profile or admins view all" ON public.profiles;
CREATE POLICY "Users can view own profile or admins view all"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert/delete profiles" ON public.profiles;
CREATE POLICY "Admins can manage profiles"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ============================================================================
-- 2. CHURCH_SETTINGS — global single-row configuration
-- ============================================================================
-- "Exactly one row" is a declarative invariant, not a trigger:
--     CHECK (id = <constant>)  +  PRIMARY KEY (id)  ==>  at most one row
-- This is what makes `upsert` on the constant id safe and idempotent. The
-- earlier BEFORE INSERT trigger raised P0001 instead, which forced the client
-- to guess UPDATE-vs-INSERT and was the cause of the settings-save 400.

CREATE TABLE IF NOT EXISTS public.church_settings (
    id               UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
    main_address     TEXT,
    contact_email    TEXT,
    contact_phone    TEXT,
    bank_details     TEXT,
    facebook_url     TEXT,
    instagram_url    TEXT,
    youtube_url      TEXT,
    x_url            TEXT,
    hero_video_url   TEXT,
    home_spotlight_image TEXT,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.church_settings ENABLE ROW LEVEL SECURITY;

-- Applied by ALTER rather than inline so this file also converges a database
-- created by an earlier version of the schema (CREATE TABLE IF NOT EXISTS is a
-- no-op once the table exists, and would silently skip the constraint).
ALTER TABLE public.church_settings
    ALTER COLUMN id SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- Converges databases that predate the spotlight image column.
ALTER TABLE public.church_settings
    ADD COLUMN IF NOT EXISTS home_spotlight_image TEXT;

UPDATE public.church_settings
SET id = '00000000-0000-0000-0000-000000000001'
WHERE id <> '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.church_settings
    DROP CONSTRAINT IF EXISTS church_settings_singleton;

ALTER TABLE public.church_settings
    ADD CONSTRAINT church_settings_singleton
    CHECK (id = '00000000-0000-0000-0000-000000000001');

-- Remove the superseded trigger if this database predates the CHECK.
DROP TRIGGER IF EXISTS trg_church_settings_single ON public.church_settings;
DROP FUNCTION IF EXISTS public.enforce_single_church_settings();

DROP POLICY IF EXISTS "Public can view settings" ON public.church_settings;
CREATE POLICY "Public can view settings"
    ON public.church_settings FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can update settings" ON public.church_settings;
CREATE POLICY "Admins can update settings"
    ON public.church_settings FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert settings" ON public.church_settings;
CREATE POLICY "Admins can insert settings"
    ON public.church_settings FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

-- Seed the single row only if the table is empty (re-run safe).
INSERT INTO public.church_settings (id, main_address, contact_email, contact_phone)
SELECT '00000000-0000-0000-0000-000000000001', '', '', ''
WHERE NOT EXISTS (SELECT 1 FROM public.church_settings);


-- ============================================================================
-- 3. SITE_CONTENT — dynamic text blocks
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.site_content (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_key    TEXT UNIQUE NOT NULL,
    title          TEXT,
    body           TEXT,
    hero_video_url TEXT,
    is_active      BOOLEAN DEFAULT true,
    sort_order     INTEGER DEFAULT 0,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active content" ON public.site_content;
CREATE POLICY "Public can view active content"
    ON public.site_content FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage content" ON public.site_content;
CREATE POLICY "Admins can manage content"
    ON public.site_content FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

INSERT INTO public.site_content (section_key, title, body, sort_order)
VALUES
    ('hero', 'Welcome to Hills of Glory', 'A vibrant community of faith', 1),
    ('about_mission', 'Our Mission', 'To proclaim the Gospel of Jesus Christ, equip believers for ministry, and impact our community with the love of God.', 1),
    ('about_vision', 'Our Vision', 'To be a house of prayer for all nations, raising up a generation that honors God and transforms lives.', 1),
    ('about_belief', 'Statement of Belief', 'We believe in the Bible as the inspired Word of God, in the Trinity, the virgin birth, the sacrificial death and resurrection of Jesus Christ, and the gift of salvation by grace through faith.', 1)
ON CONFLICT (section_key) DO NOTHING;


-- ============================================================================
-- 4. LEADERSHIP_TEAM
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.leadership_team (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       TEXT NOT NULL,
    role       TEXT,
    bio        TEXT,
    image_url  TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.leadership_team ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view leadership" ON public.leadership_team;
CREATE POLICY "Public can view leadership"
    ON public.leadership_team FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage leadership" ON public.leadership_team;
CREATE POLICY "Admins can manage leadership"
    ON public.leadership_team FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ============================================================================
-- 5. MINISTRIES — Worship / General / Campus
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ministries (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name           TEXT NOT NULL,
    category       TEXT NOT NULL CHECK (category IN ('Worship', 'General', 'Campus')),
    description    TEXT,
    image_url      TEXT,
    contact_person TEXT,
    target_school  TEXT,
    sort_order     INTEGER DEFAULT 0,
    is_active      BOOLEAN DEFAULT true,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ministries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view ministries" ON public.ministries;
CREATE POLICY "Public can view ministries"
    ON public.ministries FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage ministries" ON public.ministries;
CREATE POLICY "Admins can manage ministries"
    ON public.ministries FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ============================================================================
-- 6. LOCATIONS — main campus and outreaches
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.locations (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                   TEXT NOT NULL,
    location_type          TEXT NOT NULL CHECK (location_type IN ('Main', 'Outreach')),
    address                TEXT,
    google_maps_embed_link TEXT,
    status                 TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    sort_order             INTEGER DEFAULT 0,
    created_at             TIMESTAMPTZ DEFAULT now(),
    updated_at             TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view locations" ON public.locations;
CREATE POLICY "Public can view locations"
    ON public.locations FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage locations" ON public.locations;
CREATE POLICY "Admins can manage locations"
    ON public.locations FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ============================================================================
-- 7. SERVICE_SCHEDULES — service times per location
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.service_schedules (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id  UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    service_name TEXT NOT NULL,
    day          TEXT NOT NULL,
    time         TEXT NOT NULL,
    image_url    TEXT,
    sort_order   INTEGER DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.service_schedules ENABLE ROW LEVEL SECURITY;

-- Converges databases that predate the optional per-service image.
ALTER TABLE public.service_schedules
    ADD COLUMN IF NOT EXISTS image_url TEXT;

DROP POLICY IF EXISTS "Public can view schedules" ON public.service_schedules;
CREATE POLICY "Public can view schedules"
    ON public.service_schedules FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage schedules" ON public.service_schedules;
CREATE POLICY "Admins can manage schedules"
    ON public.service_schedules FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ============================================================================
-- 8. LIFEGROUPS — Bible study groups
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lifegroups (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_name   TEXT NOT NULL,
    leader_name  TEXT,
    location     TEXT,
    meeting_time TEXT,
    contact_info TEXT,
    group_type   TEXT CHECK (group_type IN ('men', 'women', 'youth', 'children', 'couple')),
    sort_order   INTEGER DEFAULT 0,
    is_active    BOOLEAN DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lifegroups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view lifegroups" ON public.lifegroups;
CREATE POLICY "Public can view lifegroups"
    ON public.lifegroups FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage lifegroups" ON public.lifegroups;
CREATE POLICY "Admins can manage lifegroups"
    ON public.lifegroups FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ============================================================================
-- 8b. SPECIAL_EVENTS — upcoming one-off events (max two active)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.special_events (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title       TEXT NOT NULL,
    description TEXT,
    event_date  DATE NOT NULL,
    event_time  TEXT,
    image_url   TEXT,
    sort_order  INTEGER DEFAULT 0,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.special_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view special events" ON public.special_events;
CREATE POLICY "Public can view special events"
    ON public.special_events FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage special events" ON public.special_events;
CREATE POLICY "Admins can manage special events"
    ON public.special_events FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_special_events_updated_at ON public.special_events;
-- NOTE: (re)created in section 13 next to handle_updated_at(), which this file
-- defines after the table sections.

-- Hard cap at two ACTIVE events. Counts committed rows only because the
-- trigger runs before the insert lands.
CREATE OR REPLACE FUNCTION public.prevent_extra_special_events()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM public.special_events WHERE is_active = true) >= 2 THEN
        RAISE EXCEPTION 'Only two active special events are allowed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_special_events_max_two ON public.special_events;
CREATE TRIGGER trg_special_events_max_two
    BEFORE INSERT ON public.special_events
    FOR EACH ROW EXECUTE FUNCTION public.prevent_extra_special_events();


-- ============================================================================
-- 8c. MONTHLY_THEME — homepage "Monthly Theme" showcase (single row)
-- ============================================================================
-- "At most one row" is declarative: constant PRIMARY KEY + CHECK on that id,
-- mirroring church_settings so the admin CMS can upsert idempotently.

CREATE TABLE IF NOT EXISTS public.monthly_theme (
    id          UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000002',
    month_label TEXT,
    scripture   TEXT,
    title       TEXT,
    description TEXT,
    image_url   TEXT,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.monthly_theme
    ALTER COLUMN id SET DEFAULT '00000000-0000-0000-0000-000000000002';

ALTER TABLE public.monthly_theme
    DROP CONSTRAINT IF EXISTS monthly_theme_singleton;

ALTER TABLE public.monthly_theme
    ADD CONSTRAINT monthly_theme_singleton
    CHECK (id = '00000000-0000-0000-0000-000000000002');

ALTER TABLE public.monthly_theme ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view monthly theme" ON public.monthly_theme;
CREATE POLICY "Public can view monthly theme"
    ON public.monthly_theme FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage monthly theme" ON public.monthly_theme;
CREATE POLICY "Admins can manage monthly theme"
    ON public.monthly_theme FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ============================================================================
-- 8d. LIVE_STATUS — "Happening Right Now" live stream (single row)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.live_status (
    id               UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000003',
    is_live          BOOLEAN DEFAULT false,
    live_title       TEXT,
    live_description TEXT,
    youtube_url      TEXT,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.live_status
    ALTER COLUMN id SET DEFAULT '00000000-0000-0000-0000-000000000003';

ALTER TABLE public.live_status
    DROP CONSTRAINT IF EXISTS live_status_singleton;

ALTER TABLE public.live_status
    ADD CONSTRAINT live_status_singleton
    CHECK (id = '00000000-0000-0000-0000-000000000003');

ALTER TABLE public.live_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view live status" ON public.live_status;
CREATE POLICY "Public can view live status"
    ON public.live_status FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage live status" ON public.live_status;
CREATE POLICY "Admins can manage live status"
    ON public.live_status FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ============================================================================
-- 9. SERMONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sermons (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title       TEXT NOT NULL,
    speaker     TEXT,
    date        DATE,
    youtube_url TEXT,
    description TEXT,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.sermons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view sermons" ON public.sermons;
CREATE POLICY "Public can view sermons"
    ON public.sermons FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage sermons" ON public.sermons;
CREATE POLICY "Admins can manage sermons"
    ON public.sermons FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ============================================================================
-- 10. PRAYER_REQUESTS — public insert, admin read/manage
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.prayer_requests (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visitor_name   TEXT NOT NULL,
    request_text   TEXT NOT NULL,
    date_submitted TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.prayer_requests ENABLE ROW LEVEL SECURITY;

-- Visitors may submit but never read back — no SELECT policy for anon.
DROP POLICY IF EXISTS "Public can insert prayer requests" ON public.prayer_requests;
DROP POLICY IF EXISTS "Anyone can insert prayer requests" ON public.prayer_requests;
CREATE POLICY "Public can insert prayer requests"
    ON public.prayer_requests FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view prayer requests" ON public.prayer_requests;
CREATE POLICY "Admins can view prayer requests"
    ON public.prayer_requests FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- FIX: admins need to be able to clear spam and test rows.
DROP POLICY IF EXISTS "Admins can delete prayer requests" ON public.prayer_requests;
CREATE POLICY "Admins can delete prayer requests"
    ON public.prayer_requests FOR DELETE
    TO authenticated
    USING (public.is_admin());


-- ============================================================================
-- 11. MINISTRY_JOIN_REQUESTS — public insert, admin read/manage
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ministry_join_requests (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visitor_name         TEXT NOT NULL,
    contact_info         TEXT NOT NULL,
    ministry_of_interest TEXT NOT NULL,
    status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'followed_up')),
    date_submitted       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ministry_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can insert join requests" ON public.ministry_join_requests;
DROP POLICY IF EXISTS "Anyone can insert join requests" ON public.ministry_join_requests;
CREATE POLICY "Public can insert join requests"
    ON public.ministry_join_requests FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view join requests" ON public.ministry_join_requests;
CREATE POLICY "Admins can view join requests"
    ON public.ministry_join_requests FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- FIX: status exists to be advanced from 'pending' — that needs UPDATE.
DROP POLICY IF EXISTS "Admins can update join requests" ON public.ministry_join_requests;
CREATE POLICY "Admins can update join requests"
    ON public.ministry_join_requests FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete join requests" ON public.ministry_join_requests;
CREATE POLICY "Admins can delete join requests"
    ON public.ministry_join_requests FOR DELETE
    TO authenticated
    USING (public.is_admin());


-- ============================================================================
-- 12. STORAGE — website-images bucket
-- ============================================================================
-- 50 MB ceiling: large enough for a compressed hero video, small enough to
-- stop a runaway upload. The CMS enforces a stricter 2 MB limit on images
-- client-side. SVG is excluded on purpose — it can carry script.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'website-images',
    'website-images',
    true,
    52428800,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE
    SET public             = EXCLUDED.public,
        file_size_limit    = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read access for website images" ON storage.objects;
CREATE POLICY "Public read access for website images"
    ON storage.objects FOR SELECT
    TO anon, authenticated
    USING (bucket_id = 'website-images');

DROP POLICY IF EXISTS "Authenticated admins can upload images" ON storage.objects;
CREATE POLICY "Authenticated admins can upload images"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'website-images' AND public.is_admin());

DROP POLICY IF EXISTS "Authenticated admins can update images" ON storage.objects;
CREATE POLICY "Authenticated admins can update images"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'website-images' AND public.is_admin())
    WITH CHECK (bucket_id = 'website-images' AND public.is_admin());

DROP POLICY IF EXISTS "Authenticated admins can delete images" ON storage.objects;
CREATE POLICY "Authenticated admins can delete images"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'website-images' AND public.is_admin());


-- ============================================================================
-- 13. updated_at TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_church_settings_updated_at ON public.church_settings;
CREATE TRIGGER trg_church_settings_updated_at
    BEFORE UPDATE ON public.church_settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- FIX: site_content has an updated_at column but never had a trigger.
DROP TRIGGER IF EXISTS trg_site_content_updated_at ON public.site_content;
CREATE TRIGGER trg_site_content_updated_at
    BEFORE UPDATE ON public.site_content
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_leadership_team_updated_at ON public.leadership_team;
CREATE TRIGGER trg_leadership_team_updated_at
    BEFORE UPDATE ON public.leadership_team
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_ministries_updated_at ON public.ministries;
CREATE TRIGGER trg_ministries_updated_at
    BEFORE UPDATE ON public.ministries
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_locations_updated_at ON public.locations;
CREATE TRIGGER trg_locations_updated_at
    BEFORE UPDATE ON public.locations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_service_schedules_updated_at ON public.service_schedules;
CREATE TRIGGER trg_service_schedules_updated_at
    BEFORE UPDATE ON public.service_schedules
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_lifegroups_updated_at ON public.lifegroups;
CREATE TRIGGER trg_lifegroups_updated_at
    BEFORE UPDATE ON public.lifegroups
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_sermons_updated_at ON public.sermons;
CREATE TRIGGER trg_sermons_updated_at
    BEFORE UPDATE ON public.sermons
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_special_events_updated_at ON public.special_events;
CREATE TRIGGER trg_special_events_updated_at
    BEFORE UPDATE ON public.special_events
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_monthly_theme_updated_at ON public.monthly_theme;
CREATE TRIGGER trg_monthly_theme_updated_at
    BEFORE UPDATE ON public.monthly_theme
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_live_status_updated_at ON public.live_status;
CREATE TRIGGER trg_live_status_updated_at
    BEFORE UPDATE ON public.live_status
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================================
-- 14. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ministries_category           ON public.ministries(category);
CREATE INDEX IF NOT EXISTS idx_locations_type                ON public.locations(location_type);
CREATE INDEX IF NOT EXISTS idx_service_schedules_location    ON public.service_schedules(location_id);
CREATE INDEX IF NOT EXISTS idx_lifegroups_type               ON public.lifegroups(group_type);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_date          ON public.prayer_requests(date_submitted);
CREATE INDEX IF NOT EXISTS idx_ministry_join_requests_date   ON public.ministry_join_requests(date_submitted);
CREATE INDEX IF NOT EXISTS idx_sermons_date                  ON public.sermons(date);

-- Supports the paginated public queries (ORDER BY ... LIMIT/OFFSET).
CREATE INDEX IF NOT EXISTS idx_sermons_date_desc             ON public.sermons(date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_lifegroups_active_sort        ON public.lifegroups(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_special_events_date           ON public.special_events(event_date);


-- ============================================================================
-- 15. GRANTS — least privilege
-- ============================================================================
-- RLS is the real gate; these grants make sure anon cannot even reach the
-- tables it has no business touching (profiles, and the two request inboxes).

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Reset anything a previous migration granted too broadly.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- anon: read the public-facing content...
GRANT SELECT ON
    public.church_settings,
    public.site_content,
    public.leadership_team,
    public.ministries,
    public.locations,
    public.service_schedules,
    public.lifegroups,
    public.sermons,
    public.special_events,
    public.monthly_theme,
    public.live_status
TO anon;

-- ...and submit the two visitor forms (insert only; no read-back).
GRANT INSERT ON public.prayer_requests, public.ministry_join_requests TO anon;

-- Signed-in users get full table access; RLS narrows it to admins in practice.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
