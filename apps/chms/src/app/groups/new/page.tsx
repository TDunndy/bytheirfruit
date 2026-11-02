'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/components/Session'
import { GroupForm } from '@/components/groups/GroupForm'
import { BackLink } from '@/components/ui'
import { listAreas, type Area } from '@/lib/checkin'
import { errorMessage } from '@/lib/people'
import { saveGroup } from '@/lib/groups'

export default function NewGroupPage() {
  const { org, can } = useSession()
  const router = useRouter()
  const [areas, setAreas] = useState<Area[]>([])
  useEffect(() => { if (org) listAreas(org.id).then(setAreas).catch(() => setAreas([])) }, [org])

  if (!org || !can('groups.manage')) return <p className="muted">You don't have permission to add groups.</p>
  return (
    <section>
      <div className="page-nav"><BackLink href="/groups" label="Groups" /></div>
      <header className="page-head"><h1>Add group</h1></header>
      <GroupForm initial={{}} areas={areas} submitLabel="Add group" onCancel={() => router.push('/groups')}
        onSubmit={async (g) => {
          try { const saved = await saveGroup(org.id, g); router.push(`/groups/view?id=${saved.id}`) } catch (e) { throw new Error(errorMessage(e)) }
        }} />
    </section>
  )
}
