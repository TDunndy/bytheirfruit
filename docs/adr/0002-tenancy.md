# ADR-0002: Tenancy model

**Status:** accepted (2026-10-22)

## Context

Today a church is "owned" by one user through `churches.claimed_by`. A
church-management product needs several people per church with different
rights (owner, admin, staff, volunteer), and later multi-campus churches and
denominational groupings.

## Decision

- `organizations` is the tenant. One organization per claimed church today
  (`organizations.church_id` is unique); the link is nullable so an
  organization can outlive or precede a listing.
- `org_members (org_id, user_id, role)` with roles ranked
  owner > admin > staff > volunteer. `is_org_member(org_id, min_role)` is the
  one check every ChMS policy uses.
- Billing attaches to the organization (`subscriptions.org_id`), and
  `has_active_subscription(org_id)` is the entitlement check.
- Every ChMS table carries `org_id` and the policy pattern
  `using (is_org_member(org_id, '<role>'))`.
- Legacy claim columns on `churches` stay for now and are mirrored into these
  tables by the `sync_org_from_church` trigger, so the deployed Stripe webhook
  keeps working unchanged.

## Next step

A Supabase auth hook that adds `org_roles: {org_id: role}` to the JWT lets
RLS read `auth.jwt()` instead of joining `org_members` on every row.
