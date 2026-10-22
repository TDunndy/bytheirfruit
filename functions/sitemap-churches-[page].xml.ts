// Dynamic paginated church sitemap.
// Supabase caps REST responses at the project's "Max rows" setting (1,000 by
// default), so each sitemap page holds 1,000 churches and the index lists
// ceil(total / 1000) pages. Google allows up to 50,000 URLs per sitemap file.
const SUPABASE_URL = 'https://ffqmbhftivmiubvtzhhr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcW1iaGZ0aXZtaXVidnR6aGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzYyMTcsImV4cCI6MjA4ODg1MjIxN30.aYpnohEz3_kZzteD5y7mNwR8gzvkZm0iDGXGP_rHmNk'
export const PER_PAGE = 1000

function makeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  const match = url.pathname.match(/sitemap-churches-(\d+)\.xml/)
  if (!match) return new Response('Not found', { status: 404 })
  const pageNum = parseInt(match[1], 10)
  if (!Number.isFinite(pageNum) || pageNum < 0 || pageNum > 2000) return new Response('Not found', { status: 404 })

  const from = pageNum * PER_PAGE

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/churches?select=id,name,total_reviews,scores_updated_at,created_at&status=eq.approved&order=total_reviews.desc,created_at.desc,id.asc&offset=${from}&limit=${PER_PAGE}`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
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
    <loc>${escapeXml(`https://bytheirfruit.church/church/${c.id}/${slug}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
  }).join('\n')}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
  })
}
