// Static pages sitemap. Only real URLs belong here: hash routes (#/about,
// #/blog/...) are never crawled as separate pages, so they are intentionally
// absent until those pages get real paths.
export const onRequest: PagesFunction = async () => {
  const today = new Date().toISOString().split('T')[0]

  const staticPages = [
    { loc: 'https://bytheirfruit.church/', priority: '1.0', changefreq: 'daily' },
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
    headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
  })
}
