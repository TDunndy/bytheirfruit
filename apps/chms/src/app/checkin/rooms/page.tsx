'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { isCriteria, matches, type Criteria } from '@btf/core'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { CriteriaEditor, describeCriteria } from '@/components/checkin/CriteriaEditor'
import { PersonPicker } from '@/components/PersonPicker'
import { Avatar, IconTile, RemoveGlyph, Spinner, Switch } from '@/components/ui'
import { errorMessage, listRoles, peopleNames, todayLocal, type OrgRole } from '@/lib/people'
import {
  AREA_KINDS, addAreaLeader, addRoomLeader, archiveArea, archiveRoom, getSettings, listAreaLeaders, listAreas, listRoomLeaders, listRooms,
  previewPeople, removeAreaLeader, removeRoomLeader, saveArea, saveRoom,
  type Area, type AreaLeader, type CheckinSettings, type PreviewPerson, type Room, type RoomInput, type RoomLeader,
} from '@/lib/checkin'
import { listFieldDefs } from '@/lib/kids'

export default function RoomsPage() {
  const { org, can } = useSession()
  const [areas, setAreas] = useState<Area[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [areaLeaders, setAreaLeaders] = useState<AreaLeader[]>([])
  const [roomLeaders, setRoomLeaders] = useState<RoomLeader[]>([])
  const [roles, setRoles] = useState<OrgRole[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [settings, setSettings] = useState<CheckinSettings | null>(null)
  const [kids, setKids] = useState<PreviewPerson[]>([])
  const [fieldKeys, setFieldKeys] = useState<string[]>([])
  const [editingArea, setEditingArea] = useState<Partial<Area> | null>(null)
  const [editingRoom, setEditingRoom] = useState<Partial<RoomInput> | null>(null)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const manage = can('checkin.manage')
  const allowed = manage || can('checkin.station') || can('kids.view')

  const load = useCallback(async () => {
    if (!org || !allowed) return
    try {
      const [a, r, al, rl, ro, s, defs] = await Promise.all([
        listAreas(org.id), listRooms(org.id), listAreaLeaders(org.id), listRoomLeaders(org.id), listRoles(org.id), getSettings(org.id), listFieldDefs(org.id),
      ])
      setAreas(a); setRooms(r); setAreaLeaders(al); setRoomLeaders(rl); setRoles(ro); setSettings(s)
      setFieldKeys(defs.filter((d) => d.applies_to === 'person' && !d.sensitive).map((d) => d.key))
      setNames(await peopleNames([...al, ...rl].map((l) => l.person_id ?? '')))
      if (can('kids.view')) setKids(await previewPeople(org.id))
      setError(''); setLoaded(true)
    } catch (e) { setError(errorMessage(e)) }
  }, [org, allowed, can])
  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load() } catch (e) { setError(errorMessage(e)) } }
  const ctx = useMemo(() => ({ on: todayLocal(), settings: { cutoffMonth: settings?.grade_cutoff_month ?? 8, cutoffDay: settings?.grade_cutoff_day ?? 16 } }), [settings])
  const roleName = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles])

  // How many known children each room's criteria would place today.
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rooms) {
      if (!isCriteria(r.criteria)) continue
      m.set(r.id, kids.filter((k) => matches(r.criteria as unknown as Criteria, child(k), ctx)).length)
    }
    return m
  }, [rooms, kids, ctx])

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="rooms" />
  if (!loaded && !error) return <Spinner />

  return (
    <div className="stack">
      {error && <p className="error" role="alert">{error}</p>}
      {manage && !editingArea && !editingRoom && (
        <div className="row">
          <button className="btn btn-tinted" onClick={() => setEditingArea({ name: '', kind: 'kids' })}>Add area</button>
          {areas.length > 0 && <button className="btn btn-filled" onClick={() => setEditingRoom({ area_id: areas[0].id, criteria: { rules: [] }, priority: (rooms.length + 1) * 10, active: true })}>Add room</button>}
        </div>
      )}
      {editingArea && (
        <AreaForm initial={editingArea} onCancel={() => setEditingArea(null)}
          onSave={(a) => act(async () => { await saveArea(org.id, { ...a, id: editingArea.id }); setEditingArea(null) })} />
      )}
      {editingRoom && (
        <RoomForm initial={editingRoom} areas={areas} rooms={rooms} kids={kids} ctx={ctx} fieldKeys={fieldKeys} onCancel={() => setEditingRoom(null)}
          onSave={(r) => act(async () => { await saveRoom(org.id, r); setEditingRoom(null) })} />
      )}
      {areas.length === 0 && !editingArea && <div className="card empty"><p className="muted">No areas yet. Start with the kids area, then add its rooms.</p></div>}
      {areas.map((a) => (
        <section key={a.id} className="section">
          <div className="group-head-row">
            <h2 className="group-head">{a.name} <span className="muted cap">· {a.kind}</span></h2>
            {manage && (
              <div className="actions">
                <button className="btn btn-plain btn-small" onClick={() => setEditingArea(a)}>Edit</button>
                <button className="btn btn-plain btn-small" onClick={() => act(() => archiveArea(a.id, true))}>Archive</button>
              </div>
            )}
          </div>
          <ul className="group">
            {rooms.filter((r) => r.area_id === a.id).map((r) => (
              <li key={r.id} className="cell">
                <IconTile name="room" />
                <span className="cell-text">
                  <span className="cell-title">{r.name}{!r.active && <span className="chip">Inactive</span>}</span>
                  <span className="cell-sub">{describeCriteria(r.criteria)}{r.capacity ? ` · up to ${r.capacity}` : ''}{r.children_per_adult ? ` · 1 adult per ${r.children_per_adult}` : ''}</span>
                </span>
                {kids.length > 0 && <span className="cell-value" title="Children who would land here today">{counts.get(r.id) ?? 0}</span>}
                {manage && <button className="btn btn-plain btn-small" onClick={() => setEditingRoom(toInput(r))}>Edit</button>}
              </li>
            ))}
            {rooms.filter((r) => r.area_id === a.id).length === 0 && <li className="cell muted">No rooms in this area.</li>}
          </ul>
          <Leaders title="Area leaders" leaders={areaLeaders.filter((l) => l.area_id === a.id)} names={names} roleName={roleName} roles={roles} manage={manage} orgId={org.id}
            onAdd={(who, kind) => act(() => addAreaLeader(org.id, a.id, who, kind))} onRemove={(id) => act(() => removeAreaLeader(id))} />
          {rooms.filter((r) => r.area_id === a.id).map((r) => (
            <Leaders key={r.id} title={`${r.name} leaders`} compact leaders={roomLeaders.filter((l) => l.room_id === r.id)} names={names} roleName={roleName} roles={roles} manage={manage} orgId={org.id}
              onAdd={(who, kind) => act(() => addRoomLeader(org.id, r.id, who, kind))} onRemove={(id) => act(() => removeRoomLeader(id))} />
          ))}
        </section>
      ))}
    </div>
  )
}

function child(k: PreviewPerson) {
  return {
    birthdate: k.birthdate, gender: (k.gender as 'male' | 'female' | null) ?? null, tags: k.tags,
    custom: (k.custom ?? {}) as Record<string, unknown>,
    gradeOverride: k.grade_override !== null && k.grade_override_year !== null ? { grade: k.grade_override, year: k.grade_override_year } : null,
  }
}

function toInput(r: Room): RoomInput {
  return {
    id: r.id, area_id: r.area_id, name: r.name, capacity: r.capacity, children_per_adult: r.children_per_adult, overflow_room_id: r.overflow_room_id,
    priority: r.priority, criteria: (isCriteria(r.criteria) ? r.criteria : { manual_only: true, rules: [] }) as Criteria, active: r.active,
  }
}

function AreaForm({ initial, onSave, onCancel }: { initial: Partial<Area>; onSave: (a: { name: string; kind: Area['kind']; sort_order: number }) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(initial.name ?? '')
  const [kind, setKind] = useState<Area['kind']>(initial.kind ?? 'kids')
  return (
    <form className="card form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave({ name: name.trim(), kind, sort_order: initial.sort_order ?? 0 }) }}>
      <fieldset>
        <legend className="group-head">{initial.id ? 'Edit area' : 'New area'}</legend>
        <div className="group">
          <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Barn" required /></label>
          <label className="field"><span>Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as Area['kind'])}>{AREA_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
          </label>
        </div>
      </fieldset>
      <div className="actions"><button type="button" className="btn btn-tinted" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-filled">Save</button></div>
    </form>
  )
}

function RoomForm({ initial, areas, rooms, kids, ctx, fieldKeys, onSave, onCancel }: {
  initial: Partial<RoomInput>
  areas: Area[]
  rooms: Room[]
  kids: PreviewPerson[]
  ctx: { on: string; settings: { cutoffMonth: number; cutoffDay: number } }
  fieldKeys: string[]
  onSave: (r: RoomInput) => Promise<void>
  onCancel: () => void
}) {
  const [v, setV] = useState<RoomInput>({
    id: initial.id, area_id: initial.area_id ?? areas[0]?.id ?? '', name: initial.name ?? '', capacity: initial.capacity ?? null,
    children_per_adult: initial.children_per_adult ?? null, overflow_room_id: initial.overflow_room_id ?? null, priority: initial.priority ?? 10,
    criteria: initial.criteria ?? { rules: [] }, active: initial.active ?? true,
  })
  const valid = isCriteria(v.criteria)
  const preview = useMemo(() => (valid ? kids.filter((k) => matches(v.criteria, child(k), ctx)) : []), [valid, kids, v.criteria, ctx])
  const num = (s: string) => (s === '' ? null : Number(s))
  return (
    <form className="card form" onSubmit={(e) => { e.preventDefault(); if (v.name.trim() && valid) onSave({ ...v, name: v.name.trim() }) }}>
      <fieldset>
        <legend className="group-head">{v.id ? 'Edit room' : 'New room'}</legend>
        <div className="group">
          <label className="field"><span>Name</span><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Ducklings" required /></label>
          <label className="field"><span>Area</span>
            <select value={v.area_id} onChange={(e) => setV({ ...v, area_id: e.target.value })}>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </label>
          <label className="field"><span>Capacity</span><input type="number" min={1} max={2000} value={v.capacity ?? ''} placeholder="No limit" onChange={(e) => setV({ ...v, capacity: num(e.target.value) })} /></label>
          <label className="field"><span>Kids per adult</span><input type="number" min={1} max={50} value={v.children_per_adult ?? ''} placeholder="No ratio" onChange={(e) => setV({ ...v, children_per_adult: num(e.target.value) })} /></label>
          <label className="field"><span>Overflow room</span>
            <select value={v.overflow_room_id ?? ''} onChange={(e) => setV({ ...v, overflow_room_id: e.target.value || null })}>
              <option value="">None</option>{rooms.filter((r) => r.id !== v.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Priority</span><input type="number" min={0} max={1000} value={v.priority} onChange={(e) => setV({ ...v, priority: Number(e.target.value) })} /></label>
          <div className="field"><Switch label="Active" checked={v.active} onChange={(on) => setV({ ...v, active: on })} /></div>
        </div>
        <p className="group-foot">When several rooms match, the lowest priority number is suggested first.</p>
      </fieldset>
      <CriteriaEditor value={v.criteria} onChange={(c) => setV({ ...v, criteria: c })} fieldKeys={fieldKeys} />
      {!valid && <p className="error" role="alert">Each bound needs a value, and lower bounds must not exceed upper ones.</p>}
      {kids.length > 0 && valid && !v.criteria.manual_only && (
        <section className="section">
          <h2 className="group-head">Who would land here today · {preview.length}</h2>
          <ul className="group preview">
            {preview.slice(0, 12).map((k) => (
              <li key={k.id} className="cell"><Avatar name={`${k.first_name} ${k.last_name}`} size="xs" /><span className="cell-title">{k.first_name} {k.last_name}</span><span className="cell-value">{k.birthdate}</span></li>
            ))}
            {preview.length > 12 && <li className="cell muted">and {preview.length - 12} more</li>}
            {preview.length === 0 && <li className="cell muted">No one in the directory matches yet.</li>}
          </ul>
        </section>
      )}
      <div className="actions"><button type="button" className="btn btn-tinted" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-filled" disabled={!valid}>Save room</button></div>
    </form>
  )
}

function Leaders({ title, leaders, names, roleName, roles, manage, orgId, compact = false, onAdd, onRemove }: {
  title: string
  leaders: (AreaLeader | RoomLeader)[]
  names: Map<string, string>
  roleName: Map<string, string>
  roles: OrgRole[]
  manage: boolean
  orgId: string
  compact?: boolean
  onAdd: (who: { personId?: string; roleId?: string }, kind: 'director' | 'leader') => void
  onRemove: (id: string) => void
}) {
  const [kind, setKind] = useState<'director' | 'leader'>('leader')
  if (!manage && leaders.length === 0) return null
  return (
    <div className={compact ? 'leaders compact' : 'leaders'}>
      <h3 className="group-head">{title}</h3>
      <ul className="group">
        {leaders.map((l) => (
          <li key={l.id} className="cell">
            {manage && <button className="remove-btn" aria-label="Remove leader" onClick={() => onRemove(l.id)}><RemoveGlyph /></button>}
            {l.person_id ? <Avatar name={names.get(l.person_id) ?? 'Someone'} size="xs" /> : <IconTile name="board" />}
            <span className="cell-title">{l.person_id ? names.get(l.person_id) ?? 'Someone' : `${roleName.get(l.role_id ?? '') ?? 'Role'} (everyone with the role)`}</span>
            <span className="cell-value cap">{l.kind}</span>
          </li>
        ))}
        {manage && (
          <li className="cell add-member">
            <select className="popup" aria-label="Leader kind" value={kind} onChange={(e) => setKind(e.target.value as 'director' | 'leader')}><option value="leader">Leader</option><option value="director">Director</option></select>
            <PersonPicker orgId={orgId} placeholder="Add a person" onPick={(p) => onAdd({ personId: p.id }, kind)} />
            <select className="row-select action" aria-label="Add a role" value="" onChange={(e) => e.target.value && onAdd({ roleId: e.target.value }, kind)}>
              <option value="">Or a role…</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </li>
        )}
      </ul>
    </div>
  )
}
