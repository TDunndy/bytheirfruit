'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '../Session'
import { PersonPicker } from '../PersonPicker'
import { Avatar, Icon, RemoveGlyph, Switch } from '../ui'
import { errorMessage, peopleNames, todayLocal, type Person } from '@/lib/people'
import { addRestriction, clearOverride, clearRestriction, listRooms, overridesFor, restrictionsFor, setOverride, type Restriction, type Room, type RoomOverride } from '@/lib/checkin'
import {
  CREDENTIAL_KINDS, addCredential, addPickup, archiveCredential, archiveDocument, archivePickup, credentialStatus, credentialsFor, documentsFor, getCare, listFieldDefs,
  photoUrl, pickupsFor, sensitiveValuesFor, setCare, setPlainCustom, setSensitiveValue, uploadDocument, uploadPhoto,
  type CareNotes, type Credential, type CustomFieldDef, type PersonDocument, type PickupPerson, type SensitiveValue,
} from '@/lib/kids'
import { supabase } from '@/lib/supabase'

function fmt(d: string) { return new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }

/** The kids' ministry sections of a person's page. Each one shows only to roles that may use it. */
export function KidsSections({ person, onChange }: { person: Person; onChange: () => Promise<void> }) {
  const { org, can } = useSession()
  const [error, setError] = useState('')
  if (!org) return null
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); setError(''); await onChange() } catch (e) { setError(errorMessage(e)) } }
  return (
    <>
      {error && <p className="error" role="alert">{error}</p>}
      {can('people.edit') && <PhotoSection person={person} orgId={org.id} act={act} />}
      {can('kids.care') && <CareSection person={person} />}
      {(can('kids.view') || can('custody.manage')) && <PickupsSection person={person} orgId={org.id} act={act} canManage={can('custody.manage')} />}
      {(can('custody.manage') || can('kids.care')) && <DocumentsSection person={person} orgId={org.id} act={act} canCustody={can('custody.manage')} />}
      {(can('checkin.manage') || can('custody.manage') || can('kids.care')) && <RestrictionsSection person={person} orgId={org.id} act={act} canSet={can('checkin.manage') || can('custody.manage')} />}
      {(can('checkin.manage') || can('kids.view')) && <OverrideSection person={person} orgId={org.id} act={act} canSet={can('checkin.manage')} />}
      {can('checkin.manage') && <CredentialsSection person={person} orgId={org.id} act={act} />}
      {can('people.edit') && <CustomFieldsSection person={person} orgId={org.id} act={act} canSensitive={can('kids.care')} />}
    </>
  )
}

function PhotoSection({ person, orgId, act }: { person: Person; orgId: string; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { let c = false; photoUrl(person.photo_path).then((u) => { if (!c) setUrl(u) }); return () => { c = true } }, [person.photo_path])
  return (
    <section className="section">
      <h2 className="group-head">Photo</h2>
      <div className="group">
        <div className="cell">
          {url ? <img className="photo" src={url} alt="" width={64} height={64} /> : <Avatar name={`${person.first_name} ${person.last_name}`} size="lg" />}
          <label className="btn btn-tinted btn-small file-btn">
            {url ? 'Replace photo' : 'Add photo'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) act(() => uploadPhoto(orgId, person.id, f)) }} />
          </label>
        </div>
      </div>
      <p className="group-foot">Private; shown on rosters and labels. Consent comes from taking part in the ministry.</p>
    </section>
  )
}

function CareSection({ person }: { person: Person }) {
  const [care, setCare_] = useState<CareNotes | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState({ allergies: '', allergy_short: '', medical: '', special_needs: '' })
  const [error, setError] = useState('')
  const open = async () => {
    try {
      const c = await getCare(person.id)
      setCare_(c)
      setV({ allergies: c?.allergies ?? '', allergy_short: c?.allergy_short ?? '', medical: c?.medical ?? '', special_needs: c?.special_needs ?? '' })
    } catch (e) { setError(errorMessage(e)) }
  }
  return (
    <section className="section">
      <h2 className="group-head">Care notes</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {care === undefined ? (
        <div className="group"><button className="cell-link cell-action" onClick={open}>Show care notes</button></div>
      ) : editing ? (
        <form className="card form" onSubmit={async (e) => {
          e.preventDefault()
          try { await setCare(person.id, v); setEditing(false); await open() } catch (err) { setError(errorMessage(err)) }
        }}>
          <div className="group">
            <label className="field"><span>Allergies</span><input value={v.allergies} onChange={(e) => setV({ ...v, allergies: e.target.value })} placeholder="e.g. Peanuts, tree nuts" /></label>
            <label className="field"><span>On the label</span><input value={v.allergy_short} maxLength={40} onChange={(e) => setV({ ...v, allergy_short: e.target.value })} placeholder="Short, e.g. Peanut" /></label>
            <div className="cell"><textarea rows={3} aria-label="Medical" placeholder="Medical (inhaler, epi-pen, seizures…)" value={v.medical} onChange={(e) => setV({ ...v, medical: e.target.value })} /></div>
            <div className="cell"><textarea rows={3} aria-label="Special needs" placeholder="Special needs and what helps" value={v.special_needs} onChange={(e) => setV({ ...v, special_needs: e.target.value })} /></div>
          </div>
          <div className="actions"><button type="button" className="btn btn-tinted" onClick={() => setEditing(false)}>Cancel</button><button type="submit" className="btn btn-filled">Save</button></div>
        </form>
      ) : (
        <>
          <dl className="group details">
            <div className="kv"><dt>Allergies</dt><dd>{care?.allergies || <span className="muted">None noted</span>}{care?.allergy_short && <div className="cell-sub">Label: {care.allergy_short}</div>}</dd></div>
            <div className="kv"><dt>Medical</dt><dd className="pre">{care?.medical || <span className="muted">None noted</span>}</dd></div>
            <div className="kv"><dt>Special needs</dt><dd className="pre">{care?.special_needs || <span className="muted">None noted</span>}</dd></div>
          </dl>
          <div className="row mt"><button className="btn btn-tinted btn-small" onClick={() => setEditing(true)}>Edit care notes</button></div>
          <p className="group-foot">Every view and change is logged.</p>
        </>
      )}
    </section>
  )
}

function PickupsSection({ person, orgId, act, canManage }: { person: Person; orgId: string; act: (fn: () => Promise<unknown>) => Promise<void>; canManage: boolean }) {
  const [rows, setRows] = useState<PickupPerson[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [adding, setAdding] = useState<'authorized' | 'restricted' | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [rel, setRel] = useState('')
  const [note, setNote] = useState('')
  const [validTo, setValidTo] = useState('')
  const load = useCallback(async () => {
    const r = await pickupsFor(person.id)
    setRows(r)
    setNames(await peopleNames(r.map((x) => x.person_id ?? '')))
  }, [person.id])
  useEffect(() => { load().catch(() => {}) }, [load])
  const run = (fn: () => Promise<unknown>) => act(async () => { await fn(); await load() })
  return (
    <section className="section">
      <h2 className="group-head">Pickups and custody</h2>
      <ul className="group">
        {rows.length === 0 && <li className="cell muted">No pickups recorded. Parents in the family can always pick up.</li>}
        {rows.map((p) => (
          <li key={p.id} className="cell">
            {canManage && <button className="remove-btn" aria-label="Remove" onClick={() => run(() => archivePickup(p.id))}><RemoveGlyph /></button>}
            {p.kind === 'restricted' ? <Icon name="warn" size={20} className="warn-icon" /> : <Avatar name={p.person_id ? names.get(p.person_id) ?? '?' : p.name ?? '?'} size="xs" />}
            <span className="cell-text">
              <span className="cell-title">{p.person_id ? names.get(p.person_id) ?? 'Someone' : p.name}{p.relationship ? <span className="muted"> · {p.relationship}</span> : null}</span>
              <span className="cell-sub">{p.kind === 'restricted' ? 'Must not pick up' : 'May pick up'}{p.valid_to ? ` until ${fmt(p.valid_to)}` : ''}{p.note ? ` · ${p.note}` : ''}{p.phone ? ` · ${p.phone}` : ''}</span>
            </span>
          </li>
        ))}
        {canManage && !adding && (
          <li className="cell">
            <div className="row">
              <button className="btn btn-plain btn-small" onClick={() => setAdding('authorized')}>Add authorized pickup</button>
              <button className="btn btn-plain btn-small destructive" onClick={() => setAdding('restricted')}>Add restriction</button>
            </div>
          </li>
        )}
      </ul>
      {adding && (
        <div className="card form mt">
          <div className="group">
            <div className="cell"><PersonPicker orgId={orgId} exclude={[person.id]} placeholder={adding === 'restricted' ? 'Who must not pick up (directory)' : 'Pick from the directory'}
              onPick={(p) => run(async () => { await addPickup(orgId, person.id, { personId: p.id, kind: adding, note, validTo: validTo || null, relationship: rel || undefined }); setAdding(null); setNote(''); setValidTo('') })} /></div>
            {adding === 'authorized' && (
              <>
                <label className="field"><span>Or a name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Not in the directory" /></label>
                <label className="field"><span>Phone</span><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
              </>
            )}
            <label className="field"><span>Relationship</span><input value={rel} onChange={(e) => setRel(e.target.value)} placeholder="e.g. grandmother" /></label>
            <label className="field"><span>Note</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={adding === 'restricted' ? 'e.g. court order on file' : 'Optional'} /></label>
            <label className="field"><span>Until</span><input type="date" value={validTo} data-empty={!validTo} onChange={(e) => setValidTo(e.target.value)} /></label>
          </div>
          {adding === 'restricted' && <p className="group-foot">A restriction must name someone in the directory, so the station can check it. Stations show a neutral message and alert staff.</p>}
          <div className="actions">
            <button type="button" className="btn btn-tinted" onClick={() => setAdding(null)}>Cancel</button>
            {adding === 'authorized' && <button type="button" className="btn btn-filled" disabled={!name.trim()} onClick={() => run(async () => { await addPickup(orgId, person.id, { name: name.trim(), phone, relationship: rel, kind: 'authorized', note, validTo: validTo || null }); setAdding(null); setName(''); setPhone(''); setNote(''); setValidTo('') })}>Add by name</button>}
          </div>
        </div>
      )}
    </section>
  )
}

function DocumentsSection({ person, orgId, act, canCustody }: { person: Person; orgId: string; act: (fn: () => Promise<unknown>) => Promise<void>; canCustody: boolean }) {
  const [docs, setDocs] = useState<PersonDocument[]>([])
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<PersonDocument['kind']>(canCustody ? 'custody' : 'medical')
  const [file, setFile] = useState<File | null>(null)
  const [opening, setOpening] = useState('')
  const load = useCallback(async () => { setDocs(await documentsFor(person.id)) }, [person.id])
  useEffect(() => { load().catch(() => {}) }, [load])
  const run = (fn: () => Promise<unknown>) => act(async () => { await fn(); await load() })
  const open = async (d: PersonDocument) => {
    setOpening(d.id)
    try {
      const { data, error } = await supabase.functions.invoke('document-url', { body: { documentId: d.id } })
      if (error) throw error
      const url = (data as { url?: string })?.url
      if (url) window.open(url, '_blank', 'noopener')
    } catch (e) { act(() => Promise.reject(e)) } finally { setOpening('') }
  }
  return (
    <section className="section">
      <h2 className="group-head">Documents</h2>
      <ul className="group">
        {docs.length === 0 && <li className="cell muted">No documents.</li>}
        {docs.map((d) => (
          <li key={d.id} className="cell">
            <button className="remove-btn" aria-label={`Remove ${d.title}`} onClick={() => run(() => archiveDocument(d.id))}><RemoveGlyph /></button>
            <Icon name="doc" size={20} />
            <span className="cell-text">
              <span className="cell-title">{d.title}</span>
              <span className="cell-sub"><span className="cap">{d.kind}</span> · {fmt(d.created_at)}{d.note ? ` · ${d.note}` : ''}</span>
            </span>
            <button className="btn btn-plain btn-small" disabled={opening === d.id} onClick={() => open(d)}>{opening === d.id ? 'Opening…' : 'Open'}</button>
          </li>
        ))}
      </ul>
      <form className="card form mt" onSubmit={(e) => { e.preventDefault(); if (file && title.trim()) run(async () => { await uploadDocument(orgId, person.id, kind, file, title.trim(), null); setTitle(''); setFile(null) }) }}>
        <div className="group">
          <label className="field"><span>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Custody order, March 2027" /></label>
          <label className="field"><span>Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as PersonDocument['kind'])}>
              {canCustody && <option value="custody">Custody</option>}<option value="medical">Medical</option><option value="other">Other</option>
            </select>
          </label>
          <label className="field"><span>File</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        </div>
        <p className="group-foot">Stored privately; every open is logged.</p>
        <div className="actions"><button type="submit" className="btn btn-filled btn-small" disabled={!file || !title.trim()}>Upload</button></div>
      </form>
    </section>
  )
}

function RestrictionsSection({ person, orgId, act, canSet }: { person: Person; orgId: string; act: (fn: () => Promise<unknown>) => Promise<void>; canSet: boolean }) {
  const [rows, setRows] = useState<Restriction[]>([])
  const [kind, setKind] = useState<Restriction['kind']>('see_staff')
  const [note, setNote] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const load = useCallback(async () => { setRows(await restrictionsFor(person.id)) }, [person.id])
  useEffect(() => { load().catch(() => {}) }, [load])
  const run = (fn: () => Promise<unknown>) => act(async () => { await fn(); await load() })
  const active = rows.filter((r) => !r.cleared_at)
  return (
    <section className="section">
      <h2 className="group-head">Check-in restrictions</h2>
      <ul className="group">
        {active.length === 0 && <li className="cell muted">None. Stations check this child in as usual.</li>}
        {active.map((r) => (
          <li key={r.id} className="cell">
            <Icon name="warn" size={20} className="warn-icon" />
            <span className="cell-text">
              <span className="cell-title">{r.kind === 'no_checkin' ? 'Do not check in' : 'See staff first'}</span>
              <span className="cell-sub">{r.note ?? ''}{r.ends_on ? ` · until ${fmt(r.ends_on)}` : ''}</span>
            </span>
            {canSet && <button className="btn btn-plain btn-small" onClick={() => run(() => clearRestriction(r.id))}>Clear</button>}
          </li>
        ))}
        {canSet && (
          <li className="cell add-member">
            <select className="popup" aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as Restriction['kind'])}><option value="see_staff">See staff first</option><option value="no_checkin">Do not check in</option></select>
            <input aria-label="Reason" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (staff only)" />
            <input type="date" aria-label="Until" value={endsOn} data-empty={!endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            <button className="btn btn-tinted btn-small" onClick={() => run(async () => { await addRestriction(orgId, person.id, kind, note || null, endsOn || null); setNote(''); setEndsOn('') })}>Restrict</button>
          </li>
        )}
      </ul>
      <p className="group-foot">The station shows a neutral &ldquo;please see the welcome desk&rdquo; and alerts staff silently.</p>
    </section>
  )
}

function OverrideSection({ person, orgId, act, canSet }: { person: Person; orgId: string; act: (fn: () => Promise<unknown>) => Promise<void>; canSet: boolean }) {
  const [rows, setRows] = useState<RoomOverride[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomId, setRoomId] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [note, setNote] = useState('')
  const load = useCallback(async () => { const [o, r] = await Promise.all([overridesFor(person.id), listRooms(orgId)]); setRows(o); setRooms(r) }, [person.id, orgId])
  useEffect(() => { load().catch(() => {}) }, [load])
  const run = (fn: () => Promise<unknown>) => act(async () => { await fn(); await load() })
  const roomName = useMemo(() => new Map(rooms.map((r) => [r.id, r.name])), [rooms])
  const current = rows[0]
  return (
    <section className="section">
      <h2 className="group-head">Room override</h2>
      <ul className="group">
        {!current && <li className="cell muted">None. The room follows the criteria.</li>}
        {current && (
          <li className="cell">
            <Icon name="room" size={20} />
            <span className="cell-text">
              <span className="cell-title">Always {roomName.get(current.room_id) ?? 'this room'}</span>
              <span className="cell-sub">{current.ends_on ? `until ${fmt(current.ends_on)}` : 'until cleared'}{current.note ? ` · ${current.note}` : ''}</span>
            </span>
            {canSet && <button className="btn btn-plain btn-small" onClick={() => run(() => clearOverride(current.id))}>Clear</button>}
          </li>
        )}
        {canSet && (
          <li className="cell add-member">
            <select className="popup" aria-label="Room" value={roomId} onChange={(e) => setRoomId(e.target.value)}><option value="">Room…</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            <input type="date" aria-label="Until" value={endsOn} data-empty={!endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            <input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why (e.g. keep with sibling)" />
            <button className="btn btn-tinted btn-small" disabled={!roomId} onClick={() => run(async () => { await setOverride(orgId, person.id, roomId, endsOn || null, note || null); setRoomId(''); setEndsOn(''); setNote('') })}>Set</button>
          </li>
        )}
      </ul>
    </section>
  )
}

function CredentialsSection({ person, orgId, act }: { person: Person; orgId: string; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [rows, setRows] = useState<Credential[]>([])
  const [v, setV] = useState({ kind: 'background_check' as Credential['kind'], completedOn: todayLocal(), expiresOn: '', provider: '', reference: '' })
  const load = useCallback(async () => { setRows(await credentialsFor(person.id)) }, [person.id])
  useEffect(() => { load().catch(() => {}) }, [load])
  const run = (fn: () => Promise<unknown>) => act(async () => { await fn(); await load() })
  const status = credentialStatus(rows, todayLocal())
  return (
    <section className="section">
      <h2 className="group-head">Volunteer credentials <span className={`status status-${status === 'cleared' ? 'member' : status === 'expired' ? 'visitor' : status === 'pending' ? 'regular' : 'inactive'}`}>{status === 'cleared' ? 'Cleared' : status === 'expired' ? 'Check expired' : status === 'pending' ? 'Check pending' : 'No check'}</span></h2>
      <ul className="group">
        {rows.length === 0 && <li className="cell muted">No credentials recorded.</li>}
        {rows.map((c) => (
          <li key={c.id} className="cell">
            <button className="remove-btn" aria-label="Remove credential" onClick={() => run(() => archiveCredential(c.id))}><RemoveGlyph /></button>
            <Icon name="shield" size={20} />
            <span className="cell-text">
              <span className="cell-title">{CREDENTIAL_KINDS.find((k) => k.value === c.kind)?.label ?? c.kind}</span>
              <span className="cell-sub">{fmt(c.completed_on)}{c.expires_on ? ` → ${fmt(c.expires_on)}` : ''}{c.provider ? ` · ${c.provider}` : ''}{c.reference ? ` · ${c.reference}` : ''}</span>
            </span>
          </li>
        ))}
      </ul>
      <form className="card form mt" onSubmit={(e) => { e.preventDefault(); run(async () => { await addCredential(orgId, person.id, { kind: v.kind, completedOn: v.completedOn, expiresOn: v.expiresOn || null, provider: v.provider || null, reference: v.reference || null, note: null }); setV({ ...v, reference: '' }) }) }}>
        <div className="group">
          <label className="field"><span>Kind</span><select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as Credential['kind'] })}>{CREDENTIAL_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
          <label className="field"><span>Completed</span><input type="date" value={v.completedOn} onChange={(e) => setV({ ...v, completedOn: e.target.value })} required /></label>
          <label className="field"><span>Expires</span><input type="date" value={v.expiresOn} data-empty={!v.expiresOn} onChange={(e) => setV({ ...v, expiresOn: e.target.value })} /></label>
          <label className="field"><span>Provider</span><input value={v.provider} onChange={(e) => setV({ ...v, provider: e.target.value })} placeholder="e.g. Protect My Ministry" /></label>
          <label className="field"><span>Reference</span><input value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} placeholder="Optional" /></label>
        </div>
        <div className="actions"><button type="submit" className="btn btn-filled btn-small">Record</button></div>
      </form>
    </section>
  )
}

function CustomFieldsSection({ person, orgId, act, canSensitive }: { person: Person; orgId: string; act: (fn: () => Promise<unknown>) => Promise<void>; canSensitive: boolean }) {
  const [defs, setDefs] = useState<CustomFieldDef[]>([])
  const [sensitive, setSensitive] = useState<SensitiveValue[]>([])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const load = useCallback(async () => {
    const d = (await listFieldDefs(orgId)).filter((x) => x.applies_to === 'person')
    setDefs(d)
    if (canSensitive && d.some((x) => x.sensitive)) setSensitive(await sensitiveValuesFor(person.id))
  }, [orgId, person.id, canSensitive])
  useEffect(() => { load().catch(() => {}) }, [load])
  const run = (fn: () => Promise<unknown>) => act(async () => { await fn(); await load(); setDraft({}) })
  const custom = (person.custom ?? {}) as Record<string, unknown>
  const shown = defs.filter((d) => !d.sensitive || canSensitive)
  if (shown.length === 0) return null
  const valueOf = (d: CustomFieldDef): string => {
    const raw = d.sensitive ? sensitive.find((s) => s.field_id === d.id)?.value : custom[d.key]
    return raw === undefined || raw === null ? '' : typeof raw === 'string' ? raw : JSON.stringify(raw)
  }
  const save = (d: CustomFieldDef, text: string) => {
    const value: unknown = d.field_type === 'boolean' ? text === 'true' : d.field_type === 'number' ? (text === '' ? null : Number(text)) : d.field_type === 'multiselect' ? text.split(',').map((s) => s.trim()).filter(Boolean) : (text || null)
    if (d.sensitive) return run(() => setSensitiveValue(orgId, d.id, person.id, value))
    const next = { ...custom }
    if (value === null || value === '') delete next[d.key]; else next[d.key] = value
    return run(() => setPlainCustom('people', person.id, next))
  }
  return (
    <section className="section">
      <h2 className="group-head">More</h2>
      <div className="group">
        {shown.map((d) => {
          const current = draft[d.id] ?? valueOf(d)
          return (
            <label key={d.id} className="field">
              <span>{d.label}{d.sensitive && <span className="chip chip-warn">Sensitive</span>}</span>
              {d.field_type === 'boolean' ? (
                <Switch label="" checked={current === 'true'} onChange={(on) => save(d, on ? 'true' : 'false')} />
              ) : d.field_type === 'select' ? (
                <select value={current} onChange={(e) => save(d, e.target.value)}><option value="">—</option>{d.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              ) : (
                <input type={d.field_type === 'date' ? 'date' : d.field_type === 'number' ? 'number' : 'text'} value={current}
                  onChange={(e) => setDraft({ ...draft, [d.id]: e.target.value })} onBlur={() => { if (draft[d.id] !== undefined && draft[d.id] !== valueOf(d)) save(d, draft[d.id]) }}
                  placeholder={d.field_type === 'multiselect' ? d.options.join(', ') : ''} />
              )}
            </label>
          )
        })}
      </div>
    </section>
  )
}
