// Cloudflare Pages Function: handles /church/[id] and /church/[id]/[slug]
// Serves proper HTML with OG tags, meta tags, and JSON-LD for crawlers + social sharing
// Real users get the full SPA experience

const SUPABASE_URL = 'https://ffqmbhftivmiubvtzhhr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcW1iaGZ0aXZtaXVidnR6aGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzYyMTcsImV4cCI6MjA4ODg1MjIxN30.aYpnohEz3_kZzteD5y7mNwR8gzvkZm0iDGXGP_rHmNk'

const SCORE_FIELDS = ['teaching', 'welcome', 'community', 'worship', 'prayer', 'kids', 'youth', 'leadership', 'service', 'finances']

function makeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

async function fetchChurch(id: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/churches?id=eq.${id}&select=*`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data?.[0] || null
}

async function fetchReviews(churchId: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/reviews?church_id=eq.${churchId}&status=eq.published&deleted_at=is.null&select=id,text,reviewer_role,created_at,score_teaching,score_welcome,score_community,score_worship,score_prayer,score_kids,score_youth,score_leadership,score_service,score_finances,profiles!reviews_user_id_fkey(display_name)&order=created_at.desc&limit=10`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    }
  )
  if (!res.ok) return []
  return await res.json()
}

function avgScoreFromDb(church: any): number | null {
  const scores = SCORE_FIELDS.map(f => church[`score_${f}`]).filter((s: any) => s != null)
  if (scores.length === 0) return null
  return Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
}

function reviewAvg(review: any): number | null {
  const scores = SCORE_FIELDS.map(f => review[`score_${f}`]).filter((s: any) => s != null)
  if (scores.length === 0) return null
  return Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
}

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  const parts = url.pathname.split('/').filter(Boolean) // ["church", id, slug?]
  const churchId = parts[1]

  if (!churchId) {
    // No church ID — let the static site handle it
    return context.next()
  }

  const church = await fetchChurch(churchId)
  if (!church) {
    // Church not found — fall through to static 404 or SPA
    return context.next()
  }

  const reviews = await fetchReviews(churchId)
  const overall = avgScoreFromDb(church)
  const slug = makeSlug(church.name)
  const canonicalUrl = `https://bytheirfruit.church/church/${church.id}/${slug}`
  const locationParts = [church.city, church.state].filter(Boolean)
  const locationStr = locationParts.join(', ')
  const denomStr = church.denomination || ''

  // Build description
  const description = church.description
    ? escapeHtml(church.description.substring(0, 160))
    : escapeHtml(`Read honest reviews of ${church.name} in ${locationStr}. ${denomStr}. Real experiences from real congregants across 10 categories.${overall ? ` Rated ${overall}/5.` : ''}`)

  // Build JSON-LD
  const jsonLd: any = {
    '@context': 'https://schema.org',
    '@type': 'Church',
    name: church.name,
    url: canonicalUrl,
  }
  if (church.description) jsonLd.description = church.description
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
    jsonLd.geo = { '@type': 'GeoCoordinates', latitude: church.latitude, longitude: church.longitude }
  }
  if (overall && church.total_reviews > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: overall,
      bestRating: 5,
      worstRating: 1,
      reviewCount: church.total_reviews,
    }
  }
  if (reviews.length > 0) {
    jsonLd.review = reviews.slice(0, 5).map((r: any) => {
      const rScore = reviewAvg(r)
      const obj: any = {
        '@type': 'Review',
        datePublished: r.created_at?.split('T')[0],
        reviewBody: r.text?.substring(0, 300),
      }
      if (r.profiles?.display_name) obj.author = { '@type': 'Person', name: r.profiles.display_name }
      if (rScore) obj.reviewRating = { '@type': 'Rating', ratingValue: rScore, bestRating: 5, worstRating: 1 }
      return obj
    })
  }

  const title = escapeHtml(`${church.name} — Church Reviews | By Their Fruit`)
  const ogTitle = escapeHtml(`${church.name} — Reviews & Ratings`)
  const ogDesc = escapeHtml(`${church.total_reviews || 0} reviews from real congregants${overall ? `. Rated ${overall}/5` : ''}. ${locationStr}. ${denomStr}. Honest, structured church reviews.`)

  // Fetch the static SPA index.html as our shell
  const spaResponse = await context.env.ASSETS.fetch(new URL('/', context.request.url))
  let spaHtml = await spaResponse.text()

  // Inject church-specific meta tags into the <head>
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
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  `

  // Replace the existing <title> and add our meta tags right after <head>
  // Remove the generic title first
  spaHtml = spaHtml.replace(/<title>[^<]*<\/title>/, '')
  // Remove generic meta description
  spaHtml = spaHtml.replace(/<meta name="description" content="[^"]*"\s*\/?>/, '')
  // Remove generic og tags
  spaHtml = spaHtml.replace(/<meta property="og:title" content="[^"]*"\s*\/?>/g, '')
  spaHtml = spaHtml.replace(/<meta property="og:description" content="[^"]*"\s*\/?>/g, '')
  spaHtml = spaHtml.replace(/<meta property="og:url" content="[^"]*"\s*\/?>/g, '')
  spaHtml = spaHtml.replace(/<meta property="og:type" content="[^"]*"\s*\/?>/g, '')
  spaHtml = spaHtml.replace(/<meta property="og:site_name" content="[^"]*"\s*\/?>/g, '')
  spaHtml = spaHtml.replace(/<meta name="twitter:card" content="[^"]*"\s*\/?>/g, '')
  spaHtml = spaHtml.replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/g, '')
  spaHtml = spaHtml.replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/g, '')
  spaHtml = spaHtml.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/g, '')

  // Inject our meta tags after <head>
  spaHtml = spaHtml.replace('<head>', `<head>\n${metaInjection}`)

  return new Response(spaHtml, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
