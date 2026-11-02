import type { Metadata } from 'next'
import { NewHere } from '@/components/intake/NewHere'

export const metadata: Metadata = { title: 'New here?' }

export default function NewHerePage() {
  return <NewHere />
}
