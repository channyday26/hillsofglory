-- ==========================================================
-- Hills of Glory — Fix RLS Infinite Recursion
-- Run this in Supabase Dashboard -> SQL Editor
-- ==========================================================

-- 1. Helper Function with SECURITY DEFINER to bypass RLS recursion
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

-- 2. Drop recursive policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public can view active content" ON public.site_content;
DROP POLICY IF EXISTS "Admins can manage content" ON public.site_content;
DROP POLICY IF EXISTS "Public can view leadership" ON public.leadership_team;
DROP POLICY IF EXISTS "Admins can manage leadership" ON public.leadership_team;
DROP POLICY IF EXISTS "Public can view ministries" ON public.ministries;
DROP POLICY IF EXISTS "Admins can manage ministries" ON public.ministries;
DROP POLICY IF EXISTS "Public can view locations" ON public.locations;
DROP POLICY IF EXISTS "Admins can manage locations" ON public.locations;
DROP POLICY IF EXISTS "Public can view schedules" ON public.service_schedules;
DROP POLICY IF EXISTS "Admins can manage schedules" ON public.service_schedules;
DROP POLICY IF EXISTS "Public can view lifegroups" ON public.lifegroups;
DROP POLICY IF EXISTS "Admins can manage lifegroups" ON public.lifegroups;
DROP POLICY IF EXISTS "Public can view sermons" ON public.sermons;
DROP POLICY IF EXISTS "Admins can manage sermons" ON public.sermons;
DROP POLICY IF EXISTS "Public can insert prayer requests" ON public.prayer_requests;
DROP POLICY IF EXISTS "Public can view their own requests" ON public.prayer_requests;
DROP POLICY IF EXISTS "Admins can view all requests" ON public.prayer_requests;
DROP POLICY IF EXISTS "Public can insert join requests" ON public.ministry_join_requests;
DROP POLICY IF EXISTS "Public can view their own requests" ON public.ministry_join_requests;
DROP POLICY IF EXISTS "Admins can view all join requests" ON public.ministry_join_requests;
DROP POLICY IF EXISTS "Admins can update settings" ON public.church_settings;

-- 3. Re-create clean, non-recursive policies

-- PROFILES
CREATE POLICY "Users can view own profile or admins view all"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Admins can insert/delete profiles"
    ON public.profiles FOR ALL
    USING (public.is_admin());

-- CHURCH SETTINGS
CREATE POLICY "Admins can update settings"
    ON public.church_settings FOR UPDATE
    USING (public.is_admin());

CREATE POLICY "Admins can insert settings"
    ON public.church_settings FOR INSERT
    WITH CHECK (public.is_admin());

-- SITE CONTENT
CREATE POLICY "Public can view active content"
    ON public.site_content FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage content"
    ON public.site_content FOR ALL
    USING (public.is_admin());

-- LEADERSHIP TEAM
CREATE POLICY "Public can view leadership"
    ON public.leadership_team FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage leadership"
    ON public.leadership_team FOR ALL
    USING (public.is_admin());

-- MINISTRIES
CREATE POLICY "Public can view ministries"
    ON public.ministries FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage ministries"
    ON public.ministries FOR ALL
    USING (public.is_admin());

-- LOCATIONS
CREATE POLICY "Public can view locations"
    ON public.locations FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage locations"
    ON public.locations FOR ALL
    USING (public.is_admin());

-- SERVICE SCHEDULES
CREATE POLICY "Public can view schedules"
    ON public.service_schedules FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage schedules"
    ON public.service_schedules FOR ALL
    USING (public.is_admin());

-- LIFEGROUPS
CREATE POLICY "Public can view lifegroups"
    ON public.lifegroups FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage lifegroups"
    ON public.lifegroups FOR ALL
    USING (public.is_admin());

-- SERMONS
CREATE POLICY "Public can view sermons"
    ON public.sermons FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage sermons"
    ON public.sermons FOR ALL
    USING (public.is_admin());

-- PRAYER REQUESTS
CREATE POLICY "Anyone can insert prayer requests"
    ON public.prayer_requests FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Admins can view prayer requests"
    ON public.prayer_requests FOR SELECT
    USING (public.is_admin());

-- MINISTRY JOIN REQUESTS
CREATE POLICY "Anyone can insert join requests"
    ON public.ministry_join_requests FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Admins can view join requests"
    ON public.ministry_join_requests FOR SELECT
    USING (public.is_admin());

-- STORAGE POLICIES
DROP POLICY IF EXISTS "Authenticated admins can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated admins can update images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated admins can delete images" ON storage.objects;

CREATE POLICY "Authenticated admins can upload images"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'website-images' AND public.is_admin());

CREATE POLICY "Authenticated admins can update images"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'website-images' AND public.is_admin());

CREATE POLICY "Authenticated admins can delete images"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'website-images' AND public.is_admin());
