import { createServerSupabase } from '@/lib/supabase-server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const CHURCHES_PER_SITEMAP = 40000

function makeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
}

export async function GET(request: Request, { params }: { params: { page: string } }) {
  const pageNum = parseInt(params.page, 10)
  if (isNaN(pageNum) || pageNum < 0) {
    return new Response('Not found', { status: 404 })
  }

  const supabase = createServerSupabase()
  const from = pageNum * CHURCHES_PER_SITEMAP
  const to = from + CHURCHES_PER_SITEMAP - 1

  const { data: churches } = await supabase
    .from('churches')
    .select('id, name, total_reviews, scores_updated_at, created_at')
    .order('total_reviews', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (!churches || churches.length === 0) {
    return new Response('Not found', { status: 404 })
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${churches.map(c => {
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
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
