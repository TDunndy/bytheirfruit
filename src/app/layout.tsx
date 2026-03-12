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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`* { margin: 0; padding: 0; box-sizing: border-box; } body { -webkit-font-smoothing: antialiased; }`}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
