# By Their Fruit — Check-In, Notifications & Rules Engine

**Spec v1 · Nov 2026 · Owner: Tyler Dunn**
People v1 is done. This is the next build. Pilot church: Lakewood Ranch Baptist (LWR).

---

## 0. For Claude Code

- Read this spec and the People v1 code before proposing anything.
- Plan first (`docs/plans/checkin-plan.md`). No code until Tyler approves the plan.
- Names, tables and libraries are your call. Requirements here are not — ask if one is unclear, and push back if one is a bad idea.
- §1 applies to every vertical. Copy it into `CLAUDE.md`.

---

## 1. Platform principles (copy into CLAUDE.md)

1. **Multi-church, config-driven.** Every row is scoped to a church and protected by RLS. No church-specific logic in code — LWR's setup is data, not code.
2. **Log everything, delete nothing.** Every action writes an immutable event: who, what, when (device time + server time), which device/station. Current state is derived from the log or kept in sync with it. Soft-delete only. Store UTC; each church has a time zone.
3. **One attendance core.** Kids check-in, volunteer check-in, events (Parents Night Out, VBS) and groups all share one schedule → occurrence → location → check-in model. No kids-only tables.
4. **Rules are platform-level.** Every vertical emits domain events (`checkin.created`, `person.created`, …). Emit them from day one, before the engine exists.
5. **Offline-tolerant clients.** Client-generated UUIDs (v7) + idempotent writes, so a station can queue during a Wi-Fi drop and sync with no duplicates.
6. **Least privilege for kids' data.** Role-scoped access (a room volunteer sees their room, not the database). Log who views or edits child records.

---

## 2. Pilot context (LWR)

- 2 services: 9:00 and 10:45. ~150 kids + ~40 volunteers per Sunday (preschool + K/5 combined).
- Today: Subsplash check-in on 7 iPad + Brother QL stations (2 mobile stands, 3 wall-mounted, 2 desk), 62 mm continuous labels (DK-2205). One station is volunteers-only on blue label stock.
- Each kid gets 1 name label + 1 parent pickup tag. Each volunteer gets 1 label.
- Preschool rooms ("the Barn"), age cutoff Aug 16:

| Room | Rule |
|---|---|
| Little Lambs | 0–11 months |
| Piglets | 12–20 months |
| Chicklets | 21–29 months |
| Ducklings | 30–36 months |
| Cubs | 3 years |
| Colts | 4–5, not yet in kindergarten |

- K/5 rooms are grade-based.

---

## 3. Core model

- **Areas → Rooms:** capacity, adult:child ratio, which service times it runs.
- **Schedules → Occurrences:** "Sunday 9:00" → the Nov 8, 2026 instance. Every check-in belongs to an occurrence. Events will reuse this.
- **Check-in:** person, occurrence, room, role (child / volunteer / leader), checked in by (which guardian), lookup method + phone number used, station/device, security code, labels printed.
- **Room move:** its own row (from, to, when, by). Never overwrite the original room — time-in-room must be reconstructable (exposure notices depend on it).
- **Check-out:** when, picked up by, verified by (volunteer), code matched.
- **People v1 additions (if missing):** guardian/child household roles, birthdate, grade (manual override of the derived grade), allergies / medical / special-needs notes, photo, authorized pickups, restricted pickups (custody), volunteer background-check + training dates, custom fields.

---

## 4. Room assignment

- Per-room criteria, any combination: age in months, age in years, birthdate range, grade range, gender, tag/custom field, manual only.
- Church settings: age/grade cutoff date (LWR: Aug 16) and promotion date (Move-Up Sunday). Derive grade from birthdate + cutoff when none is entered.
- Boundaries are explicit (inclusive/exclusive). LWR's 36-month vs 3-year edge is a good test.
- Priority order. Multiple matches → offer choices. No match → staff picks.
- Per-child sticky override with optional end date (special needs, keep siblings together).
- Live count vs capacity and ratio. Warn and suggest an overflow room — never hard-block.
- **Moves: one tap, any user with check-in permission, no approval.** Logged. Optional label reprint.
- **Next-room projection:** each child's next room + date (birthday threshold or promotion date). Report for Move-Up Sunday planning.

---

## 5. Station app

- **Modes:** self-serve kiosk (parents) · staffed (volunteer runs it) · room roster (classroom device: live roster, move, page parent, check out) · volunteer-only (own label stock).
- **Lookup:** phone (full or last 4), name, or scan (QR / barcode / key tag). Log the method and number used.
- Pick kids + service(s). One pass covers both services for a kid staying all morning.
- Room auto-suggested; one-tap override.
- **First-time guest quick-add:** parent name + mobile, kids' names + birthdates, allergies, SMS consent → People records tagged guest.
- **Check-out:** scan or type the pickup-tag code; show authorized/restricted pickup alerts; log who picked up.
- **Restricted pickup hit:** neutral message on screen, silent alert to staff.
- Target: returning family checked in under 20 seconds. Big tap targets.
- Rosters update live on every device (e.g., Supabase Realtime).
- **Station setup:** admin generates a pairing code/QR → device bound to church, station name, mode and printer. No personal logins on shared kiosks; staff PIN to override or exit.
- **Kiosk lock:** iOS Guided Access, plus Autonomous Single App Mode on MDM-supervised iPads; Android Lock Task mode.

---

## 6. Labels & printing

- **Child label:** name (first + last initial option), room, service, date, security code, alert icons (allergy, medical, special needs, custody), guest marker, optional short allergy text.
- **Pickup tag:** same security code + kids' names.
- **Volunteer label:** name, room/role, date.
- Per-church template editor with presets and live preview.
- **Security code:** 3–4 characters, no look-alikes (0/O, 1/I), unique per church per day. Offline stations draw from a pre-allocated block.
- **Printers v1: Brother QL-8xx over Wi-Fi, 62 mm continuous (DK-2205)** — LWR's existing hardware, so the pilot needs nothing new. Use Brother Print SDK (iOS + Android, v4.x). A community Capacitor plugin exists (`@rdlabo/capacitor-brotherprint`, release candidate) — use it or write a thin native plugin.
- iOS Bluetooth printing to Brother requires Brother's MFi/PPID approval for App Store apps. Defer; Wi-Fi first.
- Laptops v1: browser station + Chrome `--kiosk-printing` (silent printing to the default printer).
- Failed print: retry, reroute to another printer, reprint from roster. Log every print and failure.
- Later: DYMO, Zebra.

---

## 7. Native apps

- **Targets:** iPad (primary), Android tablets, staff phones (room roster mode), laptops (browser).
- **Approach:** evaluate Capacitor vs Expo. Lean: Capacitor — one React station UI runs in laptop browsers and inside the iPad/Android shells. Reuse our TypeScript types and Supabase client either way.
- Must be a real app (offline, native printing, kiosk) — Apple rejects website wrappers.
- **Offline:** cache what a Sunday needs (households, rosters, room rules, code block); queue writes in an outbox; print locally; sync when back; show an offline banner. Append-only events + client UUIDs should keep this a simple outbox — no complex conflict resolution. Test by pulling Wi-Fi mid-service.
- **Store readiness:** demo church + reviewer login, privacy labels / Data Safety forms (children's data), in-app account deletion if parents can create accounts.

---

## 8. Notifications

- **Channels:** SMS (urgent), email (Resend), push (once a parent app exists). Capture SMS consent; honor STOP.
- **Page parent:** "Please come to Cubs" — from the roster in 2 taps, to that child's guardian(s). By default volunteers page through the app (logged) and don't see phone numbers.
- **Emergency broadcast:** all guardians of kids currently checked in — building, area or room. Templates: evacuation/reunification point, lockdown, weather.
- **Exposure notice:** guardians of every child who was in Room X between two dates (uses move history). Never names the sick child. e.g., hand-foot-and-mouth.
- **General:** any segment (room roster for the last N weeks, an area, all families).
- Per-church templates with merge fields. Log every message: sender, recipients, channel, delivery status, linked occurrence/room.
- SMS provider: your recommendation. US carrier registration (10DLC or toll-free verification) must clear before sending — Tyler starts it early.

---

## 9. Data & reporting

The event log is the source of truth; use views/rollups for speed. Every report: date-range filter + CSV export.

- **Per occurrence:** by room/area, kids vs volunteers, first-timers, ratio through the morning.
- **Per child:** attendance per month, first/last attended, room history, next room + date, consecutive absences.
- **Per family:** check-ins year to date, serving history, serve-policy status.
- **Ops:** arrivals per 5 minutes per station (staffing), average check-in time, prints/reprints/failures, offline events.
- **Volunteers:** serves per month, by room.
- **Import:** Subsplash check-in history (at least 2026 YTD) so counts and the serve rule continue without a gap.

---

## 10. Rules & workflow engine (platform-wide)

Admins build rules in the UI — no code. Kids is the first consumer, not the only one.

- **Rule = trigger + conditions + actions.** Stored as JSON, versioned, on/off, "preview who matches now" before activating, full run history.
- **Triggers:** domain events from any vertical; schedules (e.g., Mondays 6 am).
- **Conditions:** field comparisons (age, grade, tags, statuses) and metrics over the log (count of X in a window — calendar year / rolling N days / since date; consecutive absences; last seen), plus exclusions.
- **Actions:** tag or flag a person/household, set a status, alert at the check-in station, notify a staff role (routed by area/room), send a templated message, create a task, start a workflow, restrict check-in.
- **Workflows:** ordered steps with waits ("2 weeks") and exit conditions ("started serving", "marked exempt", "responded") checked before every step.
- **Dedupe:** e.g., once per family per year.
- **Guardrail:** any action that restricts a child's check-in defaults to "create a task for staff to confirm."
- Log every firing: rule + version, subject, inputs, actions, results.

### Seed rule 1 — LWR serve policy (build and test against this)

- Count child check-ins per family since Jan 1, any kids room (preschool or K/5). Threshold: 10. (Count unit: see §12.)
- Serving in either kids ministry (preschool or K/5) satisfies the policy.
- Exclude: families with a serving adult; families marked exempt, joining the team, or no longer attending; families with no check-in in the last 3 months (back in once they check in again).
- One case per family per year — never two letters.
- Route by room: preschool → Preschool Director; K and up → K/5 Director. Case view shows each child, parents' names and room.
- **Workflow:** letter → 2 weeks → follow-up email → 2 weeks → final email (a few days to respond) → task: director confirms removal from check-in. Exit at any step if the family starts serving, is marked exempt/joining, or responds (staff marks it).
- Replaces Tyler's manual Monday report.

### Other seed rules

- First-time guest → welcome text + follow-up task for Connections.
- Child absent 4 straight weeks → notify room leader.
- Volunteer background check expired → block kids-room volunteer check-in + notify staff.
- Room over ratio 10+ minutes → alert area leader.

---

## 11. Phases (each ends testable)

0. **Plan** — data model, migrations, People changes, app approach, offline design, questions. No code.
1. **Core + web station** — schedules, rooms, assignment, check-in/out/move, volunteer check-in, codes, labels (browser printing), live rosters, admin config, core reports, Subsplash import. Dry run at LWR on a laptop.
2. **Native station app** — iPad first, then Android; Brother SDK printing; kiosk; offline. Live pilot in the Barn.
3. **Notifications** — page, emergency, exposure, general; SMS + email.
4. **Rules & workflows** — engine + seed rules; serve policy goes live.
5. **Parents** — pre-check-in, QR/wallet pass, push, attendance history; more printers.

Groups and Events can start after Phase 1 and reuse the core.

---

## 12. Open questions for Tyler

1. Serve count unit: 2 kids at one service = 1 use or 2? Both services on one Sunday = 1 or 2?
2. Brother model(s) at LWR — on Wi-Fi or Bluetooth today?
3. K/5 rooms and grades per room; Move-Up Sunday date.
4. What do LWR labels show today? (Make that the default template.)
5. SMS provider/budget; who can send emergency broadcasts?
6. Parent app: Phase 5 or sooner?
7. Multi-campus now or later?
