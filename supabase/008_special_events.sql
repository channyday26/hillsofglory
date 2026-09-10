-- ============================================================================
-- Hills of Glory — Migration 008: special events
-- ============================================================================
--
-- Run ONCE in the Supabase Dashboard -> SQL Editor, after 007.
--
-- Adds:
--   1. special_events — a public table holding upcoming one-off events
--      (title, description, date, time, image). The public events page reads
--      it; the admin CMS writes it (add / edit / delete).
--   2. A BEFORE INSERT trigger capped at two ACTIVE events, mirroring the
--      "up to two events" rule the admin UI enforces in the browser.
--
-- Images are uploaded to the existing `website-images` bucket and referenced
-- here by their public URL in image_url.
--
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
CREATE TRIGGER trg_special_events_updated_at
    BEFORE UPDATE ON public.special_events
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Defense in depth for the "two active events" cap. The counting happens
-- before the new row is inserted, so the count reflects the committed rows
-- only.
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

-- The public page lists by date, hopefully ascending.
CREATE INDEX IF NOT EXISTS idx_special_events_date ON public.special_events(event_date);

-- anon may read; authenticated gets full CRUD via the all-tables grant.
GRANT SELECT ON public.special_events TO anon;


-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------

SELECT tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'public.special_events'::regclass
  AND NOT tgisinternal
ORDER BY tgname;
-- Expect: trg_special_events_max_two and trg_special_events_updated_at.

SELECT event_date, title FROM public.special_events;
-- Expect: an empty result set (no events seeded yet).
-- ============================================================================