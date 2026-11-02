import { StationProvider, useStation } from './lib/station'
import { Pair } from './screens/Pair'
import { Blocked } from './screens/Blocked'
import { Shell } from './screens/Shell'
import { Checkin } from './screens/Checkin'
import { Roster } from './screens/Roster'
import { Volunteers } from './screens/Volunteers'

export function App() {
  return (
    <StationProvider>
      <Root />
    </StationProvider>
  )
}

function Root() {
  const { boot, self, day, error, reload } = useStation()
  if (boot === 'loading') return <main className="attract"><span className="spin" aria-label="Loading" /></main>
  if (boot === 'unpaired') return <Pair onPaired={reload} />
  if (boot === 'blocked') return <Blocked status={self && self.status !== 'active' ? self.status : 'unknown'} onRetry={reload} />
  if (boot === 'error' || !day) {
    return (
      <main className="attract">
        <h1>Something went wrong</h1>
        <p className="muted">{error || 'The station could not load its setup.'}</p>
        <button className="btn btn-filled btn-large" onClick={() => reload()}>Try again</button>
      </main>
    )
  }
  const mode = day.self.mode
  return (
    <Shell>
      {mode === 'roster' ? <Roster /> : mode === 'volunteer' ? <Volunteers /> : <Checkin staffed={mode === 'staffed'} />}
    </Shell>
  )
}
