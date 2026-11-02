// The station's running state, shared by every screen: who we are (from
// station_self), the day's configuration, the outbox, the code block, the
// staff unlock, and live attendance for our rooms.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { attendanceSince, attendanceToday, heartbeat, ingest, stationSelf } from './api'
import { CodeBlock } from './codes'
import { cachedDay, loadDay, type Day } from './day'
import { Outbox, type Command, type OutboxState } from './outbox'
import { subscribeOccurrence } from './realtime'
import { supabase } from './supabase'
import type { StaffUnlock, StationSelf } from './types'

export type Boot = 'loading' | 'unpaired' | 'blocked' | 'ready' | 'error'

export interface Presence { occurrence_id: string; person_id: string; room_id: string | null; status: 'in' | 'out'; role: string }

interface StationValue {
  boot: Boot
  self: StationSelf | null
  day: Day | null
  error: string
  outbox: Outbox
  outboxState: OutboxState
  codes: CodeBlock | null
  staff: StaffUnlock | null
  setStaff: (s: StaffUnlock | null) => void
  presence: Presence[]
  /** Queue commands, apply them to the screen, and push. */
  send: (cmds: Command[]) => void
  flush: () => Promise<void>
  reload: () => Promise<void>
  refreshDay: () => Promise<void>
  alerts: string[]
  dismissAlert: (i: number) => void
}

const Ctx = createContext<StationValue | null>(null)
export function useStation(): StationValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStation outside <StationProvider>')
  return v
}

const outbox = new Outbox(localStorage)

export function StationProvider({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = useState<Boot>('loading')
  const [self, setSelf] = useState<StationSelf | null>(null)
  const [day, setDay] = useState<Day | null>(null)
  const [error, setError] = useState('')
  const [outboxState, setOutboxState] = useState<OutboxState>(outbox.state())
  const [codes, setCodes] = useState<CodeBlock | null>(null)
  const [staff, setStaffRaw] = useState<StaffUnlock | null>(null)
  const [presence, setPresence] = useState<Presence[]>([])
  const [alerts, setAlerts] = useState<string[]>([])
  const rev = useRef(0)

  const flush = useCallback(async () => { await outbox.flush(ingest) }, [])

  const send = useCallback((cmds: Command[]) => {
    outbox.enqueue(cmds)
    // apply to the screen at once; the server's row replaces it on sync
    setPresence((p) => {
      let next = [...p]
      for (const c of cmds) {
        if (c.op !== 'event') continue
        const type = c.type as string
        if (!['check_in', 'move', 'check_out'].includes(type)) continue
        const key = (x: Presence) => x.occurrence_id === c.occurrence_id && x.person_id === c.person_id
        const cur = next.find(key)
        if (type === 'check_in') {
          const row: Presence = { occurrence_id: String(c.occurrence_id), person_id: String(c.person_id), room_id: String(c.room_id), status: 'in', role: String(c.role ?? 'child') }
          next = cur ? next.map((x) => (key(x) ? row : x)) : [...next, row]
        } else if (cur && type === 'move') {
          next = next.map((x) => (key(x) ? { ...x, room_id: String(c.room_id) } : x))
        } else if (cur && type === 'check_out') {
          next = next.map((x) => (key(x) ? { ...x, status: 'out' } : x))
        }
      }
      return next
    })
    void flush()
  }, [flush])

  const loadPresence = useCallback(async (d: Day) => {
    try {
      const rowsNow = await attendanceToday(d.services.map((s) => s.id))
      setPresence(rowsNow.map((r) => ({ occurrence_id: r.occurrence_id, person_id: r.person_id, room_id: r.room_id, status: r.status as 'in' | 'out', role: r.role })))
      rev.current = rowsNow.reduce((m, r) => Math.max(m, Number(r.rev)), rev.current)
    } catch (e) { console.warn('presence', e) }
  }, [])

  const reload = useCallback(async () => {
    setBoot('loading'); setError('')
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) { setBoot('unpaired'); return }
      let me: StationSelf | null = null
      try { me = await stationSelf() } catch (e) {
        // offline: boot from the cached day if it is today's
        const cached = cachedDay()
        if (cached) { setSelf(cached.self); setDay(cached); setCodes(new CodeBlock(cached.self.station_id, cached.local_date)); setBoot('ready'); return }
        throw e
      }
      setSelf(me)
      if (!me || me.status !== 'active') { setBoot('blocked'); return }
      const d = await loadDay(me)
      setDay(d)
      const block = new CodeBlock(me.station_id, d.local_date)
      setCodes(block)
      void block.refresh()
      void heartbeat()
      await loadPresence(d)
      setBoot('ready')
      void flush()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBoot('error')
    }
  }, [flush, loadPresence])

  const refreshDay = useCallback(async () => {
    if (!self || self.status !== 'active') return
    const me = await stationSelf()
    if (me && me.status === 'active') { setSelf(me); const d = await loadDay(me); setDay(d); await loadPresence(d) }
    else { setSelf(me); setBoot('blocked') }
  }, [self, loadPresence])

  useEffect(() => { void reload() }, [reload])
  useEffect(() => outbox.subscribe(setOutboxState), [])
  useEffect(() => {
    outbox.onAlerts = (_cmd, raised) => setAlerts((a) => [...a, ...raised])
    outbox.onRev = (r) => { rev.current = Math.max(rev.current, r) }
  }, [])

  // push the outbox whenever the network comes back, and every 20 s while something waits
  useEffect(() => {
    const online = () => { void flush() }
    window.addEventListener('online', online)
    const t = window.setInterval(() => { if (outbox.state().pending > 0) void flush() }, 20_000)
    return () => { window.removeEventListener('online', online); window.clearInterval(t) }
  }, [flush])

  // heartbeat every 30 minutes; the day rolls over at midnight in the church's zone
  useEffect(() => {
    if (boot !== 'ready' || !day) return
    const hb = window.setInterval(() => { void heartbeat() }, 30 * 60_000)
    const roll = window.setInterval(() => { if (self?.status === 'active' && day && self.local_today !== day.local_date) void reload() }, 60_000)
    return () => { window.clearInterval(hb); window.clearInterval(roll) }
  }, [boot, day, self, reload])

  // live rosters: broadcast per service, plus a catch-up read every two minutes
  useEffect(() => {
    if (boot !== 'ready' || !day) return
    const unsubs = day.services.map((s) => subscribeOccurrence(day.self.org_id, s.id, (c) => {
      rev.current = Math.max(rev.current, c.rev)
      setPresence((p) => {
        const key = (x: Presence) => x.occurrence_id === c.occurrence_id && x.person_id === c.person_id
        if (c.status === 'none') return p.filter((x) => !key(x))
        const cur = p.find(key)
        const row: Presence = { occurrence_id: c.occurrence_id, person_id: c.person_id, room_id: c.room_id, status: c.status, role: cur?.role ?? 'child' }
        return cur ? p.map((x) => (key(x) ? row : x)) : [...p, row]
      })
    }))
    const t = window.setInterval(async () => {
      try {
        const changed = await attendanceSince(rev.current)
        if (changed.length === 0) return
        const ids = new Set(day.services.map((s) => s.id))
        setPresence((p) => {
          const next = new Map(p.map((x) => [`${x.occurrence_id}:${x.person_id}`, x]))
          for (const r of changed) {
            if (!ids.has(r.occurrence_id)) continue
            next.set(`${r.occurrence_id}:${r.person_id}`, { occurrence_id: r.occurrence_id, person_id: r.person_id, room_id: r.room_id, status: r.status as 'in' | 'out', role: r.role })
            rev.current = Math.max(rev.current, Number(r.rev))
          }
          return [...next.values()]
        })
      } catch { /* offline */ }
    }, 120_000)
    return () => { unsubs.forEach((u) => u()); window.clearInterval(t) }
  }, [boot, day])

  const setStaff = useCallback((s: StaffUnlock | null) => setStaffRaw(s), [])
  useEffect(() => {
    if (!staff) return
    const t = window.setTimeout(() => setStaffRaw(null), Math.max(0, staff.until - Date.now()))
    return () => window.clearTimeout(t)
  }, [staff])

  const value = useMemo<StationValue>(() => ({
    boot, self, day, error, outbox, outboxState, codes, staff, setStaff, presence, send, flush, reload, refreshDay, alerts,
    dismissAlert: (i) => setAlerts((a) => a.filter((_, j) => j !== i)),
  }), [boot, self, day, error, outboxState, codes, staff, setStaff, presence, send, flush, reload, refreshDay, alerts])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
