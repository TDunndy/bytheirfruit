# Check-in, notifications and rules: Phase 0 plan

Spec: `docs/specs/checkin-and-rules.md`. Builds on People v1 (`supabase/migrations/20261031041359_chms_people.sql`, `apps/chms`, ADR-0004).

## 0. Decisions (Tyler, 2026-11-01)
Answers to the first draft's questions A–P, and what each changes.

| # | Decision | Effect on the plan |
|---|---|---|
| A | Subsplash exports nothing; an admin can only read it on screen. | No import. An admin screen records each family's year-to-date count (`attendance_baselines`). Families enter the system through guest quick-add or admin entry. We issue our own QR/key tags. |
| B | Month-based rooms are measured on the service date; Cubs/Colts and kindergarten entry use the Aug 16 cutoff. | Encoded in LWR's room criteria. The 36-month edge has a proposed default (B2, confirm). |
| C | A child can belong to two households. | Already supported. A check-in counts toward the household of the guardian who checked the child in; each household is its own serve-policy case. |
| D | A serving adult is any adult who serves. Serving outside kids ministry can count, but only as a staff-verified exemption. | Automatic exclusion: a volunteer check-in in a kids area within the window (D2, confirm). Otherwise staff set a `serving_elsewhere` flag with a note. |
| E | Jenna: newborn to pre-K. Jenny: kindergarten and up. | `area_leaders`: Barn → Jenna, K/5 → Jenny. A family with children in both areas gets one case, assigned to the director whose area has more of that family's check-ins this year (ties go to the Barn); the other director can see it (E2, confirm). |
| F, N | Medical and special-needs notes: leadership, staff and head volunteers. Custody data: pastors, elders and kids directors. Church admins see all. | `kids.care` is seeded on Pastor, Staff, Elder, Kids Director and Room Leader. `custody.manage` on Pastor, Elder and Kids Director. Owners and admins hold everything, as in People v1. Adult volunteers get nothing by default; a church can grant it. |
| G | "Supervised" was unclear. | The pilot uses Guided Access, which is built into iOS and exits with a staff passcode. Supervision is a one-time reset-and-enroll through Apple Configurator on a Mac that lets the app lock itself; it is optional and can come later. Android uses screen pinning. |
| H | Citrus Data, possibly with a "By Their Fruit" DBA. | Apple and Google accounts under Citrus Data (Apple needs Citrus Data's D-U-N-S number). SMS: Citrus Data registers as the provider; each church is a verified sender in its own name. |
| I | Volunteers are scheduled and still check in; record early, on time, late and no-show. | New volunteer scheduling tables, punctuality at check-in, and a volunteer report (§3.2, §8). |
| J | Child label: first name, last name, room, allergies, pickup code. The parent's pickup paper prints too and carries the same code. | Default child template: full name + room + allergy text + code. Pickup tag: code + children's names. Sizes are still open (Q4). |
| K | Custody only as it comes up, with a place for files and notes. | `pickup_people` (restricted entries) plus `person_documents` in a private bucket (kind custody/medical/other) and notes. Access needs `custody.manage`. |
| L | No redaction. Keep all data forever. | `redact_person()` is removed; the append-only guard has no bypass. Events still carry no personal data, since reports read them widely. Phase 5 parent accounts: in-app deletion removes the parent's login only, which satisfies the app-store rule; church records stay. |
| M | Photos are captured; consent comes from participating in the ministry and being on campus. | Capture at quick-add or in admin. Private bucket, signed URLs. The church's written policy states the consent. |
| O | Volunteers check in at front-desk iPads. | Roster mode runs on paired classroom devices bound to rooms. Volunteers need no app login. Personal logins are for staff with `checkin.manage` or a `room_leaders` assignment. |
| P | Letters are emailed, unsigned, as a church-wide notice of the Barn participation policy. | The template is a church notice. Step 1 stays director-approved for the first season (a toggle), per pushback 3. |

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
- **Append-only logs.** Event tables are append-only: an INVOKER guard trigger refuses UPDATE/DELETE, with no bypass. Event foreign keys are `on delete restrict`; organizations and people are archived, never hard-deleted. All data is kept forever (decision L).
- **No personal data in events.** Events hold ids and codes, not values: phone lookups store method + last 4 digits only; names and free text go in side tables; domain-event payloads carry changed field names, not values. Reports read events widely, so this keeps them least-privilege.
- **Audit everywhere.** Every new mutable table gets an audit trigger: who (person/station), before and after, when. For sensitive tables (care, pickups, credentials, restrictions) the audit is readable only by `kids.care` holders and admins.
- **Soft delete.** `household_members` gains `ended_at` instead of hard delete, because custody history matters. The remaining People v1 hard deletes (roles, notes) are a documented exception.

## 3. Data model

### 3.1 Migration A: People v1 changes
- **Permissions:**
  - `chms_private.all_permissions()` becomes the single source for the CHECK constraint, the owner/admin branch and the seed;
  - new permissions: `checkin.station`, `checkin.manage`, `kids.view` (children in the directory), `kids.care` (medical and special-needs notes), `custody.manage`, `attendance.reports`, `notify.page`, `notify.broadcast`, `rules.manage`;
  - seeded roles: Kids Director, Room Leader, Check-in Volunteer;
  - seeded grants (decisions F and N): `kids.care` on Pastor, Staff, Elder, Kids Director and Room Leader; `custody.manage` on Pastor, Elder and Kids Director; owners and admins hold everything;
  - the TypeScript `Permission` union is updated.
- **Children in the directory.** Children (relationship `child` or age < 18) need `kids.view` to read through the `people`, `household_members` and `people_audit` policies. `kids.view` is seeded on the same roles as `people.view`, plus Kids Director and Room Leader.
- **`org_checkin_settings`** (RLS on `checkin.manage`): time zone (required at setup), grade cutoff (`08-16`), promotion date per school year, label defaults, volunteer punctuality grace window.
- **`household_members`** gains `is_guardian`, `can_check_in`, `ended_at`.
- **Grade.** `people.grade_override` and `grade_override_year`. The override advances each school year: grade = override + (current year − override year). Only staff clear it.
- **Custom fields.** `custom_field_defs` (applies to person or household, type, options, `sensitive`). Non-sensitive values go in `people.custom` / `households.custom`. Sensitive values go in a separate table with its own permission and are kept out of `people_audit`.
- **`household_flags`** (flag, note, set_by, set_at, cleared_at), append-friendly. Flags include `exempt`, `joining_team`, `serving_elsewhere` (staff-verified, decision D), `no_longer_attending`, `pastoral_hold`. Notes behind a pastoral hold stay in person notes.
- **`child_care`** (1:1 with the child): allergies, `allergy_short` (label text), medical, special_needs, alert flags. There is **no SELECT policy**. It is read through `get_child_care()`, which checks `kids.care` and writes `access_log`. Stations receive alert flags and the short allergy text only.
- **`pickup_people`** (child, person or side-table name, kind `authorized` / `restricted`, valid_from/to, note):
  - only `custody.manage` writes it;
  - **a restricted entry overrides every guardian, `can_check_in` and authorized flag for that child**, enforced by one DB function and by `packages/core`.
- **`person_documents`** (person, kind `custody` / `medical` / `other`, storage path in a private per-church bucket, note, uploaded_by): the place for court orders and similar files, used only as cases come up (decision K). Reading needs `custody.manage` for custody documents and `kids.care` for medical ones; every read is logged.
- **`person_credentials`** (background check, training, child safety; completed, expires, verified_by). Readable with `checkin.manage`; stations see only cleared/expired.
- **`contact_consents`**, moved up from Phase 3:
  - keyed per (org, E.164 number, scope `safety` | `general`), with text_version, source, station and revoked_at;
  - linked to people;
  - numbers entered by admins start with no consent; the station asks at the next check-in.
- **Phones and scan keys.** `people.phone_e164` is generated and normalized, with an index for last-4 lookup. `checkin_keys` (household/person, kind qr/barcode/keytag, value, unique per org) holds the tags we issue.
- **Photos.** `people.photo_path` points into a private per-church storage bucket (`org/person`) with storage RLS. Photos are served as short-lived signed URLs, never public URLs. Stations and admins can capture them; consent is covered by the church's ministry policy (decision M).
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
- **Volunteer scheduling** (decision I):
  - `volunteer_slots` (schedule or a single occurrence, room or role, expected arrival as minutes before start, headcount needed);
  - `volunteer_assignments` (slot, person, status scheduled / confirmed / declined, set_by).
  - Punctuality is derived, not stored: at check-in the station compares `device_at` with the slot's expected arrival and the church's grace window, giving early / on time / late. No-show is computed when the occurrence closes: an assignment with no volunteer check-in that day.
  - Volunteer mode lists today's scheduled volunteers first, and unscheduled volunteers can still check in.
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
  - columns: session_id, occurrence_id, person_id, type, role, room_id, from_room_id, `target_event_id` (for voids), `picked_up_by_pickup_id` / person (free-text names go in a side table), verified_by_person_id, code_matched, station_id, actor_person_id, device_at, clock_offset_ms, recorded_at, source (`station` / `admin` / `import`, the last kept for a future importer), external_id (unique per org and source);
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
- **`attendance_baselines`** (household, year, count, entered_by, note): each family's year-to-date child check-ins, typed in by an admin from Subsplash's screen (decision A). The serve-policy count adds it to our own events for that year.
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
- **Kiosk lock** (decision G):
  - iOS: Guided Access for the pilot (built in; a staff passcode exits it). Later, if wanted, supervising the iPads through Apple Configurator on a Mac (a one-time reset-and-enroll) lets the app lock itself with Autonomous Single App Mode.
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

**Room scope** (least privilege, decision O):
- **Classroom devices** are paired stations bound to rooms. Room volunteers use these and never need an app login.
- **Volunteers check in** at the front-desk volunteer station.
- **Personal logins** are for staff: `checkin.manage` sees every room; a `room_leaders` assignment scopes a leader's phone to their rooms.
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

**Volunteer punctuality:** the volunteer station shows today's `volunteer_assignments`, records the check-in as an attendance event with role `volunteer`, and shows early / on time / late against the slot. No-shows are listed after the occurrence closes.

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
- **Template editor** (1a admin) with presets and live preview from the same model. The default child label (decision J) shows first name, last name, room, allergy text and the pickup code; the pickup tag shows the code and the children's names. A church can switch to last-initial-only or icon-only allergies in the editor.
- **Setup spike** of half a day with LWR's actual QL-8xx and driver before the 1b dry run.

## 7. Domain events, Groups/Events, and the rules engine
- **Domain events.** Phase 1 writes `domain_events` only. Phase 4 adds the pgmq enqueue trigger and a worker run by pg_cron every minute, batching events with no per-row pokes. Event-triggered rules fire only for events recorded after the rule version's `activated_at`; the backlog serves metrics and preview only. Each action is checked against an idempotency key before it runs.
- **Events** (Parents Night Out, VBS) are schedules of kind `event`, using the same rooms, sessions, labels and reports. Registrations come later.
- **Groups and teams:** `groups` and `group_members`; meetings are schedules; leaders take attendance in roster mode (`attendee` / `leader`). Serving teams are groups. For the serve policy, only kids-area volunteer check-ins count automatically; serving elsewhere is a staff-verified `serving_elsewhere` flag (decision D).
- **Rules engine:**
  - **Conditions** are a typed JSON DSL compiled to vetted SQL metric functions, never admin-written SQL. Examples: `metric_household_child_checkins` (which adds `attendance_baselines`), `metric_consecutive_absences` (per service week across a set of schedules), "room state held for N minutes" (evaluated each minute during open occurrences), and last seen.
  - **Permissions.** Every condition and merge field is tagged with the permission it needs (care fields need `kids.care`, custody needs `custody.manage`, notes are never available). Save and preview go through a definer RPC that checks the author's permissions; the worker re-checks the author at run time. Previews are logged to `access_log`.
  - **Actions** follow spec §10. Child restriction always means a staff task. Rules may notify about a volunteer credential block but never set one.
  - **Workflows** are steps with waits. Exits are re-checked before each step; dedupe uses `rule_dedupe`.
- **Serve policy seed rule:**
  - trigger: Mondays at 6 am in the church time zone;
  - count: household child check-ins this calendar year plus the baseline, counted toward the household of the guardian who checked the child in (decision C), with the unit from Q1;
  - exclusions: an adult in the household with a volunteer check-in in a kids area within the window (D2), the flags exempt / joining / serving elsewhere / no longer attending / **pastoral hold**, and no check-in in the last 3 months;
  - dedupe: once per household per year;
  - routing: by area through `area_leaders` (Barn → Jenna, K/5 → Jenny). A family with children in both areas gets one case, assigned to the director whose area has more of its check-ins this year, ties to the Barn; the other director can see it (E2);
  - the case view shows the children, parents, rooms, and any serving outside kids ministry;
  - **step 1 is "director approves and sends"** (automatic sending is off for the first season; a toggle);
  - then 2 weeks → email → 2 weeks → final email → task: the director confirms removal. All messages are emails from the church, unsigned, worded as the Barn participation notice (decision P);
  - exits: started serving, exempt or joining, responded.

## 8. Phases (each ends testable)
| Phase | Delivers | Done when |
|---|---|---|
| **1a Core data + admin** | Migrations A–C. `packages/core`. Admin in `apps/chms`: settings, areas/rooms/criteria, schedules, volunteer slots and assignments, printers, label templates, stations, care, pickups/custody and documents, credentials, flags, custom fields, baseline entry. LWR seed data. Domain events. | DB tests for every policy, trigger and view (two-church). LWR room matrix passes. An admin configures the Barn and this week's volunteer schedule. |
| **1b Web station** | `apps/station` in the browser: pairing and unpair, station identity walls, staffed/volunteer/kiosk/roster modes, lookup, guest quick-add with consent and photo, sessions and codes, check-in/move/check-out, volunteer check-in with punctuality, browser labels, station alerts, room-scoped rosters, Realtime. | Laptop + QL dry run at LWR. Returning family under 20 s. A station token cannot post a review. |
| **1c Reports** | §9 reports with CSV (bulk-read logged), plus the volunteer punctuality report. Duplicate-guest merge. | Tyler's Monday numbers match Subsplash's, using the baselines. |
| **2 Native** | Capacitor iPad, then Android: Brother SDK, kiosk lock, SQLCipher cache scoped by mode, outbox, wipe. Store readiness: demo church and reviewer pairing code, privacy labels / Data Safety, TestFlight and Play testing. | Live Barn pilot passing both outage drills. |
| **3 Notifications** | Per-church senders, consent/STOP, page, emergency (with a list of guardians who can't get SMS and an email fallback), exposure (room + window + illness template, small-room warning, includes volunteers), general, quiet hours. | Page and exposure drills. |
| **4 Rules** | Engine, builder, preview, history, workflows, tasks; seed rules. | Serve policy replaces the Monday report. |
| **5 Parents** | Pre-check-in, QR/wallet pass, push, history, in-app account deletion; DYMO/Zebra. | — |

Groups and Events can start after 1b with no new core tables.

## 9. Pushback (still standing)
1. **"Log every view" works only where reads go through our code.** Care notes and documents are RPC-only, and bulk reads (sync, export, preview) are logged once per operation, not per render.
2. **A restriction is never shown to a parent, and never automated for a child.** A volunteer credential block is automatic, but at the station, not through the rules engine.
3. **Serve-policy letters start director-approved, with a pastoral hold.** Automatic letters to families in crisis or in shared custody would hurt. The approval is a toggle the director can switch off once the rule has proven itself.
4. **Build the rules engine for the five seed rules,** with a fixed, permission-tagged catalog, not a general workflow language.
5. **Typed append-only tables with fold-on-write projections,** not a generic event store.
6. **The app-store and SMS long poles start now,** under Citrus Data (decision H):
   - an Apple Developer **organization** account (needs Citrus Data's D-U-N-S number; weeks);
   - a Google Play organization account (new personal accounts must run a 14-day closed test with 12+ testers);
   - Twilio with **one verified sender per church** (Citrus Data is the provider). Toll-free verification is usually faster than 10DLC. At about 3 messages per second, a broadcast to 150 families takes about a minute.
7. **Keeping all data forever** (decision L) is fine for the pilot. Because events carry no personal data, a redaction path could be added later without touching the log if a legal request ever requires it.

## 10. Still open
**From the spec's §12:**
- Q1: count unit. Two kids at one service: 1 or 2? Both services one Sunday: 1 or 2?
- Q2: Brother models at LWR; Wi-Fi or Bluetooth today.
- Q3: K/5 rooms and grades per room; Move-Up Sunday date.
- Q4: current label sizes (content is settled by decision J).
- Q5: SMS budget; who may send emergency broadcasts.
- Q6: parent app: Phase 5 or sooner.
- Q7: multi-campus now or later. The plan leaves room to add a campus above areas.

**Sub-points with a proposed default (confirm or change):**
- **B2.** At exactly 36 months: Ducklings while under 36 months on the service date, Cubs from the third birthday; kindergarten entry at age 5 by Aug 16.
- **D2.** Serving window for the automatic exclusion: any volunteer check-in in a kids area in the last 90 days.
- **E2.** Family in both areas: one case, assigned to the director whose area has more of that family's check-ins this year, ties to the Barn.
- **Jenny's full name and title**, for the People record and `area_leaders`.
