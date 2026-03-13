import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'By Their Fruit — Church Reviews by the Congregation',
  description: 'Real reviews from real congregants. Honest, structured feedback to help churches grow and help families find home. Matthew 7:16.',
  openGraph: {
    title: 'By Their Fruit',
    description: 'You will recognize them by their fruit. Real church reviews from the people who attend.',
    url: 'https://bytheirfruit.church',
    siteName: 'By Their Fruit',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
