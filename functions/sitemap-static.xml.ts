// Static pages sitemap — lists all non-church pages
export const onRequest: PagesFunction = async () => {
  const today = new Date().toISOString().split('T')[0]

  const staticPages = [
    { loc: 'https://bytheirfruit.church/', priority: '1.0', changefreq: 'daily' },
    { loc: 'https://bytheirfruit.church/#/about', priority: '0.7', changefreq: 'monthly' },
    { loc: 'https://bytheirfruit.church/#/blog', priority: '0.8', changefreq: 'weekly' },
    { loc: 'https://bytheirfruit.church/#/blog/honest-church-reviews-why-they-matter', priority: '0.7', changefreq: 'monthly' },
    { loc: 'https://bytheirfruit.church/#/blog/what-to-look-for-in-a-church', priority: '0.7', changefreq: 'monthly' },
    { loc: 'https://bytheirfruit.church/#/blog/how-to-write-a-helpful-church-review', priority: '0.7', changefreq: 'monthly' },
    { loc: 'https://bytheirfruit.church/#/blog/the-10-categories-explained', priority: '0.7', changefreq: 'monthly' },
    { loc: 'https://bytheirfruit.church/#/blog/questions-to-ask-before-joining-a-church', priority: '0.7', changefreq: 'monthly' },
    { loc: 'https://bytheirfruit.church/#/blog/how-to-leave-a-church-gracefully', priority: '0.7', changefreq: 'monthly' },
    { loc: 'https://bytheirfruit.church/#/blog/church-for-young-adults', priority: '0.7', changefreq: 'monthly' },
    { loc: 'https://bytheirfruit.church/#/blog/what-church-leaders-can-learn-from-reviews', priority: '0.7', changefreq: 'monthly' },
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
    headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  })
}
