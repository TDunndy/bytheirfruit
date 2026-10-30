import type { Metadata } from 'next'

// absolute: the People layout's plain title does not pass the root template on to this segment.
export const metadata: Metadata = { title: { absolute: 'Add person · By Their Fruit for Churches' } }

export default function NewPersonLayout({ children }: { children: React.ReactNode }) {
  return children
}
