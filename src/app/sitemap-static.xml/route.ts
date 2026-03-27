export const runtime = 'edge'

export async function GET() {
  const today = new Date().toISOString().split('T')[0]

  const staticPages = [
    { loc: 'https://bytheirfruit.church/', changefreq: 'daily', priority: '1.0' },
    { loc: 'https://bytheirfruit.church/#/discover', changefreq: 'daily', priority: '0.9' },
    { loc: 'https://bytheirfruit.church/#/rate', changefreq: 'weekly', priority: '0.8' },
    { loc: 'https://bytheirfruit.church/#/about', changefreq: 'monthly', priority: '0.7' },
    { loc: 'https://bytheirfruit.church/#/blog', changefreq: 'weekly', priority: '0.8' },
    { loc: 'https://bytheirfruit.church/#/blog/how-to-find-the-right-church', changefreq: 'monthly', priority: '0.7' },
    { loc: 'https://bytheirfruit.church/#/blog/what-makes-a-healthy-church', changefreq: 'monthly', priority: '0.7' },
    { loc: 'https://bytheirfruit.church/#/blog/why-church-reviews-matter', changefreq: 'monthly', priority: '0.7' },
    { loc: 'https://bytheirfruit.church/#/blog/questions-to-ask-before-joining-a-church', changefreq: 'monthly', priority: '0.7' },
    { loc: 'https://bytheirfruit.church/#/blog/how-to-leave-a-church-gracefully', changefreq: 'monthly', priority: '0.7' },
    { loc: 'https://bytheirfruit.church/#/blog/church-for-young-adults', changefreq: 'monthly', priority: '0.7' },
    { loc: 'https://bytheirfruit.church/#/blog/what-church-leaders-can-learn-from-reviews', changefreq: 'monthly', priority: '0.7' },
    { loc: 'https://bytheirfruit.church/#/terms', changefreq: 'yearly', priority: '0.3' },
    { loc: 'https://bytheirfruit.church/#/privacy', changefreq: 'yearly', priority: '0.3' },
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.map(p => `  <url>
    <loc>${p.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}
