// What a station needs for the day, read once at boot and refreshed on
// demand: the services, rooms (its scope), areas, label templates, printer
// and the church's settings. Kept in memory and mirrored to localStorage so
// a reload during a Wi-Fi drop still shows the morning's configuration.
import { defaultTemplates, isCriteria, isLabelLayout, type CutoffSettings } from '@btf/core'
import { listAreas, listOccurrences, listPrinters, listRooms, listScheduleRooms, listSchedules, listTemplates } from './api'
import type { OccurrenceRow, PrinterRow, RoomInfo, StationSelf, TemplateInfo } from './types'

export interface Service { id: string; schedule_id: string; name: string; starts_at: string; ends_at: string; status: OccurrenceRow['status']; room_ids: string[] | null }

export interface Day {
  self: Extract<StationSelf, { status: 'active' }>
  local_date: string
  loaded_at: string
  services: Service[]
  rooms: RoomInfo[]
  templates: Record<'child' | 'pickup' | 'volunteer', TemplateInfo>
  printer: PrinterRow | null
  cutoff: CutoffSettings
}

const KEY = 'btf-day'

export function cachedDay(): Day | null {
  try { const v = localStorage.getItem(KEY); return v ? (JSON.parse(v) as Day) : null } catch { return null }
}

export async function loadDay(self: Extract<StationSelf, { status: 'active' }>): Promise<Day> {
  const local_date = self.local_today
  const [occ, schedules, scheduleRooms, rooms, areas, templates, printers] = await Promise.all([
    listOccurrences(local_date), listSchedules(), listScheduleRooms(), listRooms(), listAreas(), listTemplates(), listPrinters(),
  ])
  const scheduleName = new Map(schedules.map((s) => [s.id, s.name]))
  const roomsBySchedule = new Map<string, string[]>()
  for (const sr of scheduleRooms) roomsBySchedule.set(sr.schedule_id, [...(roomsBySchedule.get(sr.schedule_id) ?? []), sr.room_id])
  const areaById = new Map(areas.map((a) => [a.id, a]))
  const services: Service[] = occ.map((o) => ({
    id: o.id, schedule_id: o.schedule_id, name: scheduleName.get(o.schedule_id) ?? 'Service', starts_at: o.starts_at, ends_at: o.ends_at, status: o.status,
    room_ids: roomsBySchedule.get(o.schedule_id) ?? null,
  }))
  const roomInfos: RoomInfo[] = rooms.map((r) => ({
    id: r.id, name: r.name, area_id: r.area_id, area_name: areaById.get(r.area_id)?.name ?? '', area_kind: areaById.get(r.area_id)?.kind ?? 'general',
    priority: r.priority, capacity: r.capacity, children_per_adult: r.children_per_adult, overflow_room_id: r.overflow_room_id,
    criteria: isCriteria(r.criteria) ? r.criteria : { manual_only: true, rules: [] }, active: r.active,
  }))
  const defaults = defaultTemplates()
  const pick = (kind: 'child' | 'pickup' | 'volunteer'): TemplateInfo => {
    const mine = templates.filter((t) => t.kind === kind && isLabelLayout(t.layout))
    const t = mine.find((x) => x.is_default) ?? mine[0]
    if (!t || !isLabelLayout(t.layout)) return { kind, width_mm: defaults[kind].width_mm, height_mm: defaults[kind].height_mm, layout: defaults[kind].layout }
    return { kind, width_mm: t.width_mm, height_mm: t.height_mm, layout: t.layout }
  }
  const settings = self.settings
  const promotion = settings?.promotion_date ? settings.promotion_date.split('-').map(Number) : null
  const day: Day = {
    self, local_date, loaded_at: new Date().toISOString(), services, rooms: roomInfos,
    templates: { child: pick('child'), pickup: pick('pickup'), volunteer: pick('volunteer') },
    printer: printers.find((p) => p.id === self.printer_id) ?? null,
    cutoff: {
      cutoffMonth: settings?.grade_cutoff_month ?? 8, cutoffDay: settings?.grade_cutoff_day ?? 16,
      ...(promotion ? { promotionMonth: promotion[1], promotionDay: promotion[2] } : {}),
    },
  }
  try { localStorage.setItem(KEY, JSON.stringify(day)) } catch { /* no storage */ }
  return day
}

/** Rooms a service runs in (every room in scope when the service names none). */
export function roomsFor(day: Day, service: Service | null): RoomInfo[] {
  if (!service || !service.room_ids) return day.rooms
  const set = new Set(service.room_ids)
  return day.rooms.filter((r) => set.has(r.id))
}

/** Services worth offering now: not over yet (ended more than 30 minutes ago drops off), nearest first. */
export function liveServices(day: Day, now = Date.now()): Service[] {
  return day.services.filter((s) => s.status !== 'cancelled' && new Date(s.ends_at).getTime() > now - 30 * 60_000)
}
