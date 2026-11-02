import type { Metadata } from 'next'
import { FollowupsList } from '@/components/followups/FollowupsList'

export const metadata: Metadata = { title: 'Follow-ups' }

export default function FollowupsPage() {
  return <FollowupsList />
}
