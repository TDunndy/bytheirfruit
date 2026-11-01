import { describe, expect, it } from 'vitest'
import { CODE_ALPHABET, isSecurityCode, offlineCode, randomCode } from '../src/codes'
import { pickupCheck, type Membership, type PickupEntry } from '../src/pickup'
import { punctuality } from '../src/punctuality'

describe('pickupCheck (mirrors pickup_status)', () => {
  const memberships: Membership[] = [
    { household_id: 'h1', person_id: 'pat', relationship: 'head', can_check_in: true },
    { household_id: 'h1', person_id: 'kid', relationship: 'child', can_check_in: false },
    { household_id: 'h1', person_id: 'uri', relationship: 'other', can_check_in: true },
    { household_id: 'h1', person_id: 'old', relationship: 'spouse', can_check_in: true, ended_at: '2026-01-01T00:00:00Z' },
    { household_id: 'h2', person_id: 'kid', relationship: 'child', can_check_in: false },
    { household_id: 'h2', person_id: 'dad', relationship: 'head', can_check_in: true },
  ]
  const pickups: PickupEntry[] = [
    { child_person_id: 'kid', person_id: 'uri', kind: 'restricted' },
    { child_person_id: 'kid', person_id: 'ann', kind: 'authorized' },
    { child_person_id: 'kid', person_id: 'bob', kind: 'authorized', valid_to: '2027-01-01' },
    { child_person_id: 'kid', person_id: 'cat', kind: 'restricted', valid_from: '2027-04-01' },
    { child_person_id: 'kid', person_id: 'dan', kind: 'authorized', archived_at: '2026-06-01T00:00:00Z' },
  ]
  const today = '2027-03-07'
  it('restricted wins, even over a guardian', () => {
    expect(pickupCheck('kid', 'uri', memberships, pickups, today)).toBe('restricted')
  })
  it('guardians in either household may pick up; ended ones may not', () => {
    expect(pickupCheck('kid', 'pat', memberships, pickups, today)).toBe('guardian')
    expect(pickupCheck('kid', 'dad', memberships, pickups, today)).toBe('guardian')
    expect(pickupCheck('kid', 'old', memberships, pickups, today)).toBe('unknown')
  })
  it('authorized pickups respect their dates and archiving', () => {
    expect(pickupCheck('kid', 'ann', memberships, pickups, today)).toBe('authorized')
    expect(pickupCheck('kid', 'bob', memberships, pickups, today)).toBe('unknown')
    expect(pickupCheck('kid', 'dan', memberships, pickups, today)).toBe('unknown')
    expect(pickupCheck('kid', 'cat', memberships, pickups, today)).toBe('unknown')
    expect(pickupCheck('kid', 'cat', memberships, pickups, '2027-04-01')).toBe('restricted')
  })
  it('a sibling child is never a guardian', () => {
    const m = [...memberships, { household_id: 'h1', person_id: 'sis', relationship: 'child', can_check_in: false }]
    expect(pickupCheck('kid', 'sis', m, pickups, today)).toBe('unknown')
  })
})

describe('punctuality (mirrors the fold)', () => {
  const starts = new Date('2027-03-07T17:30:00Z')
  it('is on time within the grace window around the expected arrival', () => {
    expect(punctuality(new Date('2027-03-07T17:12:00Z'), starts, 20)).toEqual({ status: 'on_time', minutes: 2 })
    expect(punctuality(new Date('2027-03-07T17:25:00Z'), starts, 20)).toEqual({ status: 'late', minutes: 15 })
    expect(punctuality(new Date('2027-03-07T16:55:00Z'), starts, 20)).toEqual({ status: 'early', minutes: -15 })
    expect(punctuality(new Date('2027-03-07T17:00:00Z'), starts, 20, 10).status).toBe('on_time')
    expect(punctuality(new Date('2027-03-07T17:00:00Z'), starts, 20, 5).status).toBe('early')
  })
})

describe('security codes', () => {
  it('uses the no-look-alike alphabet', () => {
    expect(CODE_ALPHABET).toHaveLength(23)
    expect(CODE_ALPHABET).not.toMatch(/[01OIBSZGLQ28]/)
    expect(isSecurityCode('ACD')).toBe(true)
    expect(isSecurityCode('AB1')).toBe(false)
    expect(isSecurityCode('ACDEF')).toBe(false)
  })
  it('draws codes from the alphabet with any rng', () => {
    let i = 0
    const rng = () => ((i++ * 7) % 23) / 23
    const c = randomCode(3, rng)
    expect(c).toHaveLength(3)
    expect(isSecurityCode(c)).toBe(true)
  })
  it('offline codes are prefixed and never repeat on a device', () => {
    const used = new Set<string>()
    const codes = new Set<string>()
    for (let n = 0; n < 500; n++) codes.add(offlineCode('K', used))
    expect(codes.size).toBe(500)
    for (const c of codes) expect(c).toMatch(/^K[ACDEFHJKMNPRTUVWXY34679]{3}$/)
    expect(() => offlineCode('B', new Set())).toThrow()
  })
})
