import { describe, expect, it } from 'vitest'
import { defaultTemplates, isLabelLayout, renderLabelHtml } from '../src/labels'

describe('labels', () => {
  const t = defaultTemplates()
  it('default templates are valid and sized to the stock', () => {
    for (const k of ['child', 'pickup', 'volunteer'] as const) expect(isLabelLayout(t[k].layout), k).toBe(true)
    expect(t.child).toMatchObject({ width_mm: 62, height_mm: 29 })
    expect(t.pickup).toMatchObject({ width_mm: 62, height_mm: 100 })
  })
  it('renders the child label with name, room, allergy text, code and icons at page size', () => {
    const html = renderLabelHtml(t.child, {
      first_name: 'Kid', last_name: 'Parent', room: 'Cubs', code: 'ACD', allergy_short: 'Peanut',
      service: '9:00', date: 'Sun, Mar 7', flags: { allergy: true, custody: true },
    })
    expect(html).toContain('@page { size: 62mm 29mm; margin: 0 }')
    expect(html).toContain('Kid Parent')
    expect(html).toContain('>Cubs<')
    expect(html).toContain('>ACD<')
    expect(html).toContain('>Peanut<')
    expect(html).toContain('class="icon allergy"')
    expect(html).toContain('class="icon custody"')
    expect(html).not.toContain('class="icon medical"')
  })
  it('renders the pickup tag with the code and the children', () => {
    const html = renderLabelHtml(t.pickup, { first_name: '', code: 'ACD', children_names: ['Kid', 'Tess'] })
    expect(html).toContain('@page { size: 62mm 100mm; margin: 0 }')
    expect(html).toContain('>ACD<')
    expect(html).toContain('Kid, Tess')
  })
  it('escapes names', () => {
    const html = renderLabelHtml(t.volunteer, { first_name: '<b>Eve</b>', last_name: 'O&apos;', role: 'Greeter' })
    expect(html).not.toContain('<b>Eve</b>')
    expect(html).toContain('&lt;b&gt;Eve&lt;/b&gt;')
  })
  it('a church can switch to initial-only names', () => {
    const custom = { ...t.child, layout: { elements: [{ type: 'text' as const, field: 'name_initial' as const, x: 2, y: 2, w: 50, h: 8, size: 18 }] } }
    expect(isLabelLayout(custom.layout)).toBe(true)
    expect(renderLabelHtml(custom, { first_name: 'Kid', last_name: 'Parent' })).toContain('Kid P.')
  })
  it('rejects unknown fields and shapes', () => {
    expect(isLabelLayout({ elements: [{ type: 'text', field: 'phone', x: 0, y: 0, w: 1, h: 1, size: 8 }] })).toBe(false)
    expect(isLabelLayout({ elements: [{ type: 'static', text: 'x', x: 0, y: 0, w: 1, h: 1, size: 8, align: 'middle' }] })).toBe(false)
    expect(isLabelLayout({ elements: 'none' })).toBe(false)
    expect(isLabelLayout({ elements: Array.from({ length: 41 }, () => ({ type: 'icons', x: 0, y: 0, size: 4 })) })).toBe(false)
  })
})

import { renderLabelSheetHtml } from '../src/labels'
describe('label sheets', () => {
  const t = defaultTemplates()
  it('prints several labels of one template as one page each', () => {
    const html = renderLabelSheetHtml(t.child, [{ first_name: 'Kid', code: 'ACD' }, { first_name: 'Tess', code: 'ACD' }])
    expect(html).toContain('@page { size: 62mm 29mm; margin: 0 }')
    expect(html.match(/class="label"/g)?.length).toBe(2)
    expect(html).toContain('break-after: page')
    expect(html.indexOf('>Kid<')).toBeLessThan(html.indexOf('>Tess<'))
  })
})
