import type { Metadata } from 'next'
import { GroupsList } from '@/components/groups/GroupsList'

export const metadata: Metadata = { title: 'Groups' }

export default function GroupsPage() {
  return <GroupsList />
}
