// One label model for the browser (HTML + @page) and, later, the native
// bitmap renderer. Sizes are millimetres on the label stock.

export type LabelKind = 'child' | 'pickup' | 'volunteer'

export type LabelField =
  | 'first_name' | 'last_name' | 'full_name' | 'name_initial' | 'room' | 'service' | 'date' | 'code'
  | 'allergy_short' | 'children_names' | 'role' | 'church' | 'guest'

export type LabelElement =
  | { type: 'text'; field: LabelField; x: number; y: number; w: number; h: number; size: number; bold?: boolean; align?: 'left' | 'center' | 'right' }
  | { type: 'static'; text: string; x: number; y: number; w: number; h: number; size: number; bold?: boolean; align?: 'left' | 'center' | 'right' }
  | { type: 'icons'; x: number; y: number; size: number }

export interface LabelLayout {
  elements: LabelElement[]
}

export interface LabelTemplate {
  kind: LabelKind
  width_mm: number
  height_mm: number
  layout: LabelLayout
}

export interface LabelData {
  first_name: string
  last_name?: string | null
  room?: string | null
  service?: string | null
  /** Already formatted for the church (e.g. 'Sun, Mar 7'). */
  date?: string | null
  code?: string | null
  allergy_short?: string | null
  flags?: { allergy?: boolean; medical?: boolean; special_needs?: boolean; custody?: boolean }
  guest?: boolean
  children_names?: string[]
  role?: string | null
  church?: string | null
}

const FIELDS: LabelField[] = ['first_name', 'last_name', 'full_name', 'name_initial', 'room', 'service', 'date', 'code', 'allergy_short', 'children_names', 'role', 'church', 'guest']

function isNum(x: unknown): x is number { return typeof x === 'number' && Number.isFinite(x) }

function isElement(e: unknown): e is LabelElement {
  if (typeof e !== 'object' || e === null) return false
  const o = e as Record<string, unknown>
  if (!isNum(o.x) || !isNum(o.y)) return false
  if (o.type === 'icons') return isNum(o.size)
  if (!isNum(o.w) || !isNum(o.h) || !isNum(o.size)) return false
  if ('bold' in o && typeof o.bold !== 'boolean') return false
  if ('align' in o && !['left', 'center', 'right'].includes(String(o.align))) return false
  if (o.type === 'text') return typeof o.field === 'string' && FIELDS.includes(o.field as LabelField)
  if (o.type === 'static') return typeof o.text === 'string' && o.text.length <= 200
  return false
}

export function isLabelLayout(p: unknown): p is LabelLayout {
  if (typeof p !== 'object' || p === null) return false
  const o = p as Record<string, unknown>
  return Array.isArray(o.elements) && o.elements.length <= 40 && o.elements.every(isElement)
}

function text(field: LabelField, d: LabelData): string {
  switch (field) {
    case 'first_name': return d.first_name
    case 'last_name': return d.last_name ?? ''
    case 'full_name': return [d.first_name, d.last_name ?? ''].filter(Boolean).join(' ')
    case 'name_initial': return d.last_name ? `${d.first_name} ${d.last_name[0]}.` : d.first_name
    case 'room': return d.room ?? ''
    case 'service': return d.service ?? ''
    case 'date': return d.date ?? ''
    case 'code': return d.code ?? ''
    case 'allergy_short': return d.allergy_short ?? ''
    case 'children_names': return (d.children_names ?? []).join(', ')
    case 'role': return d.role ?? ''
    case 'church': return d.church ?? ''
    case 'guest': return d.guest ? 'GUEST' : ''
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function icons(d: LabelData): string {
  const f = d.flags ?? {}
  const out: string[] = []
  if (f.allergy) out.push('<span class="icon allergy" title="Allergy">A</span>')
  if (f.medical) out.push('<span class="icon medical" title="Medical">M</span>')
  if (f.special_needs) out.push('<span class="icon special" title="Special needs">S</span>')
  if (f.custody) out.push('<span class="icon custody" title="Custody">C</span>')
  return out.join('')
}

/** The default templates (decision J): child with full name, room, allergy text and code; pickup tag with code and children; volunteer with name and role. */
export function defaultTemplates(): Record<LabelKind, LabelTemplate> {
  return {
    child: {
      kind: 'child', width_mm: 62, height_mm: 29,
      layout: { elements: [
        { type: 'text', field: 'full_name', x: 2, y: 1.5, w: 46, h: 9, size: 20, bold: true },
        { type: 'icons', x: 49, y: 2, size: 5 },
        { type: 'text', field: 'room', x: 2, y: 11, w: 40, h: 6, size: 12 },
        { type: 'text', field: 'allergy_short', x: 2, y: 17.5, w: 40, h: 5, size: 9 },
        { type: 'text', field: 'code', x: 42, y: 11, w: 18, h: 12, size: 24, bold: true, align: 'right' },
        { type: 'text', field: 'service', x: 2, y: 23, w: 30, h: 4.5, size: 7 },
        { type: 'text', field: 'date', x: 32, y: 23, w: 28, h: 4.5, size: 7, align: 'right' },
      ] },
    },
    pickup: {
      kind: 'pickup', width_mm: 62, height_mm: 100,
      layout: { elements: [
        { type: 'static', text: 'Pickup tag', x: 2, y: 2, w: 58, h: 6, size: 10 },
        { type: 'text', field: 'code', x: 2, y: 10, w: 58, h: 24, size: 56, bold: true, align: 'center' },
        { type: 'text', field: 'children_names', x: 2, y: 38, w: 58, h: 40, size: 14 },
        { type: 'text', field: 'service', x: 2, y: 84, w: 58, h: 5, size: 9 },
        { type: 'text', field: 'date', x: 2, y: 90, w: 58, h: 5, size: 9 },
      ] },
    },
    volunteer: {
      kind: 'volunteer', width_mm: 62, height_mm: 29,
      layout: { elements: [
        { type: 'text', field: 'full_name', x: 2, y: 2, w: 58, h: 10, size: 20, bold: true },
        { type: 'text', field: 'role', x: 2, y: 13, w: 58, h: 7, size: 12 },
        { type: 'text', field: 'date', x: 2, y: 22, w: 58, h: 5, size: 8 },
      ] },
    },
  }
}

/**
 * HTML for one label, sized exactly to the stock so the browser prints it
 * on a QL driver custom paper size with no scaling.
 */
export function renderLabelHtml(t: LabelTemplate, d: LabelData): string {
  const els = t.layout.elements.map(e => {
    const pos = `left:${e.x}mm;top:${e.y}mm;`
    if (e.type === 'icons') return `<div class="icons" style="${pos}font-size:${e.size}mm">${icons(d)}</div>`
    const content = e.type === 'text' ? text(e.field, d) : e.text
    const style = `${pos}width:${e.w}mm;height:${e.h}mm;font-size:${e.size}pt;${e.bold ? 'font-weight:700;' : ''}text-align:${e.align ?? 'left'};`
    return `<div class="el" style="${style}">${esc(content)}</div>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: ${t.width_mm}mm ${t.height_mm}mm; margin: 0 }
html, body { margin: 0; padding: 0 }
.label { position: relative; width: ${t.width_mm}mm; height: ${t.height_mm}mm; overflow: hidden; font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #000 }
.el { position: absolute; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.icons { position: absolute; display: flex; gap: 1mm }
.icon { display: inline-flex; align-items: center; justify-content: center; width: 1em; height: 1em; border: 0.3mm solid #000; border-radius: 50%; font-size: 0.6em; font-weight: 700 }
</style></head><body><div class="label">${els}</div></body></html>`
}
