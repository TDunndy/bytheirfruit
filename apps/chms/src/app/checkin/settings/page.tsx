'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { PersonPicker } from '@/components/PersonPicker'
import { IntakeCard } from '@/components/intake/IntakeCard'
import { RemoveGlyph, Spinner, Switch } from '@/components/ui'
import { errorMessage, listRoles, peopleNames, type OrgRole } from '@/lib/people'
import { getSettings, guessTimeZone, saveSettings, setMyStaffPin, type CheckinSettings } from '@/lib/checkin'
import { FIELD_TYPES, archiveFieldDef, listFieldDefs, saveFieldDef, type CustomFieldDef } from '@/lib/kids'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function zones(): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
    return all.length ? all : ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles']
  } catch { return ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'] }
}

export default function SettingsPage() {
  const { org, can } = useSession()
  const [settings, setSettings] = useState<CheckinSettings | null | undefined>(undefined)
  const [defs, setDefs] = useState<CustomFieldDef[]>([])
  const [roles, setRoles] = useState<OrgRole[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  const load = useCallback(async () => {
    if (!org) return
    try {
      const [s, d, r] = await Promise.all([getSettings(org.id), listFieldDefs(org.id), listRoles(org.id)])
      setSettings(s); setDefs(d); setRoles(r); setError('')
      if (s?.followup_person_id) setNames(await peopleNames([s.followup_person_id]))
    } catch (e) { setError(errorMessage(e)) }
  }, [org])
  useEffect(() => { load() }, [load])

  if (!org) return <Spinner />
  if (!can('checkin.manage') && !can('checkin.station') && !can('org.manage')) return <NoAccess what="check-in settings" />
  if (settings === undefined && !error) return <Spinner />

  return (
    <div className="stack">
      {error && <p className="error" role="alert">{error}</p>}
      <p className="muted" role="status">{saved}</p>
      {can('checkin.manage') && (
        <SettingsForm initial={settings ?? null} onSave={async (v) => {
          setSaved('')
          try { setSettings(await saveSettings(org.id, v)); setSaved('Settings saved.'); setError('') } catch (e) { setError(errorMessage(e)) }
        }} />
      )}
      {can('checkin.manage') && settings && (
        <FollowupDefault settings={settings} roles={roles} names={names} orgId={org.id} onSave={async (v) => {
          setSaved('')
          try { setSettings(await saveSettings(org.id, { time_zone: settings.time_zone, ...v })); await load(); setSaved('Follow-up default saved.') } catch (e) { setError(errorMessage(e)) }
        }} />
      )}
      {can('checkin.manage') && <IntakeCard slug={org.slug} churchName={org.name} />}
      {(can('checkin.station') || can('checkin.manage')) && <PinForm onSave={async (pin) => { await setMyStaffPin(org.id, pin) }} />}
      {can('org.manage') && (
        <FieldDefs defs={defs}
          onAdd={async (d) => { try { await saveFieldDef(org.id, d); await load() } catch (e) { setError(errorMessage(e)) } }}
          onArchive={async (id) => { try { await archiveFieldDef(id); await load() } catch (e) { setError(errorMessage(e)) } }} />
      )}
    </div>
  )
}

function SettingsForm({ initial, onSave }: { initial: CheckinSettings | null; onSave: (v: { time_zone: string; grade_cutoff_month: number; grade_cutoff_day: number; promotion_date: string | null; punctuality_grace_minutes: number }) => Promise<void> }) {
  const [tz, setTz] = useState(initial?.time_zone ?? guessTimeZone())
  const [month, setMonth] = useState(initial?.grade_cutoff_month ?? 8)
  const [day, setDay] = useState(initial?.grade_cutoff_day ?? 16)
  const [promotion, setPromotion] = useState(initial?.promotion_date ?? '')
  const [grace, setGrace] = useState(initial?.punctuality_grace_minutes ?? 10)
  const [busy, setBusy] = useState(false)
  return (
    <form className="card form" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true)
      await onSave({ time_zone: tz, grade_cutoff_month: month, grade_cutoff_day: day, promotion_date: promotion || null, punctuality_grace_minutes: grace })
      setBusy(false)
    }}>
      <fieldset>
        <legend className="group-head">Church</legend>
        <div className="group">
          <label className="field"><span>Time zone</span>
            <input autoFocus list="tz-list" value={tz} onChange={(e) => setTz(e.target.value)} required />
            <datalist id="tz-list">{zones().map((z) => <option key={z} value={z} />)}</datalist>
          </label>
        </div>
        <p className="group-foot">Services are scheduled in this zone; the app works out daylight saving on its own.</p>
      </fieldset>
      <fieldset>
        <legend className="group-head">Grades</legend>
        <div className="group">
          <label className="field"><span>Cutoff month</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          </label>
          <label className="field"><span>Cutoff day</span><input type="number" min={1} max={31} value={day} onChange={(e) => setDay(Number(e.target.value))} /></label>
          <label className="field"><span>Move-Up Sunday</span><input type="date" value={promotion} data-empty={!promotion} onChange={(e) => setPromotion(e.target.value)} /></label>
        </div>
        <p className="group-foot">A child who is 5 by the cutoff starts kindergarten. Rooms move up on Move-Up Sunday (the cutoff date when none is set).</p>
      </fieldset>
      <fieldset>
        <legend className="group-head">Volunteers</legend>
        <div className="group">
          <label className="field"><span>On-time grace (min)</span><input type="number" min={0} max={120} value={grace} onChange={(e) => setGrace(Number(e.target.value))} /></label>
        </div>
        <p className="group-foot">A volunteer is on time within this many minutes of their slot&apos;s expected arrival.</p>
      </fieldset>
      <div className="actions"><button type="submit" className="btn btn-filled" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>
    </form>
  )
}

function FollowupDefault({ settings, roles, names, orgId, onSave }: {
  settings: CheckinSettings; roles: OrgRole[]; names: Map<string, string>; orgId: string
  onSave: (v: { followup_role_id: string | null; followup_person_id: string | null }) => Promise<void>
}) {
  const who = settings.followup_person_id ? names.get(settings.followup_person_id) ?? 'A person' : settings.followup_role_id ? `${roles.find((r) => r.id === settings.followup_role_id)?.name ?? 'A role'} (any holder)` : 'Nobody yet'
  return (
    <section className="card form">
      <fieldset>
        <legend className="group-head">First-time follow-ups</legend>
        <div className="group">
          <div className="field"><span>Default assignee</span><span>{who}</span></div>
          <label className="field"><span>A role</span>
            <select value={settings.followup_role_id ?? ''} onChange={(e) => onSave({ followup_role_id: e.target.value || null, followup_person_id: null })}>
              <option value="">None</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <div className="field"><span>Or a person</span><PersonPicker orgId={orgId} placeholder="Search people" onPick={(p) => onSave({ followup_person_id: p.id, followup_role_id: null })} /></div>
        </div>
        <p className="group-foot">A first-time family goes to the director of the kids area for the child&apos;s room or age (set directors and age bands under Rooms). Families outside every area, or without children, go here.</p>
      </fieldset>
    </section>
  )
}

function PinForm({ onSave }: { onSave: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  return (
    <form className="card form" onSubmit={async (e) => {
      e.preventDefault(); setErr(''); setMsg('')
      if (!/^\d{4,8}$/.test(pin)) { setErr('Use 4 to 8 digits.'); return }
      if (pin !== again) { setErr("The two PINs don't match."); return }
      try { await onSave(pin); setMsg('Your station PIN is set.'); setPin(''); setAgain('') } catch (e) { setErr(errorMessage(e)) }
    }}>
      <p className="sr-only" role="status">{msg}</p>
      <fieldset>
        <legend className="group-head">My station PIN</legend>
        <div className="group">
          <label className="field"><span>New PIN</span><input type="password" inputMode="numeric" autoComplete="new-password" pattern="\d{4,8}" value={pin} onChange={(e) => setPin(e.target.value)} /></label>
          <label className="field"><span>Again</span><input type="password" inputMode="numeric" autoComplete="new-password" pattern="\d{4,8}" value={again} onChange={(e) => setAgain(e.target.value)} /></label>
        </div>
        <p className="group-foot">Stations ask for it to override a room or exit the kiosk. Five wrong tries lock it for fifteen minutes.</p>
      </fieldset>
      {err && <p className="error" role="alert">{err}</p>}
      {msg && <p className="muted">{msg}</p>}
      <div className="actions"><button type="submit" className="btn btn-filled">Set PIN</button></div>
    </form>
  )
}

function FieldDefs({ defs, onAdd, onArchive }: {
  defs: CustomFieldDef[]
  onAdd: (d: { applies_to: 'person' | 'household'; key: string; label: string; field_type: CustomFieldDef['field_type']; options: string[]; sensitive: boolean; sort: number }) => Promise<void>
  onArchive: (id: string) => Promise<void>
}) {
  const [label, setLabel] = useState('')
  const [appliesTo, setAppliesTo] = useState<'person' | 'household'>('person')
  const [type, setType] = useState<CustomFieldDef['field_type']>('text')
  const [options, setOptions] = useState('')
  const [sensitive, setSensitive] = useState(false)
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+/, '').replace(/_+$/, '').slice(0, 40)
  return (
    <section className="section">
      <h2 className="group-head">Custom fields</h2>
      <ul className="group">
        {defs.length === 0 && <li className="cell muted">No custom fields yet.</li>}
        {defs.map((d) => (
          <li key={d.id} className="cell">
            <button className="remove-btn" aria-label={`Remove the ${d.label} field`} onClick={() => { if (window.confirm(`Remove the ${d.label} field? Values already entered are kept.`)) onArchive(d.id) }}><RemoveGlyph /></button>
            <span className="cell-text">
              <span className="cell-title">{d.label}{d.sensitive && <span className="chip chip-warn">Sensitive</span>}</span>
              <span className="cell-sub">{d.applies_to === 'person' ? 'People' : 'Families'} · {FIELD_TYPES.find((t) => t.value === d.field_type)?.label ?? d.field_type}{d.options.length ? ` · ${d.options.join(', ')}` : ''}</span>
            </span>
          </li>
        ))}
      </ul>
      <form className="card form mt" onSubmit={async (e) => {
        e.preventDefault()
        if (!key) return
        await onAdd({ applies_to: appliesTo, key, label: label.trim(), field_type: type, options: options.split(',').map((o) => o.trim()).filter(Boolean), sensitive, sort: defs.length })
        setLabel(''); setOptions(''); setSensitive(false)
      }}>
        <fieldset>
          <legend className="group-head">Add a field</legend>
          <div className="group">
            <label className="field"><span>Label</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Rides the bus" required /></label>
            <label className="field"><span>For</span>
              <select value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as 'person' | 'household')}><option value="person">People</option><option value="household">Families</option></select>
            </label>
            <label className="field"><span>Type</span>
              <select value={type} onChange={(e) => setType(e.target.value as CustomFieldDef['field_type'])}>{FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
            </label>
            {(type === 'select' || type === 'multiselect') && <label className="field"><span>Options</span><input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Comma separated" /></label>}
            <div className="field"><Switch label="Sensitive (care team only)" checked={sensitive} onChange={setSensitive} /></div>
          </div>
          <p className="group-foot">Sensitive values are stored apart from the directory. Only the care team can read them.</p>
        </fieldset>
        <div className="actions"><button type="submit" className="btn btn-filled" disabled={!key}>Add field</button></div>
      </form>
    </section>
  )
}
