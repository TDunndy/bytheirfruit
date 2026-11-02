# ADR-0005: The attendance core and station identity

**Status:** accepted (2026-11-01)

## Context

Kids check-in is the first attendance vertical, but volunteer check-in,
events (Parents Night Out, VBS) and groups all need the same thing: a
schedule, its occurrences, a place, and a log of who was where. The pilot
church runs seven iPads and Brother label printers with Wi-Fi that drops,
so the station must keep working offline and sync later without
duplicates. Children's data must be least-privilege: a room volunteer sees
their room, not the directory.

`docs/specs/checkin-and-rules.md` is the spec; `docs/plans/checkin-plan.md`
is the plan this ADR records the decisions of.

## Decisions

### One attendance core (principle 3)

`schedules → occurrences → rooms`, `checkin_sessions`, `attendance_events`
and the `attendance` projection serve every vertical. There are no
kids-only tables; a kids room, a volunteer slot and a group meeting differ
by `areas.kind`, `attendance_events.role` and `schedules.kind` only.

### Typed append-only log with a fold-on-write projection

`attendance_events` is append-only for everyone, the database owner
included (triggers refuse UPDATE, DELETE and TRUNCATE; `recorded_at` is the
server's clock). Rows carry client-generated UUIDv7 ids, the device's time
and its clock offset, so a replayed outbox is a set of duplicates, not a
second check-in. `attendance` is recomputed per `(occurrence, person)` by
folding every non-voided event in device order under an advisory lock, so a
check-out that reaches the server before its move still folds correctly,
and genuine inversions are kept and flagged (`anomalies`). A `rev` sequence
lets clients catch up (`rev > last_rev − overlap`; revs are drawn before
commit, so a row can land with a smaller rev than one already seen: overlap
by at least 1000, or take rows updated in the last two minutes, and dedupe
by id). `room_stays` is a view
over the same log, so time in a room is always reconstructable (exposure
notices depend on it); it is computed over the whole log by a definer
helper and then filtered to the rooms the reader may see, so a stay never
runs on because its closing event was out of the reader's scope, and a
child the projection has out is out. We chose this over a generic event store: the
tables are typed, indexed and readable by SQL reports.

### One write path

`ingest(commands)` is the only way to write sessions, events, alerts and
guest families. Each command runs in its own savepoint and answers
`accepted`, `duplicate`, `retry` (a deadlock or lock timeout that outlived
three attempts; the outbox resends) or `rejected(reason)`, so one bad
command never blocks the rest. It enforces the station's room scope, refuses restricted
check-ins and restricted pickups with `see_staff` plus a silent
`station_alert`, binds security codes, and alerts on duplicate codes and
missing background checks. The API has no INSERT policy on any log table.

### Station identity is a pairing row, never a token claim

A paired device is an auth user with `app_metadata.kind = 'station'`. The
database recognises it only through `chms_private.station_principals`
(`my_station()`), which the pairing edge function writes and an admin can
revoke; the token's own `station_id` claim is ignored. Station users get no
profile; restrictive policies and `BEFORE` triggers wall them off from the
review site and the membership tables (the triggers hold inside
`SECURITY DEFINER` code too); the claim RPC and edge function refuse them.

### Pairing (1b)

A check-in manager asks for a pairing code (eight characters from the
security-code alphabet, hashed in `chms_private.station_pairing_codes`, ten
minutes, one use, one live code per station). The `pair-station` edge
function, which needs no token, creates the device's auth user
(`station-<uuid>@stations.invalid`, `app_metadata.kind = 'station'`), claims
the code through `claim_pairing_code()` (service role only; it refuses a
person's account and retires the device paired before), and hands the device
a session minted from a one-time magic link. The device keeps the refresh
token and nothing else. Unpairing revokes the pairing row, so `my_station()`
is null at once, and the function bans the retired auth users
(`revoked_station_users` / `confirm_station_revocation`) so their refresh
tokens die too. Nothing a church user can read carries an account id.

### Least privilege for rooms

Rooms readable by a station are its scope (`station_scopes`; none means
every room). Rosters come from `roster()` as first name + last initial,
flags and code status, logged once per read. Families come from
`station_lookup()` (whole phone number or scan on a kiosk; last four digits
or a name on a staffed desk; twenty misses in ten minutes lock the station
out), `station_household()` (criteria fields, care flags and short allergy
text, "see staff" without its reason, today's pass), `station_pickups()`
(guardians, authorized and restricted pickups by name, only for a child in
the caller's rooms now) and `station_volunteers()`; each is logged once. Room leaders (`room_leaders`)
get their rooms; `checkin.manage`, `kids.view` and `attendance.reports` get
the church. Care notes stay RPC-only; restriction reasons need `kids.care`;
documents open through `log_document_access()` and a signing edge function.

### Codes

Security codes come from the alphabet `ACDEFHJKMNPRTUVWXY34679` (no
look-alikes), unique per church per day. Stations draw blocks ahead of time
(`allocate_codes`); a code issued to a session covers both services and
every child on the pass; a code already bound to another session is
accepted and alerted rather than refused.

### Keep everything (decision L)

Nothing in the core is deleted: rooms, schedules, stations and slots are
archived; memberships end; the logs refuse changes. Events carry ids and
codes, never names or free text (pickup names live in a side table), so a
redaction path could be added later without touching the log.

### Shared logic in `packages/core`

Ages, grades (cutoff and Move-Up rollover), room criteria (the same shape
`chms_private.check_room_criteria` accepts), capacity warnings, pickup
checks, punctuality and the label model are one TypeScript package with
tests, used by the church app and the station app, so a laptop and an iPad
route a child the same way the database would.

## Consequences

- Reports and the rules engine read `attendance` (one row per child per
  occurrence, decision Q1) plus `attendance_baselines`; they never need the
  raw log, but it is there. Reports are SECURITY DEFINER functions that gate
  and log themselves (1c), and they resolve merged people through
  `person_merges` at read time: a merge archives the duplicate and records
  what it became; nothing in the log or the projection is rewritten.
- The station app owns an outbox and replays it in order; the server never
  needs to be told "this is a retry".
- Pairing (1b) adds the edge function and a pairing-code table; nothing in
  the core changes.
- Realtime broadcast and pg_cron are guarded so the migration chain runs
  on plain Postgres in CI.
