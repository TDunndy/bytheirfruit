import { ComingNext } from '@/components/AppShell'

export default function EventsPage() {
  return (
    <ComingNext
      title="Events"
      lead="Services, Wednesday nights, seasonal classes and group meetings: a leader, a topic, a time and a place, with as much detail as you want."
      items={[
        'Leaders you assign can edit their event; you see every change',
        'Serving: positions such as a nursery room, invitations to serve, schedules',
        'Accepting an invitation adds the person to the right group',
        'Kids check-in and attendance for Sundays and midweek',
      ]}
    />
  )
}
