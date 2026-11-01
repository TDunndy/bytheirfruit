import type { Metadata } from 'next'
import { CheckinNav } from '@/components/checkin/CheckinNav'

export const metadata: Metadata = { title: 'Check-in' }

export default function CheckinLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="checkin">
      <header className="page-head"><h1>Check-in</h1></header>
      <CheckinNav />
      {children}
    </section>
  )
}
