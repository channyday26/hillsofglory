-- ============================================
-- Hills of Glory — Supabase Database Schema
-- Run these in the Supabase Dashboard → SQL Editor
-- ============================================

-- --- Enable UUID extension ---
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. PROFILES — Admin user roles and permissions
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       TEXT UNIQUE NOT NULL,
    role        TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'editor')),
    permissions JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Helper Function with SECURITY DEFINER to avoid RLS infinite recursion
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

CREATE POLICY "Users can view own profile or admins view all"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Admins can insert/delete profiles"
    ON public.profiles FOR ALL
    USING (public.is_admin());

-- ============================================
-- 2. CHURCH_SETTINGS — Global single-row configuration
-- ============================================
CREATE TABLE IF NOT EXISTS public.church_settings (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    main_address     TEXT,
    contact_email    TEXT,
    contact_phone    TEXT,
    bank_details     TEXT,
    facebook_url     TEXT,
    instagram_url    TEXT,
    youtube_url      TEXT,
    x_url            TEXT,
    hero_video_url   TEXT,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.church_settings ENABLE ROW LEVEL SECURITY;

-- Trigger to enforce single-row
CREATE OR REPLACE FUNCTION public.enforce_single_church_settings()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT count(*) FROM public.church_settings WHERE id != NEW.id) > 0 THEN
        RAISE EXCEPTION 'Only one row allowed in church_settings';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_church_settings_single
    BEFORE INSERT ON public.church_settings
    FOR EACH ROW EXECUTE FUNCTION public.enforce_single_church_settings();

CREATE POLICY "Public can view settings"
    ON public.church_settings FOR SELECT
    USING (true);

CREATE POLICY "Admins can update settings"
    ON public.church_settings FOR UPDATE
    USING (public.is_admin());

CREATE POLICY "Admins can insert settings"
    ON public.church_settings FOR INSERT
    WITH CHECK (public.is_admin());

-- Insert default row
INSERT INTO public.church_settings (id, main_address, contact_email, contact_phone)
VALUES (uuid_generate_v4(), '', '', '')
ON CONFLICT DO NOTHING;

-- ============================================
-- 3. SITE_CONTENT — Dynamic text blocks and general page settings
-- ============================================
CREATE TABLE IF NOT EXISTS public.site_content (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_key TEXT UNIQUE NOT NULL,
    title       TEXT,
    body        TEXT,
    hero_video_url TEXT,
    is_active   BOOLEAN DEFAULT true,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active content"
    ON public.site_content FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage content"
    ON public.site_content FOR ALL
    USING (public.is_admin());

-- Seed default content blocks
INSERT INTO public.site_content (section_key, title, body, sort_order)
VALUES
    ('hero', 'Welcome to Hills of Glory', 'A vibrant community of faith', 1),
    ('about_mission', 'Our Mission', 'To proclaim the Gospel of Jesus Christ, equip believers for ministry, and impact our community with the love of God.', 1),
    ('about_vision', 'Our Vision', 'To be a house of prayer for all nations, raising up a generation that honors God and transforms lives.', 1),
    ('about_belief', 'Statement of Belief', 'We believe in the Bible as the inspired Word of God, in the Trinity, the virgin birth, the sacrificial death and resurrection of Jesus Christ, and the gift of salvation by grace through faith.', 1)
ON CONFLICT DO NOTHING;

-- ============================================
-- 4. LEADERSHIP_TEAM — Leadership and pastoral team
-- ============================================
CREATE TABLE IF NOT EXISTS public.leadership_team (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    role        TEXT,
    bio         TEXT,
    image_url   TEXT,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.leadership_team ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view leadership"
    ON public.leadership_team FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage leadership"
    ON public.leadership_team FOR ALL
    USING (public.is_admin());

-- ============================================
-- 5. MINISTRIES — Worship, General, Campus ministries
-- ============================================
CREATE TABLE IF NOT EXISTS public.ministries (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             TEXT NOT NULL,
    category         TEXT NOT NULL CHECK (category IN ('Worship', 'General', 'Campus')),
    description      TEXT,
    image_url        TEXT,
    contact_person   TEXT,
    target_school    TEXT,
    sort_order       INTEGER DEFAULT 0,
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ministries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view ministries"
    ON public.ministries FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage ministries"
    ON public.ministries FOR ALL
    USING (public.is_admin());

-- ============================================
-- 6. LOCATIONS — Main campus and outreaches
-- ============================================
CREATE TABLE IF NOT EXISTS public.locations (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                  TEXT NOT NULL,
    location_type         TEXT NOT NULL CHECK (location_type IN ('Main', 'Outreach')),
    address               TEXT,
    google_maps_embed_link TEXT,
    status                TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    sort_order            INTEGER DEFAULT 0,
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view locations"
    ON public.locations FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage locations"
    ON public.locations FOR ALL
    USING (public.is_admin());

-- ============================================
-- 7. SERVICE_SCHEDULES — Service times by location
-- ============================================
CREATE TABLE IF NOT EXISTS public.service_schedules (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    service_name TEXT NOT NULL,
    day         TEXT NOT NULL,
    time        TEXT NOT NULL,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.service_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view schedules"
    ON public.service_schedules FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage schedules"
    ON public.service_schedules FOR ALL
    USING (public.is_admin());

-- ============================================
-- 8. LIFEGROUPS — Bible study groups
-- ============================================
CREATE TABLE IF NOT EXISTS public.lifegroups (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_name  TEXT NOT NULL,
    leader_name TEXT,
    location    TEXT,
    meeting_time TEXT,
    contact_info TEXT,
    group_type  TEXT CHECK (group_type IN ('men', 'women', 'youth', 'children')),
    sort_order  INTEGER DEFAULT 0,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lifegroups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view lifegroups"
    ON public.lifegroups FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage lifegroups"
    ON public.lifegroups FOR ALL
    USING (public.is_admin());

-- ============================================
-- 9. SERMONS — Sermon recordings
-- ============================================
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

CREATE POLICY "Public can view sermons"
    ON public.sermons FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage sermons"
    ON public.sermons FOR ALL
    USING (public.is_admin());

-- ============================================
-- 10. PRAYER_REQUESTS — Visitor prayer requests (public inserts)
-- ============================================
CREATE TABLE IF NOT EXISTS public.prayer_requests (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visitor_name TEXT NOT NULL,
    request_text TEXT NOT NULL,
    date_submitted TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.prayer_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert prayer requests"
    ON public.prayer_requests FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Admins can view prayer requests"
    ON public.prayer_requests FOR SELECT
    USING (public.is_admin());

-- ============================================
-- 11. MINISTRY_JOIN_REQUESTS — Visitor ministry interest (public inserts)
-- ============================================
CREATE TABLE IF NOT EXISTS public.ministry_join_requests (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visitor_name     TEXT NOT NULL,
    contact_info     TEXT NOT NULL,
    ministry_of_interest TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'followed_up')),
    date_submitted   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ministry_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert join requests"
    ON public.ministry_join_requests FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Admins can view join requests"
    ON public.ministry_join_requests FOR SELECT
    USING (public.is_admin());

-- ============================================
-- STORAGE — website-images bucket
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('website-images', 'website-images', true, 2147483648)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: public read
CREATE POLICY "Public read access for website images"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'website-images');

-- Storage policy: authenticated admins can upload
CREATE POLICY "Authenticated admins can upload images"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'website-images' AND public.is_admin());

-- Storage policy: authenticated admins can update/delete
CREATE POLICY "Authenticated admins can update images"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'website-images' AND public.is_admin());

CREATE POLICY "Authenticated admins can delete images"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'website-images' AND public.is_admin());

-- ============================================
-- TRIGGERS — updated_at timestamps
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_church_settings_updated_at
    BEFORE UPDATE ON public.church_settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_leadership_team_updated_at
    BEFORE UPDATE ON public.leadership_team
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_ministries_updated_at
    BEFORE UPDATE ON public.ministries
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_locations_updated_at
    BEFORE UPDATE ON public.locations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_service_schedules_updated_at
    BEFORE UPDATE ON public.service_schedules
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_lifegroups_updated_at
    BEFORE UPDATE ON public.lifegroups
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_sermons_updated_at
    BEFORE UPDATE ON public.sermons
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- INDEXES for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_ministries_category ON public.ministries(category);
CREATE INDEX IF NOT EXISTS idx_locations_type ON public.locations(location_type);
CREATE INDEX IF NOT EXISTS idx_service_schedules_location ON public.service_schedules(location_id);
CREATE INDEX IF NOT EXISTS idx_lifegroups_type ON public.lifegroups(group_type);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_date ON public.prayer_requests(date_submitted);
CREATE INDEX IF NOT EXISTS idx_ministry_join_requests_date ON public.ministry_join_requests(date_submitted);
CREATE INDEX IF NOT EXISTS idx_sermons_date ON public.sermons(date);
