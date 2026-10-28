'use client'

import { useState } from 'react'
import { MEMBERSHIP_STATUSES, type Person, type PersonInput } from '@/lib/people'

export function StatusBadge({ status }: { status: string }) {
  const label = MEMBERSHIP_STATUSES.find((s) => s.value === status)?.label ?? status
  return <span className={`status status-${status}`}>{label}</span>
}

type FormValues = Omit<PersonInput, 'org_id' | 'id' | 'search_text' | 'created_at' | 'updated_at' | 'archived_at' | 'external_id' | 'external_source'>

const EMPTY: FormValues = {
  first_name: '', last_name: '', preferred_name: null, title: null, email: null, phone: null,
  birthdate: null, gender: null, membership_status: 'visitor', first_visit_date: null, joined_date: null,
  address_line1: null, address_line2: null, city: null, state: null, postal_code: null, tags: [],
}

/** Add / edit form for a person. Empty fields are saved as blank, never as "". */
export function PersonForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial?: Person
  submitLabel: string
  onSubmit: (values: FormValues) => Promise<void>
  onCancel?: () => void
}) {
  const [v, setV] = useState<FormValues>(() => (initial ? pick(initial) : EMPTY))
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const text = (key: keyof FormValues) => ({
    value: (v[key] as string | null | undefined) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setV((prev) => ({ ...prev, [key]: e.target.value === '' ? null : e.target.value })),
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!v.first_name || !String(v.first_name).trim()) { setError('First name is required.'); return }
    setBusy(true)
    setError('')
    try {
      await onSubmit({
        ...v,
        first_name: String(v.first_name).trim(),
        last_name: (v.last_name ?? '').trim(),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <fieldset>
        <legend>Name</legend>
        <div className="grid">
          <label className="field"><span>First name *</span><input required value={v.first_name ?? ''} onChange={(e) => setV({ ...v, first_name: e.target.value })} /></label>
          <label className="field"><span>Last name</span><input value={v.last_name ?? ''} onChange={(e) => setV({ ...v, last_name: e.target.value })} /></label>
          <label className="field"><span>Goes by</span><input {...text('preferred_name')} /></label>
          <label className="field"><span>Position or title</span><input placeholder="e.g. Youth Pastor" {...text('title')} /></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Church</legend>
        <div className="grid">
          <label className="field"><span>Status</span>
            <select value={v.membership_status ?? 'visitor'} onChange={(e) => setV({ ...v, membership_status: e.target.value })}>
              {MEMBERSHIP_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="field"><span>First visit</span><input type="date" {...text('first_visit_date')} /></label>
          <label className="field"><span>Joined</span><input type="date" {...text('joined_date')} /></label>
          <label className="field"><span>Tags</span><input placeholder="comma separated" value={tags} onChange={(e) => setTags(e.target.value)} /></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Contact</legend>
        <div className="grid">
          <label className="field"><span>Email</span><input type="email" {...text('email')} /></label>
          <label className="field"><span>Phone</span><input type="tel" {...text('phone')} /></label>
          <label className="field"><span>Birthdate</span><input type="date" {...text('birthdate')} /></label>
          <label className="field"><span>Gender</span>
            <select {...text('gender')}>
              <option value="">—</option><option value="male">Male</option><option value="female">Female</option>
            </select>
          </label>
          <label className="field wide"><span>Address</span><input {...text('address_line1')} /></label>
          <label className="field wide"><span>Address line 2</span><input {...text('address_line2')} /></label>
          <label className="field"><span>City</span><input {...text('city')} /></label>
          <label className="field"><span>State</span><input {...text('state')} /></label>
          <label className="field"><span>Zip</span><input {...text('postal_code')} /></label>
        </div>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  )
}

function pick(p: Person): FormValues {
  return {
    first_name: p.first_name, last_name: p.last_name, preferred_name: p.preferred_name, title: p.title,
    email: p.email, phone: p.phone, birthdate: p.birthdate, gender: p.gender, membership_status: p.membership_status,
    first_visit_date: p.first_visit_date, joined_date: p.joined_date, address_line1: p.address_line1,
    address_line2: p.address_line2, city: p.city, state: p.state, postal_code: p.postal_code, tags: p.tags,
  }
}

export type { FormValues }
