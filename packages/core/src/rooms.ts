import { matches, type Child, type Criteria, type EvalContext } from './criteria'
import { addDays, addMonths, ageOn, compareDates, cutoffDateFor, parts, toLocalDate, daysInMonth, type LocalDate } from './dates'

export interface Room {
  id: string
  name: string
  area_id?: string
  priority: number
  capacity?: number | null
  children_per_adult?: number | null
  overflow_room_id?: string | null
  criteria: Criteria
  active?: boolean
}

export interface RoomOverride {
  room_id: string
  ends_on?: LocalDate | null
}

/** Rooms whose criteria the child meets, best first (lowest priority number). Manual-only rooms never match. */
export function matchRooms(child: Child, rooms: Room[], ctx: EvalContext): Room[] {
  return rooms
    .filter(r => r.active !== false && matches(r.criteria, child, ctx))
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
}

export interface Suggestion {
  /** The room to pre-select, if any. */
  room: Room | null
  /** Every room the child could go to, best first (the sticky override first when it applies). */
  choices: Room[]
  /** Why: 'override', 'match', 'choices' (several matches), 'none' (staff picks). */
  reason: 'override' | 'match' | 'choices' | 'none'
}

/** The room to suggest: a live override wins; one match pre-selects; several offer choices; none means staff picks. */
export function suggestRoom(child: Child, rooms: Room[], ctx: EvalContext, override?: RoomOverride | null): Suggestion {
  const matched = matchRooms(child, rooms, ctx)
  if (override && (!override.ends_on || compareDates(override.ends_on, ctx.on) >= 0)) {
    const room = rooms.find(r => r.id === override.room_id && r.active !== false)
    if (room) return { room, choices: [room, ...matched.filter(r => r.id !== room.id)], reason: 'override' }
  }
  if (matched.length === 1) return { room: matched[0], choices: matched, reason: 'match' }
  if (matched.length > 1) return { room: matched[0], choices: matched, reason: 'choices' }
  return { room: null, choices: [], reason: 'none' }
}

export type CapacityState = 'ok' | 'near_capacity' | 'at_capacity' | 'over_ratio'

export interface Capacity {
  state: CapacityState
  children: number
  adults: number
  capacity: number | null
  /** Adults needed for the children present under the room's ratio, or null when no ratio is set. */
  adultsNeeded: number | null
  /** The overflow room to suggest when the room is full; never a hard block. */
  suggestOverflowRoomId: string | null
}

/** Live count against capacity and ratio. Warns and suggests the overflow room; never blocks. */
export function capacityState(room: Room, children: number, adults: number): Capacity {
  const cap = room.capacity ?? null
  const ratio = room.children_per_adult ?? null
  const adultsNeeded = ratio ? Math.ceil(children / ratio) : null
  let state: CapacityState = 'ok'
  if (adultsNeeded !== null && adults < adultsNeeded && children > 0) state = 'over_ratio'
  else if (cap !== null && children >= cap) state = 'at_capacity'
  else if (cap !== null && children >= Math.max(1, cap - Math.max(1, Math.floor(cap * 0.1)))) state = 'near_capacity'
  return {
    state, children, adults, capacity: cap, adultsNeeded,
    suggestOverflowRoomId: state === 'at_capacity' || state === 'over_ratio' ? room.overflow_room_id ?? null : null,
  }
}

export interface NextRoom {
  room: Room | null
  /** The first date the suggestion changes, or null when it will not within the horizon. */
  on: LocalDate | null
}

/**
 * The child's next room and the date it changes: the first monthly birthday,
 * yearly birthday, or school-year rollover within `horizonMonths` at which
 * the best match differs from today's.
 */
export function nextRoom(child: Child, rooms: Room[], ctx: EvalContext, horizonMonths = 24): NextRoom {
  const today = matchRooms(child, rooms, ctx)[0] ?? null
  const candidates: LocalDate[] = []
  if (child.birthdate) {
    // Every monthly anniversary after today, up to the horizon.
    const ageNow = ageOn(child.birthdate, ctx.on).months
    for (let i = 1; i <= horizonMonths + 1; i++) {
      const d = addMonths(child.birthdate, ageNow + i)
      if (compareDates(d, ctx.on) > 0) candidates.push(d)
    }
  }
  // School-year rollovers (promotion date) within the horizon.
  const o = parts(ctx.on)
  const pm = ctx.settings.promotionMonth ?? ctx.settings.cutoffMonth, pd = ctx.settings.promotionDay ?? ctx.settings.cutoffDay
  for (let y = o.y; y <= o.y + Math.ceil(horizonMonths / 12); y++) {
    const d = toLocalDate(y, pm, Math.min(pd, daysInMonth(y, pm)))
    if (compareDates(d, ctx.on) > 0) candidates.push(d)
  }
  const limit = addMonths(ctx.on, horizonMonths)
  const sorted = Array.from(new Set(candidates)).filter(d => compareDates(d, limit) <= 0).sort()
  for (const d of sorted) {
    const next = matchRooms(child, rooms, { ...ctx, on: d })[0] ?? null
    if ((next?.id ?? null) !== (today?.id ?? null)) return { room: next, on: d }
  }
  return { room: today, on: null }
}

/** The day after which the current school year's cutoff no longer applies (for display). */
export function currentCutoff(on: LocalDate, ctx: EvalContext): LocalDate {
  return cutoffDateFor(on, ctx.settings)
}

export { addDays }
