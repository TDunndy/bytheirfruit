'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { IconTile, RemoveGlyph, Spinner, Switch } from '@/components/ui'
import { errorMessage } from '@/lib/people'
import {
  STATION_MODES, archiveStation, createPairingCode, fmtAgo, fmtPairingCode, label, listAreas, listPrinters, listRooms, listStationScopes, listStations,
  pairingStatus, saveStation, setStationScope, unpairStation,
  type Area, type PairingStatus, type Printer, type Room, type Station, type StationInput, type StationScope,
} from '@/lib/checkin'

const STATION_URL = process.env.NEXT_PUBLIC_STATION_URL || 'https://station.bytheirfruit.church'

export default function StationsPage() {
  const { org, can } = useSession()
  const [stations, setStations] = useState<Station[]>([])
  const [scopes, setScopes] = useState<StationScope[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [printers, setPrinters] = useState<Printer[]>([])
  const [pairing, setPairing] = useState<PairingStatus[]>([])
  const [code, setCode] = useState<{ stationId: string; code: string; until: number } | null>(null)
  const [editing, setEditing] = useState<(Partial<StationInput> & { areaIds?: string[]; roomIds?: string[] }) | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [loaded, setLoaded] = useState(false)
  const manage = can('checkin.manage')
  const allowed = manage || can('checkin.station')

  const load = useCallback(async () => {
    if (!org || !allowed) return
    try {
      const [s, sc, a, r, p, ps] = await Promise.all([listStations(org.id), listStationScopes(org.id), listAreas(org.id), listRooms(org.id), listPrinters(org.id), pairingStatus(org.id)])
      setStations(s); setScopes(sc); setAreas(a); setRooms(r); setPrinters(p); setPairing(ps); setError(''); setLoaded(true)
    } catch (e) { setError(errorMessage(e)) }
  }, [org, allowed])
  useEffect(() => { load() }, [load])
  const act = async (fn: () => Promise<unknown>, done = 'Saved') => { setStatus(''); try { await fn(); await load(); setStatus(done) } catch (e) { setError(errorMessage(e)) } }
  const areaName = useMemo(() => new Map(areas.map((a) => [a.id, a.name])), [areas])
  const roomName = useMemo(() => new Map(rooms.map((r) => [r.id, r.name])), [rooms])
  const printerName = useMemo(() => new Map(printers.map((p) => [p.id, p.name])), [printers])
  const paired = useMemo(() => new Map(pairing.map((p) => [p.station_id, p])), [pairing])

  // The code card counts down; the list refreshes when it expires.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!code) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [code])
  useEffect(() => { if (code && now > code.until) { setCode(null); load() } }, [code, now, load])

  const pair = async (s: Station) => {
    setStatus('')
    try {
      const c = await createPairingCode(s.id)
      setCode({ stationId: s.id, code: c, until: Date.now() + 10 * 60_000 })
      setNow(Date.now())
      setStatus(`Pairing code for ${s.name} shown`)
      await load()
    } catch (e) { setError(errorMessage(e)) }
  }

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="stations" />
  if (!loaded && !error) return <Spinner />

  const scopeText = (id: string) => {
    const mine = scopes.filter((s) => s.station_id === id)
    if (mine.length === 0) return 'Every room'
    return mine.map((s) => (s.area_id ? `${areaName.get(s.area_id) ?? 'Area'} (area)` : roomName.get(s.room_id ?? '') ?? 'Room')).join(', ')
  }

  if (editing) {
    return (
      <StationForm key={editing.id ?? 'new'} initial={editing} areas={areas} rooms={rooms} printers={printers} onCancel={() => setEditing(null)}
        onSave={(s, areaIds, roomIds) => act(async () => {
          const saved = await saveStation(org.id, s)
          await setStationScope(org.id, saved.id, areaIds, roomIds)
          setEditing(null)
        }, 'Station saved')} />
    )
  }

  return (
    <div className="stack">
      <p className="sr-only" role="status">{status}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {manage && <div className="row"><button className="btn btn-filled" onClick={() => setEditing({ areaIds: [], roomIds: [] })}>Add station</button></div>}
      {code && (() => {
        const s = stations.find((x) => x.id === code.stationId)
        const left = Math.max(0, Math.ceil((code.until - now) / 1000))
        return (
          <section className="card form" aria-live="polite">
            <h2 className="group-head">Pair a device with {s?.name ?? 'this station'}</h2>
            <p className="pair-code" aria-label={`Pairing code ${code.code.split('').join(' ')}`}>{fmtPairingCode(code.code)}</p>
            <p>On the device, open <strong>{STATION_URL.replace(/^https?:\/\//, '')}</strong> and type this code. It works once and expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}.</p>
            <div className="actions"><button type="button" className="btn btn-tinted" onClick={() => setCode(null)}>Done</button></div>
          </section>
        )
      })()}
      <ul className="group">
        {stations.length === 0 && <li className="cell muted">No stations yet. One per iPad or laptop: a mode, the rooms it serves and its printer.</li>}
        {stations.map((s) => (
          <li key={s.id} className="cell">
            {manage && <button className="remove-btn" aria-label={`Remove ${s.name}`} onClick={() => { if (window.confirm(`Remove the station ${s.name}? Its paired device will stop working.`)) act(() => archiveStation(s.id), 'Station removed') }}><RemoveGlyph /></button>}
            <IconTile name="tablet" />
            <span className="cell-text">
              <span className="cell-title">{s.name}{!s.active && <span className="chip">Off</span>}</span>
              <span className="cell-sub">{label(STATION_MODES, s.mode)} · {scopeText(s.id)}{s.printer_id ? ` · ${printerName.get(s.printer_id) ?? 'printer'}` : ''}</span>
              <span className="cell-sub">{pairedText(paired.get(s.id))}</span>
            </span>
            {manage && (paired.get(s.id)?.paired_at
              ? <button className="btn btn-plain btn-small" aria-label={`Unpair the device on ${s.name}`} onClick={() => { if (window.confirm(`Unpair the device on ${s.name}? It stops working at once; pair it again with a new code.`)) act(() => unpairStation(s.id), 'Device unpaired') }}>Unpair</button>
              : <button className="btn btn-plain btn-small" aria-label={`Pair a device with ${s.name}`} onClick={() => pair(s)}>Pair device</button>)}
            {manage && (
              <button className="btn btn-plain btn-small" aria-label={`Edit ${s.name}`} onClick={() => setEditing({
                ...s, areaIds: scopes.filter((x) => x.station_id === s.id && x.area_id).map((x) => x.area_id as string),
                roomIds: scopes.filter((x) => x.station_id === s.id && x.room_id).map((x) => x.room_id as string),
              })}>Edit</button>
            )}
          </li>
        ))}
      </ul>
      <p className="group-foot">Pair device shows a code good for ten minutes; type it on the iPad or laptop at {STATION_URL.replace(/^https?:\/\//, '')}. Pairing a station again retires the device paired before.</p>
    </div>
  )
}

function pairedText(p: PairingStatus | undefined): string {
  if (!p) return 'Not paired'
  if (p.paired_at) {
    const what = [p.platform, p.app_version].filter(Boolean).join(' ')
    return `Paired${what ? ` (${what})` : ''} · seen ${fmtAgo(p.last_seen_at)}`
  }
  if (p.code_expires_at && new Date(p.code_expires_at).getTime() > Date.now()) return 'Not paired · a pairing code is live'
  return 'Not paired'
}

function StationForm({ initial, areas, rooms, printers, onSave, onCancel }: {
  initial: Partial<StationInput> & { areaIds?: string[]; roomIds?: string[] }
  areas: Area[]
  rooms: Room[]
  printers: Printer[]
  onSave: (s: StationInput, areaIds: string[], roomIds: string[]) => Promise<void>
  onCancel: () => void
}) {
  const [v, setV] = useState<StationInput>({
    id: initial.id, name: initial.name ?? '', mode: initial.mode ?? 'kiosk', printer_id: initial.printer_id ?? null, label_stock: initial.label_stock ?? null, active: initial.active ?? true,
  })
  const [areaIds, setAreaIds] = useState<string[]>(initial.areaIds ?? [])
  const [roomIds, setRoomIds] = useState<string[]>(initial.roomIds ?? [])
  const [busy, setBusy] = useState(false)
  const flip = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); if (!v.name.trim()) return; setBusy(true); await onSave({ ...v, name: v.name.trim() }, areaIds, roomIds); setBusy(false) }}>
      <fieldset>
        <legend className="group-head">{v.id ? 'Edit station' : 'New station'}</legend>
        <div className="group">
          <label className="field"><span>Name</span><input autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Barn kiosk 1" required /></label>
          <label className="field"><span>Mode</span>
            <select value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value as Station['mode'] })}>{STATION_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
          </label>
          <label className="field"><span>Printer</span>
            <select value={v.printer_id ?? ''} onChange={(e) => setV({ ...v, printer_id: e.target.value || null })}><option value="">None</option>{printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </label>
          <label className="field"><span>Label stock</span><input value={v.label_stock ?? ''} placeholder="Printer default" onChange={(e) => setV({ ...v, label_stock: e.target.value || null })} /></label>
          <div className="field"><Switch label="Active" checked={v.active} onChange={(on) => setV({ ...v, active: on })} /></div>
        </div>
        <p className="group-foot">{STATION_MODES.find((m) => m.value === v.mode)?.help}.</p>
      </fieldset>
      <fieldset>
        <legend className="group-head">Rooms it serves</legend>
        <div className="group">
          {areas.map((a) => <div key={a.id} className="field"><Switch label={`${a.name} (whole area)`} checked={areaIds.includes(a.id)} onChange={() => setAreaIds(flip(areaIds, a.id))} /></div>)}
          {rooms.map((r) => <div key={r.id} className="field"><Switch label={r.name} checked={roomIds.includes(r.id)} onChange={() => setRoomIds(flip(roomIds, r.id))} /></div>)}
        </div>
        <p className="group-foot">Nothing selected means every room (a front-desk kiosk). A classroom device gets its one room.</p>
      </fieldset>
      <div className="actions"><button type="button" className="btn btn-tinted" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-filled" disabled={busy}>{busy ? 'Saving…' : 'Save station'}</button></div>
    </form>
  )
}
