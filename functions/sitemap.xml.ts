// Dynamic sitemap index — links to the static sitemap and one church sitemap
// per 1,000 approved churches (see sitemap-churches-[page].xml.ts).
const SUPABASE_URL = 'https://ffqmbhftivmiubvtzhhr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcW1iaGZ0aXZtaXVidnR6aGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzYyMTcsImV4cCI6MjA4ODg1MjIxN30.aYpnohEz3_kZzteD5y7mNwR8gzvkZm0iDGXGP_rHmNk'
const PER_PAGE = 1000

export const onRequest: PagesFunction = async () => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/churches?select=id&status=eq.approved&limit=1`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: 'count=exact' },
  })
  const countHeader = res.headers.get('content-range')
  const total = countHeader ? parseInt(countHeader.split('/')[1], 10) : 0
  const numSitemaps = Math.max(1, Math.ceil(total / PER_PAGE))
  const today = new Date().toISOString().split('T')[0]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://bytheirfruit.church/sitemap-static.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
${Array.from({ length: numSitemaps }, (_, i) => `  <sitemap>
    <loc>https://bytheirfruit.church/sitemap-churches-${i}.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>`).join('\n')}
</sitemapindex>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
  })
}
