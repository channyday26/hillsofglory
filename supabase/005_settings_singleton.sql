-- ============================================================================
-- Hills of Glory — Migration 005: church_settings singleton hardening
-- ============================================================================
--
-- Run ONCE in the Supabase Dashboard -> SQL Editor, after 004_fixes.sql.
--
-- WHY
--   church_settings is a one-row table. That was enforced by a BEFORE INSERT
--   trigger that raised 'Only one row allowed in church_settings' (P0001).
--   The trigger works, but it makes every INSERT-shaped write a runtime error
--   instead of a no-op, so the CMS had to know in advance whether a row existed
--   and pick UPDATE or INSERT accordingly. Getting that branch wrong is exactly
--   what produced the 400 Bad Request on the settings form.
--
-- WHAT THIS DOES INSTEAD
--   Pins the row to one constant primary key and adds a CHECK that the id must
--   equal it. PRIMARY KEY already guarantees uniqueness, so:
--
--       CHECK (id = <constant>)  +  PRIMARY KEY (id)  ==>  at most one row
--
--   That is a declarative invariant the planner and the client can both rely
--   on, and it makes the trigger redundant — so it is dropped.
--
-- WHAT YOU GAIN
--   `upsert` becomes unconditionally safe and idempotent:
--
--       await supabase
--         .from('church_settings')
--         .upsert({ id: '00000000-0000-0000-0000-000000000001', ...payload })
--         .select('id')
--         .single();
--
--   One round trip, no branching, correct whether or not the row exists.
--
-- ⚠  ORDERING
--   admin/js/admin-cms.js currently uses UPDATE-then-fallback, which is correct
--   both before AND after this migration — nothing breaks by running this alone.
--   Do NOT switch the JS to the upsert form above until this migration has run:
--   upserting the constant id against a row that still has a random id would
--   insert a second row and trip the old trigger.
--
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Safety check — this migration assumes at most one existing row
-- ---------------------------------------------------------------------------
-- The old trigger should have guaranteed this. If it somehow did not, stop and
-- decide which row is authoritative rather than letting a migration guess.

DO $$
DECLARE
    n INTEGER;
BEGIN
    SELECT count(*) INTO n FROM public.church_settings;
    IF n > 1 THEN
        RAISE EXCEPTION
            'church_settings holds % rows; expected 0 or 1. Inspect them and delete the stale ones before running 005.', n;
    END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 1. Retire the single-row trigger
-- ---------------------------------------------------------------------------
-- Superseded by the CHECK constraint added in step 4.

DROP TRIGGER IF EXISTS trg_church_settings_single ON public.church_settings;
DROP FUNCTION IF EXISTS public.enforce_single_church_settings();


-- ---------------------------------------------------------------------------
-- 2. Move the existing row onto the canonical id
-- ---------------------------------------------------------------------------
-- Nothing references church_settings.id by foreign key, and the client only
-- ever reads it, so rewriting it is safe. Runs as the table owner here, so RLS
-- does not apply.

UPDATE public.church_settings
SET id = '00000000-0000-0000-0000-000000000001'
WHERE id <> '00000000-0000-0000-0000-000000000001';


-- ---------------------------------------------------------------------------
-- 3. Default the id to the canonical value
-- ---------------------------------------------------------------------------
-- So an INSERT that omits the id lands on the singleton rather than minting a
-- random uuid that the CHECK would then reject.

ALTER TABLE public.church_settings
    ALTER COLUMN id SET DEFAULT '00000000-0000-0000-0000-000000000001';


-- ---------------------------------------------------------------------------
-- 4. The invariant
-- ---------------------------------------------------------------------------

ALTER TABLE public.church_settings
    DROP CONSTRAINT IF EXISTS church_settings_singleton;

ALTER TABLE public.church_settings
    ADD CONSTRAINT church_settings_singleton
    CHECK (id = '00000000-0000-0000-0000-000000000001');


-- ---------------------------------------------------------------------------
-- 5. Seed the row if the table is empty
-- ---------------------------------------------------------------------------

INSERT INTO public.church_settings (id, main_address, contact_email, contact_phone)
SELECT '00000000-0000-0000-0000-000000000001', '', '', ''
WHERE NOT EXISTS (SELECT 1 FROM public.church_settings);


-- ---------------------------------------------------------------------------
-- 6. Verify
-- ---------------------------------------------------------------------------
-- Expect exactly one row, with id ending in ...0001.

SELECT id, main_address, contact_email, updated_at
FROM public.church_settings;

-- And confirm the invariant bites. This must fail with a check_violation
-- (23514), NOT insert a second row:
--
--     INSERT INTO public.church_settings (id) VALUES (gen_random_uuid());
--
-- A bare INSERT now fails on the primary key instead, which is also correct:
--
--     INSERT INTO public.church_settings (main_address) VALUES ('x');
--     -- duplicate key value violates unique constraint "church_settings_pkey"
-- ============================================================================
