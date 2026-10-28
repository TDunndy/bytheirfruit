# ADR-0004: Church-management app — verticals and the People model

**Status:** accepted (2026-10-28)

## Context

The church-management app is built around congregational health: healthy
individuals lead to a healthy church. The owner's vision has four verticals
that overlap. The pilot church has 500-2,000 people and keeps its list in
Subsplash today. Leaders sign in first; members are records without a login
until a later phase.

## The four verticals

| Vertical | Holds |
|---|---|
| **People** | individuals, households (families), church-named roles that grant permissions (Pastor opens nearly everything), pastoral notes, history; later giving (funds, gifts, statements) as a leadership-only section |
| **Groups** | every ministry and team (welcome, parking, worship, kids rooms), small groups on-site and off-site, community groups, classes; membership drives notifications; later a channel per group |
| **Events** | services, Wednesday youth or kids nights, seasonal classes, group meetings. An event needs only a leader, a topic, a time and a place, and can carry much more. Leaders it names can edit it; the pastor sees every change. Serving lives here: positions such as a nursery room, invitations to serve, accepting adds the person to the right group, schedules, kids check-in and attendance |
| **Health** | the leadership dashboard: attendance, participation, care coverage; goals the church sets from a library or writes itself ("each deacon calls 10 people a week", "+10% in small groups", scripture memorization); scores for the church, individuals and leaders; AI suggestions; reminders; later a phone app and calendar links |

Overlaps are by design. Events reference people and groups. Serving
invitations create group membership. Health reads all three.

## Build order

People (this phase), then Groups, then Health v1 (care-call goals and group
participation need only People + Groups), then Events with attendance, then
volunteering and kids check-in, then giving, then AI suggestions, notifications
and the phone app.

## Decisions

- **Separate app** `apps/chms` at app.bytheirfruit.church. It is a Next.js
  static export like the public site, with Supabase auth in the browser and
  the same accounts. Server work (email, imports, AI) runs in Supabase edge
  functions. One database, one migrations folder (ADR-0001).
- **Tenant:** `organizations` (ADR-0002). Every ChMS table carries `org_id`.
- **Who can sign in:** `org_members` (owner / admin / staff / volunteer).
  Owners and admins hold every permission.
- **What they can do:** church-named roles (`org_roles`, e.g. Pastor, Staff,
  Elder, Deacon, Group Leader) carry permissions from a fixed list. People
  hold roles (`person_roles`). A signed-in staff or volunteer member's
  permissions are the union of the roles on the person record their login is
  linked to. `has_org_permission(org_id, permission)` is the one check RLS
  uses. People-phase permissions: `people.view`, `people.edit`,
  `people.notes`, `people.export`, `roles.manage`, `org.manage`. Later
  phases add `groups.*`, `events.*`, `health.*`, `giving.*`.
- **People are records, not accounts.** `people.user_id` is set only when a
  leader accepts an invitation.

## Guardrails

1. **Reviewer anonymity is absolute.** No ChMS table, view or function joins
   `people` to `reviews` or `profiles`. Church email addresses are never
   matched against By Their Fruit accounts; a login is linked to a person
   only by accepting an invitation. A test asserts that no function in the
   schema references both `people` and `reviews`.
2. **Isolation:** every policy checks the row's `org_id`; tests cover two
   organizations.
3. **Pastoral notes** need `people.notes`; contact details need `people.view`.
4. **Audit:** every insert, update and archive of a person is logged with the
   actor.
5. **Children's records** are people like any other, but kids check-in
   (Events phase) adds guardian links and security codes, never public.
