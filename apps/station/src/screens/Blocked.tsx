import { signOutLocal } from '@/lib/api'

const TEXT: Record<string, { title: string; body: string }> = {
  unpaired: { title: 'This device was unpaired', body: 'A check-in manager unpaired it, or paired the station with another device. Ask for a new pairing code.' },
  removed: { title: 'This station was removed', body: 'The station no longer exists in the church app. Create a station there and pair this device again.' },
  inactive: { title: 'This station is switched off', body: 'Turn it on in the church app (Check-in → Stations) and try again.' },
  unknown: { title: 'This device is not recognised', body: 'Pair it again with a code from the church app.' },
}

export function Blocked({ status, onRetry }: { status: string; onRetry: () => void }) {
  const t = TEXT[status] ?? TEXT.unknown
  return (
    <main className="attract">
      <h1>{t.title}</h1>
      <p className="muted">{t.body}</p>
      <div className="row">
        <button className="btn btn-tinted btn-large" onClick={onRetry}>Try again</button>
        <button className="btn btn-filled btn-large" onClick={async () => { await signOutLocal(); onRetry() }}>Pair again</button>
      </div>
    </main>
  )
}
