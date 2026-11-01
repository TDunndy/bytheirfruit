export type Punctuality = 'early' | 'on_time' | 'late'

export interface PunctualityResult {
  status: Punctuality
  /** Minutes after the expected arrival (negative when early). */
  minutes: number
}

/**
 * Mirrors the fold in chms_private.fold_attendance: a volunteer is on time
 * within the grace window around the slot's expected arrival
 * (starts_at - arrive_minutes_before).
 */
export function punctuality(checkedInAt: Date, startsAt: Date, arriveMinutesBefore: number, graceMinutes = 10): PunctualityResult {
  const expected = startsAt.getTime() - arriveMinutesBefore * 60_000
  const minutes = Math.round((checkedInAt.getTime() - expected) / 60_000)
  const status: Punctuality = minutes < -graceMinutes ? 'early' : minutes > graceMinutes ? 'late' : 'on_time'
  return { status, minutes }
}
