"use client"
// @ts-nocheck

import { useState, useEffect } from "react";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   BY THEIR FRUIT â€” Admin Dashboard
   Backend data model + management interface
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

const fonts = `@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');`;

const T = {
  bg: "#09090b", surface: "#18181b", surfaceAlt: "#27272a",
  border: "#3f3f46", borderLight: "#27272a",
  text: "#fafafa", textSoft: "#a1a1aa", textMuted: "#71717a",
  accent: "#3b82f6", accentSoft: "rgba(59,130,246,0.12)", accentBorder: "rgba(59,130,246,0.3)",
  green: "#22c55e", greenSoft: "rgba(34,197,94,0.12)",
  amber: "#f59e0b", amberSoft: "rgba(245,158,11,0.12)",
  red: "#ef4444", redSoft: "rgba(239,68,68,0.12)",
  heading: "'Sora', sans-serif", body: "'Plus Jakarta Sans', sans-serif", mono: "'JetBrains Mono', monospace",
  radius: 10, radiusSm: 6, radiusFull: 9999,
};

/* â”€â”€â”€ SAMPLE BACKEND DATA â”€â”€â”€ */
const USERS = [
  { id: "u1", name: "Sarah Mitchell", email: "sarah.m@gmail.com", provider: "google", joined: "2026-01-15", reviewCount: 3, lastActive: "2026-03-10", status: "active" },
  { id: "u2", name: "James Torres", email: "jtorres@outlook.com", provider: "microsoft", joined: "2026-01-22", reviewCount: 1, lastActive: "2026-03-08", status: "active" },
  { id: "u3", name: "Michael Reed", email: "m.reed@yahoo.com", provider: "email", joined: "2026-02-01", reviewCount: 2, lastActive: "2026-03-05", status: "active" },
  { id: "u4", name: "Emily Wu", email: "emily.wu@gmail.com", provider: "google", joined: "2026-02-10", reviewCount: 1, lastActive: "2026-03-01", status: "active" },
  { id: "u5", name: "Daniel Kim", email: "dkim@icloud.com", provider: "apple", joined: "2026-02-14", reviewCount: 2, lastActive: "2026-03-09", status: "active" },
  { id: "u6", name: "Christina Lopez", email: "c.lopez@gmail.com", provider: "google", joined: "2026-02-20", reviewCount: 1, lastActive: "2026-03-07", status: "active" },
  { id: "u7", name: "Robert Park", email: "rpark@gmail.com", provider: "google", joined: "2026-03-01", reviewCount: 1, lastActive: "2026-03-10", status: "active" },
  { id: "u8", name: "SpamBot9000", email: "totally.real@temp.xyz", provider: "email", joined: "2026-03-05", reviewCount: 0, lastActive: "2026-03-05", status: "suspended" },
];

const CHURCHES = [
  { id: "c1", name: "Harbor Grace Fellowship", city: "Tampa", state: "FL", denomination: "Non-Denominational", totalReviews: 47, avgScore: 4.35, source: "seed", addedBy: "admin", created: "2026-01-01", claimed: true },
  { id: "c2", name: "Christ Redeemer Bible Church", city: "St. Petersburg", state: "FL", denomination: "Reformed Baptist", totalReviews: 31, avgScore: 4.27, source: "seed", addedBy: "admin", created: "2026-01-01", claimed: true },
  { id: "c3", name: "New Life Community Church", city: "Lakewood Ranch", state: "FL", denomination: "Assemblies of God", totalReviews: 83, avgScore: 4.13, source: "seed", addedBy: "admin", created: "2026-01-01", claimed: false },
  { id: "c4", name: "Grace Baptist Church", city: "Ruskin", state: "FL", denomination: "Baptist", totalReviews: 2, avgScore: 0, source: "google", addedBy: "u5", created: "2026-02-18", claimed: false },
  { id: "c5", name: "Calvary Chapel Sun City", city: "Sun City Center", state: "FL", denomination: "Calvary Chapel", totalReviews: 1, avgScore: 0, source: "manual", addedBy: "u7", created: "2026-03-02", claimed: false },
  { id: "c6", name: "First Methodist Tampa", city: "Tampa", state: "FL", denomination: "Methodist", totalReviews: 8, avgScore: 3.92, source: "google", addedBy: "u3", created: "2026-02-05", claimed: false },
];

const REVIEWS = [
  { id: "r1", churchId: "c1", userId: "u1", author: "Sarah M.", role: "Member Â· 2 yrs", date: "2026-02-15", text: "Our family found a real home here. The children's ministry is outstanding â€” our kids actually ask to go to church. The youth group is newer and still finding its footing. Pastor David teaches verse by verse and doesn't shy away from hard passages. The only area I'd love to see growth is more transparency around the annual budget.", scores: { teaching: 5, welcome: 5, community: 5, kids: 5, youth: 3, leadership: 4, finances: 3 }, skipped: ["prayer"], status: "published", flags: 0, aiSummary: null },
  { id: "r2", churchId: "c1", userId: "u2", author: "James T.", role: "First-time Visitor", date: "2026-01-28", text: "Visited on a Sunday morning with my wife. We were greeted at the door, someone walked us to the kids' check-in, and a couple invited us to sit with them. Got a text follow-up on Tuesday. Worship felt genuine, though I didn't see a dedicated prayer time.", scores: { teaching: 4, welcome: 5, community: 4, worship: 4, kids: 5 }, skipped: ["prayer", "leadership", "finances", "youth", "service"], status: "published", flags: 0, aiSummary: null },
  { id: "r3", churchId: "c1", userId: "u3", author: "Michael R.", role: "Former Member", date: "2025-12-10", text: "Attended for a year. Teaching is solid and the people are kind. I left because the leadership structure felt top-heavy â€” elders weren't accessible and major decisions happened without congregation input.", scores: { teaching: 5, welcome: 4, community: 4, leadership: 3, finances: 3 }, skipped: ["worship", "prayer", "kids", "youth"], status: "published", flags: 1, aiSummary: null },
  { id: "r4", churchId: "c2", userId: "u5", author: "Daniel K.", role: "Member Â· 4 yrs", date: "2026-02-20", text: "If you want expository preaching that doesn't water down the gospel, this is it. The church publishes full financial reports quarterly. Prayer is woven into everything â€” Wednesday nights are entirely devoted to corporate prayer.", scores: { teaching: 5, community: 5, prayer: 5, leadership: 5, finances: 5 }, skipped: [], status: "published", flags: 0, aiSummary: null },
  { id: "r5", churchId: "c3", userId: "u6", author: "Christina L.", role: "Member Â· 1 yr", date: "2026-03-01", text: "The worship experience here is powerful and the production quality is top-notch. My concern is that sermons sometimes feel more motivational than biblical. No real corporate prayer time, and I have no idea what the budget looks like.", scores: { teaching: 3, welcome: 5, worship: 5, prayer: 2, kids: 5, youth: 5, leadership: 4, finances: 2 }, skipped: [], status: "published", flags: 0, aiSummary: null },
  { id: "r6", churchId: "c1", userId: "u8", author: "SpamBot9000", role: "First-time Visitor", date: "2026-03-05", text: "THIS CHURCH IS A CULT RUN BY NARCISSISTS DO NOT GO HERE!!!! Visit realchurch.biz instead for the TRUTH!!!!", scores: { teaching: 1, welcome: 1, leadership: 1 }, skipped: [], status: "flagged", flags: 4, aiSummary: "AI flagged: No specific experience described. Contains promotional URL. Aggressive tone without substantive feedback." },
];

const WEEKLY_STATS = [
  { week: "Feb 3", users: 12, reviews: 8, churches: 3 },
  { week: "Feb 10", users: 19, reviews: 14, churches: 4 },
  { week: "Feb 17", users: 28, reviews: 21, churches: 5 },
  { week: "Feb 24", users: 35, reviews: 26, churches: 5 },
  { week: "Mar 3", users: 44, reviews: 34, churches: 6 },
  { week: "Mar 10", users: 52, reviews: 41, churches: 6 },
];

/* â”€â”€â”€ SCHEMA DOCS â”€â”€â”€ */
const SCHEMA = `
-- BY THEIR FRUIT â€” Supabase PostgreSQL Schema
-- =============================================

-- Users (extends Supabase Auth)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  provider TEXT, -- google, apple, facebook, microsoft, email
  role TEXT DEFAULT 'user', -- user, moderator, admin, church_admin
  status TEXT DEFAULT 'active', -- active, suspended, banned
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW()
);

-- Churches
CREATE TABLE churches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  denomination TEXT DEFAULT 'Non-Denominational',
  size TEXT,
  service_style TEXT,
  service_times TEXT,
  website TEXT,
  phone TEXT,
  source TEXT DEFAULT 'manual', -- seed, google, manual
  added_by UUID REFERENCES profiles(id),
  claimed_by UUID REFERENCES profiles(id),
  claimed_at TIMESTAMPTZ,
  -- Aggregate scores (recalculated every Saturday)
  score_teaching DECIMAL,
  score_welcome DECIMAL,
  score_community DECIMAL,
  score_worship DECIMAL,
  score_prayer DECIMAL,
  score_kids DECIMAL,
  score_youth DECIMAL,
  score_leadership DECIMAL,
  score_service DECIMAL,
  score_finances DECIMAL,
  score_overall DECIMAL,
  total_reviews INT DEFAULT 0,
  scores_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reviews (1 per user per church)
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID REFERENCES churches(id) NOT NULL,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  role TEXT NOT NULL, -- relationship to church
  text TEXT NOT NULL,
  -- Category scores (NULL = "not sure"/skipped)
  score_teaching INT CHECK (score_teaching BETWEEN 1 AND 5),
  score_welcome INT CHECK (score_welcome BETWEEN 1 AND 5),
  score_community INT CHECK (score_community BETWEEN 1 AND 5),
  score_worship INT CHECK (score_worship BETWEEN 1 AND 5),
  score_prayer INT CHECK (score_prayer BETWEEN 1 AND 5),
  score_kids INT CHECK (score_kids BETWEEN 1 AND 5),
  score_youth INT CHECK (score_youth BETWEEN 1 AND 5),
  score_leadership INT CHECK (score_leadership BETWEEN 1 AND 5),
  score_service INT CHECK (score_service BETWEEN 1 AND 5),
  score_finances INT CHECK (score_finances BETWEEN 1 AND 5),
  -- Category comments (optional per-category)
  comment_teaching TEXT,
  comment_welcome TEXT,
  comment_community TEXT,
  comment_worship TEXT,
  comment_prayer TEXT,
  comment_kids TEXT,
  comment_youth TEXT,
  comment_leadership TEXT,
  comment_service TEXT,
  comment_finances TEXT,
  -- Metadata
  status TEXT DEFAULT 'published', -- pending, published, flagged, removed
  flag_count INT DEFAULT 0,
  ai_moderation_result JSONB, -- AI screening output
  ai_summary TEXT, -- AI-generated review summary
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(church_id, user_id) -- 1 review per user per church
);

-- Review flags
CREATE TABLE review_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID REFERENCES reviews(id) NOT NULL,
  flagged_by UUID REFERENCES profiles(id) NOT NULL,
  reason TEXT NOT NULL, -- inappropriate, spam, personal_attack, fake
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(review_id, flagged_by)
);

-- Church responses (churches respond to reviews)
CREATE TABLE church_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID REFERENCES reviews(id) NOT NULL,
  church_id UUID REFERENCES churches(id) NOT NULL,
  responder_id UUID REFERENCES profiles(id) NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Saturday score recalculation function
CREATE OR REPLACE FUNCTION recalculate_church_scores()
RETURNS void AS $$
BEGIN
  UPDATE churches c SET
    score_teaching = sub.avg_teaching,
    score_welcome = sub.avg_welcome,
    score_community = sub.avg_community,
    score_worship = sub.avg_worship,
    score_prayer = sub.avg_prayer,
    score_kids = sub.avg_kids,
    score_youth = sub.avg_youth,
    score_leadership = sub.avg_leadership,
    score_service = sub.avg_service,
    score_finances = sub.avg_finances,
    score_overall = sub.avg_overall,
    total_reviews = sub.review_count,
    scores_updated_at = NOW()
  FROM (
    SELECT
      church_id,
      COUNT(*) as review_count,
      AVG(score_teaching) as avg_teaching,
      AVG(score_welcome) as avg_welcome,
      AVG(score_community) as avg_community,
      AVG(score_worship) as avg_worship,
      AVG(score_prayer) as avg_prayer,
      AVG(score_kids) as avg_kids,
      AVG(score_youth) as avg_youth,
      AVG(score_leadership) as avg_leadership,
      AVG(score_service) as avg_service,
      AVG(score_finances) as avg_finances,
      AVG(COALESCE(score_teaching, score_welcome, score_community,
        score_worship, score_prayer, score_kids, score_youth,
        score_leadership, score_service, score_finances)) as avg_overall
    FROM reviews
    WHERE status = 'published'
    GROUP BY church_id
  ) sub
  WHERE c.id = sub.church_id;
END;
$$ LANGUAGE plpgsql;

-- Cron: run every Saturday at 3 AM ET
-- SELECT cron.schedule('recalc-scores', '0 3 * * 6',
--   'SELECT recalculate_church_scores()');

-- Row Level Security
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read published reviews"
  ON reviews FOR SELECT USING (status = 'published');
CREATE POLICY "Users can insert their own review"
  ON reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own review after 7 days"
  ON reviews FOR UPDATE USING (
    auth.uid() = user_id
    AND created_at < NOW() - INTERVAL '7 days'
  );
`;

/* â”€â”€â”€ HELPERS â”€â”€â”€ */
const scoreColor = (s) => s >= 4.5 ? T.green : s >= 3.5 ? T.amber : T.red;

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, fontFamily: T.heading, color: color || T.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function MiniBar({ data, label }) {
  const max = Math.max(...data.map(d => d.v));
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 60 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ width: "100%", borderRadius: 3, background: T.accent, opacity: 0.7 + (d.v / max) * 0.3, height: `${(d.v / max) * 100}%`, minHeight: 4, transition: "height 0.5s ease" }} />
            <span style={{ fontSize: 8, color: T.textMuted, fontFamily: T.mono }}>{d.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Badge({ status }) {
  const s = {
    active: { bg: T.greenSoft, color: T.green, border: "transparent" },
    published: { bg: T.greenSoft, color: T.green, border: "transparent" },
    suspended: { bg: T.redSoft, color: T.red, border: "transparent" },
    banned: { bg: T.redSoft, color: T.red, border: "transparent" },
    flagged: { bg: T.amberSoft, color: T.amber, border: "transparent" },
    pending: { bg: T.accentSoft, color: T.accent, border: "transparent" },
    removed: { bg: T.surfaceAlt, color: T.textMuted, border: T.border },
  }[status] || { bg: T.surfaceAlt, color: T.textMuted, border: T.border };
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: T.radiusFull, background: s.bg, color: s.color, border: `1px solid ${s.border}`, textTransform: "uppercase", letterSpacing: "0.04em" }}>{status}</span>;
}

/* â”€â”€â”€ MAIN DASHBOARD â”€â”€â”€ */
export default function AdminDashboard() {
  const [tab, setTab] = useState("overview");
  const [selectedReview, setSelectedReview] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [reviews, setReviews] = useState(REVIEWS);
  const [aiChurchSummary, setAiChurchSummary] = useState(null);
  const [aiChurchLoading, setAiChurchLoading] = useState(false);

  const activeUsers = USERS.filter(u => u.status === "active").length;
  const publishedReviews = reviews.filter(r => r.status === "published").length;
  const flaggedReviews = reviews.filter(r => r.status === "flagged").length;
  const claimedChurches = CHURCHES.filter(c => c.claimed).length;

  const summarizeReview = async (review) => {
    setAiLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: `You are a moderation AI for a church review platform. Analyze this review and provide:
1. A 1-2 sentence summary of the reviewer's experience
2. Key positives mentioned (bullet points)  
3. Key concerns mentioned (bullet points)
4. Moderation flags (if any): personal attacks, spam, fake review, coordinated campaign, doctrinal argument disguised as review
5. Confidence score (0-100) that this is a genuine, constructive review

Review by ${review.author} (${review.role}):
"${review.text}"

Scores given: ${JSON.stringify(review.scores)}
Categories skipped: ${JSON.stringify(review.skipped || [])}

Respond in JSON only, no markdown: {"summary":"...","positives":["..."],"concerns":["..."],"flags":["..."],"confidence":0}` }],
        }),
      });
      const data = await res.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      const json = JSON.parse(text.replace(/```json|```/g, "").trim());
      setReviews(prev => prev.map(r => r.id === review.id ? { ...r, aiSummary: json } : r));
    } catch (e) { console.error(e); }
    finally { setAiLoading(false); }
  };

  const summarizeChurch = async (church) => {
    setAiChurchLoading(true);
    try {
      const churchReviews = reviews.filter(r => r.churchId === church.id && r.status === "published");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: `You are an AI for a church review platform. Summarize all reviews for "${church.name}" into a congregation-sourced profile. This summary will be shown publicly.

Reviews:
${churchReviews.map(r => `- ${r.author} (${r.role}): "${r.text}" Scores: ${JSON.stringify(r.scores)}`).join("\n")}

Respond in JSON only: {"headline":"One sentence capturing the church's identity","strengths":["..."],"growthAreas":["..."],"bestFor":"Who would thrive here","notIdealFor":"Who might want to look elsewhere","visitorTip":"One practical tip for first-time visitors"}` }],
        }),
      });
      const data = await res.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      setAiChurchSummary({ churchId: church.id, ...JSON.parse(text.replace(/```json|```/g, "").trim()) });
    } catch (e) { console.error(e); }
    finally { setAiChurchLoading(false); }
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users" },
    { id: "churches", label: "Churches" },
    { id: "reviews", label: "Reviews" },
    { id: "schema", label: "Schema" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.body, color: T.text }}>
      <style>{fonts}{`::selection{background:${T.accentSoft};color:${T.accent}}*{box-sizing:border-box}input::placeholder,textarea::placeholder{color:${T.textMuted}}`}</style>

      {/* Nav */}
      <nav style={{ padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
            <rect x="1" y="1" width="26" height="26" rx="7" stroke={T.text} strokeWidth="1.5" />
            <path d="M14 7 C14 7, 9 13, 9 17 C9 19.76 11.24 22 14 22 C16.76 22 19 19.76 19 17 C19 13 14 7 14 7Z" fill={T.text} opacity="0.85" />
          </svg>
          <span style={{ fontSize: 16, fontFamily: T.heading, fontWeight: 700, letterSpacing: "-0.03em" }}>By Their Fruit</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: T.radiusFull, background: T.accentSoft, color: T.accent, border: `1px solid ${T.accentBorder}`, marginLeft: 4 }}>Admin</span>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 12.5, fontWeight: 500,
              fontFamily: T.body, cursor: "pointer", transition: "all 0.15s",
              background: tab === t.id ? T.text : "transparent", color: tab === t.id ? T.bg : T.textMuted,
              border: "none",
            }}>{t.label}</button>
          ))}
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>

        {/* â•â•â• OVERVIEW â•â•â• */}
        {tab === "overview" && (
          <>
            <h1 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: "0 0 20px", letterSpacing: "-0.03em" }}>Dashboard</h1>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
              <Stat label="Active Users" value={activeUsers} sub={`+${USERS.filter(u => u.joined >= "2026-03-01").length} this month`} color={T.accent} />
              <Stat label="Churches" value={CHURCHES.length} sub={`${claimedChurches} claimed`} />
              <Stat label="Published Reviews" value={publishedReviews} sub={`${flaggedReviews} flagged`} color={T.green} />
              <Stat label="Avg Score" value="4.22" sub="Across all churches" color={T.amber} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <MiniBar label="Users per week" data={WEEKLY_STATS.map(w => ({ l: w.week.split(" ")[1], v: w.users }))} />
              </div>
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <MiniBar label="Reviews per week" data={WEEKLY_STATS.map(w => ({ l: w.week.split(" ")[1], v: w.reviews }))} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Recent Reviews */}
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Recent Reviews</div>
                {reviews.slice(0, 4).map(r => {
                  const church = CHURCHES.find(c => c.id === r.churchId);
                  return (
                    <div key={r.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.borderLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{r.author} <span style={{ fontWeight: 400, color: T.textMuted }}>â†’ {church?.name}</span></div>
                        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{r.role} Â· {r.date}</div>
                      </div>
                      <Badge status={r.status} />
                    </div>
                  );
                })}
              </div>

              {/* Flagged Items */}
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Flagged for Review</div>
                {reviews.filter(r => r.status === "flagged").map(r => {
                  const church = CHURCHES.find(c => c.id === r.churchId);
                  return (
                    <div key={r.id} style={{ padding: "12px", borderRadius: T.radiusSm, background: T.amberSoft, border: `1px solid rgba(245,158,11,0.2)`, marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.amber }}>{r.author} â†’ {church?.name}</div>
                      <div style={{ fontSize: 12, color: T.textSoft, marginTop: 4, lineHeight: 1.5 }}>{r.text.slice(0, 120)}...</div>
                      {r.aiSummary && typeof r.aiSummary === "string" && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6, fontStyle: "italic" }}>{r.aiSummary}</div>}
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <button style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: T.radiusFull, background: T.redSoft, color: T.red, border: "none", cursor: "pointer" }}>Remove</button>
                        <button style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: T.radiusFull, background: T.greenSoft, color: T.green, border: "none", cursor: "pointer" }}>Approve</button>
                      </div>
                    </div>
                  );
                })}
                {reviews.filter(r => r.status === "flagged").length === 0 && <div style={{ fontSize: 13, color: T.textMuted, padding: "20px 0", textAlign: "center" }}>No flagged reviews</div>}
              </div>
            </div>
          </>
        )}

        {/* â•â•â• USERS â•â•â• */}
        {tab === "users" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h1 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: 0, letterSpacing: "-0.03em" }}>Users ({USERS.length})</h1>
            </div>
            <div style={{ borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1fr", padding: "10px 16px", borderBottom: `1px solid ${T.border}`, fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                <span>Name</span><span>Email</span><span>Provider</span><span>Reviews</span><span>Last Active</span><span>Status</span>
              </div>
              {USERS.map(u => (
                <div key={u.id} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1fr", padding: "12px 16px", borderBottom: `1px solid ${T.borderLight}`, fontSize: 13, alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{u.name}</span>
                  <span style={{ color: T.textMuted, fontFamily: T.mono, fontSize: 11 }}>{u.email}</span>
                  <span style={{ fontSize: 11, color: T.textSoft }}>{u.provider}</span>
                  <span style={{ fontFamily: T.mono }}>{u.reviewCount}</span>
                  <span style={{ fontSize: 11, color: T.textMuted }}>{u.lastActive}</span>
                  <Badge status={u.status} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* â•â•â• CHURCHES â•â•â• */}
        {tab === "churches" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h1 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: 0, letterSpacing: "-0.03em" }}>Churches ({CHURCHES.length})</h1>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {CHURCHES.map(c => (
                <div key={c.id} style={{ padding: "18px 20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.heading, letterSpacing: "-0.02em" }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{c.denomination} Â· {c.city}, {c.state} Â· Source: {c.source}{c.claimed ? " Â· Claimed" : ""}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {c.avgScore > 0 && <span style={{ fontSize: 20, fontWeight: 800, fontFamily: T.heading, color: scoreColor(c.avgScore) }}>{c.avgScore.toFixed(1)}</span>}
                      <span style={{ fontSize: 12, color: T.textMuted }}>{c.totalReviews} reviews</span>
                    </div>
                  </div>

                  {/* AI Church Summary */}
                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <button onClick={() => summarizeChurch(c)} disabled={aiChurchLoading} style={{
                      fontSize: 11, fontWeight: 600, padding: "5px 14px", borderRadius: T.radiusFull,
                      background: T.accentSoft, color: T.accent, border: `1px solid ${T.accentBorder}`,
                      cursor: aiChurchLoading ? "wait" : "pointer",
                    }}>{aiChurchLoading && aiChurchSummary?.churchId === c.id ? "Generating..." : "Generate AI Profile Summary"}</button>
                  </div>

                  {aiChurchSummary?.churchId === c.id && (
                    <div style={{ marginTop: 12, padding: "14px 16px", borderRadius: T.radiusSm, background: T.accentSoft, border: `1px solid ${T.accentBorder}` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>AI-Generated Profile</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 8 }}>{aiChurchSummary.headline}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12, lineHeight: 1.6 }}>
                        <div><div style={{ fontWeight: 600, color: T.green, marginBottom: 4 }}>Strengths</div>{aiChurchSummary.strengths?.map((s, i) => <div key={i} style={{ color: T.textSoft }}>â€¢ {s}</div>)}</div>
                        <div><div style={{ fontWeight: 600, color: T.amber, marginBottom: 4 }}>Growth Areas</div>{aiChurchSummary.growthAreas?.map((s, i) => <div key={i} style={{ color: T.textSoft }}>â€¢ {s}</div>)}</div>
                      </div>
                      <div style={{ marginTop: 10, fontSize: 12, color: T.textSoft }}><strong style={{ color: T.text }}>Best for:</strong> {aiChurchSummary.bestFor}</div>
                      <div style={{ fontSize: 12, color: T.textSoft, marginTop: 4 }}><strong style={{ color: T.text }}>Visitor tip:</strong> {aiChurchSummary.visitorTip}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* â•â•â• REVIEWS â•â•â• */}
        {tab === "reviews" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h1 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: 0, letterSpacing: "-0.03em" }}>Reviews ({reviews.length})</h1>
              <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
                <span style={{ color: T.green }}>â— {publishedReviews} published</span>
                <span style={{ color: T.amber }}>â— {flaggedReviews} flagged</span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reviews.map(r => {
                const church = CHURCHES.find(c => c.id === r.churchId);
                const user = USERS.find(u => u.id === r.userId);
                return (
                  <div key={r.id} style={{ padding: "18px 20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${r.status === "flagged" ? "rgba(245,158,11,0.3)" : T.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 14, background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: T.heading }}>{r.author.charAt(0)}</div>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.heading }}>{r.author}</span>
                          <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 8 }}>{r.role}</span>
                          <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 8 }}>â†’ {church?.name}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge status={r.status} />
                        {r.flags > 0 && <span style={{ fontSize: 10, color: T.red, fontWeight: 600 }}>{r.flags} flags</span>}
                        <span style={{ fontSize: 11, color: T.textMuted }}>{r.date}</span>
                      </div>
                    </div>

                    <p style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.65, margin: "0 0 10px" }}>{r.text}</p>

                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 10 }}>
                      {Object.entries(r.scores).map(([k, v]) => (
                        <span key={k} style={{ fontSize: 10, padding: "2px 7px", borderRadius: T.radiusFull, background: scoreColor(v) === T.green ? T.greenSoft : scoreColor(v) === T.amber ? T.amberSoft : T.redSoft, color: scoreColor(v), fontWeight: 700, fontFamily: T.heading }}>{k.slice(0, 4)} {v}</span>
                      ))}
                      {r.skipped?.length > 0 && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: T.radiusFull, background: T.surfaceAlt, color: T.textMuted, fontWeight: 500 }}>{r.skipped.length} skipped</span>}
                    </div>

                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button onClick={() => summarizeReview(r)} disabled={aiLoading} style={{
                        fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: T.radiusFull,
                        background: T.accentSoft, color: T.accent, border: `1px solid ${T.accentBorder}`,
                        cursor: aiLoading ? "wait" : "pointer",
                      }}>{aiLoading ? "..." : r.aiSummary ? "Re-analyze" : "AI Analyze"}</button>
                      {r.status === "published" && <button style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: T.radiusFull, background: T.redSoft, color: T.red, border: "none", cursor: "pointer" }}>Remove</button>}
                      {r.status === "flagged" && <>
                        <button style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: T.radiusFull, background: T.greenSoft, color: T.green, border: "none", cursor: "pointer" }}>Approve</button>
                        <button style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: T.radiusFull, background: T.redSoft, color: T.red, border: "none", cursor: "pointer" }}>Remove</button>
                      </>}
                    </div>

                    {/* AI Analysis Result */}
                    {r.aiSummary && typeof r.aiSummary === "object" && (
                      <div style={{ marginTop: 12, padding: "14px", borderRadius: T.radiusSm, background: T.accentSoft, border: `1px solid ${T.accentBorder}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>AI Analysis</div>
                        <div style={{ fontSize: 12.5, color: T.text, marginBottom: 8 }}>{r.aiSummary.summary}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11.5, lineHeight: 1.5 }}>
                          <div><span style={{ fontWeight: 600, color: T.green }}>Positives:</span> {r.aiSummary.positives?.map((p, i) => <span key={i} style={{ color: T.textSoft }}> â€¢ {p}</span>)}</div>
                          <div><span style={{ fontWeight: 600, color: T.amber }}>Concerns:</span> {r.aiSummary.concerns?.map((c, i) => <span key={i} style={{ color: T.textSoft }}> â€¢ {c}</span>)}</div>
                        </div>
                        {r.aiSummary.flags?.length > 0 && <div style={{ marginTop: 6, fontSize: 11, color: T.red, fontWeight: 600 }}>Flags: {r.aiSummary.flags.join(", ")}</div>}
                        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11, color: T.textMuted }}>Confidence:</span>
                          <div style={{ width: 80, height: 4, borderRadius: 2, background: T.surfaceAlt, overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 2, width: `${r.aiSummary.confidence}%`, background: r.aiSummary.confidence >= 70 ? T.green : r.aiSummary.confidence >= 40 ? T.amber : T.red }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: T.mono, color: r.aiSummary.confidence >= 70 ? T.green : r.aiSummary.confidence >= 40 ? T.amber : T.red }}>{r.aiSummary.confidence}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* â•â•â• SCHEMA â•â•â• */}
        {tab === "schema" && (
          <>
            <h1 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.03em" }}>Database Schema</h1>
            <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 20px" }}>Supabase PostgreSQL schema â€” ready to deploy. Copy this into the SQL editor.</p>
            <div style={{
              padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}`,
              fontFamily: T.mono, fontSize: 11.5, lineHeight: 1.7, color: T.textSoft,
              whiteSpace: "pre-wrap", maxHeight: "70vh", overflowY: "auto",
            }}>
              {SCHEMA}
            </div>
            <button onClick={() => navigator.clipboard?.writeText(SCHEMA)} style={{
              marginTop: 12, padding: "8px 20px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600,
              background: T.accentSoft, color: T.accent, border: `1px solid ${T.accentBorder}`, cursor: "pointer",
            }}>Copy Schema to Clipboard</button>
          </>
        )}
      </div>
    </div>
  );
}
