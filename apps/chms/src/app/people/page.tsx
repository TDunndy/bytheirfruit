'use client'

import { useSession } from '@/components/Session'

export default function PeoplePage() {
  const { org } = useSession()
  return (
    <section>
      <header className="page-head">
        <h1>People</h1>
      </header>
      <div className="card empty">
        <h2>Your directory is being set up</h2>
        <p className="muted">
          Soon everyone at {org?.name} will be here: individuals and families, roles such as Pastor,
          Staff and Deacon with the permissions they open, private pastoral notes, and an import from Subsplash.
        </p>
      </div>
    </section>
  )
}
