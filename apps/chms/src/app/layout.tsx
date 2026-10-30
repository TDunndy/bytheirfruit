import type { Metadata, Viewport } from 'next'
import { SessionProvider } from '@/components/Session'
import { AppShell } from '@/components/AppShell'
import './globals.css'

export const metadata: Metadata = {
  title: 'By Their Fruit for Churches',
  description: 'Church management built around the health of your congregation.',
  robots: { index: false, follow: false },
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7.2' fill='%231d1d1f'/><path d='M16 6C16 6 10 13 10 18C10 21.3 12.7 24 16 24C19.3 24 22 21.3 22 18C22 13 16 6 16 6Z' fill='%23007aff'/></svg>",
  },
}

// viewport-fit=cover lets the tab bar sit under the home indicator (it pads itself
// with env(safe-area-inset-bottom)). theme-color matches the grouped background.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f2f7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  )
}
