'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { defaultTemplates, isLabelLayout, renderLabelHtml, type LabelData, type LabelKind, type LabelLayout } from '@btf/core'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { IconTile, RemoveGlyph, Spinner, Switch } from '@/components/ui'
import { errorMessage } from '@/lib/people'
import {
  PRINTER_CONNECTIONS, archivePrinter, archiveTemplate, label, listAreas, listPrinters, listTemplates, savePrinter, saveTemplate,
  type Area, type LabelTemplate, type Printer, type PrinterInput, type TemplateInput,
} from '@/lib/checkin'

const SAMPLE: LabelData = {
  first_name: 'Ava', last_name: 'Sample', room: 'Cubs', service: '9:00', date: 'Sun, Mar 7', code: 'ACD', allergy_short: 'Peanut',
  flags: { allergy: true }, children_names: ['Ava', 'Ben'], role: 'Greeter', church: 'Your church', guest: false,
}
const KIND_LABEL: Record<LabelKind, string> = { child: 'Child label', pickup: 'Pickup tag', volunteer: 'Volunteer label' }

export default function LabelsPage() {
  const { org, can } = useSession()
  const [printers, setPrinters] = useState<Printer[]>([])
  const [templates, setTemplates] = useState<LabelTemplate[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [editingPrinter, setEditingPrinter] = useState<Partial<PrinterInput> | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<Partial<TemplateInput> | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [loaded, setLoaded] = useState(false)
  const manage = can('checkin.manage')
  const allowed = manage || can('checkin.station')

  const load = useCallback(async () => {
    if (!org || !allowed) return
    try {
      const [p, t, a] = await Promise.all([listPrinters(org.id), listTemplates(org.id), listAreas(org.id)])
      setPrinters(p); setTemplates(t); setAreas(a); setError(''); setLoaded(true)
    } catch (e) { setError(errorMessage(e)) }
  }, [org, allowed])
  useEffect(() => { load() }, [load])
  const act = async (fn: () => Promise<unknown>, done = 'Saved') => { setStatus(''); try { await fn(); await load(); setStatus(done) } catch (e) { setError(errorMessage(e)) } }
  const areaName = useMemo(() => new Map(areas.map((a) => [a.id, a.name])), [areas])

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="printers and labels" />
  if (!loaded && !error) return <Spinner />

  const defaults = defaultTemplates()
  if (editingPrinter) {
    return <PrinterForm key={editingPrinter.id ?? 'new'} initial={editingPrinter} areas={areas} onCancel={() => setEditingPrinter(null)} onSave={(p) => act(async () => { await savePrinter(org.id, p); setEditingPrinter(null) }, 'Printer saved')} />
  }
  if (editingTemplate) {
    return <TemplateForm key={editingTemplate.id ?? 'new'} initial={editingTemplate} onCancel={() => setEditingTemplate(null)} onSave={(t) => act(async () => { await saveTemplate(org.id, t); setEditingTemplate(null) }, 'Template saved')} />
  }

  return (
    <div className="stack">
      <p className="sr-only" role="status">{status}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="section">
        <div className="group-head-row">
          <h2 className="group-head">Printers</h2>
          {manage && <button className="btn btn-tinted btn-small" onClick={() => setEditingPrinter({})}>Add printer</button>}
        </div>
        <ul className="group">
          {printers.length === 0 && <li className="cell muted">No printers yet. Add each label printer with how it connects and the label stock it holds.</li>}
          {printers.map((p) => (
            <li key={p.id} className="cell">
              {manage && <button className="remove-btn" aria-label={`Remove ${p.name}`} onClick={() => { if (window.confirm(`Remove the printer ${p.name}?`)) act(() => archivePrinter(p.id), 'Printer removed') }}><RemoveGlyph /></button>}
              <IconTile name="print" />
              <span className="cell-text">
                <span className="cell-title">{p.name}{!p.active && <span className="chip">Off</span>}</span>
                <span className="cell-sub">{[p.model, label(PRINTER_CONNECTIONS, p.connection), p.address, p.stock, p.area_id ? areaName.get(p.area_id) : null].filter(Boolean).join(' · ')}</span>
              </span>
              {manage && <button className="btn btn-plain btn-small" aria-label={`Edit ${p.name}`} onClick={() => setEditingPrinter({ ...p })}>Edit</button>}
            </li>
          ))}
        </ul>
      </section>
      <section className="section">
        <div className="group-head-row">
          <h2 className="group-head">Label templates</h2>
          {manage && (
            <select className="popup" aria-label="Add a template from a preset" value="" onChange={(e) => {
              const k = e.target.value as LabelKind
              if (!k) return
              const d = defaults[k]
              setEditingTemplate({ name: KIND_LABEL[k], kind: k, stock: 'DK-2205', width_mm: d.width_mm, height_mm: d.height_mm, layout: d.layout, is_default: !templates.some((t) => t.kind === k && t.is_default) })
            }}>
              <option value="">Add a template…</option><option value="child">Child label</option><option value="pickup">Pickup tag</option><option value="volunteer">Volunteer label</option>
            </select>
          )}
        </div>
        <ul className="group">
          {templates.length === 0 && <li className="cell muted">No templates yet. Add the three presets and adjust them.</li>}
          {templates.map((t) => (
            <li key={t.id} className="cell">
              {manage && <button className="remove-btn" aria-label={`Remove ${t.name}`} onClick={() => { if (window.confirm(`Remove the template ${t.name}?`)) act(() => archiveTemplate(t.id), 'Template removed') }}><RemoveGlyph /></button>}
              <Preview template={t} name={t.name} />
              <span className="cell-text">
                <span className="cell-title">{t.name}{t.is_default && <span className="chip chip-tint">Default</span>}</span>
                <span className="cell-sub">{KIND_LABEL[t.kind as LabelKind] ?? t.kind} · {t.width_mm}×{t.height_mm} mm · {t.stock} · v{t.version}</span>
              </span>
              {manage && <button className="btn btn-plain btn-small" aria-label={`Edit ${t.name}`} onClick={() => setEditingTemplate({ ...t, layout: t.layout })}>Edit</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** A decorative rendering of the label at a fixed thumbnail width, or large in the editor. */
function Preview({ template, name, large = false }: { template: { kind: string; width_mm: number; height_mm: number; layout: unknown }; name: string; large?: boolean }) {
  if (!isLabelLayout(template.layout)) return <span className="chip chip-warn">Invalid layout</span>
  const html = renderLabelHtml({ kind: template.kind as LabelKind, width_mm: template.width_mm, height_mm: template.height_mm, layout: template.layout }, SAMPLE)
  const scale = large ? 1.4 : 16 / template.width_mm
  return (
    <span className={large ? 'label-preview large' : 'label-preview'} style={{ width: `${template.width_mm * scale}mm`, height: `${template.height_mm * scale}mm` }} aria-hidden="true">
      <iframe title={`Preview of ${name}`} tabIndex={-1} srcDoc={html} sandbox="" style={{ width: `${template.width_mm}mm`, height: `${template.height_mm}mm`, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0, pointerEvents: 'none' }} />
    </span>
  )
}

function PrinterForm({ initial, areas, onSave, onCancel }: { initial: Partial<PrinterInput>; areas: Area[]; onSave: (p: PrinterInput) => Promise<void>; onCancel: () => void }) {
  const [v, setV] = useState<PrinterInput>({
    id: initial.id, name: initial.name ?? '', model: initial.model ?? 'QL-820NWBc', connection: initial.connection ?? 'wifi', address: initial.address ?? null,
    stock: initial.stock ?? 'DK-2205', area_id: initial.area_id ?? null, active: initial.active ?? true,
  })
  const [busy, setBusy] = useState(false)
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); if (!v.name.trim()) return; setBusy(true); await onSave({ ...v, name: v.name.trim() }); setBusy(false) }}>
      <fieldset>
        <legend className="group-head">{v.id ? 'Edit printer' : 'New printer'}</legend>
        <div className="group">
          <label className="field"><span>Name</span><input autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Barn desk" required /></label>
          <label className="field"><span>Model</span><input value={v.model ?? ''} onChange={(e) => setV({ ...v, model: e.target.value || null })} /></label>
          <label className="field"><span>Connection</span>
            <select value={v.connection} onChange={(e) => setV({ ...v, connection: e.target.value as Printer['connection'] })}>{PRINTER_CONNECTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
          </label>
          <label className="field"><span>Address</span><input value={v.address ?? ''} placeholder="IP or host name" onChange={(e) => setV({ ...v, address: e.target.value || null })} /></label>
          <label className="field"><span>Stock</span><input value={v.stock} onChange={(e) => setV({ ...v, stock: e.target.value })} required /></label>
          <label className="field"><span>Area</span>
            <select value={v.area_id ?? ''} onChange={(e) => setV({ ...v, area_id: e.target.value || null })}><option value="">Any</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </label>
          <div className="field"><Switch label="Active" checked={v.active} onChange={(on) => setV({ ...v, active: on })} /></div>
        </div>
      </fieldset>
      <div className="actions"><button type="button" className="btn btn-tinted" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-filled" disabled={busy}>{busy ? 'Saving…' : 'Save printer'}</button></div>
    </form>
  )
}

function TemplateForm({ initial, onSave, onCancel }: { initial: Partial<TemplateInput>; onSave: (t: TemplateInput) => Promise<void>; onCancel: () => void }) {
  const [v, setV] = useState<TemplateInput>({
    id: initial.id, name: initial.name ?? '', kind: initial.kind ?? 'child', stock: initial.stock ?? 'DK-2205', width_mm: initial.width_mm ?? 62, height_mm: initial.height_mm ?? 29,
    layout: initial.layout ?? { elements: [] }, is_default: initial.is_default ?? false,
  })
  const [json, setJson] = useState(JSON.stringify(v.layout, null, 2))
  const [parsed, setParsed] = useState<LabelLayout | null>(isLabelLayout(v.layout) ? v.layout : null)
  const [busy, setBusy] = useState(false)
  const update = (text: string) => {
    setJson(text)
    try { const p = JSON.parse(text); setParsed(isLabelLayout(p) ? p : null); if (isLabelLayout(p)) setV((x) => ({ ...x, layout: p })) } catch { setParsed(null) }
  }
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); if (!v.name.trim() || !parsed) return; setBusy(true); await onSave({ ...v, name: v.name.trim(), layout: parsed }); setBusy(false) }}>
      <fieldset>
        <legend className="group-head">{v.id ? 'Edit template' : 'New template'}</legend>
        <div className="group">
          <label className="field"><span>Name</span><input autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></label>
          <label className="field"><span>Kind</span>
            <select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as LabelKind })}><option value="child">Child label</option><option value="pickup">Pickup tag</option><option value="volunteer">Volunteer label</option></select>
          </label>
          <label className="field"><span>Stock</span><input value={v.stock} onChange={(e) => setV({ ...v, stock: e.target.value })} /></label>
          <label className="field"><span>Width (mm)</span><input type="number" min={10} max={300} value={v.width_mm} onChange={(e) => setV({ ...v, width_mm: Number(e.target.value) })} /></label>
          <label className="field"><span>Height (mm)</span><input type="number" min={10} max={300} value={v.height_mm} onChange={(e) => setV({ ...v, height_mm: Number(e.target.value) })} /></label>
          <div className="field"><Switch label="Default for this kind" checked={v.is_default} onChange={(on) => setV({ ...v, is_default: on })} /></div>
        </div>
      </fieldset>
      <fieldset>
        <legend className="group-head">Preview</legend>
        <div className="layout-preview">
          {parsed ? <Preview large template={{ ...v, layout: parsed }} name={v.name || 'template'} /> : <p className="error" role="alert">The layout is not valid: elements need a type (text, static or icons), a position and a size; text fields must be known.</p>}
        </div>
        <details className="disclosure">
          <summary>Advanced: edit the layout</summary>
          <div className="group"><div className="cell"><textarea aria-label="Layout JSON" rows={14} value={json} onChange={(e) => update(e.target.value)} spellCheck={false} /></div></div>
          <p className="group-foot">Fields: first_name, last_name, full_name, name_initial, room, service, date, code, allergy_short, children_names, role, church, guest. Positions and sizes are millimetres; font sizes are points.</p>
        </details>
      </fieldset>
      <div className="actions"><button type="button" className="btn btn-tinted" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-filled" disabled={!parsed || busy}>{busy ? 'Saving…' : 'Save template'}</button></div>
    </form>
  )
}
