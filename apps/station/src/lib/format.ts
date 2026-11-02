// Times in the church's zone; dates as 'YYYY-MM-DD'.
export function fmtTime(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(new Date(iso))
  } catch { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }
}

export function fmtLocalDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Today as 'YYYY-MM-DD' in the church's zone (the browser's when none is known). */
export function todayIn(timeZone?: string | null): string {
  try {
    if (timeZone) return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch { /* unknown zone */ }
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fmtPhone(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 10)
  const a = d.slice(0, 3), b = d.slice(3, 6), c = d.slice(6, 10)
  if (d.length <= 3) return a ? `(${a}` : ''
  if (d.length <= 6) return `(${a}) ${b}`
  return `(${a}) ${b}-${c}`
}

export function ageText(birthdate: string | undefined, on: string): string {
  if (!birthdate) return ''
  const b = new Date(birthdate + 'T00:00:00'), o = new Date(on + 'T00:00:00')
  let months = (o.getFullYear() - b.getFullYear()) * 12 + (o.getMonth() - b.getMonth())
  if (o.getDate() < b.getDate()) months -= 1
  if (months < 0) months = 0
  if (months < 24) return `${months} mo`
  return `${Math.floor(months / 12)} yr`
}

export function minutesAgo(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
}

export function errorText(e: unknown): string {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'No connection. Your check-ins are saved and will sync.'
  if (/row-level security|permission denied|Not allowed/i.test(msg)) return "This station isn't allowed to do that."
  return msg
}
