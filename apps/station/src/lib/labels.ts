// Browser printing: each label kind is a print job on the QL driver's custom
// paper size, which the template's @page matches exactly (plan §6). The
// browser can only say it asked (label_print_requested); staff reprint from
// the roster. Chrome with --kiosk-printing prints silently.
import { renderLabelSheetHtml, type LabelData } from '@btf/core'
import type { Day } from './day'
import type { TemplateInfo } from './types'

export function printSheet(t: TemplateInfo, items: LabelData[]): Promise<void> {
  if (items.length === 0) return Promise.resolve()
  const html = renderLabelSheetHtml({ kind: t.kind, width_mm: t.width_mm, height_mm: t.height_mm, layout: t.layout }, items)
  return new Promise((resolve) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.position = 'fixed'
    frame.style.right = '0'
    frame.style.bottom = '0'
    frame.style.width = '0'
    frame.style.height = '0'
    frame.style.border = '0'
    frame.srcdoc = html
    let done = false
    const finish = () => { if (done) return; done = true; window.setTimeout(() => frame.remove(), 2000); resolve() }
    frame.onload = () => {
      try {
        const w = frame.contentWindow
        if (!w) return finish()
        w.onafterprint = finish
        w.focus()
        w.print()
        window.setTimeout(finish, 1500)   // kiosk printing never fires afterprint
      } catch { finish() }
    }
    document.body.appendChild(frame)
  })
}

export function labelDate(day: Day): string {
  return new Date(day.local_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
