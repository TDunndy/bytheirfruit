import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'By Their Fruit — Church Reviews by the Congregation',
  description: 'Real reviews from real congregants. Honest, structured feedback to help churches grow and help families find home. Matthew 7:16.',
  openGraph: {
    title: 'By Their Fruit — You will recognize them by their fruit.',
    description: 'Real church reviews from the people who attend. Honest, structured feedback across 10 categories rooted in scripture. Find a church you can trust.',
    url: 'https://bytheirfruit.church',
    siteName: 'By Their Fruit',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'By Their Fruit — Church Reviews by the Congregation',
    description: 'Real church reviews from the people who attend. Honest, structured, and built to help churches grow. Matthew 7:16.',
  },
  keywords: ['church reviews', 'church ratings', 'find a church', 'church near me', 'honest church reviews', 'church community', 'by their fruit', 'congregation reviews'],
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://bytheirfruit.church' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning style={{ margin: 0, padding: 0 }}>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var d=window.matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.style.backgroundColor=d?'#0a0a0b':'#fafafa';document.body.style.backgroundColor=d?'#0a0a0b':'#fafafa'}catch(e){}})()` }} />
        {children}
      </body>
    </html>
  )
}
