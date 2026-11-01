'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { IconTile, RemoveGlyph, Spinner, Switch } from '@/components/ui'
import { errorMessage } from '@/lib/people'
import {
  STATION_MODES, archiveStation, listAreas, listPrinters, listRooms, listStationScopes, listStations, saveStation, setStationScope,
  type Area, type Printer, type Room, type Station, type StationInput, type StationScope,
} from '@/lib/checkin'

const MODE_HELP: Record<Station['mode'], string> = {
  kiosk: 'Parents check in by phone number or scan',
  staffed: 'A volunteer runs it; last-4 lookup and guest add',
  roster: 'A classroom device: live roster, move, check out',
  volunteer: 'Volunteers check in; own label stock',
}

export default function StationsPage() {
  const { org, can } = useSession()
  const [stations, setStations] = useState<Station[]>([])
  const [scopes, setScopes] = useState<StationScope[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [printers, setPrinters] = useState<Printer[]>([])
  const [editing, setEditing] = useState<(Partial<StationInput> & { areaIds?: string[]; roomIds?: string[] }) | null>(null)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const manage = can('checkin.manage')
  const allowed = manage || can('checkin.station')

  const load = useCallback(async () => {
    if (!org || !allowed) return
    try {
      const [s, sc, a, r, p] = await Promise.all([listStations(org.id), listStationScopes(org.id), listAreas(org.id), listRooms(org.id), listPrinters(org.id)])
      setStations(s); setScopes(sc); setAreas(a); setRooms(r); setPrinters(p); setError(''); setLoaded(true)
    } catch (e) { setError(errorMessage(e)) }
  }, [org, allowed])
  useEffect(() => { load() }, [load])
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load() } catch (e) { setError(errorMessage(e)) } }
  const areaName = useMemo(() => new Map(areas.map((a) => [a.id, a.name])), [areas])
  const roomName = useMemo(() => new Map(rooms.map((r) => [r.id, r.name])), [rooms])
  const printerName = useMemo(() => new Map(printers.map((p) => [p.id, p.name])), [printers])

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="stations" />
  if (!loaded && !error) return <Spinner />

  const scopeText = (id: string) => {
    const mine = scopes.filter((s) => s.station_id === id)
    if (mine.length === 0) return 'Every room'
    return mine.map((s) => (s.area_id ? `${areaName.get(s.area_id) ?? 'Area'} (area)` : roomName.get(s.room_id ?? '') ?? 'Room')).join(', ')
  }

  return (
    <div className="stack">
      {error && <p className="error" role="alert">{error}</p>}
      {manage && !editing && <div className="row"><button className="btn btn-filled" onClick={() => setEditing({ areaIds: [], roomIds: [] })}>Add station</button></div>}
      {editing && (
        <StationForm initial={editing} areas={areas} rooms={rooms} printers={printers} onCancel={() => setEditing(null)}
          onSave={(s, areaIds, roomIds) => act(async () => {
            const saved = await saveStation(org.id, s)
            await setStationScope(org.id, saved.id, areaIds, roomIds)
            setEditing(null)
          })} />
      )}
      <ul className="group">
        {stations.length === 0 && <li className="cell muted">No stations yet. One per iPad or laptop: a mode, the rooms it serves and its printer.</li>}
        {stations.map((s) => (
          <li key={s.id} className="cell">
            {manage && <button className="remove-btn" aria-label={`Remove ${s.name}`} onClick={() => act(() => archiveStation(s.id))}><RemoveGlyph /></button>}
            <IconTile name="tablet" />
            <span className="cell-text">
              <span className="cell-title">{s.name}{!s.active && <span className="chip">Off</span>}</span>
              <span className="cell-sub"><span className="cap">{s.mode}</span> · {scopeText(s.id)}{s.printer_id ? ` · ${printerName.get(s.printer_id) ?? 'printer'}` : ''}</span>
            </span>
            {manage && (
              <button className="btn btn-plain btn-small" onClick={() => setEditing({
                ...s, areaIds: scopes.filter((x) => x.station_id === s.id && x.area_id).map((x) => x.area_id as string),
                roomIds: scopes.filter((x) => x.station_id === s.id && x.room_id).map((x) => x.room_id as string),
              })}>Edit</button>
            )}
          </li>
        ))}
      </ul>
      <p className="group-foot">Pairing a device to a station (a code shown here, typed on the iPad) arrives with the station app.</p>
    </div>
  )
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
  const flip = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  return (
    <form className="card form" onSubmit={(e) => { e.preventDefault(); if (v.name.trim()) onSave({ ...v, name: v.name.trim() }, areaIds, roomIds) }}>
      <fieldset>
        <legend className="group-head">{v.id ? 'Edit station' : 'New station'}</legend>
        <div className="group">
          <label className="field"><span>Name</span><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Barn kiosk 1" required /></label>
          <label className="field"><span>Mode</span>
            <select value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value as Station['mode'] })}>{STATION_MODES.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          </label>
          <label className="field"><span>Printer</span>
            <select value={v.printer_id ?? ''} onChange={(e) => setV({ ...v, printer_id: e.target.value || null })}><option value="">None</option>{printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </label>
          <label className="field"><span>Label stock</span><input value={v.label_stock ?? ''} placeholder="Printer default" onChange={(e) => setV({ ...v, label_stock: e.target.value || null })} /></label>
          <div className="field"><Switch label="Active" checked={v.active} onChange={(on) => setV({ ...v, active: on })} /></div>
        </div>
        <p className="group-foot">{MODE_HELP[v.mode]}.</p>
      </fieldset>
      <fieldset>
        <legend className="group-head">Rooms it serves</legend>
        <div className="group">
          {areas.map((a) => <div key={a.id} className="field"><Switch label={`${a.name} (whole area)`} checked={areaIds.includes(a.id)} onChange={() => setAreaIds(flip(areaIds, a.id))} /></div>)}
          {rooms.map((r) => <div key={r.id} className="field"><Switch label={r.name} checked={roomIds.includes(r.id)} onChange={() => setRoomIds(flip(roomIds, r.id))} /></div>)}
        </div>
        <p className="group-foot">Nothing selected means every room (a front-desk kiosk). A classroom device gets its one room.</p>
      </fieldset>
      <div className="actions"><button type="button" className="btn btn-tinted" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-filled">Save station</button></div>
    </form>
  )
}
