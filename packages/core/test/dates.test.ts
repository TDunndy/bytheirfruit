import { describe, expect, it } from 'vitest'
import { addMonths, ageOn, cutoffDateFor, daysBetween, gradeFor, isLocalDate, schoolYearFor } from '../src/dates'

const LWR = { cutoffMonth: 8, cutoffDay: 16 }

describe('local dates', () => {
  it('validates calendar dates', () => {
    expect(isLocalDate('2027-02-28')).toBe(true)
    expect(isLocalDate('2027-02-29')).toBe(false)
    expect(isLocalDate('2028-02-29')).toBe(true)
    expect(isLocalDate('2027-13-01')).toBe(false)
    expect(isLocalDate('27-01-01')).toBe(false)
  })
  it('adds months and clamps to the month length', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonths('2027-11-15', 3)).toBe('2028-02-15')
    expect(daysBetween('2027-03-01', '2027-03-08')).toBe(7)
  })
})

describe('ageOn', () => {
  it('counts whole months and years', () => {
    expect(ageOn('2024-03-07', '2027-03-07')).toEqual({ years: 3, months: 36, days: 0 })
    expect(ageOn('2024-03-08', '2027-03-07')).toMatchObject({ years: 2, months: 35 })
    expect(ageOn('2026-09-01', '2027-03-07')).toMatchObject({ years: 0, months: 6, days: 6 })
  })
  it('turns one on Feb 28 for a leap-day baby in a common year', () => {
    expect(ageOn('2024-02-29', '2025-02-28').years).toBe(1)
    expect(ageOn('2024-02-29', '2025-02-27')).toMatchObject({ years: 0, months: 11 })
    expect(ageOn('2024-02-29', '2028-02-29').years).toBe(4)
  })
  it('is zero before birth', () => {
    expect(ageOn('2027-05-01', '2027-03-07')).toEqual({ years: 0, months: 0, days: 0 })
  })
})

describe('school year', () => {
  it('rolls over at the cutoff by default', () => {
    expect(cutoffDateFor('2027-03-07', LWR)).toBe('2026-08-16')
    expect(cutoffDateFor('2027-08-15', LWR)).toBe('2026-08-16')
    expect(cutoffDateFor('2027-08-16', LWR)).toBe('2027-08-16')
    expect(schoolYearFor('2027-03-07', LWR)).toBe(2026)
  })
  it('rolls over at the promotion date when one is set', () => {
    const s = { ...LWR, promotionMonth: 8, promotionDay: 23 }
    expect(cutoffDateFor('2027-08-20', s)).toBe('2026-08-16')
    expect(cutoffDateFor('2027-08-23', s)).toBe('2027-08-16')
  })
})

describe('gradeFor', () => {
  it('starts kindergarten for children who are 5 by the cutoff', () => {
    expect(gradeFor('2021-08-16', '2027-03-07', LWR)).toBe(0)
    expect(gradeFor('2021-08-17', '2027-03-07', LWR)).toBe(-1)
    expect(gradeFor('2021-08-17', '2027-09-05', LWR)).toBe(0)
    expect(gradeFor('2015-05-01', '2027-03-07', LWR)).toBe(6)
  })
  it('is null outside pre-K to 12th grade', () => {
    expect(gradeFor('2024-03-07', '2027-03-07', LWR)).toBeNull()
    expect(gradeFor('2005-01-01', '2027-03-07', LWR)).toBeNull()
    expect(gradeFor(null, '2027-03-07', LWR)).toBeNull()
  })
  it('advances an override one grade per school year', () => {
    expect(gradeFor(null, '2027-03-07', LWR, { grade: 2, year: 2026 })).toBe(2)
    expect(gradeFor('2015-05-01', '2027-09-01', LWR, { grade: 2, year: 2026 })).toBe(3)
    expect(gradeFor(null, '2040-09-01', LWR, { grade: 2, year: 2026 })).toBeNull()
  })
})
