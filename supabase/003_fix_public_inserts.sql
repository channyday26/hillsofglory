-- ==========================================================
-- Hills of Glory — Enable Public Form Submissions
-- Run this in Supabase Dashboard -> SQL Editor
-- ==========================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Allow anon and authenticated visitors to submit prayer requests
DROP POLICY IF EXISTS "Public can insert prayer requests" ON public.prayer_requests;
DROP POLICY IF EXISTS "Anyone can insert prayer requests" ON public.prayer_requests;
CREATE POLICY "Public can insert prayer requests"
    ON public.prayer_requests
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Allow anon and authenticated visitors to submit ministry join requests
DROP POLICY IF EXISTS "Public can insert join requests" ON public.ministry_join_requests;
DROP POLICY IF EXISTS "Anyone can insert join requests" ON public.ministry_join_requests;
CREATE POLICY "Public can insert join requests"
    ON public.ministry_join_requests
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);
