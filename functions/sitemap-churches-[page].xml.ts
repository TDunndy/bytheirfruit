// Dynamic paginated church sitemap — serves 40,000 churches per page
const SUPABASE_URL = 'https://ffqmbhftivmiubvtzhhr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcW1iaGZ0aXZtaXVidnR6aGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzYyMTcsImV4cCI6MjA4ODg1MjIxN30.aYpnohEz3_kZzteD5y7mNwR8gzvkZm0iDGXGP_rHmNk'
const PER_PAGE = 40000

function makeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
}

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  // Extract page number from path: /sitemap-churches-0.xml
  const match = url.pathname.match(/sitemap-churches-(\d+)\.xml/)
  if (!match) return new Response('Not found', { status: 404 })
  const pageNum = parseInt(match[1], 10)

  const from = pageNum * PER_PAGE
  const to = from + PER_PAGE - 1

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/churches?select=id,name,total_reviews,scores_updated_at,created_at&order=total_reviews.desc,created_at.desc&offset=${from}&limit=${PER_PAGE}`,
    { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
  )

  if (!res.ok) return new Response('Error', { status: 500 })
  const churches = await res.json()
  if (!churches || churches.length === 0) return new Response('Not found', { status: 404 })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${churches.map((c: any) => {
    const slug = makeSlug(c.name)
    const lastmod = (c.scores_updated_at || c.created_at || new Date().toISOString()).split('T')[0]
    const priority = c.total_reviews > 0 ? '0.8' : '0.5'
    const changefreq = c.total_reviews > 0 ? 'weekly' : 'monthly'
    return `  <url>
    <loc>https://bytheirfruit.church/church/${c.id}/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
  }).join('\n')}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  })
}
