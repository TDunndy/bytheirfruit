import { ComingNext } from '@/components/AppShell'

export default function GroupsPage() {
  return (
    <ComingNext
      title="Groups"
      lead="Every ministry, team and group your church runs, and who belongs to each."
      items={[
        'Ministries and serving teams: welcome, parking, worship, kids rooms',
        'Small groups on-site and off-site, community groups, classes',
        'Leaders and members, drawn from People',
        'Group lists for notifications, later a channel per group',
      ]}
    />
  )
}
