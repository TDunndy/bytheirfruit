'use client'

// Check-in → Settings: the church's "New here?" link and a QR code for cards
// and screens, with a printable version.
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

const APP_URL = process.env.NEXT_PUBLIC_CHMS_URL || 'https://app.bytheirfruit.church'

export function IntakeCard({ slug, churchName }: { slug: string; churchName: string }) {
  const url = `${APP_URL}/new?church=${encodeURIComponent(slug)}`
  const [svg, setSvg] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => { QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(setSvg).catch(() => setSvg('')) }, [url])

  const print = () => {
    const w = window.open('', '_blank', 'width=640,height=800')
    if (!w) return
    w.document.write(`<!doctype html><html><head><title>New here? ${esc(churchName)}</title><style>
      @page { size: auto; margin: 16mm } body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; text-align: center; color: #111 }
      h1 { font-size: 34px; margin: 24px 0 4px } p { font-size: 18px; color: #444; margin: 0 0 24px } svg { width: 70mm; height: 70mm } .url { font-size: 15px; color: #666; margin-top: 16px }
    </style></head><body><h1>New here? Welcome!</h1><p>Scan to tell ${esc(churchName)} about your family</p>${svg}<div class="url">${esc(url)}</div><script>window.onload=function(){window.print()}</script></body></html>`)
    w.document.close()
  }

  return (
    <section className="card form">
      <fieldset>
        <legend className="group-head">New here? form</legend>
        <div className="group" style={{ padding: 16 }}>
          <div className="qr-card">
            {svg ? <span dangerouslySetInnerHTML={{ __html: svg }} aria-label="QR code for the sign-up form" role="img" /> : null}
            <div className="stack" style={{ flex: 1, minWidth: 220 }}>
              <code>{url}</code>
              <div className="row">
                <button type="button" className="btn btn-tinted btn-small" onClick={() => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}>{copied ? 'Copied' : 'Copy link'}</button>
                <button type="button" className="btn btn-tinted btn-small" onClick={print} disabled={!svg}>Print a card</button>
                <a className="btn btn-plain btn-small" href={url} target="_blank" rel="noreferrer">Open</a>
              </div>
            </div>
          </div>
        </div>
        <p className="group-foot">Put the code on seat-back cards, the welcome desk and the kids check-in screens. A family that fills it in appears under People as guests and gets a follow-up for the right director. Add the Turnstile site key to the build and its secret to the intake function to screen bots (see the runbook).</p>
      </fieldset>
    </section>
  )
}

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
