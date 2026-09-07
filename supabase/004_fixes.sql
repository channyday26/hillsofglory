-- ============================================================================
-- Hills of Glory — Migration 004: schema hardening + fixes
-- ============================================================================
--
-- Run this ONCE in the Supabase Dashboard -> SQL Editor on the EXISTING
-- database that already has 001, 002 and 003 applied.
--
-- For a brand new Supabase project, run schema.sql instead — it already
-- contains everything here.
--
-- What this changes:
--   1. profiles.id becomes a FK to auth.users(id) and loses its random
--      default. This is the fix that unblocks the CMS.
--   2. Admins gain DELETE on prayer_requests, and UPDATE + DELETE on
--      ministry_join_requests.
--   3. Every policy is recreated with an explicit TO role and WITH CHECK.
--   4. site_content gains its missing updated_at trigger.
--   5. Storage bucket: 2 GB -> 50 MB, plus a MIME allowlist.
--   6. anon's blanket GRANT ALL is revoked and replaced with least privilege.
--   7. Indexes for the paginated sermons/lifegroups queries.
--   8. (Optional, at the bottom) removes the __conn_test__ rows.
--
-- ⚠  READ SECTION 1 BEFORE RUNNING. It contains a DELETE.
--
-- ============================================================================


-- ============================================================================
-- 1. PROFILES — tie rows to real auth users
-- ============================================================================
-- ⚠  The DELETE below removes profiles rows whose id does not match a real
--    auth.users id. Such rows can never authenticate — is_admin() matches on
--    auth.uid(), so a row with a random uuid_generate_v4() id is permanently
--    inert. They must go before the foreign key can be added.
--
--    Check what would be removed first:
--        SELECT * FROM public.profiles p
--        WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
--
--    On this project that query is expected to return nothing (no admin has
--    been created yet). If it returns rows you did not expect, stop and
--    inspect them before continuing.

ALTER TABLE public.profiles ALTER COLUMN id DROP DEFAULT;

DELETE FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- ============================================================================
-- 2. Recreate all policies with explicit roles and WITH CHECK
-- ============================================================================

-- --- PROFILES ---
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

DROP POLICY IF EXISTS "Admins can insert/delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;
CREATE POLICY "Admins can manage profiles"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- --- CHURCH SETTINGS ---
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

-- --- SITE CONTENT ---
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

-- --- LEADERSHIP TEAM ---
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

-- --- MINISTRIES ---
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

-- --- LOCATIONS ---
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

-- --- SERVICE SCHEDULES ---
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

-- --- LIFEGROUPS ---
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

-- --- SERMONS ---
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
-- 3. REQUEST INBOXES — admins can now manage, not just read
-- ============================================================================

-- --- PRAYER REQUESTS ---
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

-- NEW: without this, spam and test rows can never be removed.
DROP POLICY IF EXISTS "Admins can delete prayer requests" ON public.prayer_requests;
CREATE POLICY "Admins can delete prayer requests"
    ON public.prayer_requests FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- --- MINISTRY JOIN REQUESTS ---
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

-- NEW: the status column exists to be advanced from 'pending'.
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
-- 4. STORAGE — tighter bucket limits and policies
-- ============================================================================

UPDATE storage.buckets
SET file_size_limit    = 52428800,   -- 50 MB (was 2 GB)
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'video/mp4', 'video/webm']
WHERE id = 'website-images';

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
-- 5. site_content — the missing updated_at trigger
-- ============================================================================

DROP TRIGGER IF EXISTS trg_site_content_updated_at ON public.site_content;
CREATE TRIGGER trg_site_content_updated_at
    BEFORE UPDATE ON public.site_content
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================================
-- 6. INDEXES for the paginated public queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sermons_date_desc      ON public.sermons(date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_lifegroups_active_sort ON public.lifegroups(is_active, sort_order);


-- ============================================================================
-- 7. GRANTS — replace 003's blanket GRANT ALL with least privilege
-- ============================================================================
-- 003 ran `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated`.
-- RLS still gated the rows, but anon held table privileges it never needed —
-- including on profiles and both request inboxes. Narrow it.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

GRANT SELECT ON
    public.church_settings,
    public.site_content,
    public.leadership_team,
    public.ministries,
    public.locations,
    public.service_schedules,
    public.lifegroups,
    public.sermons
TO anon;

GRANT INSERT ON public.prayer_requests, public.ministry_join_requests TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;


-- ============================================================================
-- 8. OPTIONAL — clear the __conn_test__ rows
-- ============================================================================
-- The SQL Editor runs as the table owner and is not subject to RLS, so this
-- works without an admin session.
--
-- Look before you delete:
--     SELECT * FROM public.prayer_requests WHERE visitor_name LIKE '%__conn_test__%' OR request_text LIKE '%__conn_test__%';
--     SELECT * FROM public.ministry_join_requests WHERE visitor_name LIKE '%__conn_test__%' OR contact_info LIKE '%__conn_test__%' OR ministry_of_interest LIKE '%__conn_test__%';
--
-- Then uncomment:

-- DELETE FROM public.prayer_requests
-- WHERE visitor_name LIKE '%__conn_test__%' OR request_text LIKE '%__conn_test__%';

-- DELETE FROM public.ministry_join_requests
-- WHERE visitor_name LIKE '%__conn_test__%'
--    OR contact_info LIKE '%__conn_test__%'
--    OR ministry_of_interest LIKE '%__conn_test__%';


-- ============================================================================
-- Next step: run seed_admin.sql to grant yourself the admin role.
-- ============================================================================
