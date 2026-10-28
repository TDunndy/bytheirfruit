import { ComingNext } from '@/components/AppShell'

export default function HealthPage() {
  return (
    <ComingNext
      title="Health"
      lead="Where your church stands, and the goals your leadership chooses to pursue."
      items={[
        'Attendance, group participation and care coverage at a glance',
        'Goals from a library or your own: every member called twice a year, +10% in small groups, scripture memorization',
        'Call lists for deacons with progress toward the goal',
        'Scores for the church, individuals and leaders, and AI suggestions for what to do next',
      ]}
    />
  )
}
