// Room criteria: the same shape chms_private.check_room_criteria validates
// in Postgres. Keep the two in step.

import { ageOn, cutoffDateFor, gradeFor, isLocalDate, type CutoffSettings, type GradeOverride, type LocalDate } from './dates'

export type Bound = { min?: number; max?: number; min_inclusive?: boolean; max_inclusive?: boolean }
export type MeasuredOn = 'occurrence' | 'cutoff'

export type Rule =
  | ({ kind: 'age_months'; measured_on: MeasuredOn } & Bound)
  | ({ kind: 'age_years'; measured_on: MeasuredOn } & Bound)
  | ({ kind: 'grade' } & Bound)
  | { kind: 'birthdate'; min?: LocalDate; max?: LocalDate; min_inclusive?: boolean; max_inclusive?: boolean }
  | { kind: 'gender'; value: 'male' | 'female' }
  | { kind: 'tag'; value: string }
  | { kind: 'custom_field'; key: string; value: string | number | boolean }

export interface Criteria {
  match?: 'all' | 'any'
  manual_only?: boolean
  rules: Rule[]
}

const RANGE_KINDS = new Set(['age_months', 'age_years', 'grade', 'birthdate'])

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}
function onlyKeys(o: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(o).every(k => allowed.includes(k))
}

/** Mirrors chms_private.check_room_criteria(jsonb): true for exactly the shapes Postgres accepts. */
export function isCriteria(p: unknown): p is Criteria {
  if (!isObject(p)) return false
  if (!onlyKeys(p, ['match', 'manual_only', 'rules'])) return false
  if ('match' in p && !(p.match === 'all' || p.match === 'any')) return false
  if ('manual_only' in p && typeof p.manual_only !== 'boolean') return false
  if (!Array.isArray(p.rules) || p.rules.length > 20) return false
  if (p.rules.length === 0 && p.manual_only !== true) return false
  return p.rules.every(isRule)
}

export function isRule(r: unknown): r is Rule {
  if (!isObject(r)) return false
  const k = r.kind
  if (typeof k !== 'string') return false
  if (RANGE_KINDS.has(k)) {
    if (!onlyKeys(r, ['kind', 'min', 'max', 'min_inclusive', 'max_inclusive', 'measured_on'])) return false
    if (!('min' in r) && !('max' in r)) return false
    if (('min' in r) !== ('min_inclusive' in r) || ('max' in r) !== ('max_inclusive' in r)) return false
    if ('min_inclusive' in r && typeof r.min_inclusive !== 'boolean') return false
    if ('max_inclusive' in r && typeof r.max_inclusive !== 'boolean') return false
    const bothInclusive = r.min_inclusive === true && r.max_inclusive === true
    if (k === 'birthdate') {
      if ('measured_on' in r) return false
      if ('min' in r && (!isLocalDate(r.min) || r.min < '1900-01-01' || r.min > '2100-12-31')) return false
      if ('max' in r && (!isLocalDate(r.max) || r.max < '1900-01-01' || r.max > '2100-12-31')) return false
      if ('min' in r && 'max' in r) {
        if ((r.min as string) > (r.max as string)) return false
        if (r.min === r.max && !bothInclusive) return false
      }
      return true
    }
    const min = 'min' in r ? r.min : undefined, max = 'max' in r ? r.max : undefined
    if (min !== undefined && (typeof min !== 'number' || !Number.isInteger(min))) return false
    if (max !== undefined && (typeof max !== 'number' || !Number.isInteger(max))) return false
    if (min !== undefined && max !== undefined) {
      if (min > max) return false
      if (min === max && !bothInclusive) return false
    }
    const [lo, hi] = k === 'grade' ? [-1, 12] : [0, k === 'age_months' ? 1500 : 125]
    if (min !== undefined && (min < lo || min > hi)) return false
    if (max !== undefined && (max < lo || max > hi)) return false
    if (k === 'grade') return !('measured_on' in r)
    return r.measured_on === 'occurrence' || r.measured_on === 'cutoff'
  }
  if (k === 'gender') return onlyKeys(r, ['kind', 'value']) && (r.value === 'male' || r.value === 'female')
  if (k === 'tag') return onlyKeys(r, ['kind', 'value']) && typeof r.value === 'string' && r.value.trim().length >= 1 && r.value.length <= 60
  if (k === 'custom_field') {
    return onlyKeys(r, ['kind', 'key', 'value']) && typeof r.key === 'string' && r.key.trim().length >= 1 && r.key.length <= 60
      && (typeof r.value === 'string' || typeof r.value === 'number' || typeof r.value === 'boolean')
  }
  return false
}

/** What the criteria are evaluated against. */
export interface Child {
  birthdate: LocalDate | null
  gender?: 'male' | 'female' | null
  tags?: string[]
  custom?: Record<string, unknown>
  gradeOverride?: GradeOverride | null
}

export interface EvalContext {
  /** The occurrence's local date. */
  on: LocalDate
  settings: CutoffSettings
}

function inRange(value: number | string, b: { min?: number | string; max?: number | string; min_inclusive?: boolean; max_inclusive?: boolean }): boolean {
  if (b.min !== undefined) {
    if (b.min_inclusive ? value < b.min : value <= b.min) return false
  }
  if (b.max !== undefined) {
    if (b.max_inclusive ? value > b.max : value >= b.max) return false
  }
  return true
}

/** True, false, or null when the child lacks the data the rule needs (no birthdate, no gender). */
export function evaluateRule(rule: Rule, child: Child, ctx: EvalContext): boolean | null {
  switch (rule.kind) {
    case 'age_months':
    case 'age_years': {
      if (!child.birthdate) return null
      const on = rule.measured_on === 'cutoff' ? cutoffDateFor(ctx.on, ctx.settings) : ctx.on
      const age = ageOn(child.birthdate, on)
      return inRange(rule.kind === 'age_months' ? age.months : age.years, rule)
    }
    case 'grade': {
      const g = gradeFor(child.birthdate, ctx.on, ctx.settings, child.gradeOverride)
      if (g === null) return null
      return inRange(g, rule)
    }
    case 'birthdate':
      if (!child.birthdate) return null
      return inRange(child.birthdate, rule)
    case 'gender':
      if (!child.gender) return null
      return child.gender === rule.value
    case 'tag':
      return (child.tags ?? []).includes(rule.value)
    case 'custom_field':
      return (child.custom ?? {})[rule.key] === rule.value
  }
}

/** Does the child match? Manual-only criteria never match automatically. Unknown data counts as not matching. */
export function matches(criteria: Criteria, child: Child, ctx: EvalContext): boolean {
  if (criteria.manual_only) return false
  if (criteria.rules.length === 0) return false
  const results = criteria.rules.map(r => evaluateRule(r, child, ctx) === true)
  return criteria.match === 'any' ? results.some(Boolean) : results.every(Boolean)
}
