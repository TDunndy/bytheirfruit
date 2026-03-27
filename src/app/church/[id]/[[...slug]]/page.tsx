import { createServerSupabase } from '@/lib/supabase-server'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ByTheirFruit from '@/components/ByTheirFruit'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// Score field names matching the database columns
const SCORE_FIELDS = ['teaching', 'welcome', 'community', 'worship', 'prayer', 'kids', 'youth', 'leadership', 'service', 'finances']

interface ChurchData {
  id: string
  name: string
  address: string | null
  city: string
  state: string
  zip: string | null
  denomination: string | null
  size: string | null
  phone: string | null
  website: string | null
  description: string | null
  latitude: number | null
  longitude: number | null
  service_times: string | null
  pastor_name: string | null
  total_reviews: number
  score_overall: number | null
  score_teaching: number | null
  score_welcome: number | null
  score_community: number | null
  score_worship: number | null
  score_prayer: number | null
  score_kids: number | null
  score_youth: number | null
  score_leadership: number | null
  score_service: number | null
  score_finances: number | null
}

interface ReviewData {
  id: string
  text: string
  reviewer_role: string
  created_at: string
  score_teaching: number | null
  score_welcome: number | null
  score_community: number | null
  score_worship: number | null
  score_prayer: number | null
  score_kids: number | null
  score_youth: number | null
  score_leadership: number | null
  score_service: number | null
  score_finances: number | null
  profiles: { display_name: string | null } | null
}

async function getChurch(id: string): Promise<ChurchData | null> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('churches')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data as ChurchData
}

async function getReviews(churchId: string): Promise<ReviewData[]> {
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('reviews')
    .select('id, text, reviewer_role, created_at, score_teaching, score_welcome, score_community, score_worship, score_prayer, score_kids, score_youth, score_leadership, score_service, score_finances, profiles!reviews_user_id_fkey(display_name)')
    .eq('church_id', churchId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(10)
  return (data || []) as ReviewData[]
}

function makeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
}

function avgScore(church: ChurchData): number | null {
  const scores = SCORE_FIELDS
    .map(f => (church as any)[`score_${f}`])
    .filter((s): s is number => s != null)
  if (scores.length === 0) return null
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
}

function reviewAvgScore(review: ReviewData): number | null {
  const scores = SCORE_FIELDS
    .map(f => (review as any)[`score_${f}`])
    .filter((s): s is number => s != null)
  if (scores.length === 0) return null
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
}

// --- Generate metadata for SEO + OG tags ---
export async function generateMetadata({ params }: { params: { id: string; slug?: string[] } }): Promise<Metadata> {
  const church = await getChurch(params.id)
  if (!church) return { title: 'Church Not Found | By Their Fruit' }

  const overall = avgScore(church)
  const slug = makeSlug(church.name)
  const url = `https://bytheirfruit.church/church/${church.id}/${slug}`
  const locationStr = [church.city, church.state].filter(Boolean).join(', ')
  const denomStr = church.denomination ? ` | ${church.denomination}` : ''
  const ratingStr = overall ? ` | ${overall}/5 rating` : ''
  const reviewStr = church.total_reviews > 0 ? ` | ${church.total_reviews} review${church.total_reviews !== 1 ? 's' : ''}` : ''

  const title = `${church.name} — Church Reviews | By Their Fruit`
  const description = church.description
    ? church.description.substring(0, 160)
    : `Read honest reviews of ${church.name} in ${locationStr}${denomStr}. Real experiences from real congregants across 10 categories.${ratingStr}${reviewStr}`

  return {
    title,
    description,
    openGraph: {
      title: `${church.name} — Reviews & Ratings`,
      description: `${church.total_reviews || 0} reviews from real congregants${overall ? `. Rated ${overall}/5` : ''}. ${locationStr}${denomStr}. Honest, structured church reviews on By Their Fruit.`,
      url,
      siteName: 'By Their Fruit',
      type: 'website',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary',
      title: `${church.name} — Church Reviews`,
      description: `${church.total_reviews || 0} honest reviews from real congregants.${overall ? ` Rated ${overall}/5.` : ''} ${locationStr}${denomStr}.`,
    },
    alternates: {
      canonical: url,
    },
    robots: { index: true, follow: true },
  }
}

// --- The page component ---
export default async function ChurchPage({ params }: { params: { id: string; slug?: string[] } }) {
  const church = await getChurch(params.id)
  if (!church) notFound()

  const reviews = await getReviews(params.id)
  const overall = avgScore(church)
  const slug = makeSlug(church.name)
  const canonicalUrl = `https://bytheirfruit.church/church/${church.id}/${slug}`
  const locationStr = [church.address, church.city, church.state, church.zip].filter(Boolean).join(', ')

  // Build JSON-LD structured data
  const jsonLd: any = {
    '@context': 'https://schema.org',
    '@type': 'Church',
    name: church.name,
    url: canonicalUrl,
  }

  if (church.description) jsonLd.description = church.description
  if (locationStr) {
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
    jsonLd.geo = {
      '@type': 'GeoCoordinates',
      latitude: church.latitude,
      longitude: church.longitude,
    }
  }

  // Add AggregateRating if reviews exist
  if (overall && church.total_reviews > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: overall,
      bestRating: 5,
      worstRating: 1,
      reviewCount: church.total_reviews,
    }
  }

  // Add individual reviews
  if (reviews.length > 0) {
    jsonLd.review = reviews.slice(0, 5).map(r => {
      const rScore = reviewAvgScore(r)
      const reviewObj: any = {
        '@type': 'Review',
        datePublished: r.created_at?.split('T')[0],
        reviewBody: r.text?.substring(0, 300),
      }
      if (r.profiles?.display_name) {
        reviewObj.author = { '@type': 'Person', name: r.profiles.display_name }
      }
      if (rScore) {
        reviewObj.reviewRating = {
          '@type': 'Rating',
          ratingValue: rScore,
          bestRating: 5,
          worstRating: 1,
        }
      }
      return reviewObj
    })
  }

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Server-rendered preview content for crawlers (hidden from JS users) */}
      <noscript>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px', fontFamily: 'system-ui, sans-serif' }}>
          <h1>{church.name}</h1>
          <p>{church.denomination} &middot; {church.city}, {church.state}</p>
          {church.address && <p>{church.address}</p>}
          {overall && <p>Rating: {overall}/5 based on {church.total_reviews} review{church.total_reviews !== 1 ? 's' : ''}</p>}
          {church.description && <p>{church.description}</p>}
          {church.phone && <p>Phone: {church.phone}</p>}
          {church.website && <p>Website: <a href={church.website}>{church.website}</a></p>}
          {reviews.length > 0 && (
            <>
              <h2>Reviews</h2>
              {reviews.map(r => (
                <div key={r.id} style={{ borderTop: '1px solid #eee', padding: '16px 0' }}>
                  <p><strong>{r.profiles?.display_name || 'Anonymous'}</strong> &middot; {r.reviewer_role} &middot; {r.created_at?.split('T')[0]}</p>
                  <p>{r.text}</p>
                </div>
              ))}
            </>
          )}
        </div>
      </noscript>

      {/* Full SPA renders for JS-enabled users — the path routing handler picks up /church/[id] */}
      <ByTheirFruit />
    </>
  )
}

