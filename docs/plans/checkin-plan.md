# Check-in, notifications and rules: Phase 0 plan

Spec: `docs/specs/checkin-and-rules.md`. Builds on People v1 (`supabase/migrations/20261031041359_chms_people.sql`, `apps/chms`, ADR-0004).

## 1. What People v1 gives us, and what it lacks

**Has:**
- `organizations` and `org_members`;
- roles and permissions resolved by `chms_private.*` helpers, with set-based RLS and guard triggers;
- `people` (birthdate, gender, tags, photo_url, external ids);
- `households` and `household_members` (head/spouse/child/other; a person can be in two households);
- `people_audit`;
- notes (care/oversight/private).

Rules we keep: no church user ever reads an auth account id, and the chart is admin-only.

**Lacks:**
- church time zone and check-in settings;
- guardian flags;
- grade;
- care data;
- pickups and custody;
- credentials;
- custom fields;
- household flags;
- normalized phones and scan keys;
- device/station identity;
- domain events.

Permissions are hard-coded in three places: the `org_roles` CHECK constraint, the admin branch of `user_permissions`, and the role seed.

## 2. Conventions (all new tables)
- **Tenancy.** Every row has `org_id`, with RLS through `chms_private` helpers.
- **Views.** Every view is `security_invoker`, with SELECT revoked from anon.
- **Tests.** Every policy, view and RPC gets a two-church RLS test (CLAUDE.md rule).
- **No account ids.** Actor columns are person ids plus a station id. No auth user ids appear in any table a church user can read; device auth uids live in `chms_private`. The existing guardrail test is extended to enforce this.
- **Ids and times.**
  - Rows created on devices carry a client UUIDv7.
  - Postgres 15/17 has no built-in uuidv7, so a SQL `uuidv7()` helper covers server rows that need ordering.
  - Timestamps are stored in UTC.
  - Device rows carry `device_at`, the station's `clock_offset_ms` and `recorded_at`.
- **Append-only logs.** Event tables are append-only: an INVOKER guard trigger refuses UPDATE/DELETE. The only way past it is `redact_person()` (§9), which sets a transaction-local flag. Event foreign keys are `on delete restrict`; organizations and people are archived, never hard-deleted.
- **No personal data in events.** Events hold ids and codes, not values: phone lookups store method + last 4 digits only; names and free text go in side tables that can be redacted; domain-event payloads carry changed field names, not values.
- **Audit everywhere.** Every new mutable table gets an audit trigger: who (person/station), before and after, when. For sensitive tables (care, pickups, credentials, restrictions) the audit is readable only by `kids.care` holders and admins.
- **Soft delete.** `household_members` gains `ended_at` instead of hard delete, because custody history matters. The remaining People v1 hard deletes (roles, notes) are a documented exception.

## 3. Data model

### 3.1 Migration A: People v1 changes
- **Permissions:**
  - `chms_private.all_permissions()` becomes the single source for the CHECK constraint, the owner/admin branch and the seed;
  - new permissions: `checkin.station`, `checkin.manage`, `kids.view` (children in the directory), `kids.care` (medical and special-needs notes), `custody.manage`, `attendance.reports`, `notify.page`, `notify.broadcast`, `rules.manage`;
  - seeded roles: Kids Director, Room Leader, Check-in Volunteer;
  - the TypeScript `Permission` union is updated;
  - see Q-N on whether admins get `kids.care` and custody access implicitly.
- **Children in the directory.** Children (relationship `child` or age < 18) need `kids.view` to read through the `people`, `household_members` and `people_audit` policies.
- **`org_checkin_settings`** (RLS on `checkin.manage`): time zone (required at setup), grade cutoff (`08-16`), promotion date per school year, label-privacy defaults, retention period.
- **`household_members`** gains `is_guardian`, `can_check_in`, `ended_at`.
- **Grade.** `people.grade_override` and `grade_override_year`. The override advances each school year: grade = override + (current year − override year). Only staff clear it.
- **Custom fields.** `custom_field_defs` (applies to person or household, type, options, `sensitive`). Non-sensitive values go in `people.custom` / `households.custom`. Sensitive values go in a separate table with its own permission and are kept out of `people_audit`.
- **`household_flags`** (flag, note, set_by, set_at, cleared_at), append-friendly. Flags include `exempt`, `joining_team`, `no_longer_attending`, `pastoral_hold`. Notes behind a pastoral hold stay in person notes.
- **`child_care`** (1:1 with the child): allergies, `allergy_short` (label text), medical, special_needs, alert flags. There is **no SELECT policy**. It is read through `get_child_care()`, which checks `kids.care` and writes `access_log`. Stations receive alert flags and the short allergy text only.
- **`pickup_people`** (child, person or side-table name, kind `authorized` / `restricted`, valid_from/to; court-order details are a question, Q-K):
  - only `custody.manage` writes it;
  - **a restricted entry overrides every guardian, `can_check_in` and authorized flag for that child**, enforced by one DB function and by `packages/core`.
- **`person_credentials`** (background check, training, child safety; completed, expires, verified_by). Readable with `checkin.manage`; stations see only cleared/expired.
- **`contact_consents`**, moved up from Phase 3:
  - keyed per (org, E.164 number, scope `safety` | `general`), with text_version, source, station and revoked_at;
  - linked to people;
  - imported numbers start with no consent.
- **Phones and scan keys.** `people.phone_e164` is generated and normalized, with an index for last-4 lookup. `checkin_keys` (household/person, kind qr/barcode/keytag, value, unique per org) also holds imported Subsplash key tags.
- **Photos.** `people.photo_path` points into a private per-church storage bucket (`org/person`) with storage RLS. Photos are served as short-lived signed URLs, never public URLs (Q-M).
- **`access_log`**: append-only, admin-read. It records single reads and bulk reads (sync, export, import, preview) with a subject count and the filter used.
- **`domain_events`**: bigint identity for order, plus `uuidv7` id, type, subject, actor person, station, `device_at`, `recorded_at`, and payload as ids and changed field names. People/household triggers emit `person.created`, `person.updated`, `household.member_added` and so on. **No queue yet** (§7).
- **`people_audit`** gains `actor_kind 'station'` and `station_id`.

### 3.2 Migration B: configuration and stations
- **`areas`** (kind kids/volunteer/event/group/general). **`area_leaders`** and **`room_leaders`** (area or room → role or person, kind director/leader) drive routing.
- **`rooms`**: capacity, children-per-adult ratio, overflow_room_id, priority, and `criteria jsonb`. Criteria are typed and validated by a SQL check function and the same zod schema:
  - age in months or years, birthdate range, grade range, gender, tag or custom field, manual-only;
  - every bound states inclusive or exclusive, plus "measured on": the occurrence date or the cutoff date.
- **`schedules`** use constrained recurrence instead of RRULE: kind, local start time, duration, weekdays, interval_weeks, starts_on, until, exdates. **`schedule_rooms`** says which rooms run at which schedule.
- **`occurrences`**:
  - unique (schedule, local_date);
  - generated with a plain SQL function: `generate_series` over local dates, `(local_date + local_time) at time zone tz`, which is DST-safe;
  - pg_cron calls it eight weeks ahead, behind the existing extension guard;
  - editing a time updates future occurrences that have no events.
- **`room_overrides`**: sticky per-child room with an optional end date.
- **`checkin_restrictions`** applies to children: staff-set only (§10 guardrail).
- **Volunteer credential blocks** are enforced at the station (§5).
- **`printers`** (model, address, stock, area) and **`label_templates`** (kind child/pickup/volunteer, stock, layout JSON, version, default).
- **Stations:**
  - `stations` (mode kiosk/staffed/roster/volunteer, areas or rooms in scope, default printer, label stock, active);
  - `chms_private.station_principals` (station → auth uid, platform, app version, last_seen, revoked_at);
  - `chms_private.my_station()` looks the station up by `auth.uid()` (active, not revoked), so it never trusts a claim alone.
- **Staff PINs** live in `chms_private`. Each station receives a per-station HMAC verifier that rotates at every sync, locks the device after N misses, and logs each use.

### 3.3 Migration C: the attendance core
- **`checkin_sessions`** (client UUIDv7): one family pass at one station.
  - Columns: local_date, household, guardian (checked in by), station, lookup method + last 4, started_at, completed_at, `queued_offline`.
  - It covers several children **and both services**.
  - It drives the pickup tag and the "check-in under 20 seconds" metric.
- **`security_codes`** (org, local_date, code, station, allocated_at, session_id, issued_at), with **unique (org, local_date, code)**.
  - The alphabet is `ACDEFHJKMNPRTUVWXY34679`: 23³ = 12,167 codes a day.
  - Blocks are allocated at every sync for the next service dates.
  - The no-server fallback uses a station-slot prefix plus 3 characters, a 4-character code that is unique by construction.
  - Check-out accepts any code issued to that child that day. Duplicates alert staff.
- **`attendance_events`** (append-only, client UUIDv7):
  - columns: session_id, occurrence_id, person_id, type, role, room_id, from_room_id, `target_event_id` (for voids), `picked_up_by_pickup_id` / person (free-text names go in a side table), verified_by_person_id, code_matched, station_id, actor_person_id, device_at, clock_offset_ms, recorded_at, source (`station` / `import` / `admin`), external_id (unique per org and source);
  - types: check_in, move, check_out, void, label_print_requested, label_printed, print_failed.
- **`attendance`** is the projection: one row per (occurrence, person), plus `rev` from a sequence. A trigger maintains it:
  1. it takes an advisory lock on the key;
  2. it **recomputes the row by folding all events** for that key, ordered by `device_at + offset`, then `recorded_at`, then id;
  3. a check-out can arrive before its check-in;
  4. moves after a check-out are kept and flagged as anomalies;
  5. voids remove their target;
  6. all non-voided codes are kept.

  Print events don't affect the projection.
- **`room_stays`** (a security_invoker view): person, room, from, to. A stay with no check-out ends at the occurrence's `ends_at`.
- **`station_alerts`** (append-only; restricted_pickup / restricted_checkin / credential_block / over_ratio; acknowledged_by/at) ships in 1b, not Phase 3.
- **`attendance_baselines`** (household, year, count, source): the fallback if Subsplash history can't be imported.
- **Writes go through `ingest(commands jsonb)`**, one definer RPC whose commands run in order:
  - `guest.create`: client ids for person, household, members, care, consent. People are tagged guest and unverified, never auto-merged; a "possible duplicates" staff queue and merge tool come in 1c;
  - `session.start`, then attendance events, then `alert.raise`;
  - each command runs in its own savepoint and returns `accepted` / `duplicate` / `rejected(reason)` without blocking the rest;
  - scope comes from `my_station()` or room scope (§5).

### 3.4 Migration D: notifications (Phase 3)
- `message_templates` (kind page/emergency/exposure/general/rule; fixed templates for volunteers).
- `messages` (an idempotency key; a segment description holding only room and window for exposure notices).
- `message_recipients` (status, provider id).
- **One sender per church**: a provider messaging service verified in the church's name, with STOP routed by sender.
- **Recipient resolution** is one DB function that always excludes anyone restricted for that child. A page goes to the guardian who checked the child in, plus guardians in that household.

### 3.5 Migration E: rules and workflows (Phase 4)
- `rules`, `rule_versions` (immutable, `activated_at`), `rule_runs` (unique (rule_version, trigger_event)), `rule_dedupe`.
- `workflow_instances`, `workflow_step_runs`, `tasks` (the case view), `person_alerts`.
- pgmq is added here, guarded by an extension check so local tests and CI still run.

## 4. Room assignment (`packages/core`, pure TypeScript)
- **Functions:** `ageOn`, `gradeFor` (cutoff, promotion, advancing override), `matchRooms` (override, then priority order, then choices or staff), `capacityState` (ok/warn/over, overflow suggestion, never blocks), `nextRoom` (birthday or promotion date) for the Move-Up report, and `eligibleGuardians`/`pickupCheck` with restricted precedence.
- **Tests.** LWR's six Barn rooms and the 36-month / 3-year edge are table-driven tests. LWR's configuration is seed data in `supabase/seed/lwr-checkin.sql`, never code.
- **Packaging.** Zero-dependency ESM, consumed through a `file:` dependency and aliases by `apps/station` and `apps/chms`, and copied into `supabase/functions/_shared/core` by a script. Apps stay standalone: no npm workspaces, and `src/lib/database.types.ts` stays where it is. Workspaces can come later in its own ADR.

## 5. Station app, identity, offline

**App.** Use **Capacitor** with a new `apps/station` (Vite + React + TypeScript SPA). Expo would mean React Native views plus a second browser UI. The same build runs on laptops (`station.bytheirfruit.church`) and is bundled inside the iPad and Android shells; Apple rejects remote-URL wrappers. Native pieces:
- **Printing:** Brother Print SDK v4, via `@rdlabo/capacitor-brotherprint` or a thin Swift/Kotlin plugin. The iOS `NSLocalNetworkUsageDescription` and Bonjour keys are needed for Wi-Fi printing.
- **Local data:** SQLCipher SQLite and secure storage.
- **Scanning:** the camera barcode scanner.
- **Kiosk lock:**
  - iOS: supervise the iPads with Apple Configurator (free, needs a Mac, wipes the device) for Autonomous Single App Mode; Guided Access is the fallback.
  - Android: screen pinning for the pilot. True Lock Task needs an MDM / Android Management API kiosk policy, not a device-owner app in the Play build.

**Station identity** (1b, web first):
1. An admin creates a station and gets a pairing code (hashed, valid 10 minutes).
2. The `pair-station` edge function creates an auth user `station-<uuid>@stations.invalid` with `app_metadata.kind = 'station'`, stores it in `chms_private.station_principals`, and returns a session.

Walling stations off from the review site:
- `handle_new_user` skips station users;
- restrictive policies deny station principals on reviews, likes, flags, photos, claims, profiles and storage;
- every RPC granted to `authenticated` checks `not is_station()`;
- tests cover each of these.

**Unpair and wipe** revokes the principal and its refresh tokens.

**Room scope** (least privilege):
- **Classroom devices** are stations bound to rooms.
- **Personal logins** (staff phones in roster mode) get room scope from that person's own volunteer/leader check-in for the current occurrence, or from `room_leaders`. It ends when they check out.
- **Rosters** come from a definer roster RPC: first name + last initial, photo, alert icons, code status, guardian first name. It never needs `people.view`.
- **Actions** (move, check-out, page) verify the row is in the caller's room and occurrence. Volunteers send fixed templates only.

**Kiosk self-serve:**
- full phone number or scan only; last-4 only on staffed stations;
- results show first name + last initial;
- no care, pickup or custody data on screen;
- the device locks out after repeated misses;
- a restricted check-in or pickup shows "please see the welcome desk" plus a silent `station_alert`.
- **A staff PIN never overrides a restriction.** That needs an online user with `checkin.manage` or `custody.manage`.

**Cache scope, by mode:**
- **Kiosk:** a lookup index of HMAC'd phone numbers (key issued per day), children's first name + last initial, eligible rooms, and the code block.
- **Staffed and roster:** add pickup lists for their own rooms only (restricted entries as name + photo + "see staff", no court-order notes), allergy flags and short allergy text, and credential cleared/expired status.
- **Never cached:** medical or special-needs text, notes.
- **Lifetime:** purged at the end of the local day or after N hours offline.
- **Logging:** each sync is logged as one bulk-access row.
- **Laptops:** the IndexedDB cache is limited to the kiosk index and wiped on unpair; full offline support is on tablets.

**Writes:**
1. Every action becomes a command or event in the local outbox.
2. It is applied to the local projection.
3. The label prints.
4. The outbox is pushed in order to `ingest`.

This is idempotent, so retries are safe, and rejections land in a staff queue.

**Volunteer credential block:** volunteer mode reads the cached credential status, blocks kids-room roles when a check has expired, and raises a `station_alert`. The Phase 4 rule only notifies.

**Live updates:**
- Realtime **Broadcast from Database**: the projection trigger sends to the private topic `org:{org}:occ:{occ}`, with RLS on `realtime.messages` via membership or `my_station()`.
- Catch-up pulls `attendance.rev > last_rev − overlap` and dedupes.
- Both are guarded for CI.

**Outage matrix (the drill tests both cases):**
| Case | Printing | What devices see | Degraded behavior |
|---|---|---|---|
| Internet (WAN) down, LAN up | Works | Own events plus the morning snapshot | Rosters show "stale since hh:mm". Check-out can record a child this device doesn't know, flagged unverified, with a visual match of label code to pickup-tag code. A restricted hit locks check-out until staff clears it; the alert syncs later. |
| LAN down | Wi-Fi printers are unreachable unless set to Wireless Direct (or Bluetooth on Android) | Own device only | Same as above, plus a "print later" queue and a handwritten-label fallback |

## 6. Labels and printing
- **One label model** in `packages/core` with **fixed sizes**: child 62×29 mm, pickup tag 62×100 mm (adjust to LWR's current labels, Q4).
- **Browser tier:** each size is a custom paper size in the QL driver with cut-at-end, and CSS `@page { size: 62mm 29mm; margin: 0 }` matches it exactly. The browser can only log `label_print_requested`: no success/failure and no reroute. Staff reprint from the roster.
- **Native tier:** a bitmap goes to the Brother SDK, with real success/failure, retry, and reroute to another `printers` row.
- **Template editor** (1a admin) with presets and live preview from the same model. Child labels default to first name + last initial and an allergy icon; allergy text is opt-in (Q-J).
- **Setup spike** of half a day with LWR's actual QL-8xx and driver before the 1b dry run.

## 7. Domain events, Groups/Events, and the rules engine
- **Domain events.** Phase 1 writes `domain_events` only. Phase 4 adds the pgmq enqueue trigger and a worker run by pg_cron every minute, batching events with no per-row pokes. Event-triggered rules fire only for events recorded after the rule version's `activated_at`; the backlog serves metrics and preview only. Each action is checked against an idempotency key before it runs.
- **Events** (Parents Night Out, VBS) are schedules of kind `event`, using the same rooms, sessions, labels and reports. Registrations come later.
- **Groups and teams:** `groups` and `group_members`; meetings are schedules; leaders take attendance in roster mode (`attendee` / `leader`). Serving teams are groups, so "serving adult" can be team-based (Q-D).
- **Rules engine:**
  - **Conditions** are a typed JSON DSL compiled to vetted SQL metric functions, never admin-written SQL. Examples: `metric_household_child_checkins` (which adds `attendance_baselines`), `metric_consecutive_absences` (per service week across a set of schedules), "room state held for N minutes" (evaluated each minute during open occurrences), and last seen.
  - **Permissions.** Every condition and merge field is tagged with the permission it needs (care fields need `kids.care`, custody needs `custody.manage`, notes are never available). Save and preview go through a definer RPC that checks the author's permissions; the worker re-checks the author at run time. Previews are logged to `access_log`.
  - **Actions** follow spec §10. Child restriction always means a staff task. Rules may notify about a volunteer credential block but never set one.
  - **Workflows** are steps with waits. Exits are re-checked before each step; dedupe uses `rule_dedupe`.
- **Serve policy seed rule:**
  - trigger: Mondays at 6 am in the church time zone;
  - count: household child check-ins this calendar year plus the baseline, with the unit from Q1;
  - exclusions: a serving adult (Q-D), exempt / joining / no longer attending / **pastoral hold**, and no check-in in the last 3 months;
  - dedupe: once per household per year;
  - routing: by area through `area_leaders` (Q-E);
  - the case view shows the children, parents, rooms, and any serving outside kids ministry;
  - **step 1 is "director approves and sends"** (automatic sending is off for the first season);
  - then 2 weeks → email → 2 weeks → final email → task: the director confirms removal;
  - exits: started serving, exempt or joining, responded.

## 8. Phases (each ends testable)
| Phase | Delivers | Done when |
|---|---|---|
| **1a Core data + admin** | Migrations A–C. `packages/core`. Admin in `apps/chms`: settings, areas/rooms/criteria, schedules, printers, label templates, stations, care, pickups/custody, credentials, flags, custom fields. LWR seed data. Domain events. Redaction. | DB tests for every policy, trigger and view (two-church). LWR room matrix passes. An admin configures the Barn. |
| **1b Web station** | `apps/station` in the browser: pairing and unpair, station identity walls, staffed/volunteer/kiosk/roster modes, lookup, guest quick-add with consent, sessions and codes, check-in/move/check-out, browser labels, station alerts, room-scoped rosters, Realtime. | Laptop + QL dry run at LWR. Returning family under 20 s. A station token cannot post a review. |
| **1c Reports + import** | §9 reports with CSV (bulk-read logged). Subsplash import or baselines. Duplicate-guest merge. | Tyler's Monday numbers match. |
| **2 Native** | Capacitor iPad, then Android: Brother SDK, kiosk lock, SQLCipher cache scoped by mode, outbox, wipe. Store readiness: demo church and reviewer pairing code, privacy labels / Data Safety, TestFlight and Play testing. | Live Barn pilot passing both outage drills. |
| **3 Notifications** | Per-church senders, consent/STOP, page, emergency (with a list of guardians who can't get SMS and an email fallback), exposure (room + window + illness template, small-room warning, includes volunteers), general, quiet hours. | Page and exposure drills. |
| **4 Rules** | Engine, builder, preview, history, workflows, tasks; seed rules. | Serve policy replaces the Monday report. |
| **5 Parents** | Pre-check-in, QR/wallet pass, push, history, in-app account deletion; DYMO/Zebra. | — |

Groups and Events can start after 1b with no new core tables.

## 9. Pushback
1. **"Delete nothing" needs `redact_person()`.** Deletion requests, the app-store rule and state privacy laws all apply to kids' data. Redaction is the only path past the append-only guard: an admin-gated definer function that blanks listed personal-data columns and side tables and logs a redaction event. Events stay free of personal data so counts survive. A retention period is needed (Q-L).
2. **"Log every view" works only where reads go through our code.** Care notes are RPC-only, and bulk reads (sync, export, import, preview) are logged once per operation, not per render.
3. **Subsplash.** You told me it won't export people. If check-in history can't be exported either, we load per-family YTD baselines once. Families are then entered at first check-in as guests, unless Subsplash can export people (Q-A).
4. **A restriction is never shown to a parent, and never automated for a child.** A volunteer credential block is automatic, but at the station, not through the rules engine.
5. **Serve-policy letters start director-approved, with a pastoral hold.** Automatic letters to families in crisis or in shared custody would hurt.
6. **Build the rules engine for the five seed rules,** with a fixed, permission-tagged catalog, not a general workflow language.
7. **Typed append-only tables with fold-on-write projections,** not a generic event store.
8. **The app-store and SMS long poles start now:**
   - an Apple Developer **organization** account (needs a D-U-N-S number; weeks);
   - a Google Play organization account (new personal accounts must run a 14-day closed test with 12+ testers);
   - Twilio with **one verified sender per church** (we're an ISV). Toll-free verification is usually faster than 10DLC. At about 3 messages per second, a broadcast to 150 families takes about a minute.
9. **Children are visible to every `people.view` role today.** That includes Staff, Elder, Deacon and Group Leader. I'd add `kids.view` (Q-N).

## 10. Questions
**From the spec's §12:**
- Q1: count unit.
- Q2: Brother models; Wi-Fi or Bluetooth.
- Q3: K/5 rooms and Move-Up date.
- Q4: current label content and sizes.
- Q5: SMS budget; who may broadcast.
- Q6: parent app timing.
- Q7: multi-campus. The plan leaves room to add a campus above areas later.

**Need answers before 1a:**
- **A.** Can Subsplash export check-in history and/or people (households, kids, allergies, key tags)?
- **B.** Are the month-based rooms measured on the service date, and Cubs/Colts on the Aug 16 cutoff? At exactly 36 months, Ducklings or Cubs?
- **C.** Is the serve-policy "family" the household? How does a child in two households count?
- **D.** What is a "serving adult": a volunteer check-in in a kids room within what window, or team membership? Does serving outside kids ministry count?
- **E.** A family with kids in both the Barn and K/5: one case to both directors, or a primary?
- **F.** Who reads full medical and special-needs notes? (Plan: `kids.care` only; volunteers see icons and short allergy text.)
- **G.** Can we supervise the iPads with Apple Configurator, or is there an MDM? For Android, is screen pinning OK for the pilot?
- **H.** Which legal entity holds the Apple and Google accounts and is the SMS sender? Who signs the registration?
- **I.** Do volunteers just check in, or are they pre-scheduled? Scheduling isn't in this spec.
- **J.** Label privacy defaults: first name + last initial? Allergy icon only, or text too?
- **K.** Custody: who may enter restrictions, what evidence is needed, and do we store court documents (and where)?
- **L.** Retention period for children's data. Who may redact?
- **M.** Children's photos: capture them? With what guardian consent, and who sees them?
- **N.** Should church admins and owners automatically hold `kids.care` and custody access? Which roles get `kids.view`?
- **O.** How do the ~40 room volunteers sign in: classroom devices bound to rooms, or their own phones (logins come from admin invites)?
- **P.** Serve-policy letters: mailed or emailed? Who signs them?
