-- Applied to production through the dashboard before the schema was versioned.
-- Its effect is captured in 20261022000100_baseline.sql; this file exists so
-- the local migration list matches the remote history (no-op on fresh stacks).
select 1;
