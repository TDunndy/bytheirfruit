// Calendar arithmetic on local dates. Dates are 'YYYY-MM-DD' strings (the
// church's local calendar) so no time zone can leak in.

export type LocalDate = string

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isLocalDate(s: unknown): s is LocalDate {
  if (typeof s !== 'string') return false
  const m = DATE_RE.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1) return false
  return d <= daysInMonth(y, mo)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function parts(d: LocalDate): { y: number; m: number; d: number } {
  const m = DATE_RE.exec(d)
  if (!m) throw new Error(`not a date: ${d}`)
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

export function toLocalDate(y: number, m: number, d: number): LocalDate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Days from a to b (b - a). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const pa = parts(a), pb = parts(b)
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000)
}

export function addDays(d: LocalDate, n: number): LocalDate {
  const p = parts(d)
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n))
  return toLocalDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

/** The same day n months later, clamped to the month's length (Jan 31 + 1 → Feb 28/29). */
export function addMonths(d: LocalDate, n: number): LocalDate {
  const p = parts(d)
  const total = p.y * 12 + (p.m - 1) + n
  const y = Math.floor(total / 12), m = (total % 12) + 1
  return toLocalDate(y, m, Math.min(p.d, daysInMonth(y, m)))
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export interface Age {
  years: number
  /** Whole months of age (years * 12 + months). */
  months: number
  /** Days past the last whole month. */
  days: number
}

/**
 * Age on a date, in whole years and whole months. A child born on the 29th
 * of February turns one on the 28th in a common year.
 */
export function ageOn(birthdate: LocalDate, on: LocalDate): Age {
  if (compareDates(on, birthdate) < 0) return { years: 0, months: 0, days: 0 }
  const b = parts(birthdate), o = parts(on)
  let months = (o.y - b.y) * 12 + (o.m - b.m)
  const anniversaryDay = Math.min(b.d, daysInMonth(o.y, o.m))
  if (o.d < anniversaryDay) months -= 1
  if (months < 0) months = 0
  const lastAnniversary = addMonths(birthdate, months)
  const days = daysBetween(lastAnniversary, on)
  return { years: Math.floor(months / 12), months, days }
}

export interface CutoffSettings {
  /** Month (1-12) and day of the school-year cutoff; LWR uses Aug 16. */
  cutoffMonth: number
  cutoffDay: number
  /** When children move up (Move-Up Sunday). Defaults to the cutoff date. */
  promotionMonth?: number
  promotionDay?: number
}

/** The cutoff date of the school year that is current on `on`. */
export function cutoffDateFor(on: LocalDate, s: CutoffSettings): LocalDate {
  const o = parts(on)
  const pm = s.promotionMonth ?? s.cutoffMonth, pd = s.promotionDay ?? s.cutoffDay
  const rollover = toLocalDate(o.y, pm, Math.min(pd, daysInMonth(o.y, pm)))
  const year = compareDates(on, rollover) >= 0 ? o.y : o.y - 1
  return toLocalDate(year, s.cutoffMonth, Math.min(s.cutoffDay, daysInMonth(year, s.cutoffMonth)))
}

/** The calendar year in which the current school year started. */
export function schoolYearFor(on: LocalDate, s: CutoffSettings): number {
  return parts(cutoffDateFor(on, s)).y
}

export interface GradeOverride {
  grade: number
  /** The school year (its starting calendar year) the override was entered for. */
  year: number
}

/**
 * Grade on a date: -1 pre-K, 0 K, 1..12. Null when the child is too young
 * for pre-K (under 4 at the cutoff) or past 12th grade. Kindergarten starts
 * for children who are 5 by the cutoff. An override advances one grade per
 * school year after the year it was entered.
 */
export function gradeFor(birthdate: LocalDate | null, on: LocalDate, s: CutoffSettings, override?: GradeOverride | null): number | null {
  const year = schoolYearFor(on, s)
  if (override) {
    const g = override.grade + (year - override.year)
    return g > 12 ? null : g
  }
  if (!birthdate) return null
  const ageAtCutoff = ageOn(birthdate, cutoffDateFor(on, s)).years
  const g = ageAtCutoff - 5
  if (g < -1 || g > 12) return null
  return g
}
