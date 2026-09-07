# Supabase — database files

Run everything in the **Supabase Dashboard → SQL Editor**. The editor runs as the
table owner and is not subject to RLS, which is what makes the admin bootstrap
possible.

## Which file do I run?

| Situation | Run |
|---|---|
| The existing project (001–003 already applied) | `004_fixes.sql`, then `005_settings_singleton.sql`, then `seed_admin.sql` |
| A brand new Supabase project | `schema.sql`, then `seed_admin.sql` |

Do not run `schema.sql` and the numbered migrations against the same database —
they describe the same end state by two different routes. `schema.sql` is safe to
re-run on its own (everything is idempotent and seeds are existence-guarded).

## Files

- **`schema.sql`** — canonical source of truth. The complete database: 11 tables,
  RLS policies, `is_admin()`, triggers, indexes, storage bucket, grants.
  Consolidates 001 + 002 + 003 and folds in the fixes listed in its header.
- **`004_fixes.sql`** — one-time migration that brings the *existing* database up
  to match `schema.sql`. Contains a `DELETE` on `profiles`; read section 1 first.
- **`005_settings_singleton.sql`** — replaces the `church_settings` single-row
  trigger with a constant primary key + `CHECK`. Run after 004.
- **`seed_admin.sql`** — grants a Supabase Auth user the admin role. Required
  before the CMS can save anything.
- **`001_schema.sql`, `002_fix_rls.sql`, `003_fix_public_inserts.sql`** —
  historical record of what was applied to the live database, in order.
  Superseded by `schema.sql`; kept so the migration history stays readable.
  Don't run these on a new project — `schema.sql` replaces all three.

## Things worth knowing

- **`church_settings` holds exactly one row**, pinned to the constant id
  `00000000-0000-0000-0000-000000000001` by a `CHECK` constraint. Combined with
  the primary key that makes "at most one row" a database invariant, so
  `upsert({ id: <constant>, ... })` is safe and idempotent. The older BEFORE
  INSERT trigger that raised `P0001 Only one row allowed in church_settings` is
  dropped by `005`.
- **`is_admin()` is `SECURITY DEFINER`.** A policy on `profiles` that queries
  `profiles` recurses forever; the definer rights break the cycle. Don't inline
  the subquery back into a policy.
- **`profiles.id` is a foreign key to `auth.users(id)` with no default.** A
  profiles row is meaningless unless it matches a real auth user, because
  `is_admin()` matches on `auth.uid()`. Deleting the auth user cascades.
- **Visitors can insert into the request tables but never read them back.** There
  is no `SELECT` policy for `anon` on `prayer_requests` or
  `ministry_join_requests`, and no table-level `SELECT` grant either.
- **`site_content.hero_video_url` is unused.** The CMS reads and writes
  `church_settings.hero_video_url` (`admin/js/admin-cms.js`), and the home page
  currently hardcodes `videos/hero_video_bg.mp4`. The column is kept because the
  PRD specifies it, but nothing reads it today.
