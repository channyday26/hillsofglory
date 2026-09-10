-- ============================================================================
-- Hills of Glory — Migration 007: lifegroups 'couple' group type
-- ============================================================================
--
-- Run ONCE in the Supabase Dashboard -> SQL Editor, after 006.
--
-- Adds:
--   1. A new value for lifegroups.group_type: 'couple', for married and
--      engaged couples' small groups.
--
-- The CHECK constraint is dropped and recreated with the new value included.
-- The constraint is intentionally name-matched rather than content-matched so
-- this migration stays idempotent and also repairs a manually-named variant.
-- 'youth' and 'children' remain valid database values even though they are no
-- longer surfaced as public filter pills — historical rows must keep loading.
--
-- ============================================================================


ALTER TABLE public.lifegroups
    DROP CONSTRAINT IF EXISTS lifegroups_group_type_check;

ALTER TABLE public.lifegroups
    ADD CONSTRAINT lifegroups_group_type_check
    CHECK (group_type IN ('men', 'women', 'youth', 'children', 'couple'));

-- The directory query filters on (is_active, sort_order) and group_type;
-- the type index already exists from the base schema.
CREATE INDEX IF NOT EXISTS idx_lifegroups_type ON public.lifegroups(group_type);


-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.lifegroups'::regclass
  AND conname = 'lifegroups_group_type_check';
-- Expect: CHECK ((group_type = ANY (ARRAY['men'::text, 'women'::text,
--          'youth'::text, 'children'::text, 'couple'::text])))
-- ============================================================================