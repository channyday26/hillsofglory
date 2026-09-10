-- ============================================================================
-- Hills of Glory — Migration 009: homepage CMS features
-- ============================================================================
--
-- Run ONCE in the Supabase Dashboard -> SQL Editor, after 008.
--
-- Adds:
--   1. monthly_theme      — singleton row powering the dynamic "Monthly Theme"
--      showcase on the homepage. The admin upserts it on a constant id. When
--      the row is missing or is_active = false, the section stays hidden.
--   2. live_status        — singleton row for the "Happening Right Now" live
--      stream section. is_live + a YouTube URL reveal the section and the
--      desktop navbar "Live" button; otherwise both stay hidden.
--   3. service_schedules.image_url — optional photo per service row (shown as
--      a thumbnail on the homepage timetable).
--   4. church_settings.home_spotlight_image — CMS-managed backdrop photo for
--      the .schedule-showcase__spotlight block.
--
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Monthly theme (single row)
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- 2. Live status (single row)
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- 3. Service schedules — optional per-row image
-- ---------------------------------------------------------------------------

ALTER TABLE public.service_schedules
    ADD COLUMN IF NOT EXISTS image_url TEXT;


-- ---------------------------------------------------------------------------
-- 4. Church settings — homepage spotlight image
-- ---------------------------------------------------------------------------

ALTER TABLE public.church_settings
    ADD COLUMN IF NOT EXISTS home_spotlight_image TEXT;


-- ---------------------------------------------------------------------------
-- 5. updated_at triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_monthly_theme_updated_at ON public.monthly_theme;
CREATE TRIGGER trg_monthly_theme_updated_at
    BEFORE UPDATE ON public.monthly_theme
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_live_status_updated_at ON public.live_status;
CREATE TRIGGER trg_live_status_updated_at
    BEFORE UPDATE ON public.live_status
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 6. Grants — public read for the two new singleton tables
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.monthly_theme, public.live_status TO anon;


-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------

SELECT tablename, policyname
FROM pg_policies
WHERE tablename IN ('monthly_theme', 'live_status')
ORDER BY tablename, policyname;
-- Expect: "Public can view X" + "Admins can manage X" for each table.

SELECT column_name
FROM information_schema.columns
WHERE table_name = 'service_schedules' AND column_name = 'image_url';
-- Expect: image_url

SELECT column_name
FROM information_schema.columns
WHERE table_name = 'church_settings' AND column_name = 'home_spotlight_image';
-- Expect: home_spotlight_image
-- ============================================================================