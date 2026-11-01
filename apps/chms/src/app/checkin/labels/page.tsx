'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { defaultTemplates, isLabelLayout, renderLabelHtml, type LabelData, type LabelKind, type LabelLayout } from '@btf/core'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { IconTile, RemoveGlyph, Spinner, Switch } from '@/components/ui'
import { errorMessage } from '@/lib/people'
import {
  archivePrinter, archiveTemplate, listAreas, listPrinters, listTemplates, savePrinter, saveTemplate,
  type Area, type LabelTemplate, type Printer, type PrinterInput, type TemplateInput,
} from '@/lib/checkin'

const SAMPLE: LabelData = {
  first_name: 'Ava', last_name: 'Sample', room: 'Cubs', service: '9:00', date: 'Sun, Mar 7', code: 'ACD', allergy_short: 'Peanut',
  flags: { allergy: true }, children_names: ['Ava', 'Ben'], role: 'Greeter', church: 'Your church', guest: false,
}
const CONNECTIONS: Printer['connection'][] = ['wifi', 'bluetooth', 'usb', 'system']

export default function LabelsPage() {
  const { org, can } = useSession()
  const [printers, setPrinters] = useState<Printer[]>([])
  const [templates, setTemplates] = useState<LabelTemplate[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [editingPrinter, setEditingPrinter] = useState<Partial<PrinterInput> | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<Partial<TemplateInput> | null>(null)
  const [error, setError] = useState('')
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
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load() } catch (e) { setError(errorMessage(e)) } }
  const areaName = useMemo(() => new Map(areas.map((a) => [a.id, a.name])), [areas])

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="printers and labels" />
  if (!loaded && !error) return <Spinner />

  const defaults = defaultTemplates()

  return (
    <div className="stack">
      {error && <p className="error" role="alert">{error}</p>}
      <section className="section">
        <div className="group-head-row">
          <h2 className="group-head">Printers</h2>
          {manage && !editingPrinter && <button className="btn btn-tinted btn-small" onClick={() => setEditingPrinter({})}>Add printer</button>}
        </div>
        {editingPrinter && (
          <PrinterForm initial={editingPrinter} areas={areas} onCancel={() => setEditingPrinter(null)}
            onSave={(p) => act(async () => { await savePrinter(org.id, p); setEditingPrinter(null) })} />
        )}
        <ul className="group">
          {printers.length === 0 && <li className="cell muted">No printers yet. LWR&apos;s Brother QL-8xx printers on Wi-Fi go here, with their 62 mm stock.</li>}
          {printers.map((p) => (
            <li key={p.id} className="cell">
              {manage && <button className="remove-btn" aria-label={`Remove ${p.name}`} onClick={() => act(() => archivePrinter(p.id))}><RemoveGlyph /></button>}
              <IconTile name="print" />
              <span className="cell-text">
                <span className="cell-title">{p.name}{!p.active && <span className="chip">Off</span>}</span>
                <span className="cell-sub">{[p.model, p.connection, p.address, p.stock, p.area_id ? areaName.get(p.area_id) : null].filter(Boolean).join(' · ')}</span>
              </span>
              {manage && <button className="btn btn-plain btn-small" onClick={() => setEditingPrinter({ ...p })}>Edit</button>}
            </li>
          ))}
        </ul>
      </section>
      <section className="section">
        <div className="group-head-row">
          <h2 className="group-head">Label templates</h2>
          {manage && !editingTemplate && (
            <select className="row-select action" aria-label="Add a template" value="" onChange={(e) => {
              const k = e.target.value as LabelKind
              if (!k) return
              const d = defaults[k]
              setEditingTemplate({ name: k === 'child' ? 'Child label' : k === 'pickup' ? 'Pickup tag' : 'Volunteer label', kind: k, stock: 'DK-2205', width_mm: d.width_mm, height_mm: d.height_mm, layout: d.layout, is_default: !templates.some((t) => t.kind === k && t.is_default) })
            }}>
              <option value="">Add from a preset…</option><option value="child">Child label</option><option value="pickup">Pickup tag</option><option value="volunteer">Volunteer label</option>
            </select>
          )}
        </div>
        {editingTemplate && (
          <TemplateForm initial={editingTemplate} onCancel={() => setEditingTemplate(null)}
            onSave={(t) => act(async () => { await saveTemplate(org.id, t); setEditingTemplate(null) })} />
        )}
        <ul className="group">
          {templates.length === 0 && <li className="cell muted">No templates yet. Add the three presets and adjust them.</li>}
          {templates.map((t) => (
            <li key={t.id} className="cell">
              {manage && <button className="remove-btn" aria-label={`Remove ${t.name}`} onClick={() => act(() => archiveTemplate(t.id))}><RemoveGlyph /></button>}
              <Preview template={t} />
              <span className="cell-text">
                <span className="cell-title">{t.name}{t.is_default && <span className="chip chip-tint">Default</span>}</span>
                <span className="cell-sub cap">{t.kind} · {t.width_mm}×{t.height_mm} mm · {t.stock} · v{t.version}</span>
              </span>
              {manage && <button className="btn btn-plain btn-small" onClick={() => setEditingTemplate({ ...t, layout: t.layout })}>Edit</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Preview({ template, large = false }: { template: { kind: string; width_mm: number; height_mm: number; layout: unknown }; large?: boolean }) {
  if (!isLabelLayout(template.layout)) return <span className="label-preview muted">Invalid</span>
  const html = renderLabelHtml({ kind: template.kind as LabelKind, width_mm: template.width_mm, height_mm: template.height_mm, layout: template.layout }, SAMPLE)
  const scale = large ? 2.2 : 0.9
  return (
    <span className={large ? 'label-preview large' : 'label-preview'} style={{ width: `${template.width_mm * scale}mm`, height: `${template.height_mm * scale}mm` }}>
      <iframe title="Label preview" srcDoc={html} sandbox="" style={{ width: `${template.width_mm}mm`, height: `${template.height_mm}mm`, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0, pointerEvents: 'none' }} />
    </span>
  )
}

function PrinterForm({ initial, areas, onSave, onCancel }: { initial: Partial<PrinterInput>; areas: Area[]; onSave: (p: PrinterInput) => Promise<void>; onCancel: () => void }) {
  const [v, setV] = useState<PrinterInput>({
    id: initial.id, name: initial.name ?? '', model: initial.model ?? 'QL-820NWB', connection: initial.connection ?? 'wifi', address: initial.address ?? null,
    stock: initial.stock ?? 'DK-2205', area_id: initial.area_id ?? null, active: initial.active ?? true,
  })
  return (
    <form className="card form" onSubmit={(e) => { e.preventDefault(); if (v.name.trim()) onSave({ ...v, name: v.name.trim() }) }}>
      <fieldset>
        <legend className="group-head">{v.id ? 'Edit printer' : 'New printer'}</legend>
        <div className="group">
          <label className="field"><span>Name</span><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Barn desk" required /></label>
          <label className="field"><span>Model</span><input value={v.model ?? ''} onChange={(e) => setV({ ...v, model: e.target.value || null })} /></label>
          <label className="field"><span>Connection</span>
            <select value={v.connection} onChange={(e) => setV({ ...v, connection: e.target.value as Printer['connection'] })}>{CONNECTIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </label>
          <label className="field"><span>Address</span><input value={v.address ?? ''} placeholder="IP or host name" onChange={(e) => setV({ ...v, address: e.target.value || null })} /></label>
          <label className="field"><span>Stock</span><input value={v.stock} onChange={(e) => setV({ ...v, stock: e.target.value })} required /></label>
          <label className="field"><span>Area</span>
            <select value={v.area_id ?? ''} onChange={(e) => setV({ ...v, area_id: e.target.value || null })}><option value="">Any</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </label>
          <div className="field"><Switch label="Active" checked={v.active} onChange={(on) => setV({ ...v, active: on })} /></div>
        </div>
      </fieldset>
      <div className="actions"><button type="button" className="btn btn-tinted" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-filled">Save printer</button></div>
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
  const update = (text: string) => {
    setJson(text)
    try { const p = JSON.parse(text); setParsed(isLabelLayout(p) ? p : null); if (isLabelLayout(p)) setV((x) => ({ ...x, layout: p })) } catch { setParsed(null) }
  }
  return (
    <form className="card form" onSubmit={(e) => { e.preventDefault(); if (v.name.trim() && parsed) onSave({ ...v, name: v.name.trim(), layout: parsed }) }}>
      <fieldset>
        <legend className="group-head">{v.id ? 'Edit template' : 'New template'}</legend>
        <div className="group">
          <label className="field"><span>Name</span><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></label>
          <label className="field"><span>Kind</span>
            <select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as LabelKind })}><option value="child">Child</option><option value="pickup">Pickup tag</option><option value="volunteer">Volunteer</option></select>
          </label>
          <label className="field"><span>Stock</span><input value={v.stock} onChange={(e) => setV({ ...v, stock: e.target.value })} /></label>
          <label className="field"><span>Width (mm)</span><input type="number" min={10} max={300} value={v.width_mm} onChange={(e) => setV({ ...v, width_mm: Number(e.target.value) })} /></label>
          <label className="field"><span>Height (mm)</span><input type="number" min={10} max={300} value={v.height_mm} onChange={(e) => setV({ ...v, height_mm: Number(e.target.value) })} /></label>
          <div className="field"><Switch label="Default for this kind" checked={v.is_default} onChange={(on) => setV({ ...v, is_default: on })} /></div>
        </div>
      </fieldset>
      <fieldset>
        <legend className="group-head">Layout</legend>
        <div className="layout-edit">
          <div className="group"><div className="cell"><textarea aria-label="Layout JSON" rows={14} value={json} onChange={(e) => update(e.target.value)} spellCheck={false} /></div></div>
          <div className="layout-preview">
            {parsed ? <Preview large template={{ ...v, layout: parsed }} /> : <p className="error" role="alert">The layout is not valid: elements need a type (text, static or icons), a position and a size; text fields must be known.</p>}
          </div>
        </div>
        <p className="group-foot">Fields: first_name, last_name, full_name, name_initial, room, service, date, code, allergy_short, children_names, role, church, guest. Positions and sizes are millimetres; font sizes are points.</p>
      </fieldset>
      <div className="actions"><button type="button" className="btn btn-tinted" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-filled" disabled={!parsed}>Save template</button></div>
    </form>
  )
}
