import { describe, expect, it } from 'vitest'
import { isCriteria, matches, type Criteria } from '../src/criteria'
import { capacityState, matchRooms, nextRoom, suggestRoom, type Room } from '../src/rooms'

const settings = { cutoffMonth: 8, cutoffDay: 16 }
const ctx = (on: string) => ({ on, settings })

function months(min: number, max: number): Criteria {
  return { rules: [{ kind: 'age_months', min, min_inclusive: true, max, max_inclusive: false, measured_on: 'occurrence' }] }
}

/** The LWR Barn and K/5 as the seed configures them (decisions B and B2). */
export const LWR_ROOMS: Room[] = [
  { id: 'lambs', name: 'Little Lambs', priority: 10, capacity: 8, children_per_adult: 3, criteria: months(0, 12) },
  { id: 'piglets', name: 'Piglets', priority: 20, capacity: 10, children_per_adult: 4, criteria: months(12, 21) },
  { id: 'chicklets', name: 'Chicklets', priority: 30, capacity: 12, children_per_adult: 4, criteria: months(21, 30) },
  { id: 'ducklings', name: 'Ducklings', priority: 40, capacity: 12, children_per_adult: 5, criteria: months(30, 36) },
  { id: 'cubs', name: 'Cubs', priority: 50, capacity: 16, children_per_adult: 6, criteria: { match: 'all', rules: [
    { kind: 'age_years', min: 3, min_inclusive: true, measured_on: 'occurrence' },
    { kind: 'age_years', max: 4, max_inclusive: false, measured_on: 'cutoff' },
  ] } },
  { id: 'colts', name: 'Colts', priority: 60, capacity: 16, children_per_adult: 6, overflow_room_id: 'cubs', criteria: { match: 'all', rules: [
    { kind: 'age_years', min: 4, min_inclusive: true, measured_on: 'cutoff' },
    { kind: 'grade', max: -1, max_inclusive: true },
  ] } },
  { id: 'k', name: 'Kindergarten', priority: 70, capacity: 20, children_per_adult: 8, criteria: { rules: [{ kind: 'grade', min: 0, min_inclusive: true, max: 0, max_inclusive: true }] } },
  { id: 'g1-2', name: '1st & 2nd', priority: 80, criteria: { rules: [{ kind: 'grade', min: 1, min_inclusive: true, max: 2, max_inclusive: true }] } },
  { id: 'g3-5', name: '3rd to 5th', priority: 90, criteria: { rules: [{ kind: 'grade', min: 3, min_inclusive: true, max: 5, max_inclusive: true }] } },
  { id: 'overflow', name: 'Overflow', priority: 100, criteria: { manual_only: true, rules: [] } },
]

describe('criteria shape (mirrors check_room_criteria)', () => {
  it('accepts the LWR rooms', () => {
    for (const r of LWR_ROOMS) expect(isCriteria(r.criteria), r.name).toBe(true)
  })
  it('refuses what Postgres refuses', () => {
    const bad: unknown[] = [
      { rules: [{ kind: 'shoe_size', min: 1, min_inclusive: true }] },
      { rules: [{ kind: 'age_months', min: 36, min_inclusive: true, max: 30, max_inclusive: false, measured_on: 'occurrence' }] },
      { rules: [{ kind: 'age_months', min: 30, max: 36, max_inclusive: false, measured_on: 'occurrence' }] },
      { rules: [{ kind: 'age_years', min: 3, min_inclusive: true }] },
      { rules: [] },
      { rules: [{ kind: 'gender', value: 'other' }] },
      { rules: [{ kind: 'birthdate', min: '2020-13-45', min_inclusive: true }], extra: 1 },
      { rules: [{ kind: 'grade', min: -2, min_inclusive: true }] },
      { rules: [{ kind: 'grade', min: 0, min_inclusive: true, measured_on: 'cutoff' }] },
      { rules: [{ kind: 'age_months', min: 1.5, min_inclusive: true, measured_on: 'occurrence' }] },
      { match: 'some', rules: [{ kind: 'tag', value: 'x' }] },
      { manual_only: 'yes', rules: [] },
      { rules: [{ kind: 'custom_field', key: 'bus', value: { nested: true } }] },
      { rules: [{ kind: 'birthdate', min: '2020-02-30', min_inclusive: true }] },
      { rules: [{ kind: 'birthdate', min: '2020-05-05', min_inclusive: true, max: '2020-05-05', max_inclusive: false }] },
      { rules: [{ kind: 'grade', min: 13, min_inclusive: true }] },
      { rules: [{ kind: 'grade', max: -5, max_inclusive: true }] },
      { rules: [{ kind: 'age_months', min: 3, min_inclusive: true, max: 3, max_inclusive: false, measured_on: 'occurrence' }] },
      { rules: [{ kind: 'age_years', max: 200, max_inclusive: true, measured_on: 'cutoff' }] },
      { rules: [{ kind: 'tag', value: '   ' }] },
      'not an object',
      null,
    ]
    for (const b of bad) expect(isCriteria(b), JSON.stringify(b)).toBe(false)
  })
  it('accepts every rule kind', () => {
    expect(isCriteria({ match: 'any', rules: [
      { kind: 'birthdate', min: '2020-01-01', min_inclusive: true, max: '2020-12-31', max_inclusive: true },
      { kind: 'gender', value: 'female' }, { kind: 'tag', value: 'guest' }, { kind: 'custom_field', key: 'bus', value: true },
    ] })).toBe(true)
  })
})

describe('the Barn matrix', () => {
  const cases: Array<[string, string, string]> = [
    ['2026-09-01', '2027-03-07', 'Little Lambs'],
    ['2026-03-08', '2027-03-07', 'Little Lambs'],
    ['2026-03-07', '2027-03-07', 'Piglets'],
    ['2025-06-08', '2027-03-07', 'Piglets'],
    ['2025-06-07', '2027-03-07', 'Chicklets'],
    ['2024-09-07', '2027-03-07', 'Ducklings'],
    ['2024-03-08', '2027-03-07', 'Ducklings'],
    ['2024-03-07', '2027-03-07', 'Cubs'],
    ['2023-10-01', '2027-03-07', 'Cubs'],
    ['2022-09-01', '2027-03-07', 'Cubs'],
    ['2022-08-17', '2027-03-07', 'Cubs'],
    ['2022-08-16', '2027-03-07', 'Colts'],
    ['2021-08-17', '2027-03-07', 'Colts'],
    ['2021-08-16', '2027-03-07', 'Kindergarten'],
    ['2021-08-17', '2027-09-05', 'Kindergarten'],
    ['2019-05-05', '2027-03-07', '1st & 2nd'],
    ['2016-05-05', '2027-03-07', '3rd to 5th'],
  ]
  it.each(cases)('born %s on %s goes to %s', (birthdate, on, room) => {
    const m = matchRooms({ birthdate }, LWR_ROOMS, ctx(on))
    expect(m.map(r => r.name)).toEqual([room])
  })
  it('the 36-month edge: Ducklings the day before the third birthday, Cubs on it', () => {
    expect(matchRooms({ birthdate: '2024-03-08' }, LWR_ROOMS, ctx('2027-03-07'))[0].name).toBe('Ducklings')
    expect(matchRooms({ birthdate: '2024-03-08' }, LWR_ROOMS, ctx('2027-03-08'))[0].name).toBe('Cubs')
  })
  it('a child with no birthdate matches nothing automatic; staff picks', () => {
    expect(suggestRoom({ birthdate: null }, LWR_ROOMS, ctx('2027-03-07'))).toMatchObject({ room: null, reason: 'none' })
  })
  it('a grade override routes K/5 children', () => {
    expect(matchRooms({ birthdate: '2019-05-05', gradeOverride: { grade: 3, year: 2026 } }, LWR_ROOMS, ctx('2027-03-07'))[0].name).toBe('3rd to 5th')
  })
})

describe('suggestions, overrides and choices', () => {
  const rooms: Room[] = [
    ...LWR_ROOMS,
    { id: 'girls', name: 'Girls club', priority: 5, criteria: { match: 'all', rules: [{ kind: 'gender', value: 'female' }, { kind: 'grade', min: 1, min_inclusive: true, max: 5, max_inclusive: true }] } },
  ]
  it('offers choices when several rooms match, best first', () => {
    const s = suggestRoom({ birthdate: '2019-05-05', gender: 'female' }, rooms, ctx('2027-03-07'))
    expect(s.reason).toBe('choices')
    expect(s.choices.map(r => r.name)).toEqual(['Girls club', '1st & 2nd'])
  })
  it('a live override wins; an ended one does not', () => {
    const live = suggestRoom({ birthdate: '2024-03-08' }, rooms, ctx('2027-03-07'), { room_id: 'cubs', ends_on: '2027-03-31' })
    expect(live).toMatchObject({ reason: 'override' })
    expect(live.room?.name).toBe('Cubs')
    expect(live.choices.map(r => r.name)).toEqual(['Cubs', 'Ducklings'])
    const ended = suggestRoom({ birthdate: '2024-03-08' }, rooms, ctx('2027-04-04'), { room_id: 'cubs', ends_on: '2027-03-31' })
    expect(ended.reason).toBe('match')
  })
  it('manual-only rooms never match', () => {
    expect(matches({ manual_only: true, rules: [] }, { birthdate: '2020-01-01' }, ctx('2027-03-07'))).toBe(false)
  })
})

describe('capacity and ratio', () => {
  const room = LWR_ROOMS.find(r => r.id === 'colts')!
  it('warns, suggests the overflow room and never blocks', () => {
    expect(capacityState(room, 5, 2).state).toBe('ok')
    expect(capacityState(room, 15, 3).state).toBe('near_capacity')
    expect(capacityState(room, 16, 3)).toMatchObject({ state: 'at_capacity', suggestOverflowRoomId: 'cubs' })
    expect(capacityState(room, 9, 1)).toMatchObject({ state: 'over_ratio', adultsNeeded: 2, suggestOverflowRoomId: 'cubs' })
    expect(capacityState({ ...room, capacity: null, children_per_adult: null }, 40, 0).state).toBe('ok')
  })
})

describe('next room', () => {
  it('moves on the birthday for month-based rooms', () => {
    const n = nextRoom({ birthdate: '2024-03-08' }, LWR_ROOMS, ctx('2027-03-07'))
    expect(n).toMatchObject({ on: '2027-03-08' })
    expect(n.room?.name).toBe('Cubs')
  })
  it('moves on the school-year rollover for grade-based rooms', () => {
    const n = nextRoom({ birthdate: '2022-08-16' }, LWR_ROOMS, ctx('2027-03-07'))
    expect(n).toMatchObject({ on: '2027-08-16' })
    expect(n.room?.name).toBe('Kindergarten')
  })
  it('reports no change within the horizon', () => {
    expect(nextRoom({ birthdate: '2016-05-05' }, LWR_ROOMS, ctx('2027-03-07'), 3)).toMatchObject({ on: null })
  })
})
