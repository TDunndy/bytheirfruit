'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from '@/components/Session'
import { PersonForm } from '@/components/PersonParts'
import { createPerson, errorMessage } from '@/lib/people'

export default function NewPersonPage() {
  const { org, can } = useSession()
  const router = useRouter()

  if (!org || !can('people.edit')) {
    return <p className="muted">You don't have permission to add people.</p>
  }

  return (
    <section>
      <Link href="/people" className="back">← People</Link>
      <header className="page-head"><h1>Add person</h1></header>
      <PersonForm
        submitLabel="Add person"
        onCancel={() => router.push('/people')}
        onSubmit={async (values) => {
          try {
            const p = await createPerson({ ...values, org_id: org.id })
            router.push(`/people/view?id=${p.id}`)
          } catch (e) {
            throw new Error(errorMessage(e))
          }
        }}
      />
    </section>
  )
}
