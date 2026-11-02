'use client'

import { useState } from 'react'
import { Switch } from '@/components/ui'
import type { Area } from '@/lib/checkin'
import { GROUP_KINDS, type GroupInput } from '@/lib/groups'

export function GroupForm({ initial, areas, submitLabel, onSubmit, onCancel }: {
  initial: Partial<GroupInput>
  areas: Area[]
  submitLabel: string
  onSubmit: (g: GroupInput) => Promise<void>
  onCancel: () => void
}) {
  const [v, setV] = useState<GroupInput>({
    id: initial.id, name: initial.name ?? '', kind: initial.kind ?? 'small_group', description: initial.description ?? null,
    meets: initial.meets ?? null, area_id: initial.area_id ?? null, active: initial.active ?? true,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <form className="card form" onSubmit={async (e) => {
      e.preventDefault()
      if (!v.name.trim() || busy) return
      setBusy(true); setError('')
      try { await onSubmit({ ...v, name: v.name.trim(), meets: v.meets?.trim() || null, description: v.description?.trim() || null }) } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
    }}>
      <fieldset>
        <legend className="group-head">{v.id ? 'Edit group' : 'New group'}</legend>
        <div className="group">
          <label className="field"><span>Name</span><input autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Welcome team" required maxLength={80} /></label>
          <label className="field"><span>Kind</span>
            <select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as GroupInput['kind'] })}>{GROUP_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
          </label>
          <label className="field"><span>Meets</span><input value={v.meets ?? ''} onChange={(e) => setV({ ...v, meets: e.target.value })} placeholder="e.g. Tuesdays 7pm at the Smiths'" maxLength={200} /></label>
          <label className="field"><span>Description</span><textarea rows={3} value={v.description ?? ''} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={2000} /></label>
          {areas.length > 0 && (
            <label className="field"><span>Kids area</span>
              <select value={v.area_id ?? ''} onChange={(e) => setV({ ...v, area_id: e.target.value || null })}><option value="">None</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </label>
          )}
          <div className="field"><Switch label="Active" checked={v.active} onChange={(on) => setV({ ...v, active: on })} /></div>
        </div>
        <p className="group-foot">{GROUP_KINDS.find((k) => k.value === v.kind)?.help}. A serving team in a kids area counts as serving there.</p>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions"><button type="button" className="btn btn-tinted" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-filled" disabled={busy || !v.name.trim()}>{busy ? 'Saving…' : submitLabel}</button></div>
    </form>
  )
}
