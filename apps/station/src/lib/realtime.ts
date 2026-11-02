// Live rosters: the projection trigger broadcasts {occurrence_id, person_id,
// room_id, status, rev} on the private topic org:<org>:occ:<occurrence>;
// catch-up reads attendance.rev with an overlap of 1000 (ADR-0005).
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface AttendanceChange { occurrence_id: string; person_id: string; room_id: string | null; status: 'in' | 'out' | 'none'; rev: number }

export function subscribeOccurrence(orgId: string, occurrenceId: string, onChange: (c: AttendanceChange) => void): () => void {
  let channel: RealtimeChannel | null = null
  let closed = false
  void supabase.auth.getSession().then(({ data }) => {
    if (closed) return
    if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token)
    channel = supabase.channel(`org:${orgId}:occ:${occurrenceId}`, { config: { private: true } })
      .on('broadcast', { event: 'attendance' }, (msg) => {
        const p = (msg.payload ?? {}) as Partial<AttendanceChange>
        if (p.occurrence_id && p.person_id) onChange(p as AttendanceChange)
      })
      .subscribe()
  })
  return () => { closed = true; if (channel) void supabase.removeChannel(channel) }
}
