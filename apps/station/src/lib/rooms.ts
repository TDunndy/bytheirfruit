// Room suggestion through the core package, so a laptop and an iPad route
// a child the same way the database would (ADR-0005).
import { ageOn, gradeFor, suggestRoom, type Child, type EvalContext, type Suggestion } from '@btf/core'
import type { Day, Service } from './day'
import { roomsFor } from './day'
import type { HouseholdMember, RoomInfo } from './types'

export function childOf(m: HouseholdMember): Child {
  return {
    birthdate: m.birthdate ?? null, gender: m.gender ?? null, tags: m.tags ?? [], custom: m.custom ?? {},
    gradeOverride: m.grade_override !== undefined && m.grade_override_year !== undefined ? { grade: m.grade_override, year: m.grade_override_year } : null,
  }
}

export function contextFor(day: Day): EvalContext {
  return { on: day.local_date, settings: day.cutoff }
}

/** Kids rooms the service runs in, as the core's Room shape. */
export function suggestFor(day: Day, service: Service | null, m: HouseholdMember): Suggestion {
  const rooms: RoomInfo[] = roomsFor(day, service).filter((r) => r.area_kind === 'kids')
  return suggestRoom(childOf(m), rooms, contextFor(day), m.override_room_id ? { room_id: m.override_room_id } : null)
}

export function describeChild(day: Day, m: HouseholdMember): string {
  const parts: string[] = []
  if (m.birthdate) {
    const a = ageOn(m.birthdate, day.local_date)
    parts.push(a.months < 24 ? `${a.months} mo` : `${a.years} yr`)
    const g = gradeFor(m.birthdate, day.local_date, day.cutoff, childOf(m).gradeOverride)
    if (g !== null) parts.push(g === -1 ? 'Pre-K' : g === 0 ? 'K' : `Grade ${g}`)
  }
  return parts.join(' · ')
}
