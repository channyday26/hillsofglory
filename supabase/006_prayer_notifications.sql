-- ============================================================================
-- Hills of Glory — Migration 006: prayer request notifications + deletion
-- ============================================================================
--
-- Run ONCE in the Supabase Dashboard -> SQL Editor, after 005.
--
-- Adds:
--   1. notification_settings — a singleton, ADMIN-ONLY table holding the
--      recipient address and an on/off switch for prayer-request emails.
--   2. prayer_requests.notified_at — when the notification was sent, so a
--      retry or a replayed webhook cannot send the same email twice.
--   3. Confirms the admin DELETE policy on prayer_requests (added in 004;
--      re-created here so this migration stands alone).
--
-- WHY A SEPARATE TABLE RATHER THAN A COLUMN ON church_settings
--   church_settings has a "Public can view settings" policy and a SELECT grant
--   for anon — it feeds the public footer, contact and give pages. Putting the
--   notification recipient there would publish that address to anyone with the
--   anon key, which is in the page source. If the church wants notifications
--   sent somewhere internal (a pastor's inbox rather than the public office
--   address) that would be a quiet privacy leak and a spam magnet.
--
--   notification_settings has NO anon policy and NO anon grant. Only admins can
--   read it from the browser; the Edge Function reads it with the service role,
--   which bypasses RLS entirely.
--
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. notification_settings (singleton, admin-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_settings (
    id                    UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
    prayer_notify_enabled BOOLEAN NOT NULL DEFAULT true,
    prayer_notify_email   TEXT,
    updated_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Same singleton invariant as church_settings (see 005): constant PK + CHECK.
ALTER TABLE public.notification_settings
    ALTER COLUMN id SET DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.notification_settings
    DROP CONSTRAINT IF EXISTS notification_settings_singleton;

ALTER TABLE public.notification_settings
    ADD CONSTRAINT notification_settings_singleton
    CHECK (id = '00000000-0000-0000-0000-000000000001');

-- Admin-only. Deliberately no policy for anon: the recipient address must not
-- be readable with the public key.
DROP POLICY IF EXISTS "Admins can view notification settings" ON public.notification_settings;
CREATE POLICY "Admins can view notification settings"
    ON public.notification_settings FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage notification settings" ON public.notification_settings;
CREATE POLICY "Admins can manage notification settings"
    ON public.notification_settings FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_notification_settings_updated_at ON public.notification_settings;
CREATE TRIGGER trg_notification_settings_updated_at
    BEFORE UPDATE ON public.notification_settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Seed the single row. Defaults to the public contact email if one is set, so
-- notifications work out of the box; change it in the admin panel.
INSERT INTO public.notification_settings (id, prayer_notify_enabled, prayer_notify_email)
SELECT '00000000-0000-0000-0000-000000000001',
       true,
       NULLIF((SELECT contact_email FROM public.church_settings LIMIT 1), '')
WHERE NOT EXISTS (SELECT 1 FROM public.notification_settings);

-- Grants: authenticated only. anon gets nothing on this table.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_settings TO authenticated;
REVOKE ALL ON public.notification_settings FROM anon;


-- ---------------------------------------------------------------------------
-- 2. prayer_requests.notified_at
-- ---------------------------------------------------------------------------
-- NULL  = no email sent yet (or notifications were off when it arrived)
-- set   = email accepted by the provider at this time
--
-- The Edge Function only sends when this is NULL, so a webhook retry or a
-- manual replay cannot double-send.

ALTER TABLE public.prayer_requests
    ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

-- Partial index: the function's lookup is always "unsent requests".
CREATE INDEX IF NOT EXISTS idx_prayer_requests_unnotified
    ON public.prayer_requests(date_submitted)
    WHERE notified_at IS NULL;


-- ---------------------------------------------------------------------------
-- 3. Admin delete on prayer_requests
-- ---------------------------------------------------------------------------
-- Already added by 004; re-created so 006 stands alone. Without this the admin
-- delete button returns success with zero rows affected — PostgREST does not
-- error when RLS simply matches nothing.

DROP POLICY IF EXISTS "Admins can delete prayer requests" ON public.prayer_requests;
CREATE POLICY "Admins can delete prayer requests"
    ON public.prayer_requests FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- The visitor-facing INSERT policy must not permit writing notified_at. It
-- cannot: anon has INSERT on the table but the column simply defaults to NULL,
-- and a supplied value would be accepted — so keep anon's grant column-scoped.
REVOKE INSERT ON public.prayer_requests FROM anon;
GRANT INSERT (visitor_name, request_text) ON public.prayer_requests TO anon;


-- ---------------------------------------------------------------------------
-- 4. Verify
-- ---------------------------------------------------------------------------

SELECT id, prayer_notify_enabled, prayer_notify_email FROM public.notification_settings;

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'prayer_requests'
ORDER BY cmd, policyname;
-- Expect: DELETE (admins), INSERT (public), SELECT (admins).
-- ============================================================================
