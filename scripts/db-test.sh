#!/usr/bin/env bash
# Applies every migration to a throwaway database and runs the security tests.
#
#   scripts/db-test.sh                      # uses a local Postgres on $PGHOST/$PGPORT (default 127.0.0.1:5432)
#   DB_URL=postgres://... scripts/db-test.sh  # any Postgres superuser URL (e.g. `supabase start` on 54322)
#
# When DB_URL points at a plain Postgres (no Supabase), the stub in
# supabase/tests/local is loaded first to provide auth.uid() & friends.
set -euo pipefail
cd "$(dirname "$0")/.."

DB_URL="${DB_URL:-postgres://postgres@${PGHOST:-127.0.0.1}:${PGPORT:-5432}/postgres}"
TEST_DB="btf_test_$$"
ADMIN_URL="${DB_URL}"
BASE="${DB_URL%/*}"
TEST_URL="${BASE}/${TEST_DB}"

psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -qc "create database ${TEST_DB}"
trap 'psql "$ADMIN_URL" -qc "drop database if exists ${TEST_DB} with (force)" >/dev/null 2>&1 || true' EXIT

is_supabase=$(psql "$TEST_URL" -Atc "select exists(select 1 from pg_namespace where nspname = 'auth')" 2>/dev/null || echo f)
if [ "$is_supabase" != "t" ]; then
  echo "• plain Postgres detected: loading supabase stub"
  psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/local/00_supabase_stub.sql
  psql "$TEST_URL" -v ON_ERROR_STOP=1 -qc "alter database ${TEST_DB} set search_path = public, extensions"
fi

for f in supabase/migrations/*.sql; do
  echo "• applying $(basename "$f")"
  psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done

echo "• running supabase/tests/rls_security.sql"
psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/rls_security.sql 2>&1 | grep -E "NOTICE:  (ok|FAIL)|ERROR|All tests passed" | sed 's/^psql:[^:]*:[0-9]*: NOTICE:  //'

if [ "${GEN_TYPES:-0}" = "1" ]; then
  echo "• regenerating src/lib/database.types.ts"
  npx --yes supabase@2 gen types typescript --db-url "${TEST_URL}?sslmode=disable" --schema public > src/lib/database.types.ts
fi
