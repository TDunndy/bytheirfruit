// Cloudflare Pages Function: handles /church/[id] and /church/[id]/[slug]
// Serves the SPA shell with church-specific meta tags and JSON-LD for
// crawlers and social sharing. Real users get the full SPA experience.

const SUPABASE_URL = 'https://ffqmbhftivmiubvtzhhr.supabase.co'
// Public anon key: safe to ship, every query goes through row level security.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcW1iaGZ0aXZtaXVidnR6aGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzYyMTcsImV4cCI6MjA4ODg1MjIxN30.aYpnohEz3_kZzteD5y7mNwR8gzvkZm0iDGXGP_rHmNk'

const SCORE_FIELDS = ['teaching', 'welcome', 'community', 'worship', 'prayer', 'kids', 'youth', 'leadership', 'service', 'finances']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MIN_REVIEWS_FOR_SCORE = 3

function makeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// JSON.stringify does not escape "</script>", so a review containing it would
// break out of the JSON-LD block. Escape the characters that matter for HTML.
function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

function firstName(name: string | null | undefined): string {
  if (!name) return 'Anonymous'
  return name.trim().split(/\s+/)[0] || 'Anonymous'
}

const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }

async function fetchChurch(id: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/churches?id=eq.${id}&status=eq.approved&select=id,name,address,city,state,zip,latitude,longitude,denomination,website,phone,description,total_reviews,${SCORE_FIELDS.map(f => 'score_' + f).join(',')}`, { headers })
  if (!res.ok) return null
  const data = await res.json()
  return data?.[0] || null
}

async function fetchReviews(churchId: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/reviews?church_id=eq.${churchId}&status=eq.published&deleted_at=is.null&select=id,text,reviewer_role,created_at,${SCORE_FIELDS.map(f => 'score_' + f).join(',')},public_profiles!reviews_user_id_fkey(display_name)&order=created_at.desc&limit=10`,
    { headers },
  )
  if (!res.ok) return []
  return await res.json()
}

function avgScores(obj: any): number | null {
  const scores = SCORE_FIELDS.map(f => obj[`score_${f}`]).filter((s: any) => s != null).map(Number)
  if (scores.length === 0) return null
  return Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
}

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  const parts = url.pathname.split('/').filter(Boolean) // ["church", id, slug?]
  const churchId = parts[1]

  if (!churchId || !UUID_RE.test(churchId)) {
    return context.next()
  }

  const church = await fetchChurch(churchId)
  if (!church) {
    return context.next()
  }

  const reviews = await fetchReviews(churchId)
  const hasEnoughReviews = (church.total_reviews || 0) >= MIN_REVIEWS_FOR_SCORE
  const overall = hasEnoughReviews ? avgScores(church) : null
  const slug = makeSlug(church.name)
  const canonicalUrl = `https://bytheirfruit.church/church/${church.id}/${slug}`
  const locationStr = [church.city, church.state].filter(Boolean).join(', ')
  const denomStr = church.denomination || ''

  const description = church.description
    ? escapeHtml(church.description.substring(0, 160))
    : escapeHtml(`Read honest reviews of ${church.name} in ${locationStr}. ${denomStr}. Real experiences from real congregants across 10 categories.${overall ? ` Rated ${overall}/5.` : ''}`)

  const jsonLd: any = {
    '@context': 'https://schema.org',
    '@type': 'Church',
    name: church.name,
    url: canonicalUrl,
  }
  if (church.description) jsonLd.description = church.description.substring(0, 500)
  if (church.city) {
    jsonLd.address = {
      '@type': 'PostalAddress',
      streetAddress: church.address || undefined,
      addressLocality: church.city,
      addressRegion: church.state,
      postalCode: church.zip || undefined,
      addressCountry: 'US',
    }
  }
  if (church.phone) jsonLd.telephone = church.phone
  if (church.website) jsonLd.sameAs = church.website
  if (church.latitude && church.longitude) {
    jsonLd.geo = { '@type': 'GeoCoordinates', latitude: Number(church.latitude), longitude: Number(church.longitude) }
  }
  if (overall && church.total_reviews > 0) {
    jsonLd.aggregateRating = { '@type': 'AggregateRating', ratingValue: overall, bestRating: 5, worstRating: 1, reviewCount: church.total_reviews }
  }
  if (reviews.length > 0) {
    jsonLd.review = reviews.slice(0, 5).map((r: any) => {
      const rScore = avgScores(r)
      const obj: any = {
        '@type': 'Review',
        datePublished: r.created_at?.split('T')[0],
        reviewBody: r.text?.substring(0, 300),
        author: { '@type': 'Person', name: firstName(r.public_profiles?.display_name) },
      }
      if (rScore) obj.reviewRating = { '@type': 'Rating', ratingValue: rScore, bestRating: 5, worstRating: 1 }
      return obj
    })
  }

  const title = escapeHtml(`${church.name} — Church Reviews | By Their Fruit`)
  const ogTitle = escapeHtml(`${church.name} — Reviews & Ratings`)
  const ogDesc = escapeHtml(`${church.total_reviews || 0} reviews from real congregants${overall ? `. Rated ${overall}/5` : ''}. ${locationStr}. ${denomStr}. Honest, structured church reviews.`)

  const spaResponse = await context.env.ASSETS.fetch(new URL('/', context.request.url))
  let spaHtml = await spaResponse.text()

  const metaInjection = `
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:title" content="${ogTitle}" />
    <meta property="og:description" content="${ogDesc}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:site_name" content="By Their Fruit" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="en_US" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${ogDesc}" />
    <meta name="robots" content="index, follow" />
    <script type="application/ld+json">${safeJsonForScript(jsonLd)}</script>
  `

  spaHtml = spaHtml.replace(/<title>[^<]*<\/title>/, '')
  spaHtml = spaHtml.replace(/<meta name="description" content="[^"]*"\s*\/?>/, '')
  for (const prop of ['og:title', 'og:description', 'og:url', 'og:type', 'og:site_name']) {
    spaHtml = spaHtml.replace(new RegExp(`<meta property="${prop}" content="[^"]*"\\s*\\/?>`, 'g'), '')
  }
  for (const name of ['twitter:card', 'twitter:title', 'twitter:description']) {
    spaHtml = spaHtml.replace(new RegExp(`<meta name="${name}" content="[^"]*"\\s*\\/?>`, 'g'), '')
  }
  spaHtml = spaHtml.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/g, '')
  spaHtml = spaHtml.replace('<head>', `<head>\n${metaInjection}`)

  return new Response(spaHtml, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
