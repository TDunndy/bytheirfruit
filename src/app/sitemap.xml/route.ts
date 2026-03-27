import { createServerSupabase } from '@/lib/supabase-server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// Sitemap index: serves links to child sitemaps
// Google allows max 50,000 URLs per sitemap, so we paginate
const CHURCHES_PER_SITEMAP = 40000

export async function GET() {
  const supabase = createServerSupabase()

  // Get total church count
  const { count } = await supabase
    .from('churches')
    .select('*', { count: 'exact', head: true })

  const totalChurches = count || 0
  const numSitemaps = Math.max(1, Math.ceil(totalChurches / CHURCHES_PER_SITEMAP))

  // Build sitemap index XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://bytheirfruit.church/sitemap-static.xml</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </sitemap>
${Array.from({ length: numSitemaps }, (_, i) => `  <sitemap>
    <loc>https://bytheirfruit.church/sitemap-churches-${i}.xml</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </sitemap>`).join('\n')}
</sitemapindex>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
