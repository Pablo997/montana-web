-- =============================================================================
-- Add `expired` to incident_status enum
-- -----------------------------------------------------------------------------
-- Must live in its own migration because `ALTER TYPE ... ADD VALUE` cannot
-- be referenced from functions/constraints within the same transaction in
-- Postgres < 16. Splitting guarantees the value is committed before the
-- next migration (`00019_*`) builds the expire-job that uses it.
-- =============================================================================

alter type public.incident_status add value if not exists 'expired';
