-- ============================================================================
-- Hills of Glory — Grant admin access
-- ============================================================================
--
-- This is the bootstrap step. The CMS gates every write behind is_admin(),
-- which reads a profiles row with role = 'admin' whose id matches the signed-in
-- auth user. Until such a row exists, nothing in the dashboard can save.
--
-- The first admin cannot be created through the app: the "Admins can manage
-- profiles" policy requires you to already be an admin. The SQL Editor runs as
-- the table owner and bypasses RLS, which is why this runs here.
--
-- ---------------------------------------------------------------------------
-- STEP 1 — Create the auth user (Dashboard, not SQL)
-- ---------------------------------------------------------------------------
--   Authentication -> Users -> Add user -> Create new user
--     • enter the admin email and a strong password
--     • tick "Auto Confirm User" (otherwise login fails until the email is
--       confirmed, and no SMTP is configured on this project)
--
-- ---------------------------------------------------------------------------
-- STEP 2 — Run the statement below
-- ---------------------------------------------------------------------------
-- Replace the email on the line marked ▼ with the one you just created, then
-- run. The id is looked up from auth.users, so there is no UUID to copy.

INSERT INTO public.profiles (id, email, role)
SELECT u.id, u.email, 'admin'
FROM auth.users u
WHERE u.email = 'admin@hillsofglory.org'          -- ▼ change this
ON CONFLICT (id) DO UPDATE
    SET role  = 'admin',
        email = EXCLUDED.email;


-- ---------------------------------------------------------------------------
-- STEP 3 — Verify
-- ---------------------------------------------------------------------------
-- Expect exactly one row, with role = 'admin' and linked = true.
-- If it returns nothing, the email in STEP 2 does not match any auth user —
-- check for a typo or trailing space.

SELECT p.id,
       p.email,
       p.role,
       (u.id IS NOT NULL)   AS linked,
       (u.confirmed_at IS NOT NULL) AS confirmed
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
ORDER BY p.created_at;


-- ---------------------------------------------------------------------------
-- Then log in at admin/index.html. is_admin() should now return true:
--     SELECT public.is_admin();   -- returns false here in the SQL Editor
--                                 -- (no auth.uid()); it is only meaningful
--                                 -- from an authenticated browser session.
-- ---------------------------------------------------------------------------
--
-- To add a second administrator later, repeat STEP 1 and STEP 2 with the new
-- email. To demote someone without deleting their login:
--     UPDATE public.profiles SET role = 'editor' WHERE email = '...';
-- To revoke entirely, delete the user in Authentication -> Users; the profiles
-- row is removed automatically by the ON DELETE CASCADE foreign key.
-- ============================================================================
