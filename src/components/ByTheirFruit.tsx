"use client"
// @ts-nocheck

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const fonts = `@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');`;

const SHARED = {
  heading: "'Sora', sans-serif", body: "'Plus Jakarta Sans', sans-serif",
  radius: 12, radiusSm: 8, radiusFull: 9999,
  accent: "#2563eb", accentSoft: "#eff4ff", accentBorder: "#bfdbfe",
  green: "#16a34a", greenSoft: "#f0fdf4", grheenBorder: "#bbf7d0",
  amber: "#d97706", amberSoft: "#fffbeb", amberBorder: "#fde68a",
  red: "#dc2626", redSoft: "#fef2f2", redBorder: "#fecaca",
};

const LIGHT = {
  ...SHARED,
  bg: "#fafafa", surface: "#ffffff", surfaceAlt: "#f4f4f5",
  border: "#e4e4e7", borderLight: "#f0f0f2",
  text: "#18181b", textSoft: "#52525b", textMuted: "#a1a1aa",
  navBg: "rgba(250,250,250,0.88)",
};

const DARK = {
  ...SHARED,
  bg: "#0a0a0b", surface: "#18181b", surfaceAlt: "#1e1e22",
  border: "#2e2e33", borderLight: "#252529",
  text: "#fafafa", textSoft: "#e4e4ea", textMuted: "#b0b0bb",
  accentSoft: "#172554", accentBorder: "#1e3a5f",
  greenSoft: "#052e16", greenBorder: "#14532d",
  amberSoft: "#451a03", amberBorder: "#78350f",
  redSoft: "#450a0a", redBorder: "#7f1d1d",
  navBg: "rgba(10,10,11,0.88)",
};

// Default for server render / outside component
let T = LIGHT;

function useTheme() {
  // mode: "system" | "light" | "dark"
  const [mode, setMode] = useState("system");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    // Load saved preference
    try { const saved = localStorage.getItem("btf-theme"); if (saved) setMode(saved); } catch {}
    // Detect system preference
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const handler = (e) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = useCallback((newMode) => {
    setMode(newMode);
    try { localStorage.setItem("btf-theme", newMode); } catch {}
  }, []);

  const isDark = mode === "dark" || (mode === "system" && systemDark);
  return { theme: isDark ? DARK : LIGHT, isDark, mode, setTheme };
}

const MIN_REVIEWS_FOR_SCORE = 3;

const US_STATES = [
  "All", "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"
];

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "Washington DC"
};

const CATEGORY_GROUPS = [
  { label: "Sunday Experience", ids: ["teaching", "worship", "prayer", "welcome"] },
  { label: "Community & Care", ids: ["community", "kids", "youth"] },
  { label: "Governance", ids: ["leadership", "finances", "service"] },
];

const CATEGORIES = [
  { id: "teaching", label: "Teaching & Scripture", desc: "Is the teaching rooted in scripture? Does the pastor handle God\u2019s word faithfully?" },
  { id: "welcome", label: "Visitor Experience", desc: "Were you greeted warmly? Could you find your way? Did someone reach out after?" },
  { id: "community", label: "Genuine Community", desc: "Do relationships go beyond Sunday? Is there real depth and care?" },
  { id: "worship", label: "Worship", desc: "Is worship authentic and God-focused? Is it about performance or genuine praise?" },
  { id: "prayer", label: "Prayer Life", desc: "Is there space and priority for prayer? Are prayer requests taken seriously and followed up on?" },
  { id: "kids", label: "Children\u2019s Ministry", desc: "Are children safe, loved, and taught well? Are there proper check-in and safety protocols?" },
  { id: "youth", label: "Youth Ministry", desc: "Are teenagers engaged and discipled? Is there real mentorship or just entertainment?" },
  { id: "leadership", label: "Leadership & Integrity", desc: "Is leadership transparent, accountable, and servant-hearted?" },
  { id: "service", label: "Local Outreach", desc: "Is this church active in the community? Do they serve beyond their walls?" },
  { id: "finances", label: "Financial Transparency", desc: "Is there openness about how tithes and offerings are used?" },
];

const SCORE_FIELDS = ["teaching", "welcome", "community", "worship", "prayer", "kids", "youth", "leadership", "service", "finances"];

/* --- HAVERSINE DISTANCE (miles) --- */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* --- GEOCODE ZIP CODE TO COORDINATES (OpenStreetMap Nominatim, free, no key) --- */
async function geocodeZip(zip) {
  try {
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=US&format=json&limit=1`, {
      headers: { "User-Agent": "ByTheirFruit/1.0" }
    });
    const data = await resp.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.error("Geocode zip error:", e);
  }
  return null;
}

/* --- DB MAPPERS --- */
function dbChurchToLocal(c) {
  const scores = {};
  SCORE_FIELDS.forEach(f => {
    if (c[`score_${f}`] != null) scores[f] = parseFloat(c[`score_${f}`]);
  });
  // Generate tags from high scores
  const tags = [];
  if (scores.teaching >= 4.5) tags.push("Strong Teaching");
  if (scores.welcome >= 4.5) tags.push("Welcoming");
  if (scores.community >= 4.5) tags.push("Tight-Knit Community");
  if (scores.worship >= 4.5) tags.push("Vibrant Worship");
  if (scores.kids >= 4.5) tags.push("Great Kids Program");
  if (scores.youth >= 4.5) tags.push("Active Youth");
  if (scores.finances >= 4.5) tags.push("Financially Transparent");
  if (scores.leadership >= 4.5) tags.push("Servant Leadership");
  if (c.total_reviews === 0 || Object.keys(scores).length === 0) tags.push("New on By Their Fruit");

  return {
    id: c.id,
    name: c.name,
    denomination: c.denomination || "Non-Denominational",
    city: c.city,
    state: c.state,
    address: c.address || "",
    zip: c.zip || "",
    phone: c.phone || "",
    email: c.email || "",
    website: c.website || "",
    size: c.size || "",
    serviceStyle: c.service_style || "",
    serviceTimes: c.service_times || "",
    totalReviews: c.total_reviews || 0,
    scores,
    tags: tags.slice(0, 5),
    recentReviews: [], // loaded separately
    claimedBy: c.claimed_by || null,
    claimedAt: c.claimed_at || null,
    latitude: c.latitude || null,
    longitude: c.longitude || null,
    status: c.status || "approved",
  };
}

/* --- SEO: Dynamic meta tags + JSON-LD structured data --- */
function updateMeta(property, content) {
  let el = document.querySelector(`meta[property="${property}"]`) || document.querySelector(`meta[name="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    if (property.startsWith("og:") || property.startsWith("twitter:")) el.setAttribute("property", property);
    else el.setAttribute("name", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setJsonLd(data) {
  let el = document.getElementById("btf-jsonld");
  if (!el) {
    el = document.createElement("script");
    el.id = "btf-jsonld";
    el.type = "application/ld+json";
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function updateSEOForChurch(church, reviews = []) {
  const { name, city, state, denomination, address, totalReviews, scores, phone, website } = church;
  const overall = Object.values(scores);
  const avgScore = overall.length > 0 ? (overall.reduce((a, b) => a + b, 0) / overall.length).toFixed(1) : null;
  const location = [city, state].filter(Boolean).join(", ");

  // Page title
  document.title = `${name} Reviews — ${location} | By Their Fruit`;

  // Meta description
  const desc = avgScore
    ? `${name} in ${location} rated ${avgScore}/5 across ${overall.length} categories from ${totalReviews} review${totalReviews !== 1 ? "s" : ""}. ${denomination} church. Read honest reviews from real congregants.`
    : `Read reviews of ${name} in ${location}. ${denomination} church. Be the first to share your experience on By Their Fruit.`;
  updateMeta("description", desc);

  // Open Graph
  updateMeta("og:title", `${name} — Church Reviews | By Their Fruit`);
  updateMeta("og:description", desc);
  updateMeta("og:url", `https://bytheirfruit.church/church/${church.id}`);
  updateMeta("og:type", "website");
  updateMeta("og:site_name", "By Their Fruit");

  // Twitter
  updateMeta("twitter:title", `${name} — Church Reviews`);
  updateMeta("twitter:description", desc);

  // JSON-LD: Church + AggregateRating + Reviews
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Church",
    "name": name,
    "address": {
      "@type": "PostalAddress",
      "streetAddress": address || undefined,
      "addressLocality": city,
      "addressRegion": state,
    },
  };
  if (phone) jsonLd.telephone = phone;
  if (website) jsonLd.url = website;
  if (church.latitude && church.longitude) {
    jsonLd.geo = { "@type": "GeoCoordinates", "latitude": church.latitude, "longitude": church.longitude };
  }
  if (avgScore && totalReviews > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      "ratingValue": avgScore,
      "bestRating": "5",
      "worstRating": "1",
      "reviewCount": totalReviews,
    };
  }
  if (reviews.length > 0) {
    jsonLd.review = reviews.slice(0, 5).map(r => ({
      "@type": "Review",
      "author": { "@type": "Person", "name": r.author || "Anonymous" },
      "datePublished": r._createdAt ? new Date(r._createdAt).toISOString().split("T")[0] : undefined,
      "reviewBody": r.text,
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": Object.values(r.scores).length > 0 ? (Object.values(r.scores).reduce((a, b) => a + b, 0) / Object.values(r.scores).length).toFixed(1) : undefined,
        "bestRating": "5",
        "worstRating": "1",
      },
    }));
  }
  setJsonLd(jsonLd);
}

function updateSEOForPage(pageName) {
  const pages = {
    home: { title: "By Their Fruit \u2014 Church Reviews by the Congregation", desc: "Real reviews from real congregants. Honest, structured feedback to help churches grow and help families find home. Matthew 7:16." },
    discover: { title: "Find a Church Near You | By Their Fruit", desc: "Search and discover churches by location, denomination, and ratings. Read honest reviews from real congregants across 10 categories." },
    rate: { title: "Share Your Church Experience | By Their Fruit", desc: "Rate and review your church across 10 meaningful categories. Help others find a church they can trust." },
    about: { title: "How It Works | By Their Fruit", desc: "Learn how By Their Fruit helps church-goers share honest reviews and helps churches grow through constructive feedback." },
    blog: { title: "Church Life Blog | By Their Fruit", desc: "Guides, tips, and insights on finding the right church, understanding church culture, and making the most of your church experience." },
  };
  const p = pages[pageName] || pages.home;
  document.title = p.title;
  updateMeta("description", p.desc);
  updateMeta("og:title", p.title);
  updateMeta("og:description", p.desc);
  updateMeta("og:url", pageName === "home" ? "https://bytheirfruit.church" : `https://bytheirfruit.church/#/${pageName}`);
  updateMeta("og:type", "website");
  updateMeta("og:site_name", "By Their Fruit");
  updateMeta("twitter:title", p.title);
  updateMeta("twitter:description", p.desc);
  // Clear church-specific JSON-LD
  const el = document.getElementById("btf-jsonld");
  if (el) el.remove();
}

function dbReviewToLocal(r) {
  const scores = {};
  const comments = {};
  SCORE_FIELDS.forEach(f => {
    if (r[`score_${f}`] != null) scores[f] = r[`score_${f}`];
    if (r[`comment_${f}`]) comments[f] = r[`comment_${f}`];
  });
  return {
    id: r.id,
    author: r.profiles?.display_name || "Anonymous",
    role: r.reviewer_role,
    date: new Date(r.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    text: r.text,
    scores,
    comments,
    _reviewerId: r.user_id,
    _createdAt: r.created_at,
    responses: (r.church_responses || []).map(resp => ({
      id: resp.id,
      text: resp.text,
      author: resp.profiles?.display_name || "Church Admin",
      date: new Date(resp.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    })),
  };
}

// Tiered name display: "public" = first name only, "church" = first + last initial, "admin" = full name
function displayName(name, level = "public") {
  if (!name) return "Anonymous";
  if (level === "admin") return name;
  const parts = name.trim().split(/\s+/);
  if (level === "church" && parts.length >= 2) return `${parts[0]} ${parts[1].charAt(0)}.`;
  return parts[0];
}

/* --- HELPERS --- */
const avg = (s) => { const v = Object.values(s); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
const hasScores = (c) => c.totalReviews >= MIN_REVIEWS_FOR_SCORE && Object.keys(c.scores).length > 0;
/* Smooth HSL-interpolated score colors: 1.0→red, 2.5→amber, 4.0+→green */
function scoreHue(s) {
  // Clamp 1–5, then map to hue: 0 (red) → 38 (amber) → 142 (green)
  const t = Math.max(0, Math.min(1, (s - 1) / 4));
  // Use an easing curve so green starts earlier and red only appears for truly low scores
  const eased = t * t * (3 - 2 * t); // smoothstep
  return eased * 142; // 0=red, ~38=amber, 142=green
}
const scoreColor = (s) => `hsl(${scoreHue(s)}, 72%, 38%)`;
const scoreBg = (s) => `hsl(${scoreHue(s)}, 50%, ${T === DARK ? '12%' : '96%'})`;
const scoreBorder2 = (s) => `hsl(${scoreHue(s)}, 45%, ${T === DARK ? '22%' : '82%'})`;

/* --- RESPONSIVE --- */
const responsiveCSS = `
@media(max-width:768px){
  .btf-grid-3{grid-template-columns:1fr!important}
  .btf-grid-2{grid-template-columns:1fr!important}
  .btf-profile-grid{grid-template-columns:1fr!important}
  .btf-hero-title{font-size:36px!important}
  .btf-hero-buttons{flex-direction:column!important;align-items:stretch!important}
  .btf-desktop-nav{display:none!important}
  .btf-mobile-nav{display:flex!important}
  .btf-cat-grid{grid-template-columns:1fr!important}
  .btf-score-mini{display:none!important}
}`;

/* --- COMPONENTS --- */
function Logo({ size = 17, color = T.text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
      <svg width={size * 1.35} height={size * 1.35} viewBox="0 0 28 28" fill="none">
        <rect x="1" y="1" width="26" height="26" rx="7" stroke={color} strokeWidth="1.5" />
        <path d="M14 7 C14 7, 9 13, 9 17 C9 19.76 11.24 22 14 22 C16.76 22 19 19.76 19 17 C19 13 14 7 14 7Z" fill={color} opacity="0.85" />
      </svg>
      <span style={{ fontSize: size, fontFamily: T.heading, fontWeight: 700, color, letterSpacing: "-0.04em" }}>By Their Fruit</span>
    </div>
  );
}

function FadeIn({ children, delay = 0, style }) {
  const [v, setV] = useState(false);
  useEffect(() => { const t = setTimeout(() => setV(true), delay); return () => clearTimeout(t); }, [delay]);
  return <div style={{ opacity: v ? 1 : 0, transform: v ? "translateY(0)" : "translateY(10px)", transition: "opacity 0.5s ease, transform 0.5s ease", ...style }}>{children}</div>;
}

function ScoreBar({ label, score }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW((score / 5) * 100), 150); return () => clearTimeout(t); }, [score]);
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, fontFamily: T.body, fontWeight: 500, color: T.text }}>{label}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: T.heading, color: scoreColor(score) }}>{score.toFixed(1)}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: T.surfaceAlt, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 2, width: `${w}%`, background: scoreColor(score), transition: "width 0.7s cubic-bezier(0.16,1,0.3,1)", opacity: 0.75 }} />
      </div>
    </div>
  );
}

function Chip({ children, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 13px", borderRadius: T.radiusFull, fontSize: 12, fontFamily: T.body, fontWeight: 500,
      background: active ? T.text : T.surface, color: active ? T.bg : T.textSoft,
      border: `1.5px solid ${active ? T.text : T.border}`, cursor: "pointer", transition: "all 0.15s",
    }}>{children}</button>
  );
}

/* --- RATING SLIDER WITH OPTIONAL COMMENT + NOT SURE --- */
function RatingSlider({ label, desc, value, onChange, comment, onCommentChange, skipped, onSkipToggle }) {
  const starValue = Math.round(value);
  const sliderColor = value >= 1 ? scoreColor(value) : T.border;
  const fillPct = value > 0 ? ((value - 1) / 4) * 100 : 0;
  const [showComment, setShowComment] = useState(!!comment);

  return (
    <div style={{
      padding: "16px 18px", borderRadius: T.radiusSm, background: T.surface,
      border: `1.5px solid ${skipped ? T.borderLight : (value > 0 ? sliderColor + "44" : T.border)}`,
      transition: "border-color 0.2s, opacity 0.2s",
      opacity: skipped ? 0.55 : 1,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: skipped ? T.textMuted : T.text }}>{label}</div>
          <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.35, marginTop: 2 }}>{desc}</div>
        </div>
        {!skipped && value > 0 && (
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: T.heading, color: sliderColor, lineHeight: 1, minWidth: 32, textAlign: "right" }}>{value.toFixed(1)}</div>
        )}
      </div>

      <div
        onClick={() => onSkipToggle(!skipped)}
        style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
          border: `1.5px solid ${skipped ? T.accent : T.border}`,
          background: skipped ? T.accent : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s",
        }}>
          {skipped && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
        </div>
        <span style={{ fontSize: 12, fontWeight: 500, color: skipped ? T.accent : T.textMuted }}>
          Not sure — I can't speak to this yet
        </span>
      </div>

      {!skipped && (
        <>
          <div style={{ display: "flex", gap: 3, margin: "6px 0 8px" }}>
            {[1, 2, 3, 4, 5].map(n => (
              <span key={n} onClick={() => onChange(n)} style={{ fontSize: 22, cursor: "pointer", color: n <= starValue ? "#f59e0b" : T.border, transition: "color 0.15s" }}>★</span>
            ))}
          </div>
          <div style={{ position: "relative", height: 28, display: "flex", alignItems: "center" }}>
            <div style={{ position: "absolute", left: 0, right: 0, height: 8, borderRadius: 4, background: T.surfaceAlt, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, width: `${fillPct}%`, background: `linear-gradient(90deg, ${sliderColor}, ${sliderColor})`, transition: "width 0.15s ease" }} />
            </div>
            <input type="range" min="1" max="5" step="0.1" value={value || 1} onChange={e => onChange(parseFloat(e.target.value))}
              style={{ position: "absolute", left: -2, right: -2, top: 0, width: "calc(100% + 4px)", height: 28, opacity: 0, cursor: "pointer", margin: 0 }} />
            {value > 0 && (
              <div style={{ position: "absolute", left: `${fillPct}%`, transform: "translateX(-50%)", width: 20, height: 20, borderRadius: 10, background: sliderColor, border: "2.5px solid #fff", boxShadow: `0 1px 4px ${sliderColor}44`, transition: "left 0.15s ease", pointerEvents: "none" }} />
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, marginBottom: value > 0 ? 6 : 0 }}>
            <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 500 }}>Poor</span>
            <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 500 }}>Excellent</span>
          </div>
          {value > 0 && value <= 2.9 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.amber, marginBottom: 4 }}>A comment is required for scores below 3.0</div>
              <input
                value={comment || ""} onChange={e => onCommentChange(e.target.value)}
                placeholder={`What specifically could improve about ${label.toLowerCase().split("&")[0].trim()}?`}
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: T.radiusSm,
                  fontSize: 12, border: `1.5px solid ${!comment?.trim() ? T.amber : T.borderLight}`, background: T.surfaceAlt,
                  color: T.text, outline: "none", fontFamily: T.body, boxSizing: "border-box",
                }}
              />
            </div>
          )}
          {value > 2.9 && !showComment && (
            <button onClick={() => setShowComment(true)} style={{
              marginTop: 4, fontSize: 11, color: T.accent, background: "none", border: "none",
              cursor: "pointer", fontFamily: T.body, fontWeight: 600, padding: 0,
            }}>+ Add a comment about {label.split("&")[0].split("/")[0].trim().toLowerCase()}</button>
          )}
          {value > 2.9 && showComment && (
            <input
              value={comment || ""} onChange={e => onCommentChange(e.target.value)}
              placeholder={`Optional: what specifically about ${label.toLowerCase().split("&")[0].trim()}?`}
              style={{
                width: "100%", marginTop: 6, padding: "8px 12px", borderRadius: T.radiusSm,
                fontSize: 12, border: `1px solid ${T.borderLight}`, background: T.surfaceAlt,
                color: T.text, outline: "none", fontFamily: T.body, boxSizing: "border-box",
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

/* --- SOCIAL ICONS --- */
function GoogleIcon() { return <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>; }

function FacebookIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>; }
function MicrosoftIcon() { return <svg width="18" height="18" viewBox="0 0 24 24"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="13" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="13" width="10" height="10" fill="#00A4EF"/><rect x="13" y="13" width="10" height="10" fill="#FFB900"/></svg>; }

/* --- AUTH MODAL (REAL SUPABASE AUTH) --- */
function AuthModal({ onClose, onAuth, mode: im }) {
  const [mode, setMode] = useState(im || "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmMsg, setConfirmMsg] = useState("");

  const socialLogin = async (provider) => {
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) setError(error.message);
    } catch (e) {
      setError("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const emailAuth = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError("");
    try {
      if (mode === "signup") {
        if (!name) { setError("Name is required"); setLoading(false); return; }
        if (password.length < 6) { setError("Password must be at least 6 characters"); setLoading(false); return; }
        if (password !== confirmPassword) { setError("Passwords do not match"); setLoading(false); return; }
        if (!zipCode || !/^\d{5}(-\d{4})?$/.test(zipCode.trim())) { setError("Please enter a valid zip code"); setLoading(false); return; }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name, display_name: name, zip_code: zipCode.trim(), ...(phone ? { phone } : {}), ...(address ? { address } : {}) },
          },
        });
        if (error) {
          const msg = error.message.toLowerCase().includes("sending confirmation") || error.message.toLowerCase().includes("email")
            ? "Unable to send confirmation email. Please try signing up with Google or Microsoft instead, or try again in a few minutes."
            : error.message;
          setError(msg); setLoading(false); return;
        }
        if (data?.user?.identities?.length === 0) {
          setError("An account with this email already exists.");
          setLoading(false);
          return;
        }
        // Check if email confirmation is required
        if (data?.user && !data.session) {
          setConfirmMsg("We sent a confirmation link to your email. Please check your inbox (and spam folder) and click the link, then come back and sign in.");
          setError("");
          setMode("signin");
          setLoading(false);
          return;
        }
        // If auto-confirmed, the auth state change will handle it
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(error.message); setLoading(false); return; }
      }
      // Auth state listener will handle the rest
    } catch (e) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, background: T.surface, borderRadius: 16, padding: "36px 32px", boxShadow: "0 24px 48px rgba(0,0,0,0.12)", animation: "modalIn 0.25s ease" }}>
        <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.95) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><Logo size={15} /></div>
          <h2 style={{ fontSize: 22, fontFamily: T.heading, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.03em" }}>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
          <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>{mode === "signin" ? "Sign in to share your experience" : "Sign up to share your experience"}</p>
        </div>
        {confirmMsg && (
          <div style={{ padding: "10px 14px", borderRadius: T.radiusSm, background: T.greenSoft, border: `1px solid ${T.greenBorder}`, color: T.green, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>{confirmMsg}</div>
        )}
        {error && (
          <div style={{ padding: "10px 14px", borderRadius: T.radiusSm, background: T.redSoft, border: `1px solid ${T.redBorder}`, color: T.red, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>{error}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {[
            { p: "google", l: "Continue with Google", i: <GoogleIcon /> },
            { p: "azure", l: "Continue with Microsoft", i: <MicrosoftIcon /> },
          ].map(({ p, l, i }) => (
            <button key={p} onClick={() => socialLogin(p)} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 16px", borderRadius: T.radiusSm, fontSize: 13.5, fontWeight: 500, fontFamily: T.body, background: T.surface, color: T.text, border: `1.5px solid ${T.border}`, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1, transition: "all 0.15s" }}>{i}{l}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}><div style={{ flex: 1, height: 1, background: T.border }} /><span style={{ fontSize: 11, color: T.textMuted, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>or</span><div style={{ flex: 1, height: 1, background: T.border }} /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {mode === "signup" && <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, fontSize: 13.5, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} />}
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" type="email" style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, fontSize: 13.5, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} />
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" onKeyDown={e => mode === "signin" && e.key === "Enter" && emailAuth()} style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, fontSize: 13.5, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} />
          {mode === "signup" && <input value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm password" type="password" style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, fontSize: 13.5, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} />}
          {mode === "signup" && <input value={zipCode} onChange={e => setZipCode(e.target.value)} placeholder="Zip code *" maxLength={10} style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, fontSize: 13.5, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} />}
          {mode === "signup" && <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone number (optional)" type="tel" style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, fontSize: 13.5, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} />}
          {mode === "signup" && <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Address (optional)" style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, fontSize: 13.5, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} />}
          <button onClick={emailAuth} disabled={loading || !email || !password || (mode === "signup" && (!name || !confirmPassword || !zipCode))} style={{ padding: "11px", borderRadius: T.radiusSm, fontSize: 14, fontWeight: 600, background: T.text, color: T.bg, border: "none", cursor: "pointer", fontFamily: T.body, opacity: (loading || !email || !password) ? 0.35 : 1 }}>{loading ? "..." : (mode === "signin" ? "Sign In" : "Create Account")}</button>
        </div>
        <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: T.textMuted }}>{mode === "signin" ? "No account? " : "Have an account? "}<span onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setConfirmPassword(""); setPhone(""); setAddress(""); setZipCode(""); }} style={{ color: T.accent, fontWeight: 600, cursor: "pointer" }}>{mode === "signin" ? "Sign Up" : "Sign In"}</span></div>
      </div>
    </div>
  );
}

/* --- PROFILE COMPLETE MODAL (Demographics) --- */
function ProfileCompleteModal({ userId, onClose }) {
  const [gender, setGender] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [incomeBracket, setIncomeBracket] = useState("");
  const [saving, setSaving] = useState(false);

  const selectStyle = (selected) => ({
    padding: "8px 14px", borderRadius: T.radiusFull, fontSize: 12.5, fontWeight: 500,
    fontFamily: T.body, cursor: "pointer", transition: "all 0.15s",
    background: selected ? T.text : T.surfaceAlt, color: selected ? T.bg : T.textSoft,
    border: `1px solid ${selected ? T.text : T.border}`,
  });

  const handleSave = async () => {
    setSaving(true);
    const updates = {};
    if (gender) updates.gender = gender;
    if (ageRange) updates.age_range = ageRange;
    if (incomeBracket) updates.income_bracket = incomeBracket;
    if (Object.keys(updates).length > 0) {
      await supabase.from("profiles").update(updates).eq("id", userId);
    }
    setSaving(false);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: T.surface, borderRadius: 16, padding: "36px 32px", boxShadow: "0 24px 48px rgba(0,0,0,0.12)", animation: "modalIn 0.25s ease" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.03em" }}>Complete Your Profile</h2>
          <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>Help us serve you better (all fields are optional)</p>
        </div>

        {/* Gender */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Gender</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["Male", "Female", "Prefer not to answer"].map(opt => (
              <button key={opt} onClick={() => setGender(opt)} style={selectStyle(gender === opt)}>{opt}</button>
            ))}
          </div>
        </div>

        {/* Age Range */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Age Range</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["18-24", "25-34", "35-44", "45-54", "55-64", "65+", "Prefer not to answer"].map(opt => (
              <button key={opt} onClick={() => setAgeRange(opt)} style={selectStyle(ageRange === opt)}>{opt}</button>
            ))}
          </div>
        </div>

        {/* Income */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Household Income</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["Under $25k", "$25k-$50k", "$50k-$75k", "$75k-$100k", "$100k-$150k", "$150k+", "Prefer not to answer"].map(opt => (
              <button key={opt} onClick={() => setIncomeBracket(opt)} style={selectStyle(incomeBracket === opt)}>{opt}</button>
            ))}
          </div>
        </div>

        {/* Privacy Disclaimer */}
        <div style={{ padding: "12px 14px", borderRadius: T.radiusSm, background: T.surfaceAlt, border: `1px solid ${T.border}`, marginBottom: 20 }}>
          <p style={{ fontSize: 11.5, color: T.textMuted, lineHeight: 1.6, margin: 0 }}>
            We will never sell your personal information. We collect anonymous demographic data to help churches better understand and serve their communities. Your individual responses are kept confidential and are only used in aggregate.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 1, padding: "11px", borderRadius: T.radiusSm, fontSize: 14, fontWeight: 600,
            background: T.text, color: T.bg, border: "none", cursor: saving ? "wait" : "pointer",
            fontFamily: T.body, opacity: saving ? 0.6 : 1,
          }}>{saving ? "Saving..." : "Save & Continue"}</button>
          <button onClick={onClose} style={{
            padding: "11px 20px", borderRadius: T.radiusSm, fontSize: 14, fontWeight: 500,
            background: "transparent", color: T.textMuted, border: `1px solid ${T.border}`,
            cursor: "pointer", fontFamily: T.body,
          }}>Skip</button>
        </div>
      </div>
    </div>
  );
}

function UserMenu({ user, onSignOut, onNavigate, onSaved }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 12px 5px 5px", borderRadius: T.radiusFull, background: T.surfaceAlt, border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.body, fontSize: 12.5, fontWeight: 500, color: T.text }}>
        <div style={{ width: 24, height: 24, borderRadius: 12, background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: T.heading }}>{user.avatar}</div>
        {user.name.split(" ")[0]}
      </button>
      {open && <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: T.surface, border: `1.5px solid ${T.border}`, borderRadius: T.radiusSm, padding: "6px", minWidth: 160, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", zIndex: 200 }}>
        <div style={{ padding: "8px 12px", fontSize: 12, color: T.textMuted }}>{user.email}</div>
        <div style={{ height: 1, background: T.border, margin: "4px 0" }} />
        <button onClick={() => { onNavigate("myprofile"); setOpen(false); }} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 13, fontWeight: 500, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", color: T.text, fontFamily: T.body }}>My Profile</button>
        <button onClick={() => { if (onSaved) onSaved(); setOpen(false); }} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 13, fontWeight: 500, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", color: T.text, fontFamily: T.body }}>Saved Churches</button>
        <div style={{ height: 1, background: T.border, margin: "4px 0" }} />
        <button onClick={() => { onSignOut(); setOpen(false); }} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 13, fontWeight: 500, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", color: T.red, fontFamily: T.body }}>Sign Out</button>
      </div>}
    </div>
  );
}

/* --- REVIEW CARD WITH FLAG + CATEGORY COMMENTS --- */
function ReviewCard({ rev, delay = 0, userId, nameLevel = "public", onDelete }) {
  const [flagged, setFlagged] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [likeCount, setLikeCount] = useState(rev.likeCount || 0);
  const [liked, setLiked] = useState(rev.userLiked || false);
  const [liking, setLiking] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isOwnReview = userId && rev._reviewerId === userId;

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.rpc("soft_delete_review", { p_review_id: rev.id });
    if (!error && onDelete) onDelete(rev.id);
    setDeleting(false);
    setShowDeleteConfirm(false);
  };
  const hasComments = rev.comments && Object.keys(rev.comments).length > 0;

  const handleLike = async () => {
    if (!userId || liking) return;
    setLiking(true);
    if (liked) {
      // Unlike
      await supabase.from("review_likes").delete().eq("review_id", rev.id).eq("user_id", userId);
      setLiked(false);
      setLikeCount(prev => Math.max(0, prev - 1));
    } else {
      // Like
      const { error } = await supabase.from("review_likes").insert({ review_id: rev.id, user_id: userId });
      if (!error) {
        setLiked(true);
        setLikeCount(prev => prev + 1);
      }
    }
    setLiking(false);
  };

  const handleFlag = async () => {
    if (!userId) return;
    try {
      await supabase.from("review_flags").insert({
        review_id: rev.id,
        flagged_by: userId,
        reason: "inappropriate",
      });
      setFlagged(true);
    } catch (e) {
      console.error("Flag failed:", e);
    }
  };

  return (
    <FadeIn delay={delay}>
      <div style={{ padding: "20px 22px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}`, marginBottom: 8, position: "relative" }}>
        {rev.pending && (
          <div style={{ position: "absolute", top: 12, right: 14, padding: "3px 8px", borderRadius: T.radiusFull, background: T.amberSoft, border: `1px solid ${T.amberBorder}`, fontSize: 10, fontWeight: 600, color: T.amber }}>Under review</div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 13, background: rev.pending ? T.accent : T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: rev.pending ? "#fff" : T.textMuted, fontFamily: T.heading, border: rev.pending ? "none" : `1px solid ${T.border}` }}>{displayName(rev.author, nameLevel).charAt(0)}</div>
            <div>
              <span style={{ fontSize: 13.5, fontWeight: 700, fontFamily: T.heading }}>{displayName(rev.author, nameLevel)}</span>
              <span style={{ fontSize: 12, color: T.textMuted, marginLeft: 8 }}>{rev.role}</span>
            </div>
          </div>
          <span style={{ fontSize: 11, color: T.textMuted }}>{rev.date}</span>
        </div>
        <p style={{ fontSize: 13.5, color: T.textSoft, lineHeight: 1.7, margin: "0 0 12px" }}>{rev.text}</p>

        {rev.photos && rev.photos.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {rev.photos.map(photo => (
              <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", width: 100, height: 100, borderRadius: T.radiusSm, overflow: "hidden", border: `1.5px solid ${T.border}`, flexShrink: 0 }}>
                <img src={photo.url} alt={photo.caption || "Review photo"} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </a>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {Object.entries(rev.scores).map(([key, val]) => {
            const cat = CATEGORIES.find(c => c.id === key);
            return (
              <span key={key} style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: T.radiusFull, background: scoreBg(val), border: `1px solid ${scoreBorder2(val)}`, color: scoreColor(val), fontWeight: 700, fontFamily: T.heading }}>
                {cat?.label.split("&")[0].split("/")[0].trim()} {val}
              </span>
            );
          })}
        </div>

        {hasComments && (
          <div style={{ marginTop: 10 }}>
            <button onClick={() => setExpanded(!expanded)} style={{ fontSize: 11, fontWeight: 600, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: T.body, padding: 0 }}>
              {expanded ? "Hide" : "View"} category comments ({Object.keys(rev.comments).length})
            </button>
            {expanded && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {Object.entries(rev.comments).filter(([, v]) => v).map(([key, comment]) => {
                  const cat = CATEGORIES.find(c => c.id === key);
                  const score = rev.scores[key];
                  return (
                    <div key={key} style={{ padding: "8px 12px", borderRadius: T.radiusSm, background: T.surfaceAlt, border: `1px solid ${T.borderLight}`, fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: T.text }}>{cat?.label}</span>
                      {score && <span style={{ color: scoreColor(score), fontWeight: 700, marginLeft: 6, fontFamily: T.heading, fontSize: 11 }}>{score}/5</span>}
                      <div style={{ color: T.textSoft, marginTop: 2, lineHeight: 1.5 }}>{comment}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Church Responses */}
        {rev.responses && rev.responses.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.borderLight}` }}>
            {rev.responses.map(resp => (
              <div key={resp.id} style={{ padding: "10px 14px", borderRadius: T.radiusSm, background: T.accentSoft, border: `1px solid ${T.accentBorder}`, marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>Church Response</span>
                  <span style={{ fontSize: 11, color: T.textMuted, marginLeft: "auto" }}>{resp.date}</span>
                </div>
                <p style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.6, margin: 0 }}>{resp.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* Response form (passed via onRespond prop) */}
        {rev._showResponseForm && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.borderLight}` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.accent, marginBottom: 6 }}>Respond as church leadership:</div>
            <textarea value={rev._responseText || ""} onChange={e => rev._onResponseChange(e.target.value)} rows={3} placeholder="Write a thoughtful response to this experience..." style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.accentBorder}`, background: T.accentSoft, color: T.text, outline: "none", fontFamily: T.body, resize: "vertical" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button onClick={() => rev._onCancelResponse()} style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.surface, color: T.textSoft, border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>Cancel</button>
              <button onClick={() => rev._onSubmitResponse()} disabled={rev._responseSubmitting} style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, opacity: rev._responseSubmitting ? 0.5 : 1 }}>{rev._responseSubmitting ? "Posting..." : "Post Response"}</button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {rev._isChurchOwner && !rev._showResponseForm && rev.responses?.length === 0 && (
              <button onClick={() => rev._onStartResponse()} style={{ fontSize: 11, fontWeight: 600, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: T.body, padding: 0 }}>
                Reply as church
              </button>
            )}
            {/* Like / Helpful button */}
            <button onClick={handleLike} disabled={!userId || liking} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: liked ? T.accent : T.textMuted, background: liked ? T.accentSoft : "none", border: liked ? `1px solid ${T.accentBorder}` : "1px solid transparent", borderRadius: T.radiusFull, cursor: userId ? "pointer" : "default", fontFamily: T.body, padding: "3px 10px", transition: "all 0.15s", opacity: !userId ? 0.4 : 1 }}
              onMouseEnter={e => { if (userId && !liked) e.currentTarget.style.color = T.accent; }}
              onMouseLeave={e => { if (!liked) e.currentTarget.style.color = T.textMuted; }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill={liked ? T.accent : "none"} stroke={liked ? T.accent : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>
              Helpful{likeCount > 0 ? ` (${likeCount})` : ""}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isOwnReview && (
              <button onClick={() => setShowDeleteConfirm(true)} style={{ fontSize: 11, color: T.textMuted, background: "none", border: "none", cursor: "pointer", fontFamily: T.body, padding: 0, transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = T.red} onMouseLeave={e => e.currentTarget.style.color = T.textMuted}>
                Delete
              </button>
            )}
            {!isOwnReview && (flagged ? (
              <span style={{ fontSize: 11, color: T.textMuted, fontStyle: "italic" }}>Flagged for review</span>
            ) : (
              <button onClick={handleFlag} style={{ fontSize: 11, color: T.textMuted, background: "none", border: "none", cursor: "pointer", fontFamily: T.body, padding: 0, transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = T.red} onMouseLeave={e => e.currentTarget.style.color = T.textMuted}>
                Flag as inappropriate
              </button>
            ))}
          </div>
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div style={{ marginTop: 12, padding: "14px 16px", borderRadius: T.radiusSm, background: T.redSoft, border: `1px solid ${T.redBorder}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.red, marginBottom: 6 }}>Delete this review?</div>
            <div style={{ fontSize: 12, color: T.textSoft, marginBottom: 12, lineHeight: 1.5 }}>This will permanently remove your review from the church page. This action cannot be undone.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting} style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.surface, color: T.textSoft, border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.red, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, opacity: deleting ? 0.5 : 1 }}>{deleting ? "Deleting..." : "Yes, Delete"}</button>
            </div>
          </div>
        )}
      </div>
    </FadeIn>
  );
}

/* ===== MAIN ===== */
export default function ByTheirFruit() {
  // Wire up dark/light mode with manual toggle + system detection
  const { theme, isDark, mode: themeMode, setTheme } = useTheme();
  T = theme;

  const [page, setPage] = useState("home");
  const [selectedChurch, setSelectedChurch] = useState(null);
  const [churches, setChurches] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDenom, setFilterDenom] = useState("All");
  const [filterState, setFilterState] = useState("All");
  const [filterCity, setFilterCity] = useState("");
  const [filterZip, setFilterZip] = useState("");
  const [nearMeActive, setNearMeActive] = useState(false);
  const [nearMeLocation, setNearMeLocation] = useState(null);
  const [nearMeLoading, setNearMeLoading] = useState(false);
  const [nearMeDistances, setNearMeDistances] = useState({});
  const [userGeoLocation, setUserGeoLocation] = useState(null);
  const [geoRequested, setGeoRequested] = useState(false);
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileComplete, setShowProfileComplete] = useState(false);
  const [pendingReview, setPendingReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Toast notification system
  const [toasts, setToasts] = useState([]);
  const showToast = useCallback((message, type = "info") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  // Newsletter / email signup
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);
  const [newsletterDone, setNewsletterDone] = useState(false);

  // Abuse report modal
  const [showAbuseModal, setShowAbuseModal] = useState(false);
  const [abuseData, setAbuseData] = useState({ reportType: "", churchName: "", churchCity: "", churchState: "", description: "", contactMethod: "" });
  const [abuseSubmitting, setAbuseSubmitting] = useState(false);
  const [abuseSubmitted, setAbuseSubmitted] = useState(false);

  // Platform stats for social proof
  const [platformStats, setPlatformStats] = useState({ churches: 0, reviews: 0, users: 0 });

  useEffect(() => { setMounted(true); }, []);

  // Hash-based routing for shareable URLs and back button
  const navigate = useCallback((newPage, church = null) => {
    setPage(newPage);
    setSelectedChurch(church);
    setMobileMenuOpen(false);
    if (church) {
      const slug = church.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
      // Use real path for church pages (SSR-friendly for crawlers + OG tags)
      window.history.pushState(null, "", `/church/${church.id}/${slug}`);
      updateSEOForChurch(church);
    } else if (newPage !== "home") {
      window.history.pushState(null, "", `#/${newPage}`);
      updateSEOForPage(newPage);
    } else {
      window.history.pushState(null, "", window.location.pathname === "/" ? "/" : "/");
      updateSEOForPage("home");
    }
  }, []);

  // Parse hash or path on mount and handle back/forward
  useEffect(() => {
    const handleHash = async () => {
      const hash = window.location.hash;
      const path = window.location.pathname;
      // Skip if hash contains Supabase auth tokens (email confirmation redirect)
      if (hash.includes("access_token=") || hash.includes("type=signup") || hash.includes("type=recovery")) return;

      // Support real path: /church/[id]/[slug]
      const pathMatch = path.match(/^\/church\/([^/]+)/);
      const hashChurchMatch = hash.startsWith("#/church/") ? hash.split("/")[2] : null;
      const churchId = pathMatch ? pathMatch[1] : hashChurchMatch;

      if (churchId) {
          const { data } = await supabase.from("churches").select("*").eq("id", churchId).single();
          if (data) {
            const church = dbChurchToLocal(data);
            setPage("profile");
            setSelectedChurch(church);
            updateSEOForChurch(church);
            // Ensure church is in the churches array so fetchReviewsForChurch can update it
            setChurches(prev => prev.some(c => c.id === church.id) ? prev : [...prev, church]);
            fetchReviewsForChurch(churchId);
            if (user) checkClaimStatus(churchId, user.id);
            // If we came from a hash URL, update to real path
            if (hashChurchMatch && !pathMatch) {
              const slug = church.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
              window.history.replaceState(null, "", `/church/${churchId}/${slug}`);
            }
          }
          return;
      }
      if (hash === "#/discover") {
        setPage("discover");
      } else if (hash === "#/about") {
        setPage("about");
      } else if (hash === "#/rate") {
        setPage("rate");
      } else if (hash === "#/saved") {
        setPage("saved");
      } else if (hash === "#/dashboard") {
        setPage("dashboard");
      } else if (hash === "#/terms") {
        setPage("terms");
      } else if (hash === "#/privacy") {
        setPage("privacy");
      } else if (hash === "#/myprofile") {
        setPage("myprofile");
      } else if (hash === "#/for-churches") {
        setPage("for-churches");
      } else if (hash.startsWith("#/blog")) {
        /* Blog temporarily disabled — redirect to home */
        setPage("home");
      }
    };
    handleHash();
    window.addEventListener("popstate", handleHash);
    return () => window.removeEventListener("popstate", handleHash);
  }, []);

  // Rate flow
  const [rateStep, setRateStep] = useState(0);
  const [rateChurch, setRateChurch] = useState(null);
  const [rateSearch, setRateSearch] = useState("");
  const [rateScores, setRateScores] = useState({});
  const [rateComments, setRateComments] = useState({});
  const [rateSkipped, setRateSkipped] = useState({});
  const [rateText, setRateText] = useState("");
  const [rateRole, setRateRole] = useState("");
  const [rateLastVisited, setRateLastVisited] = useState("");
  const [showAddChurch, setShowAddChurch] = useState(false);
  const [addData, setAddData] = useState({ name: "", address: "", city: "", state: "FL", denomination: "", size: "", serviceTimes: "" });
  const [submitting, setSubmitting] = useState(false);

  // Photo upload for reviews
  const [ratePhotos, setRatePhotos] = useState([]); // Array of { file, preview, uploading }
  const MAX_REVIEW_PHOTOS = 3;

  // Geolocation for review submissions
  const [reviewerLocation, setReviewerLocation] = useState(null); // { lat, lng }
  const [locationStatus, setLocationStatus] = useState("idle"); // idle | requesting | granted | denied | unavailable

  // Track user reviews: { churchId: { review, postedAt } }
  const [userReviews, setUserReviews] = useState({});
  const [isEditing, setIsEditing] = useState(false);

  // Mobile menu
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Church claiming
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimData, setClaimData] = useState({
    fullName: "", roleAtChurch: "", workEmail: "", phone: "", message: "",
    serviceDays: [{ day: "Sunday", times: "9:00 AM, 11:00 AM" }],
    avgAttendance: "", staffCount: "", volunteerCount: "", campusCount: "1",
    programs: [],
    website: "", churchEmail: "", churchPhone: "",
    facebook: "", instagram: "", youtube: "", livestream: "",
    pastorName: "", yearFounded: "", description: ""
  });
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimStatus, setClaimStatus] = useState(null); // null | 'pending' | 'approved' | 'rejected'
  const [claimStep, setClaimStep] = useState("form"); // "form" | "verify" | "done"
  const [verifyCodeInput, setVerifyCodeInput] = useState("");
  const [verifyError, setVerifyError] = useState("");
  // Church owner response
  const [responseText, setResponseText] = useState("");
  const [respondingTo, setRespondingTo] = useState(null);
  const [responseSubmitting, setResponseSubmitting] = useState(false);
  // Reviewer history (for church owners to see a reviewer's other experiences)
  const [reviewerHistory, setReviewerHistory] = useState(null); // { userId, name, reviews: [] }
  const [reviewerHistoryLoading, setReviewerHistoryLoading] = useState(false);
  // Church report modal
  const [showReportModal, setShowReportModal] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [reportData, setReportData] = useState({ reason: "", description: "" });
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  // My Churches state
  const [myChurchesData, setMyChurchesData] = useState({ reviewed: [], claimed: [] });
  const [myChurchesLoading, setMyChurchesLoading] = useState(false);

  const [ownerDemographics, setOwnerDemographics] = useState(null);
  const [ownerReviews, setOwnerReviews] = useState([]);
  const [dashboardBenchmarks, setDashboardBenchmarks] = useState({ national: {}, state: {}, city: {} });
  const [dashboardTrends, setDashboardTrends] = useState([]);
  const [dashboardTab, setDashboardTab] = useState("overview");
  const [benchmarkLevel, setBenchmarkLevel] = useState("city");
  const [expandedReview, setExpandedReview] = useState(null);

  // Favorites state
  const [userFavorites, setUserFavorites] = useState(new Set());
  const [savedChurches, setSavedChurches] = useState(null);
  const [hasClaimed, setHasClaimed] = useState(false);


  /* --- SEARCH CHURCHES FROM DB (server-side) --- */
  const [searchLoading, setSearchLoading] = useState(false);
  const [totalChurchCount, setTotalChurchCount] = useState(0);
  const [discoverSearchQuery, setDiscoverSearchQuery] = useState("");

  const fetchChurches = useCallback(async () => {
    try {
      const { count, error } = await supabase
        .from("churches")
        .select("*", { count: "exact", head: true });
      if (error) console.error("fetchChurches error:", error);
      setTotalChurchCount(count || 0);

      // Fetch platform stats for social proof
      const [reviewRes, userRes] = await Promise.all([
        supabase.from("reviews").select("*", { count: "exact", head: true }).eq("status", "published"),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
      ]);
      setPlatformStats({ churches: count || 0, reviews: reviewRes.count || 0, users: userRes.count || 0 });
    } catch (err) {
      console.error("fetchChurches exception:", err);
      setTotalChurchCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const searchChurchesDB = useCallback(async (query, denomination, state, city, zip, _retried) => {
    if (!query && (!denomination || denomination === "All") && (!state || state === "All") && !city && !zip) {
      setChurches([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    try {
      // If a full 5-digit zip is entered, geocode it and do proximity search
      if (zip && zip.length === 5 && !query && !city) {
        const coords = await geocodeZip(zip);
        if (coords) {
          // Fetch churches with coordinates, apply denomination/state filters
          let q = supabase.from("churches").select("*")
            .not("latitude", "is", null)
            .not("longitude", "is", null);
          if (denomination && denomination !== "All") q = q.eq("denomination", denomination);
          if (state && state !== "All") q = q.eq("state", state);
          q = q.limit(500);
          const { data, error } = await q;
          if (error) {
            console.error("Zip proximity error:", error);
            if (!_retried) { await supabase.auth.getSession(); return searchChurchesDB(query, denomination, state, city, zip, true); }
          }
          if (!error && data) {
            const withDist = data.map(c => ({
              ...c,
              _dist: haversineDistance(coords.lat, coords.lng, c.latitude, c.longitude)
            })).sort((a, b) => a._dist - b._dist).slice(0, 50);
            const distMap = {};
            withDist.forEach(c => { distMap[c.id] = c._dist; });
            setNearMeDistances(distMap);
            setNearMeLocation(coords);
            setChurches(withDist.map(dbChurchToLocal));
          }
          setSearchLoading(false);
          return;
        }
        // If geocoding fails, fall through to normal zip prefix search
      }

      let q = supabase.from("churches").select("*");
      if (query) {
        q = q.ilike("name", `%${query}%`);
      }
      if (denomination && denomination !== "All") {
        q = q.eq("denomination", denomination);
      }
      if (state && state !== "All") {
        q = q.eq("state", state);
      }
      if (city) {
        q = q.ilike("city", `%${city}%`);
      }
      if (zip) {
        q = q.ilike("zip", `${zip}%`);
      }
      q = q.order("total_reviews", { ascending: false }).limit(50);
      const { data, error } = await q;
      if (error) {
        console.error("Search error:", error);
        // On auth/connection error, refresh session and retry once
        if (!_retried) {
          await supabase.auth.getSession();
          return searchChurchesDB(query, denomination, state, city, zip, true);
        }
        showToast("Search failed. Please refresh the page and try again.", "error");
      }
      if (!error && data) {
        // Clear distance data when not doing proximity search
        setNearMeDistances({});
        setChurches(data.map(dbChurchToLocal));
      }
    } catch (err) {
      console.error("Search exception:", err);
      // On network/connection error, refresh session and retry once
      if (!_retried) {
        try { await supabase.auth.getSession(); } catch {}
        return searchChurchesDB(query, denomination, state, city, zip, true);
      }
      showToast("Connection issue. Please check your internet and try again.", "error");
    } finally {
      setSearchLoading(false);
    }
  }, []);

  /* --- NEAR ME: geolocation search --- */
  const searchNearMe = useCallback(async (lat, lng) => {
    setSearchLoading(true);
    try {
      // Fetch churches that have coordinates, up to 200
      const { data, error } = await supabase
        .from("churches")
        .select("*")
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .limit(500);
      if (error) { console.error("Near me error:", error); return; }
      if (!data) return;
      // Calculate distances and sort
      const withDist = data.map(c => ({
        ...c,
        _dist: haversineDistance(lat, lng, c.latitude, c.longitude)
      })).sort((a, b) => a._dist - b._dist).slice(0, 50);
      const distMap = {};
      withDist.forEach(c => { distMap[c.id] = c._dist; });
      setNearMeDistances(distMap);
      setChurches(withDist.map(dbChurchToLocal));
    } catch (err) {
      console.error("Near me exception:", err);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleNearMe = useCallback(() => {
    if (nearMeActive) {
      // Turn off near me
      setNearMeActive(false);
      setNearMeLocation(null);
      setNearMeDistances({});
      setChurches([]);
      return;
    }
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setNearMeLoading(true);
    setDiscoverSearchQuery("");
    setFilterState("All");
    setFilterCity("");
    setFilterZip("");
    setFilterDenom("All");
    setCurrentPage(1);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setNearMeLocation(loc);
        setNearMeActive(true);
        setNearMeLoading(false);
        searchNearMe(loc.lat, loc.lng);
      },
      (err) => {
        setNearMeLoading(false);
        if (err.code === 1) alert("Location access was denied. Please allow location access in your browser settings to use this feature.");
        else alert("Could not determine your location. Please try again.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [nearMeActive, searchNearMe]);

  // Auto-trigger Near Me when navigating to Discover page with location available
  const [autoNearMeTriggered, setAutoNearMeTriggered] = useState(false);
  useEffect(() => {
    if (page === "discover" && userGeoLocation && !autoNearMeTriggered && !nearMeActive && !discoverSearchQuery && filterState === "All" && !filterCity && !filterZip && filterDenom === "All") {
      setAutoNearMeTriggered(true);
      setNearMeLocation(userGeoLocation);
      setNearMeActive(true);
      searchNearMe(userGeoLocation.lat, userGeoLocation.lng);
    }
  }, [page, userGeoLocation, autoNearMeTriggered, nearMeActive, discoverSearchQuery, filterState, filterCity, filterZip, filterDenom, searchNearMe]);

  // Reset auto-trigger when leaving discover page
  useEffect(() => {
    if (page !== "discover") setAutoNearMeTriggered(false);
  }, [page]);

  // Debounced search for Discover page
  useEffect(() => {
    if (page !== "discover" || nearMeActive) return;
    const timer = setTimeout(() => {
      searchChurchesDB(discoverSearchQuery, filterDenom, filterState, filterCity, filterZip);
    }, 300);
    return () => clearTimeout(timer);
  }, [discoverSearchQuery, filterDenom, filterState, filterCity, filterZip, page, searchChurchesDB]);

  // Debounced search for Rate flow — searches both name and city
  const [rateSearchResults, setRateSearchResults] = useState([]);
  useEffect(() => {
    if (!rateSearch || rateSearch.length < 2) { setRateSearchResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("churches")
        .select("*")
        .or(`name.ilike.%${rateSearch}%,city.ilike.%${rateSearch}%`)
        .eq("status", "approved")
        .order("total_reviews", { ascending: false })
        .limit(20);
      if (data) setRateSearchResults(data.map(dbChurchToLocal));
    }, 400);
    return () => clearTimeout(timer);
  }, [rateSearch]);

  /* --- LOAD REVIEWS FOR A CHURCH --- */
  const fetchReviewsForChurch = useCallback(async (churchId) => {
    const { data, error } = await supabase
      .from("reviews")
      .select("*, profiles!reviews_user_id_fkey(display_name, avatar_url), church_responses(id, text, created_at, profiles!church_responses_responder_id_fkey(display_name)), review_likes(user_id), review_photos(id, storage_path, caption, sort_order)")
      .eq("church_id", churchId)
      .in("status", ["published", "pending", "hidden", "flagged"])
      .order("created_at", { ascending: false });
    if (!error && data) {
      const reviews = data.map(r => {
        const review = dbReviewToLocal(r);
        const likes = r.review_likes || [];
        review.likeCount = likes.length;
        review.userLiked = user ? likes.some(l => l.user_id === user.id) : false;
        // Attach photos
        if (r.review_photos && r.review_photos.length > 0) {
          review.photos = r.review_photos.sort((a, b) => a.sort_order - b.sort_order).map(p => ({
            id: p.id,
            url: supabase.storage.from("review-photos").getPublicUrl(p.storage_path).data.publicUrl,
            caption: p.caption,
          }));
        }
        return review;
      });
      setChurches(prev => {
        const updated = prev.map(c =>
          c.id === churchId ? { ...c, recentReviews: reviews } : c
        );
        // Update JSON-LD with review data if we're viewing this church
        const church = updated.find(c => c.id === churchId);
        if (church && page === "profile") updateSEOForChurch(church, reviews);
        return updated;
      });
    }
  }, [user, page]);

  /* --- LOAD USER'S OWN REVIEWS --- */
  const fetchUserReviews = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from("reviews")
      .select("*")
      .eq("user_id", userId);
    if (!error && data) {
      const map = {};
      data.forEach(r => {
        const scores = {};
        const comments = {};
        SCORE_FIELDS.forEach(f => {
          if (r[`score_${f}`] != null) scores[f] = r[`score_${f}`];
          if (r[`comment_${f}`]) comments[f] = r[`comment_${f}`];
        });
        map[r.church_id] = {
          review: { scores, comments, text: r.text, role: r.reviewer_role, author: "" },
          postedAt: new Date(r.created_at).getTime(),
          dbId: r.id,
        };
      });
      setUserReviews(map);
    }
  }, []);

  // Fetch My Churches data
  const fetchMyChurches = useCallback(async (userId) => {
    setMyChurchesLoading(true);
    try {
      // Get churches the user has reviewed
      const { data: reviewData } = await supabase
        .from("reviews")
        .select("church_id, reviewer_role, score_teaching, score_welcome, score_community, score_worship, score_prayer, score_kids, score_youth, score_leadership, score_service, score_finances, text, created_at, edited_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      let reviewedChurches = [];
      if (reviewData && reviewData.length > 0) {
        const churchIds = [...new Set(reviewData.map(r => r.church_id))];
        const { data: churchData } = await supabase
          .from("churches")
          .select("*")
          .in("id", churchIds);
        if (churchData) {
          reviewedChurches = churchData.map(ch => {
            const rev = reviewData.find(r => r.church_id === ch.id);
            const scores = {};
            SCORE_FIELDS.forEach(f => { if (rev[`score_${f}`] != null) scores[f] = rev[`score_${f}`]; });
            const avgScore = Object.values(scores).length > 0
              ? Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length
              : null;
            return { ...dbChurchToLocal(ch), myReview: { scores, avgScore, text: rev.text, role: rev.reviewer_role, date: rev.created_at, editedAt: rev.edited_at } };
          });
        }
      }

      // Get churches the user has claimed
      const { data: claimedData } = await supabase
        .from("churches")
        .select("*")
        .eq("claimed_by", userId);
      const claimedChurches = (claimedData || []).map(ch => dbChurchToLocal(ch));

      setMyChurchesData({ reviewed: reviewedChurches, claimed: claimedChurches });
      // Auto-select "owned" tab if user has claimed churches
      if (claimedChurches.length > 0) {
        setMyChurchesTab("owned");
        fetchOwnerDashboard(claimedChurches[0].id);
      }
    } catch (e) {
      console.error("Failed to fetch my churches:", e);
    } finally {
      setMyChurchesLoading(false);
    }
  }, []);

  // Fetch owner dashboard data for a claimed church
  const fetchOwnerDashboard = useCallback(async (churchId) => {
    // Fetch all reviews for this church with reviewer profiles
    const { data: reviews } = await supabase
      .from("reviews")
      .select("*, profiles!reviews_user_id_fkey(display_name, gender, age_range, income_bracket)")
      .eq("church_id", churchId)
      .in("status", ["published", "pending", "hidden", "flagged"])
      .order("created_at", { ascending: false });
    setOwnerReviews(reviews || []);

    // Fetch church info for benchmarks
    const { data: churchData } = await supabase.from("churches").select("*").eq("id", churchId).single();

    // Fetch regional benchmarks (city, state, national)
    const benchmarks = { national: {}, state: {}, city: {} };
    if (churchData) {
      const { data: benchData } = await supabase.from("regional_benchmarks").select("*");
      if (benchData) {
        benchData.forEach(b => {
          if (b.region_type === "national") benchmarks.national[b.category] = { avg: parseFloat(b.avg_score), churches: b.church_count };
          else if (b.region_type === "state" && b.region_value === churchData.state) benchmarks.state[b.category] = { avg: parseFloat(b.avg_score), churches: b.church_count };
          else if (b.region_type === "city" && b.region_value === churchData.city + ", " + churchData.state) benchmarks.city[b.category] = { avg: parseFloat(b.avg_score), churches: b.church_count };
        });
      }
    }
    setDashboardBenchmarks(benchmarks);

    // Fetch score snapshots for trends (last 12 months)
    const { data: snapshots } = await supabase
      .from("score_snapshots")
      .select("*")
      .eq("church_id", churchId)
      .gte("snapshot_date", new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
      .order("snapshot_date", { ascending: true });
    setDashboardTrends(snapshots || []);

    // Compute demographics from reviewer profiles
    if (reviews && reviews.length > 0) {
      const genderCounts = {}, ageCounts = {}, incomeCounts = {}, roleCounts = {};
      const scoreAvgs = {};
      reviews.forEach(r => {
        const g = r.profiles?.gender || "Not specified";
        const a = r.profiles?.age_range || "Not specified";
        const inc = r.profiles?.income_bracket || "Not specified";
        const role = r.reviewer_role || "Not specified";
        genderCounts[g] = (genderCounts[g] || 0) + 1;
        ageCounts[a] = (ageCounts[a] || 0) + 1;
        incomeCounts[inc] = (incomeCounts[inc] || 0) + 1;
        roleCounts[role] = (roleCounts[role] || 0) + 1;
      });
      SCORE_FIELDS.forEach(f => {
        const vals = reviews.map(r => r[`score_${f}`]).filter(v => v != null);
        if (vals.length > 0) scoreAvgs[f] = vals.reduce((a, b) => a + b, 0) / vals.length;
      });
      setOwnerDemographics({ genderCounts, ageCounts, incomeCounts, roleCounts, scoreAvgs, totalReviews: reviews.length });
    } else {
      setOwnerDemographics({ genderCounts: {}, ageCounts: {}, incomeCounts: {}, roleCounts: {}, scoreAvgs: {}, totalReviews: 0 });
    }

    // Fetch church responses
    const { data: responses } = await supabase.from("church_responses").select("*").eq("church_id", churchId);
    return responses || [];
  }, []);

  // Fetch user favorites
  const fetchUserFavorites = useCallback(async (userId) => {
    const { data } = await supabase.from("favorites").select("church_id").eq("user_id", userId);
    if (data) setUserFavorites(new Set(data.map(f => f.church_id)));
  }, []);

  const toggleFavorite = async (churchId) => {
    if (!user) { setShowAuthModal(true); return; }
    if (userFavorites.has(churchId)) {
      await supabase.from("favorites").delete().eq("user_id", user.id).eq("church_id", churchId);
      setUserFavorites(prev => { const s = new Set(prev); s.delete(churchId); return s; });
    } else {
      await supabase.from("favorites").insert({ user_id: user.id, church_id: churchId });
      setUserFavorites(prev => new Set(prev).add(churchId));
    }
  };

  // Fetch saved churches
  const fetchSavedChurches = useCallback(async (userId) => {
    const { data: favs } = await supabase.from("favorites").select("church_id").eq("user_id", userId);
    if (favs && favs.length > 0) {
      const ids = favs.map(f => f.church_id);
      const { data: churches } = await supabase.from("churches").select("*").in("id", ids);
      setSavedChurches((churches || []).map(ch => dbChurchToLocal(ch)));
    } else {
      setSavedChurches([]);
    }
  }, []);

  /* --- AUTH STATE --- */
  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        const { data: profileRow } = await supabase.from("profiles").select("role").eq("id", u.id).single();
        const profile = {
          id: u.id,
          name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "User",
          email: u.email,
          avatar: (u.user_metadata?.full_name || u.user_metadata?.name || u.email || "U").charAt(0).toUpperCase(),
          provider: u.app_metadata?.provider || "email",
          role: profileRow?.role || "user",
        };
        setUser(profile);
        fetchUserReviews(u.id);
        fetchUserFavorites(u.id);
        // Check if user has claimed a church
        const { data: claimedCheck } = await supabase.from("churches").select("id").eq("claimed_by", u.id).limit(1);
        if (claimedCheck && claimedCheck.length > 0) setHasClaimed(true);

        // Process pending review from localStorage (for OAuth redirects on initial load)
        const pending = localStorage.getItem("btf_pending_review");
        if (pending) {
          localStorage.removeItem("btf_pending_review");
          setSubmitting(true);
          try {
            const parsed = JSON.parse(pending);
            if (parsed.churchId) {
              const cachedChurch = churches.find(c => c.id === parsed.churchId);
              if (cachedChurch) setRateChurch(cachedChurch);
            }
            const success = await submitReviewToDB(parsed, u.id);
            if (success) {
              setRateStep(3);
              setPage("rate");
            } else {
              showToast("Something went wrong submitting your experience. Please try again.", "error");
            }
          } catch (e) {
            console.error("Failed to process pending review:", e);
            showToast("Something went wrong submitting your experience. Please try again.", "error");
          } finally {
            setSubmitting(false);
          }
        }
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        const u = session.user;
        const { data: profileRow } = await supabase.from("profiles").select("role").eq("id", u.id).single();
        const profile = {
          id: u.id,
          name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "User",
          email: u.email,
          avatar: (u.user_metadata?.full_name || u.user_metadata?.name || u.email || "U").charAt(0).toUpperCase(),
          provider: u.app_metadata?.provider || "email",
          role: profileRow?.role || "user",
        };
        setUser(profile);
        setShowAuthModal(false);
        fetchUserReviews(u.id);
        fetchUserFavorites(u.id);

        // Check if user has claimed a church
        const { data: claimedCheck } = await supabase.from("churches").select("id").eq("claimed_by", u.id).limit(1);
        if (claimedCheck && claimedCheck.length > 0) setHasClaimed(true);

        // Check if user has filled demographics, if not show the profile complete modal
        const { data: profileData } = await supabase.from("profiles").select("gender,age_range,income_bracket").eq("id", u.id).single();
        if (profileData && !profileData.gender && !profileData.age_range && !profileData.income_bracket) {
          setShowProfileComplete(true);
        }

        // Process pending review from localStorage (for OAuth redirects)
        const pending = localStorage.getItem("btf_pending_review");
        if (pending) {
          localStorage.removeItem("btf_pending_review");
          setSubmitting(true);
          try {
            const parsed = JSON.parse(pending);
            // Restore the church context so the success screen shows the right name
            if (parsed.churchId) {
              const cachedChurch = churches.find(c => c.id === parsed.churchId);
              if (cachedChurch) setRateChurch(cachedChurch);
            }
            const success = await submitReviewToDB(parsed, u.id);
            if (success) {
              setRateStep(3);
              setPage("rate");
            } else {
              showToast("Something went wrong submitting your experience. Please try again.", "error");
            }
          } catch (e) {
            console.error("Failed to process pending review:", e);
            showToast("Something went wrong submitting your experience. Please try again.", "error");
          } finally {
            setSubmitting(false);
          }
        }
      }
      if (event === "SIGNED_OUT") {
        setUser(null);
        setUserReviews({});
        setUserFavorites(new Set());
        setHasClaimed(false);
      }
    });

    return () => subscription?.unsubscribe();
  }, [fetchUserReviews, fetchUserFavorites]);

  /* --- INITIAL DATA LOAD --- */
  useEffect(() => {
    if (mounted) fetchChurches();
  }, [mounted, fetchChurches]);

  /* --- REQUEST GEOLOCATION ON PAGE LOAD (silent, non-blocking) --- */
  useEffect(() => {
    if (!mounted || geoRequested) return;
    setGeoRequested(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserGeoLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => { /* silently fail if denied */ },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, [mounted, geoRequested]);

  /* --- KEEP SUPABASE ALIVE: refresh session when tab regains focus --- */
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        try {
          // Refresh the auth session to keep the connection alive
          await supabase.auth.getSession();
          // If user was searching, re-run the search to recover from stale connections
          if (page === "discover" && (discoverSearchQuery || filterDenom !== "All" || filterState !== "All")) {
            searchChurchesDB(discoverSearchQuery, filterDenom, filterState, filterCity, filterZip);
          }
        } catch (err) {
          console.error("Session refresh error:", err);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [page, discoverSearchQuery, filterDenom, filterState, filterCity, filterZip, searchChurchesDB]);

  /* --- SUBMIT REVIEW TO DB --- */
  const submitReviewToDB = async (reviewData, userId) => {
    try {
    const { churchId, scores, comments, text, role, lastVisited, isEdit, reviewerLat, reviewerLng } = reviewData;

    // --- CHECK: Is user suspended from reviewing? ---
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("review_suspended")
      .eq("id", userId)
      .single();

    if (profileError) {
      console.error("Profile check error:", profileError);
      // Don't block submission if profile check fails
    }

    if (profile?.review_suspended) {
      showToast("Your sharing ability has been temporarily paused while we verify your recent experiences. We'll have this resolved soon!", "warning");
      return false;
    }

    // --- CHECK: 3 reviews per day limit (skip for edits) ---
    if (!isEdit) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: todayCount } = await supabase
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", todayStart.toISOString());

      if (todayCount >= 3) {
        showToast("You've reached the daily limit of 3 experience submissions. You can submit more tomorrow!", "warning");
        return false;
      }
    }

    // Calculate distance if reviewer location and church location are available
    const church = churches.find(c => c.id === churchId);
    let distanceMiles = null;
    let locationVerified = false;
    if (reviewerLat && reviewerLng && church?.latitude && church?.longitude) {
      distanceMiles = Math.round(haversineDistance(reviewerLat, reviewerLng, church.latitude, church.longitude) * 10) / 10;
      locationVerified = true;
    }

    const row = {
      church_id: churchId,
      user_id: userId,
      reviewer_role: role,
      text,
      status: "pending",
      last_visited: lastVisited || null,
      reviewer_lat: reviewerLat || null,
      reviewer_lng: reviewerLng || null,
      distance_miles: distanceMiles,
      location_verified: locationVerified,
    };
    SCORE_FIELDS.forEach(f => {
      row[`score_${f}`] = scores[f] != null ? Math.round(scores[f]) : null;
      row[`comment_${f}`] = comments[f] || null;
    });

    let result;
    if (isEdit) {
      // Update existing review (upsert on unique constraint)
      result = await supabase
        .from("reviews")
        .upsert(row, { onConflict: "church_id,user_id" })
        .select("id")
        .single();
    } else {
      result = await supabase.from("reviews").insert(row).select("id").single();
    }

    if (result.error) {
      console.error("Review submit error:", result.error);
      showToast("Failed to submit experience: " + result.error.message, "error");
      return false;
    }

    // Upload photos if any
    const reviewId = result.data?.id;
    if (reviewId && reviewData.photos && reviewData.photos.length > 0) {
      for (let i = 0; i < reviewData.photos.length; i++) {
        const photo = reviewData.photos[i];
        const ext = photo.file.name.split(".").pop()?.toLowerCase() || "jpg";
        const storagePath = `${userId}/${reviewId}/${Date.now()}_${i}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("review-photos")
          .upload(storagePath, photo.file, { contentType: photo.file.type });
        if (!uploadErr) {
          await supabase.from("review_photos").insert({
            review_id: reviewId,
            user_id: userId,
            storage_path: storagePath,
            file_name: photo.file.name,
            file_size: photo.file.size,
            mime_type: photo.file.type,
            sort_order: i,
          });
        }
      }
    }

    // --- GEO-FLAG CHECK: After successful new review, check for suspicious multi-state activity ---
    if (!isEdit) {
      try {
        // Get all states this user has reviewed churches in
        const { data: userReviewData } = await supabase
          .from("reviews")
          .select("church_id")
          .eq("user_id", userId);

        if (userReviewData && userReviewData.length >= 2) {
          const churchIds = userReviewData.map(r => r.church_id);
          const { data: churchData } = await supabase
            .from("churches")
            .select("state")
            .in("id", churchIds);

          if (churchData) {
            const uniqueStates = [...new Set(churchData.map(c => c.state).filter(Boolean))];
            // If reviewing churches in 3+ different states, flag the user
            if (uniqueStates.length >= 3) {
              await supabase
                .from("profiles")
                .update({
                  review_suspended: true,
                  suspension_reason: `Auto-flagged: reviewed churches across ${uniqueStates.length} states (${uniqueStates.join(", ")})`
                })
                .eq("id", userId);

              showToast("Thanks for your experience! We noticed activity across several states — we'll verify your experiences within 24-48 hours.", "info");
            }
          }
        }
      } catch (err) {
        console.error("Geo-flag check error:", err);
        // Don't block the review if the flag check fails
      }
    }

    // --- DISTANCE FLAG: Auto-flag submissions 50+ miles from church ---
    if (!isEdit && distanceMiles !== null && distanceMiles > 50) {
      try {
        await supabase
          .from("profiles")
          .update({
            review_suspended: true,
            suspension_reason: `Auto-flagged: submitted experience from ${Math.round(distanceMiles)} miles away from ${church?.name || "church"}`
          })
          .eq("id", userId);
        showToast("Thanks for your submission! Because your location is far from this church, our team will verify it within 24-48 hours.", "info");
      } catch (err) {
        console.error("Distance flag error:", err);
      }
    }

    // Update total_reviews count locally
    setChurches(prev => prev.map(c =>
      c.id === churchId ? { ...c, totalReviews: c.totalReviews + (isEdit ? 0 : 1) } : c
    ));

    // Refresh reviews for this church
    await fetchReviewsForChurch(churchId);
    await fetchUserReviews(userId);
    return true;

    } catch (err) {
      console.error("submitReviewToDB unexpected error:", err);
      showToast("Something went wrong. Please try again.", "error");
      return false;
    }
  };

  /* --- CLAIM CHURCH --- */
  const checkClaimStatus = async (churchId, userId) => {
    if (!userId) { setClaimStatus(null); return; }
    const { data } = await supabase
      .from("claim_requests")
      .select("status")
      .eq("church_id", churchId)
      .eq("user_id", userId)
      .single();
    setClaimStatus(data?.status || null);
  };

  // Step 1: Validate email domain and send verification code
  const sendClaimVerification = async (churchId) => {
    if (!user) { setShowAuthModal(true); return; }
    if (!claimData.fullName || !claimData.roleAtChurch || !claimData.workEmail) {
      showToast("Please fill in your name, role, and work email.", "error");
      return;
    }

    // Client-side domain check
    const church = churches.find(c => c.id === churchId);
    if (church?.website) {
      try {
        const websiteDomain = new URL(
          church.website.startsWith("http") ? church.website : `https://${church.website}`
        ).hostname.replace(/^www\./, "");
        const emailDomain = claimData.workEmail.split("@")[1]?.toLowerCase();
        if (emailDomain !== websiteDomain) {
          showToast(`Your email must match the church website domain (@${websiteDomain})`, "error");
          return;
        }
      } catch { /* skip domain check if URL parse fails */ }
    }

    setClaimSubmitting(true);
    setVerifyError("");

    // Call edge function to generate code and send email
    const { data, error } = await supabase.functions.invoke("send-verification-email", {
      body: { churchId, claimEmail: claimData.workEmail, userId: user.id },
    });

    if (error || data?.error) {
      setClaimSubmitting(false);
      showToast(data?.error || error?.message || "Failed to send verification email", "error");
      return;
    }

    // Also submit to claim_requests for record-keeping
    await supabase.from("claim_requests").upsert({
      church_id: churchId,
      user_id: user.id,
      full_name: claimData.fullName,
      role_at_church: claimData.roleAtChurch,
      work_email: claimData.workEmail,
      phone: claimData.phone || null,
      message: claimData.message || null,
    }, { onConflict: "church_id,user_id" });

    setClaimSubmitting(false);
    setClaimStep("verify");
    showToast("Verification code sent to " + claimData.workEmail, "success");
  };

  // Step 2: Verify the code and proceed to payment
  const verifyClaimCode = async (churchId) => {
    if (!verifyCodeInput.trim()) return;
    setClaimSubmitting(true);
    setVerifyError("");

    // Check code against church_claims table
    const { data: claim, error } = await supabase
      .from("church_claims")
      .select("verification_code")
      .eq("church_id", churchId)
      .eq("user_id", user.id)
      .single();

    if (error || !claim) {
      setClaimSubmitting(false);
      setVerifyError("No pending claim found. Please try again.");
      return;
    }

    if (claim.verification_code !== verifyCodeInput.trim()) {
      setClaimSubmitting(false);
      setVerifyError("Incorrect code. Please check your email and try again.");
      return;
    }

    // Code correct — mark as verified
    await supabase.from("church_claims").update({
      verified: true,
      verified_at: new Date().toISOString(),
    }).eq("church_id", churchId).eq("user_id", user.id);

    // Update church record with claim info and form data
    await supabase.from("churches").update({
      claimed_by: user.id,
      claimed_at: new Date().toISOString(),
      claim_email: claimData.workEmail,
      claim_verified: true,
      service_days: claimData.serviceDays,
      avg_attendance: claimData.avgAttendance ? parseInt(claimData.avgAttendance) : null,
      staff_count: claimData.staffCount ? parseInt(claimData.staffCount) : null,
      volunteer_count: claimData.volunteerCount ? parseInt(claimData.volunteerCount) : null,
      campus_count: claimData.campusCount ? parseInt(claimData.campusCount) : null,
      programs: claimData.programs.length > 0 ? claimData.programs : null,
      website: claimData.website || null,
      email: claimData.churchEmail || null,
      phone: claimData.churchPhone || null,
      facebook_url: claimData.facebook || null,
      instagram_url: claimData.instagram || null,
      youtube_url: claimData.youtube || null,
      livestream_url: claimData.livestream || null,
      pastor_name: claimData.pastorName || null,
      year_founded: claimData.yearFounded ? parseInt(claimData.yearFounded) : null,
      description: claimData.description || null,
    }).eq("id", churchId);

    setClaimSubmitting(false);
    setClaimStep("done");
    setClaimStatus("pending");
    showToast("Email verified! Redirecting to payment...", "success");

    // Redirect to Stripe for $39/month subscription payment
    setTimeout(() => {
      const stripePaymentUrl = `https://buy.stripe.com/14A7sL0wA03Ggr9epO4ow00?prefilled_email=${encodeURIComponent(claimData.workEmail)}&client_reference_id=${encodeURIComponent(user.id)}`;
      window.open(stripePaymentUrl, "_blank");
      setShowClaimModal(false);
      setClaimStep("form");
      setVerifyCodeInput("");
      setClaimData({
        fullName: "", roleAtChurch: "", workEmail: "", phone: "", message: "",
        serviceDays: [{ day: "Sunday", times: "9:00 AM, 11:00 AM" }],
        avgAttendance: "", staffCount: "", volunteerCount: "", campusCount: "1",
        programs: [],
        website: "", churchEmail: "", churchPhone: "",
        facebook: "", instagram: "", youtube: "", livestream: "",
        pastorName: "", yearFounded: "", description: ""
      });
    }, 1500);
  };

  /* --- CHURCH OWNER RESPONSE TO REVIEW --- */
  const submitChurchResponse = async (reviewId, churchId) => {
    if (!responseText.trim()) return;
    setResponseSubmitting(true);
    const { error } = await supabase.from("church_responses").insert({
      review_id: reviewId,
      church_id: churchId,
      responder_id: user.id,
      text: responseText.trim(),
    });
    setResponseSubmitting(false);
    if (error) {
      showToast("Failed to post response: " + error.message, "error");
      return;
    }
    setResponseText("");
    setRespondingTo(null);
    // Refresh reviews to show the response
    await fetchReviewsForChurch(churchId);
  };

  // Fetch all reviews by a specific user (for church owners)
  const fetchReviewerHistory = async (reviewerUserId, reviewerName) => {
    setReviewerHistoryLoading(true);
    const { data } = await supabase
      .from("reviews")
      .select("*, churches(name, city, state)")
      .eq("user_id", reviewerUserId)
      .order("created_at", { ascending: false });
    setReviewerHistory({
      userId: reviewerUserId,
      name: displayName(reviewerName, "church"),
      reviews: data || [],
    });
    setReviewerHistoryLoading(false);
  };

  /* --- HANDLE SIGN OUT --- */
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (e) {
      console.error("Sign out error:", e);
    }
    setUser(null);
    setUserReviews({});
    setUserFavorites(new Set());
    setHasClaimed(false);
    navigate("home");
    // Force page reload to fully clear session state
    setTimeout(() => window.location.reload(), 100);
  };

  /* --- RATE FLOW --- */
  const startRateFlow = (preselect) => {
    const existingReview = preselect && user ? userReviews[preselect.id] : null;
    const canEdit = existingReview && (Date.now() - existingReview.postedAt >= 7 * 24 * 60 * 60 * 1000);

    if (existingReview && !canEdit) {
      const daysLeft = Math.ceil((7 * 24 * 60 * 60 * 1000 - (Date.now() - existingReview.postedAt)) / (24 * 60 * 60 * 1000));
      showToast(`You've already shared your experience with this church. You can update your experience in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`, "info");
      return;
    }

    navigate("rate"); setRateStep(preselect ? 1 : 0); setRateChurch(preselect || null);
    setRateSearch(""); setRateSkipped({}); setRatePhotos([]);
    setShowAddChurch(false);
    setAddData({ name: "", address: "", city: "", state: "FL", denomination: "", size: "", serviceTimes: "" });
    setReviewerLocation(userGeoLocation || null); setLocationStatus(userGeoLocation ? "granted" : "idle");

    if (existingReview && canEdit) {
      setIsEditing(true);
      setRateScores(existingReview.review.scores || {});
      setRateComments(existingReview.review.comments || {});
      setRateText(existingReview.review.text || "");
      setRateRole(existingReview.review.role || "");
    } else {
      setIsEditing(false);
      setRateScores({}); setRateComments({}); setRateText(""); setRateRole(""); setRateLastVisited("");
    }
  };

  const selectChurchToRate = (c) => {
    const existing = user ? userReviews[c.id] : null;
    if (existing) {
      const canEdit = Date.now() - existing.postedAt >= 7 * 24 * 60 * 60 * 1000;
      if (!canEdit) {
        const daysLeft = Math.ceil((7 * 24 * 60 * 60 * 1000 - (Date.now() - existing.postedAt)) / (24 * 60 * 60 * 1000));
        showToast(`You've already shared your experience with ${c.name}. You can update in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`, "info");
        return;
      }
      setIsEditing(true);
      setRateScores(existing.review.scores || {});
      setRateComments(existing.review.comments || {});
      setRateText(existing.review.text || "");
      setRateRole(existing.review.role || "");
    } else {
      setIsEditing(false);
    }
    setRateChurch(c);
    setRateStep(1);
  };

  const viewChurch = (c) => {
    const church = churches.find(ch => ch.id === c.id) || c;
    navigate("profile", church);
    fetchReviewsForChurch(c.id);
    if (user) checkClaimStatus(c.id, user.id);
  };

  const handleRateSubmit = async () => {
    const filteredScores = Object.fromEntries(
      Object.entries(rateScores).filter(([k]) => !rateSkipped[k]).map(([k, v]) => [k, Math.round(v)])
    );
    const filteredComments = Object.fromEntries(
      Object.entries(rateComments).filter(([k, v]) => !rateSkipped[k] && v)
    );

    const reviewData = {
      churchId: rateChurch.id,
      scores: filteredScores,
      comments: filteredComments,
      text: rateText,
      role: rateRole,
      lastVisited: rateLastVisited,
      isEdit: isEditing,
      reviewerLat: reviewerLocation?.lat || null,
      reviewerLng: reviewerLocation?.lng || null,
      photos: ratePhotos,
    };

    if (!user) {
      // Store pending review for after auth
      localStorage.setItem("btf_pending_review", JSON.stringify(reviewData));
      setPendingReview(reviewData);
      setShowAuthModal(true);
      return;
    }

    setSubmitting(true);
    try {
      const success = await submitReviewToDB(reviewData, user.id);
      if (success) setRateStep(3);
    } catch (err) {
      console.error("Submit error:", err);
      showToast("Something went wrong submitting your experience. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const addManualChurch = async () => {
    if (!addData.name || !addData.city) return;
    if (!user) { setShowAuthModal(true); return; }

    const { data, error } = await supabase.from("churches").insert({
      name: addData.name,
      address: addData.address || null,
      city: addData.city,
      state: addData.state || "FL",
      denomination: addData.denomination || "Non-Denominational",
      size: addData.size || null,
      service_times: addData.serviceTimes || null,
      source: "manual",
      added_by: user.id,
    }).select().single();

    if (error) { showToast("Failed to add church: " + error.message, "error"); return; }
    const newChurch = dbChurchToLocal(data);
    setChurches(prev => [...prev, newChurch]);
    setShowAddChurch(false);
    showToast("Church submitted! It will appear in search results after admin approval.", "success");
    selectChurchToRate(newChurch);
  };

  const filteredChurches = churches;
  const [currentPage, setCurrentPage] = useState(1);
  const CHURCHES_PER_PAGE = 20;
  const totalPages = Math.ceil(filteredChurches.length / CHURCHES_PER_PAGE);
  const paginatedChurches = filteredChurches.slice((currentPage - 1) * CHURCHES_PER_PAGE, currentPage * CHURCHES_PER_PAGE);
  const denoms = ["All", "AME", "Apostolic", "Assemblies of God", "Baptist", "Calvary Chapel", "Catholic", "Church of Christ", "Church of God", "Church of God in Christ", "Church of the Nazarene", "Eastern Orthodox", "Episcopal", "Lutheran", "Methodist", "Non-Denominational", "Pentecostal", "Presbyterian", "United Church of Christ", "United Methodist", "Vineyard"];
  const currentChurch = selectedChurch ? (churches.find(c => c.id === selectedChurch.id) || selectedChurch) : null;

  /* SSR-safe: render a minimal shell until client mounts to avoid hydration mismatch */
  if (!mounted) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Plus Jakarta Sans', sans-serif", color: T.text }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ textAlign: "center", padding: "120px 24px" }}>
          <div style={{ display: "inline-block", width: 24, height: 24, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
          <div style={{ fontSize: 14, color: T.textMuted, marginTop: 12 }}>Loading churches...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.body, color: T.text }}>
      <style>{fonts}{responsiveCSS}{`html,body{margin:0;padding:0;background:${T.bg}}::selection{background:${T.accentSoft};color:${T.accent}}input::placeholder,textarea::placeholder{color:${T.textMuted}}*{box-sizing:border-box}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {showAuthModal && <AuthModal onClose={() => { setShowAuthModal(false); setPendingReview(null); }} onAuth={() => {}} mode="signin" />}
      {showProfileComplete && user && <ProfileCompleteModal userId={user.id} onClose={() => setShowProfileComplete(false)} />}

      {/* NAV */}
      <nav style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border}`, background: T.navBg, position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(16px)" }}>
        <div onClick={() => navigate("home")}><Logo size={15} /></div>

        {/* Desktop nav */}
        <div className="btf-desktop-nav" style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button onClick={() => navigate("discover")} style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, fontFamily: T.body, cursor: "pointer", background: page === "discover" ? T.text : "transparent", color: page === "discover" ? T.bg : T.textSoft, border: `1px solid ${page === "discover" ? T.text : "transparent"}`, transition: "all 0.15s" }}>Find a Church</button>
          <button onClick={() => startRateFlow()} style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, fontFamily: T.body, cursor: "pointer", background: page === "rate" ? T.text : "transparent", color: page === "rate" ? T.bg : T.textSoft, border: `1px solid ${page === "rate" ? T.text : "transparent"}`, transition: "all 0.15s" }}>Share Your Experience</button>
          <button onClick={() => navigate("about")} style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 500, fontFamily: T.body, cursor: "pointer", background: page === "about" ? T.text : "transparent", color: page === "about" ? T.bg : T.textSoft, border: `1px solid ${page === "about" ? T.text : "transparent"}`, transition: "all 0.15s" }}>How It Works</button>
          {/* Blog nav link temporarily hidden */}

          {hasClaimed && (
            <button onClick={() => { navigate("dashboard"); fetchMyChurches(user.id); }} style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, fontFamily: T.body, cursor: "pointer", background: page === "dashboard" ? T.accent : T.accentSoft, color: page === "dashboard" ? "#fff" : T.accent, border: `1px solid ${page === "dashboard" ? T.accent : T.accentBorder}`, transition: "all 0.15s" }}>Church Dashboard</button>
          )}
          {/* Theme toggle */}
          <button onClick={() => setTheme(isDark ? "light" : "dark")} title={isDark ? "Switch to light mode" : "Switch to dark mode"} style={{ padding: "5px 8px", borderRadius: T.radiusFull, fontSize: 15, background: "transparent", color: T.textMuted, border: `1px solid ${T.border}`, cursor: "pointer", lineHeight: 1, transition: "all 0.15s" }}>{isDark ? "☀️" : "🌙"}</button>
          <div style={{ width: 1, height: 20, background: T.border, margin: "0 2px" }} />
          {user ? <UserMenu user={user} onSignOut={handleSignOut} onNavigate={navigate} onSaved={() => { navigate("saved"); fetchSavedChurches(user.id); }} /> : <button onClick={() => setShowAuthModal(true)} style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, fontFamily: T.body, cursor: "pointer", background: T.accent, color: "#fff", border: "none" }}>Sign In</button>}
        </div>

        {/* Mobile nav: hamburger + user */}
        <div className="btf-mobile-nav" style={{ display: "none", alignItems: "center", gap: 8 }}>
          <button onClick={() => setTheme(isDark ? "light" : "dark")} style={{ padding: "4px 7px", borderRadius: T.radiusFull, fontSize: 14, background: "transparent", color: T.textMuted, border: `1px solid ${T.border}`, cursor: "pointer", lineHeight: 1 }}>{isDark ? "☀️" : "🌙"}</button>
          {user ? <UserMenu user={user} onSignOut={handleSignOut} onNavigate={navigate} onSaved={() => { navigate("saved"); fetchSavedChurches(user.id); }} /> : <button onClick={() => setShowAuthModal(true)} style={{ padding: "5px 12px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, fontFamily: T.body, cursor: "pointer", background: T.accent, color: "#fff", border: "none" }}>Sign In</button>}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ padding: "4px 6px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: T.radiusSm, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.text} strokeWidth="2" strokeLinecap="round">{mobileMenuOpen ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></> : <><line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="17" x2="21" y2="17" /></>}</svg>
          </button>
        </div>
      </nav>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="btf-mobile-menu" style={{ position: "sticky", top: 49, zIndex: 99, background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={() => { navigate("discover"); setMobileMenuOpen(false); }} style={{ padding: "10px 16px", borderRadius: T.radiusSm, fontSize: 14, fontWeight: 600, fontFamily: T.body, cursor: "pointer", background: page === "discover" ? T.surfaceAlt : "transparent", color: T.text, border: `1px solid ${page === "discover" ? T.border : "transparent"}`, textAlign: "left" }}>Find a Church</button>
          <button onClick={() => { startRateFlow(); setMobileMenuOpen(false); }} style={{ padding: "10px 16px", borderRadius: T.radiusSm, fontSize: 14, fontWeight: 600, fontFamily: T.body, cursor: "pointer", background: T.accent, color: "#fff", border: "none", textAlign: "left" }}>Share Your Experience</button>
          <button onClick={() => { navigate("about"); setMobileMenuOpen(false); }} style={{ padding: "10px 16px", borderRadius: T.radiusSm, fontSize: 14, fontWeight: 500, fontFamily: T.body, cursor: "pointer", background: page === "about" ? T.surfaceAlt : "transparent", color: T.text, border: `1px solid ${page === "about" ? T.border : "transparent"}`, textAlign: "left" }}>How It Works</button>
          {/* Blog mobile nav link temporarily hidden */}

          {hasClaimed && (
            <button onClick={() => { navigate("dashboard"); fetchMyChurches(user.id); setMobileMenuOpen(false); }} style={{ padding: "10px 16px", borderRadius: T.radiusSm, fontSize: 14, fontWeight: 600, fontFamily: T.body, cursor: "pointer", background: page === "dashboard" ? T.accentSoft : "transparent", color: T.accent, border: `1px solid ${page === "dashboard" ? T.accentBorder : "transparent"}`, textAlign: "left" }}>Church Dashboard</button>
          )}
        </div>
      )}

      {/* TOAST NOTIFICATIONS */}
      {toasts.length > 0 && (
        <div style={{ position: "fixed", top: 64, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, maxWidth: 380 }}>
          {toasts.map(toast => (
            <div key={toast.id} style={{
              padding: "12px 18px", borderRadius: T.radiusSm,
              background: toast.type === "error" ? T.redSoft : toast.type === "warning" ? T.amberSoft : toast.type === "success" ? T.greenSoft : T.surface,
              border: `1.5px solid ${toast.type === "error" ? T.redBorder : toast.type === "warning" ? T.amberBorder : toast.type === "success" ? T.greenBorder : T.border}`,
              color: toast.type === "error" ? T.red : toast.type === "warning" ? T.amber : toast.type === "success" ? T.green : T.text,
              fontSize: 13, fontWeight: 500, fontFamily: T.body, lineHeight: 1.5,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)", animation: "modalIn 0.25s ease",
            }}>
              {toast.message}
            </div>
          ))}
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div style={{ textAlign: "center", padding: "120px 24px" }}>
          <div style={{ display: "inline-block", width: 24, height: 24, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
          <div style={{ fontSize: 14, color: T.textMuted, marginTop: 12 }}>Finding churches near you...</div>
        </div>
      )}

      {/* HOME */}
      {!loading && page === "home" && (
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "96px 24px 60px" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 64 }}>
              <div style={{ display: "inline-block", padding: "5px 14px", borderRadius: T.radiusFull, background: T.surfaceAlt, border: `1px solid ${T.border}`, fontSize: 12, fontWeight: 600, color: T.textSoft, marginBottom: 24 }}>Matthew 7:16</div>
              <h1 className="btf-hero-title" style={{ fontSize: 54, fontFamily: T.heading, fontWeight: 800, lineHeight: 1.06, margin: "0 0 20px", letterSpacing: "-0.045em" }}>You will recognize<br />them by their fruit.</h1>
              <p style={{ fontSize: 17, color: T.textSoft, lineHeight: 1.65, maxWidth: 480, margin: "0 auto 24px" }}>Churches tell you who they are. Their people show you. Real experiences from real congregants — honest, structured, and built to help churches grow.</p>
              {platformStats.churches > 0 && (
                <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 32, display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
                  <span><strong style={{ color: T.text, fontWeight: 700 }}>{platformStats.churches.toLocaleString()}</strong> churches</span>
                  {platformStats.reviews > 0 && <span><strong style={{ color: T.text, fontWeight: 700 }}>{platformStats.reviews.toLocaleString()}</strong> experiences shared</span>}
                  {platformStats.users > 0 && <span><strong style={{ color: T.text, fontWeight: 700 }}>{platformStats.users.toLocaleString()}</strong> members</span>}
                </div>
              )}
              <div className="btf-hero-buttons" style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <button onClick={() => navigate("discover")} style={{ padding: "12px 28px", borderRadius: T.radiusFull, fontSize: 14, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, boxShadow: "0 2px 12px rgba(37,99,235,0.2)" }}>Find a Church</button>
                <button onClick={() => startRateFlow()} style={{ padding: "12px 28px", borderRadius: T.radiusFull, fontSize: 14, fontWeight: 600, background: T.text, color: T.bg, border: "none", cursor: "pointer", fontFamily: T.body }}>Share Your Experience</button>
                <button onClick={() => navigate("about")} style={{ padding: "12px 28px", borderRadius: T.radiusFull, fontSize: 14, fontWeight: 500, background: "transparent", color: T.textSoft, border: `1px solid ${T.borderLight}`, cursor: "pointer", fontFamily: T.body }}>How It Works</button>
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={180}>
            <div className="btf-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
              {[{ n: "01", title: "People-sourced truth", desc: "They say they\u2019re welcoming \u2014 but are they? Reviews from visitors and members reveal what walking through the doors actually feels like." }, { n: "02", title: "Scripture as standard", desc: "Structured feedback on whether teaching is faithful to God\u2019s word. Not opinion \u2014 accountability to the text." }, { n: "03", title: "Light builds trust", desc: "Transparency about finances, leadership, and community isn\u2019t criticism \u2014 it\u2019s how the body of Christ grows." }].map((c, i) => (
                <div key={i} style={{ padding: "24px 20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: T.heading, color: T.textMuted, marginBottom: 14 }}>{c.n}</div>
                  <h3 style={{ fontSize: 15, fontFamily: T.heading, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.02em" }}>{c.title}</h3>
                  <p style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.55, margin: 0 }}>{c.desc}</p>
                </div>
              ))}
            </div>
          </FadeIn>
          {/* Social Proof Stats */}
          {(platformStats.churches > 0 || platformStats.reviews > 0 || platformStats.users > 0) && (
            <FadeIn delay={250}>
              <div style={{ marginTop: 48, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                {[
                  { value: platformStats.churches, label: "Churches Listed" },
                  { value: platformStats.reviews, label: "Experiences Shared" },
                  { value: platformStats.users, label: "Community Members" },
                ].map((stat, i) => (
                  <div key={i} style={{ textAlign: "center", padding: "20px 16px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 32, fontWeight: 800, fontFamily: T.heading, color: T.accent, letterSpacing: "-0.03em" }}>{stat.value}</div>
                    <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 500, marginTop: 2 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </FadeIn>
          )}

          {/* Featured Churches */}
          <FadeIn delay={270}>
            <div style={{ marginTop: 32 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Spotlight</div>
                  <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Featured Churches</h2>
                </div>
                <button onClick={() => navigate("discover")} style={{ fontSize: 12, fontWeight: 600, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: T.body }}>Browse all →</button>
              </div>
              {(() => {
                const reviewed = churches.filter(c => c.totalReviews > 0 && hasScores(c)).sort((a, b) => avg(b.scores) - avg(a.scores)).slice(0, 3);
                if (reviewed.length > 0) return (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                    {reviewed.map((church, i) => {
                      const overall = avg(church.scores);
                      return (
                        <div key={church.id} onClick={() => viewChurch(church)} style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1.5px solid ${T.border}`, cursor: "pointer", transition: "all 0.2s" }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(37,99,235,0.08)"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: T.accent, padding: "2px 8px", borderRadius: T.radiusFull, background: T.accentSoft, border: `1px solid ${T.accentBorder}` }}>#{i + 1} Rated</div>
                            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: T.heading, color: scoreColor(overall) }}>{overall.toFixed(1)}</div>
                          </div>
                          <h3 style={{ fontSize: 15, fontFamily: T.heading, fontWeight: 700, margin: "0 0 3px", letterSpacing: "-0.01em" }}>{church.name}</h3>
                          <div style={{ fontSize: 12, color: T.textMuted }}>{church.city}, {church.state}</div>
                          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>{church.totalReviews} review{church.totalReviews !== 1 ? "s" : ""} · {church.denomination}</div>
                        </div>
                      );
                    })}
                  </div>
                );
                return (
                  <div style={{ padding: "32px 24px", borderRadius: T.radius, background: T.surface, border: `1.5px dashed ${T.border}`, textAlign: "center" }}>
                    <div style={{ fontSize: 28, marginBottom: 12 }}>🌱</div>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.heading, color: T.text, marginBottom: 4 }}>Be the first to share</div>
                    <p style={{ fontSize: 13, color: T.textSoft, margin: "0 0 16px", maxWidth: 380, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>No churches have been reviewed yet. Your honest experience could be the first — and it could help the next person walking through those doors.</p>
                    <button onClick={() => startRateFlow()} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body }}>Write the First Review</button>
                  </div>
                );
              })()}
            </div>
          </FadeIn>

          {/* From the Blog — temporarily hidden */}

          <FadeIn delay={300}>
            <div style={{ marginTop: 24, padding: "36px 32px", borderRadius: 14, background: T === DARK ? T.surfaceAlt : T.text, color: T === DARK ? T.text : T.bg }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.35, marginBottom: 6 }}>Framework</div>
              <h2 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.03em" }}>The 10 Church Experiences</h2>
              <p style={{ fontSize: 13, opacity: 0.55, margin: "0 0 24px" }}>Ten areas of church life rooted in what scripture says a healthy church looks like.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6 }}>
                {CATEGORIES.map((cat, i) => <div key={i} style={{ padding: "9px 13px", borderRadius: T.radiusSm, background: T === DARK ? T.surface : "rgba(255,255,255,0.06)", border: `1px solid ${T === DARK ? T.border : "rgba(255,255,255,0.08)"}` }}><span style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.8 }}>{cat.label}</span></div>)}
              </div>
            </div>
          </FadeIn>

          {/* Email Newsletter Signup */}
          <FadeIn delay={400}>
            <div style={{ marginTop: 24, padding: "32px", borderRadius: 14, background: T.accentSoft, border: `1.5px solid ${T.accentBorder}`, textAlign: "center" }}>
              <h3 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.02em", color: T.text }}>Stay in the loop</h3>
              <p style={{ fontSize: 13, color: T.textSoft, margin: "0 0 20px", maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>Get church data insights, community polls, and updates on what congregations across America are saying.</p>
              {newsletterDone ? (
                <div style={{ padding: "12px 20px", borderRadius: T.radiusFull, background: T.greenSoft, border: `1px solid ${T.greenBorder}`, color: T.green, fontSize: 14, fontWeight: 600, display: "inline-block" }}>You're on the list!</div>
              ) : (
                <div style={{ display: "flex", gap: 8, maxWidth: 400, margin: "0 auto" }}>
                  <input type="email" value={newsletterEmail} onChange={e => setNewsletterEmail(e.target.value)} placeholder="Enter your email" style={{ flex: 1, padding: "11px 16px", borderRadius: T.radiusFull, fontSize: 14, border: `1.5px solid ${T.accentBorder}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body, boxSizing: "border-box" }} onKeyDown={e => { if (e.key === "Enter") document.getElementById("btf-subscribe-btn")?.click(); }} />
                  <button id="btf-subscribe-btn" disabled={newsletterSubmitting || !newsletterEmail.includes("@")} onClick={async () => {
                    setNewsletterSubmitting(true);
                    const { error } = await supabase.from("newsletter_subscribers").insert({ email: newsletterEmail.trim().toLowerCase() });
                    setNewsletterSubmitting(false);
                    if (error) {
                      if (error.code === "23505") { setNewsletterDone(true); showToast("You're already subscribed!", "info"); }
                      else showToast("Something went wrong. Please try again.", "error");
                    } else {
                      setNewsletterDone(true);
                      showToast("Welcome to the community!", "success");
                    }
                  }} style={{ padding: "11px 24px", borderRadius: T.radiusFull, fontSize: 14, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: newsletterSubmitting ? "wait" : "pointer", fontFamily: T.body, whiteSpace: "nowrap", opacity: (newsletterSubmitting || !newsletterEmail.includes("@")) ? 0.6 : 1 }}>
                    {newsletterSubmitting ? "..." : "Subscribe"}
                  </button>
                </div>
              )}
              <p style={{ fontSize: 11, color: T.textMuted, margin: "12px 0 0" }}>No spam, ever. Unsubscribe anytime.</p>
            </div>
          </FadeIn>
        </div>
      )}

      {/* DISCOVER */}
      {!loading && page === "discover" && (
        <div style={{ maxWidth: 840, margin: "0 auto", padding: "36px 24px" }}>
          <FadeIn>
            <h2 style={{ fontSize: 26, fontFamily: T.heading, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.03em" }}>Discover churches</h2>
            
          </FadeIn>
          <FadeIn delay={80}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={discoverSearchQuery} onChange={e => { setDiscoverSearchQuery(e.target.value); setCurrentPage(1); if (nearMeActive) { setNearMeActive(false); setNearMeLocation(null); setNearMeDistances({}); } }} placeholder="Search church name..." style={{ width: "100%", padding: "11px 16px", borderRadius: T.radiusFull, fontSize: 14, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body, boxSizing: "border-box" }} />
                <button onClick={handleNearMe} disabled={nearMeLoading} style={{ padding: "11px 18px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, fontFamily: T.body, cursor: nearMeLoading ? "wait" : "pointer", background: nearMeActive ? T.accent : T.surface, color: nearMeActive ? "#fff" : T.textSoft, border: `1.5px solid ${nearMeActive ? T.accent : T.border}`, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s", opacity: nearMeLoading ? 0.6 : 1 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m10-10h-4M6 12H2"/></svg>
                  {nearMeLoading ? "Locating..." : "Near Me"}
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select value={filterState} onChange={e => { setFilterState(e.target.value); setFilterCity(""); setCurrentPage(1); }} style={{ padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, fontFamily: T.body, cursor: "pointer", minWidth: 120 }}>
                  {US_STATES.map(s => <option key={s} value={s}>{s === "All" ? "All States" : `${s} — ${STATE_NAMES[s] || s}`}</option>)}
                </select>
                <input value={filterCity} onChange={e => { setFilterCity(e.target.value); setCurrentPage(1); if (e.target.value) { setNearMeActive(false); setNearMeLocation(null); setNearMeDistances({}); } }} placeholder="City" style={{ padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, fontFamily: T.body, width: 130 }} />
                <input value={filterZip} onChange={e => { const v = e.target.value.replace(/\D/g, "").slice(0, 5); setFilterZip(v); setCurrentPage(1); if (v) { setNearMeActive(false); setNearMeLocation(null); setNearMeDistances({}); } }} placeholder="Zip code" style={{ padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, fontFamily: T.body, width: 100 }} />
                <select value={filterDenom} onChange={e => { setFilterDenom(e.target.value); setCurrentPage(1); }} style={{ padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, fontFamily: T.body, cursor: "pointer", minWidth: 160 }}>
                  {denoms.map(d => <option key={d} value={d}>{d === "All" ? "All Denominations" : d}</option>)}
                </select>
                {(filterState !== "All" || filterCity || filterZip || filterDenom !== "All" || discoverSearchQuery || nearMeActive) && (
                  <button onClick={() => { setFilterState("All"); setFilterCity(""); setFilterZip(""); setFilterDenom("All"); setDiscoverSearchQuery(""); setCurrentPage(1); setNearMeActive(false); setNearMeLocation(null); setNearMeDistances({}); }} style={{ padding: "8px 14px", borderRadius: T.radiusSm, fontSize: 12, fontWeight: 600, border: `1.5px solid ${T.border}`, background: T.surfaceAlt, color: T.textSoft, cursor: "pointer", fontFamily: T.body }}>Clear filters</button>
                )}
              </div>
            </div>
          </FadeIn>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredChurches.length === 0 && !searchLoading && !discoverSearchQuery && filterDenom === "All" && filterState === "All" && !filterCity && !filterZip && !nearMeActive && (
              <div style={{ padding: "32px 20px", textAlign: "center", borderRadius: T.radius, background: T.surface, border: `1.5px solid ${T.border}` }}>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.heading, color: T.text, marginBottom: 4 }}>Search {totalChurchCount.toLocaleString()} churches</div>
                <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 16 }}>Search by name above, or use filters to browse by location and denomination.</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  <button onClick={() => { setFilterState("FL"); }} style={{ padding: "7px 16px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.surfaceAlt, color: T.textSoft, border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>Florida</button>
                  <button onClick={() => { setFilterState("TX"); }} style={{ padding: "7px 16px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.surfaceAlt, color: T.textSoft, border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>Texas</button>
                  <button onClick={() => { setFilterState("CA"); }} style={{ padding: "7px 16px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.surfaceAlt, color: T.textSoft, border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>California</button>
                  <button onClick={() => { setFilterState("GA"); }} style={{ padding: "7px 16px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.surfaceAlt, color: T.textSoft, border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>Georgia</button>
                  <button onClick={() => { setFilterState("AL"); }} style={{ padding: "7px 16px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.surfaceAlt, color: T.textSoft, border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>Alabama</button>
                  <button onClick={handleNearMe} style={{ padding: "7px 16px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body }}>Near Me</button>
                </div>
              </div>
            )}
            {filteredChurches.length === 0 && !searchLoading && (discoverSearchQuery || filterDenom !== "All" || filterState !== "All" || filterCity || filterZip) && (
              <div style={{ padding: "40px 20px", textAlign: "center", borderRadius: T.radius, background: T.surface, border: `1.5px dashed ${T.border}` }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.textSoft, marginBottom: 4 }}>No churches found</div>
                <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 16 }}>Try a different search or add your church.</div>
                <button onClick={() => startRateFlow()} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body }}>Add a Church</button>
              </div>
            )}
            {searchLoading && (
              <div style={{ padding: "40px", textAlign: "center" }}>
                <div style={{ width: 24, height: 24, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.6s linear infinite", margin: "0 auto 12px" }} />
                <div style={{ fontSize: 13, color: T.textMuted }}>Searching...</div>
              </div>
            )}
            {paginatedChurches.map((church, i) => {
              const overall = avg(church.scores);
              const rated = hasScores(church);
              return (
                <FadeIn key={church.id} delay={120 + i * 70}>
                  <div onClick={() => viewChurch(church)} style={{ padding: "22px", borderRadius: T.radius, cursor: "pointer", background: T.surface, border: `1.5px solid ${T.border}`, transition: "all 0.2s", position: "relative" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = T.accentBorder; e.currentTarget.style.boxShadow = "0 2px 16px rgba(37,99,235,0.05)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "none"; }}>
                    <button onClick={(e) => { e.stopPropagation(); toggleFavorite(church.id); }} style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: 4, lineHeight: 1 }} title={userFavorites.has(church.id) ? "Unsave" : "Save"}>
                      {userFavorites.has(church.id) ? "❤️" : "🤍"}
                    </button>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: 18, fontFamily: T.heading, fontWeight: 700, margin: "0 0 3px", letterSpacing: "-0.02em" }}>{church.name}</h3>
                        <div style={{ fontSize: 13, color: T.textMuted }}>{church.denomination} · {church.city}, {church.state}{church.size ? ` · ${church.size}` : ""}{nearMeDistances[church.id] != null && <span style={{ color: T.accent, fontWeight: 600 }}> · {nearMeDistances[church.id] < 1 ? "< 1" : Math.round(nearMeDistances[church.id])} mi</span>}</div>
                        {church.address && !church.address.toLowerCase().startsWith("po box") && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 1 }}>{church.address}</div>}
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                          {church.tags.slice(0, 4).map((tag, j) => <span key={j} style={{ fontSize: 11, padding: "2px 9px", borderRadius: T.radiusFull, background: T.surfaceAlt, color: T.textSoft, fontWeight: 500, border: `1px solid ${T.borderLight}` }}>{tag}</span>)}
                        </div>
                      </div>
                      {rated ? (
                        <div style={{ padding: "8px 14px", borderRadius: T.radiusSm, textAlign: "center", background: scoreBg(overall), border: `1px solid ${scoreBorder2(overall)}`, minWidth: 58 }}>
                          <div style={{ fontSize: 24, fontWeight: 800, fontFamily: T.heading, color: scoreColor(overall), lineHeight: 1 }}>{overall.toFixed(1)}</div>
                          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>{church.totalReviews} experiences</div>
                        </div>
                      ) : (
                        <div style={{ padding: "10px 14px", borderRadius: T.radiusSm, textAlign: "center", minWidth: 44 }}>
                          {church.totalReviews > 0 ? (
                            <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 500 }}>{church.totalReviews} review{church.totalReviews !== 1 ? "s" : ""}</div>
                          ) : (
                            <div style={{ fontSize: 11, color: T.textMuted }}>New</div>
                          )}
                        </div>
                      )}
                    </div>
                    {rated && (
                      <div className="btf-score-mini" style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.borderLight}` }}>
                        {CATEGORIES.map(cat => { const s = church.scores[cat.id]; if (!s) return null; return <div key={cat.id} style={{ padding: "3px 8px", borderRadius: T.radiusFull, background: scoreBg(s), border: `1px solid ${scoreBorder2(s)}`, display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 9.5, color: T.textMuted, fontWeight: 500 }}>{cat.label.split("&")[0].split("/")[0].trim()}</span><span style={{ fontSize: 10.5, color: scoreColor(s), fontWeight: 700, fontFamily: T.heading }}>{s.toFixed(1)}</span></div>; })}
                      </div>
                    )}
                  </div>
                </FadeIn>
              );
            })}
          </div>
          {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 20, padding: "12px 0" }}>
                <button onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={currentPage === 1} style={{ padding: "8px 16px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, fontFamily: T.body, cursor: currentPage === 1 ? "not-allowed" : "pointer", background: currentPage === 1 ? T.surfaceAlt : T.surface, color: currentPage === 1 ? T.textMuted : T.text, border: `1.5px solid ${T.border}`, opacity: currentPage === 1 ? 0.5 : 1 }}>Previous</button>
                <span style={{ fontSize: 13, color: T.textSoft, fontWeight: 500 }}>Page {currentPage} of {totalPages}</span>
                <button onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={currentPage === totalPages} style={{ padding: "8px 16px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, fontFamily: T.body, cursor: currentPage === totalPages ? "not-allowed" : "pointer", background: currentPage === totalPages ? T.surfaceAlt : T.surface, color: currentPage === totalPages ? T.textMuted : T.text, border: `1.5px solid ${T.border}`, opacity: currentPage === totalPages ? 0.5 : 1 }}>Next</button>
              </div>
            )}
            <div style={{ marginTop: 20, padding: "18px 20px", borderRadius: T.radius, background: T.surface, border: `1.5px dashed ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", transition: "all 0.15s" }} onClick={() => startRateFlow()} onMouseEnter={e => e.currentTarget.style.borderColor = T.accent} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
            <div><div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Don't see your church?</div><div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>Share an experience or add a new church to our directory.</div></div>
            <div style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.accentSoft, color: T.accent, border: `1px solid ${T.accentBorder}`, flexShrink: 0 }}>Add Church</div>
          </div>
        </div>
      )}

      {/* PROFILE */}
      {!loading && page === "profile" && currentChurch && (() => {
        const c = currentChurch; const overall = avg(c.scores); const rated = hasScores(c);
        const mapUrl = c.address && c.city ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name}, ${c.address}, ${c.city}, ${c.state}`)}` : null;
        return (
          <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px" }}>
            <FadeIn>
              <button onClick={() => window.history.back()} style={{ background: "none", border: "none", color: T.accent, fontSize: 13, cursor: "pointer", fontWeight: 600, padding: 0, marginBottom: 24, fontFamily: T.body }}>← Back</button>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <h1 style={{ fontSize: 30, fontFamily: T.heading, fontWeight: 800, margin: "0 0 5px", letterSpacing: "-0.035em" }}>{c.name}</h1>
                    {c.claimedBy && (
                      <span title="This church has been verified by its leadership" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: T.radiusFull, background: T.greenSoft, border: `1px solid ${T.greenBorder}`, fontSize: 11, fontWeight: 700, color: T.green, whiteSpace: "nowrap" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        Verified
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, color: T.textSoft, fontWeight: 500 }}>{c.denomination}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 10 }}>
                    {c.tags.map((tag, j) => <span key={j} style={{ fontSize: 11.5, padding: "4px 12px", borderRadius: T.radiusFull, background: T.accentSoft, color: T.accent, fontWeight: 600, border: `1px solid ${T.accentBorder}` }}>{tag}</span>)}
                  </div>
                </div>
                {rated ? (
                  <div style={{ padding: "12px 20px", borderRadius: T.radius, textAlign: "center", background: scoreBg(overall), border: `1.5px solid ${scoreBorder2(overall)}` }}>
                    <div style={{ fontSize: 36, fontWeight: 800, fontFamily: T.heading, color: scoreColor(overall), lineHeight: 1 }}>{overall.toFixed(1)}</div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>{c.totalReviews} experiences</div>
                  </div>
                ) : (
                  <div style={{ padding: "14px 20px", borderRadius: T.radius, textAlign: "center", background: T.surfaceAlt, border: `1.5px dashed ${T.border}` }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.textSoft }}>Not yet rated</div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{c.totalReviews > 0 ? `${c.totalReviews}/${MIN_REVIEWS_FOR_SCORE} experiences needed` : "Be the first to share"}</div>
                  </div>
                )}
              </div>

              {/* Share & Report Row */}
              {(() => {
                const shareUrl = `https://bytheirfruit.church/church/${c.id}/${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}`;
                const shareText = rated ? `${c.name} is rated ${overall.toFixed(1)}/5 on By Their Fruit — real experiences from real congregants.` : `Check out ${c.name} on By Their Fruit — real experiences from real congregants.`;
                return (
                  <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
                    {/* Share Dropdown */}
                    <div style={{ position: "relative" }}>
                      <button onClick={() => setShowShareMenu(prev => !prev)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.surfaceAlt, color: T.textSoft, border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.body, transition: "all 0.15s" }} onMouseEnter={e => { e.currentTarget.style.background = T.accent; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = T.accent; }} onMouseLeave={e => { e.currentTarget.style.background = T.surfaceAlt; e.currentTarget.style.color = T.textSoft; e.currentTarget.style.borderColor = T.border; }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                        Share
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                      {showShareMenu && (
                        <>
                          <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setShowShareMenu(false)} />
                          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 100, minWidth: 180, background: T.surface, border: `1.5px solid ${T.border}`, borderRadius: T.radius, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", padding: "6px 0", fontFamily: T.body }}>
                            <button onClick={() => { navigator.clipboard.writeText(shareUrl); showToast("Link copied!", "success"); setShowShareMenu(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", background: "none", border: "none", color: T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: T.body, textAlign: "left" }} onMouseEnter={e => e.currentTarget.style.background = T.surfaceAlt} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                              Copy Link
                            </button>
                            <a href={`sms:?body=${encodeURIComponent(shareText + " " + shareUrl)}`} onClick={() => setShowShareMenu(false)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", background: "none", border: "none", color: T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: T.body, textDecoration: "none" }} onMouseEnter={e => e.currentTarget.style.background = T.surfaceAlt} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                              Text Message
                            </a>
                            <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" onClick={() => setShowShareMenu(false)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", background: "none", border: "none", color: T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: T.body, textDecoration: "none" }} onMouseEnter={e => e.currentTarget.style.background = T.surfaceAlt} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                              Facebook
                            </a>
                            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" onClick={() => setShowShareMenu(false)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", background: "none", border: "none", color: T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: T.body, textDecoration: "none" }} onMouseEnter={e => e.currentTarget.style.background = T.surfaceAlt} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                              Post on X
                            </a>
                            <a href={`mailto:?subject=${encodeURIComponent("Check out " + c.name + " on By Their Fruit")}&body=${encodeURIComponent(shareText + "\n\n" + shareUrl)}`} onClick={() => setShowShareMenu(false)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", background: "none", border: "none", color: T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: T.body, textDecoration: "none" }} onMouseEnter={e => e.currentTarget.style.background = T.surfaceAlt} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                              Email
                            </a>
                          </div>
                        </>
                      )}
                    </div>
                    {/* Report Church */}
                    <button onClick={() => { setShowReportModal(true); setReportSubmitted(false); setReportData({ reason: "", description: "" }); }} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: "none", color: T.textMuted, border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.body, transition: "all 0.15s" }} onMouseEnter={e => { e.currentTarget.style.color = T.red; e.currentTarget.style.borderColor = T.red; }} onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.borderColor = T.border; }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                      Report
                    </button>
                  </div>
                );
              })()}

              {/* Contact & Info Card */}
              <div style={{ marginTop: 20, padding: "20px 24px", borderRadius: T.radius, background: T.surface, border: `1.5px solid ${T.border}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px 32px" }}>
                  {c.address && !c.address.toLowerCase().startsWith("po box") && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, marginBottom: 4 }}>Address</div>
                      {mapUrl ? (
                        <a href={mapUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: T.accent, textDecoration: "none", lineHeight: 1.5, fontWeight: 500 }}>{c.address}, {c.city}, {c.state} {c.zip}</a>
                      ) : (
                        <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>{c.address}, {c.city}, {c.state} {c.zip}</div>
                      )}
                    </div>
                  )}
                  {c.address && c.address.toLowerCase().startsWith("po box") && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, marginBottom: 4 }}>Location</div>
                      <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>{c.city}, {c.state} {c.zip}</div>
                    </div>
                  )}
                  {c.phone && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, marginBottom: 4 }}>Phone</div>
                      <a href={`tel:${c.phone}`} style={{ fontSize: 13, color: T.accent, textDecoration: "none", fontWeight: 500 }}>{c.phone}</a>
                    </div>
                  )}
                  {c.email && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, marginBottom: 4 }}>Email</div>
                      <a href={`mailto:${c.email}`} style={{ fontSize: 13, color: T.accent, textDecoration: "none", fontWeight: 500 }}>{c.email}</a>
                    </div>
                  )}
                  {c.website && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, marginBottom: 4 }}>Website</div>
                      <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: T.accent, textDecoration: "none", fontWeight: 500, wordBreak: "break-all" }}>{c.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>
                    </div>
                  )}
                  {c.serviceTimes && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, marginBottom: 4 }}>Service Times</div>
                      <div style={{ fontSize: 13, color: T.text }}>{c.serviceTimes}</div>
                    </div>
                  )}
                  {c.size && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, marginBottom: 4 }}>Size</div>
                      <div style={{ fontSize: 13, color: T.text }}>{c.size}</div>
                    </div>
                  )}
                </div>
                {!c.phone && !c.website && !c.email && (
                  <div style={{ fontSize: 12, color: T.textMuted }}>Contact info not yet available.</div>
                )}
                {mapUrl && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.borderLight}` }}>
                    <a href={mapUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: T.accent, textDecoration: "none", fontWeight: 600 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      Get Directions
                    </a>
                  </div>
                )}
              </div>

              {/* Claim This Church CTA */}
              {!c.claimedBy && (
                <div style={{ marginTop: 16, padding: "16px 24px", borderRadius: T.radius, background: T.accentSoft, border: `1.5px solid ${T.accentBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Are you part of this church's leadership?</div>
                    <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2 }}>Claim this church to respond to experiences, access insights, and get a verified badge.</div>
                  </div>
                  {claimStatus === "pending" ? (
                    <span style={{ padding: "8px 18px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.accentSoft, color: T.accent, border: `1.5px solid ${T.accentBorder}` }}>Claim Pending Review</span>
                  ) : (
                    <button onClick={() => { if (!user) { setShowAuthModal(true); } else { setShowClaimModal(true); } }} style={{ padding: "8px 18px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, whiteSpace: "nowrap" }}>Claim This Church</button>
                  )}
                </div>
              )}
            </FadeIn>

            {/* Claim Church Modal */}
            {showClaimModal && currentChurch && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowClaimModal(false)}>
                <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: T.radius + 4, padding: "32px 28px", maxWidth: 480, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
                  <h2 style={{ fontSize: 22, fontFamily: T.heading, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.03em" }}>{claimStep === "verify" ? "Verify your email" : claimStep === "done" ? "Verified!" : `Claim ${currentChurch.name}`}</h2>
                  {claimStep === "form" && <>
                  <p style={{ fontSize: 13, color: T.textSoft, margin: "0 0 16px" }}>Tell us about your role at this church. We'll verify your church email, then direct you to set up your subscription.</p>
                  <div style={{ padding: "12px 16px", borderRadius: T.radiusSm, background: T.accentSoft, border: `1px solid ${T.accentBorder}`, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Church Subscription</div>
                      <div style={{ fontSize: 11, color: T.textSoft, marginTop: 1 }}>Verified badge, respond to experiences, insights dashboard</div>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, fontFamily: T.heading, color: T.accent }}>$39<span style={{ fontSize: 12, fontWeight: 500, color: T.textMuted }}>/mo</span></div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {/* Your Information */}
                    <div>
                      <h3 style={{ fontSize: 13, fontFamily: T.heading, fontWeight: 700, margin: "0 0 12px", color: T.text }}>Your Information</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>Your full name *</label>
                          <input value={claimData.fullName} onChange={e => setClaimData(p => ({ ...p, fullName: e.target.value }))} placeholder="e.g. Pastor John Smith" style={{ width: "100%", padding: "11px 14px", borderRadius: T.radiusSm, fontSize: 14, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>Your role at this church *</label>
                          <select value={claimData.roleAtChurch} onChange={e => setClaimData(p => ({ ...p, roleAtChurch: e.target.value }))} style={{ width: "100%", padding: "11px 14px", borderRadius: T.radiusSm, fontSize: 14, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body }}>
                            <option value="">Select your role...</option>
                            <option value="Senior Pastor">Senior Pastor</option>
                            <option value="Associate Pastor">Associate Pastor</option>
                            <option value="Youth Pastor">Youth Pastor</option>
                            <option value="Worship Leader">Worship Leader</option>
                            <option value="Church Administrator">Church Administrator</option>
                            <option value="Elder/Deacon">Elder / Deacon</option>
                            <option value="Board Member">Board Member</option>
                            <option value="Office Staff">Office Staff</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>Church work email *</label>
                          <input type="email" value={claimData.workEmail} onChange={e => setClaimData(p => ({ ...p, workEmail: e.target.value }))} placeholder="e.g. pastor@gracechurch.org" style={{ width: "100%", padding: "11px 14px", borderRadius: T.radiusSm, fontSize: 14, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>Phone number</label>
                          <input type="tel" value={claimData.phone} onChange={e => setClaimData(p => ({ ...p, phone: e.target.value }))} placeholder="(optional)" style={{ width: "100%", padding: "11px 14px", borderRadius: T.radiusSm, fontSize: 14, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>Anything else you'd like us to know?</label>
                          <textarea value={claimData.message} onChange={e => setClaimData(p => ({ ...p, message: e.target.value }))} rows={2} placeholder="(optional)" style={{ width: "100%", padding: "11px 14px", borderRadius: T.radiusSm, fontSize: 14, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body, resize: "vertical" }} />
                        </div>
                      </div>
                    </div>

                    {/* Service Times */}
                    <div>
                      <h3 style={{ fontSize: 13, fontFamily: T.heading, fontWeight: 700, margin: "0 0 12px", color: T.text }}>Service Times</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {claimData.serviceDays.map((day, i) => (
                          <div key={i} style={{ display: "flex", gap: 8 }}>
                            <input value={day.day} onChange={e => setClaimData(p => ({ ...p, serviceDays: p.serviceDays.map((d, j) => j === i ? { ...d, day: e.target.value } : d) }))} placeholder="Day" style={{ flex: 1, padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body }} />
                            <input value={day.times} onChange={e => setClaimData(p => ({ ...p, serviceDays: p.serviceDays.map((d, j) => j === i ? { ...d, times: e.target.value } : d) }))} placeholder="Time(s)" style={{ flex: 2, padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body }} />
                          </div>
                        ))}
                        <button onClick={() => setClaimData(p => ({ ...p, serviceDays: [...p.serviceDays, { day: "", times: "" }] }))} style={{ padding: "6px 12px", borderRadius: T.radiusSm, fontSize: 12, fontWeight: 600, background: T.surfaceAlt, color: T.textSoft, border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>+ Add Service Time</button>
                      </div>
                    </div>

                    {/* Church Size */}
                    <div>
                      <h3 style={{ fontSize: 13, fontFamily: T.heading, fontWeight: 700, margin: "0 0 12px", color: T.text }}>Church Size</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div><label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 4 }}>Average Sunday Attendance</label><input type="number" min="0" value={claimData.avgAttendance} onChange={e => setClaimData(p => ({ ...p, avgAttendance: Math.max(0, parseInt(e.target.value) || 0).toString() }))} placeholder="e.g. 250 people" style={{ width: "100%", padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body, boxSizing: "border-box" }} /></div>
                        <div><label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 4 }}>Paid Staff Members</label><input type="number" min="0" value={claimData.staffCount} onChange={e => setClaimData(p => ({ ...p, staffCount: Math.max(0, parseInt(e.target.value) || 0).toString() }))} placeholder="e.g. 5 staff" style={{ width: "100%", padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body, boxSizing: "border-box" }} /></div>
                        <div><label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 4 }}>Active Volunteers</label><input type="number" min="0" value={claimData.volunteerCount} onChange={e => setClaimData(p => ({ ...p, volunteerCount: Math.max(0, parseInt(e.target.value) || 0).toString() }))} placeholder="e.g. 40 volunteers" style={{ width: "100%", padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body, boxSizing: "border-box" }} /></div>
                        <div><label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 4 }}>Number of Campuses</label><input type="number" min="1" value={claimData.campusCount} onChange={e => setClaimData(p => ({ ...p, campusCount: Math.max(1, parseInt(e.target.value) || 1).toString() }))} placeholder="e.g. 1" style={{ width: "100%", padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body, boxSizing: "border-box" }} /></div>
                      </div>
                    </div>

                    {/* Programs & Ministries */}
                    <div>
                      <h3 style={{ fontSize: 13, fontFamily: T.heading, fontWeight: 700, margin: "0 0 12px", color: T.text }}>Programs & Ministries</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {["Youth Group", "Small Groups", "Children's Ministry", "Missions", "Food Pantry", "Counseling", "Music/Worship Team", "Women's Ministry", "Men's Ministry", "Recovery/Support Groups", "Senior Ministry", "ESL Classes"].map(prog => (
                          <label key={prog} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                            <input type="checkbox" checked={claimData.programs.includes(prog)} onChange={e => setClaimData(p => e.target.checked ? { ...p, programs: [...p.programs, prog] } : { ...p, programs: p.programs.filter(pr => pr !== prog) })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                            {prog}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Contact & Social Media */}
                    <div>
                      <h3 style={{ fontSize: 13, fontFamily: T.heading, fontWeight: 700, margin: "0 0 12px", color: T.text }}>Contact & Social Media</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <input value={claimData.website} onChange={e => setClaimData(p => ({ ...p, website: e.target.value }))} placeholder="Website URL" style={{ width: "100%", padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body }} />
                        <input type="email" value={claimData.churchEmail} onChange={e => setClaimData(p => ({ ...p, churchEmail: e.target.value }))} placeholder="Church email" style={{ width: "100%", padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body }} />
                        <input type="tel" value={claimData.churchPhone} onChange={e => setClaimData(p => ({ ...p, churchPhone: e.target.value }))} placeholder="Church phone" style={{ width: "100%", padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body }} />
                        <input value={claimData.facebook} onChange={e => setClaimData(p => ({ ...p, facebook: e.target.value }))} placeholder="Facebook URL" style={{ width: "100%", padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body }} />
                        <input value={claimData.instagram} onChange={e => setClaimData(p => ({ ...p, instagram: e.target.value }))} placeholder="Instagram handle" style={{ width: "100%", padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body }} />
                        <input value={claimData.youtube} onChange={e => setClaimData(p => ({ ...p, youtube: e.target.value }))} placeholder="YouTube channel URL" style={{ width: "100%", padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body }} />
                        <input value={claimData.livestream} onChange={e => setClaimData(p => ({ ...p, livestream: e.target.value }))} placeholder="Livestream URL" style={{ width: "100%", padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body }} />
                      </div>
                    </div>

                    {/* About */}
                    <div>
                      <h3 style={{ fontSize: 13, fontFamily: T.heading, fontWeight: 700, margin: "0 0 12px", color: T.text }}>About</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <input value={claimData.pastorName} onChange={e => setClaimData(p => ({ ...p, pastorName: e.target.value }))} placeholder="Senior pastor name" style={{ width: "100%", padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body }} />
                        <input type="number" value={claimData.yearFounded} onChange={e => setClaimData(p => ({ ...p, yearFounded: e.target.value }))} placeholder="Year founded" style={{ width: "100%", padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body }} />
                        <textarea value={claimData.description} onChange={e => setClaimData(p => ({ ...p, description: e.target.value }))} rows={3} placeholder="Church description (250 words max)" style={{ width: "100%", padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body, resize: "vertical" }} />
                      </div>
                    </div>
                  </div>
                  </>}
                  {claimStep === "form" && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
                      <button onClick={() => { setShowClaimModal(false); setClaimStep("form"); }} style={{ padding: "10px 20px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.surface, color: T.textSoft, border: `1.5px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>Cancel</button>
                      <button onClick={() => sendClaimVerification(currentChurch.id)} disabled={claimSubmitting || !claimData.fullName || !claimData.roleAtChurch || !claimData.workEmail} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, opacity: (claimSubmitting || !claimData.fullName || !claimData.roleAtChurch || !claimData.workEmail) ? 0.5 : 1 }}>{claimSubmitting ? "Sending..." : "Verify Email →"}</button>
                    </div>
                  )}

                  {claimStep === "verify" && (
                    <div style={{ marginTop: 24 }}>
                      <div style={{ padding: "20px", borderRadius: T.radius, background: T.accentSoft, border: `1px solid ${T.accentBorder}`, textAlign: "center", marginBottom: 20 }}>
                        <div style={{ fontSize: 28, marginBottom: 8 }}>📧</div>
                        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.heading, marginBottom: 4 }}>Check your email</div>
                        <div style={{ fontSize: 12, color: T.textSoft }}>We sent a 6-digit code to <strong>{claimData.workEmail}</strong></div>
                      </div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>Verification code</label>
                      <input value={verifyCodeInput} onChange={e => { setVerifyCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6)); setVerifyError(""); }} placeholder="Enter 6-digit code" maxLength={6} style={{ width: "100%", padding: "14px 16px", borderRadius: T.radiusSm, fontSize: 20, fontWeight: 700, letterSpacing: "6px", textAlign: "center", border: `1.5px solid ${verifyError ? T.red : T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: "monospace" }} />
                      {verifyError && <div style={{ fontSize: 12, color: T.red, marginTop: 6 }}>{verifyError}</div>}
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
                        <button onClick={() => { setClaimStep("form"); setVerifyCodeInput(""); setVerifyError(""); }} style={{ padding: "10px 20px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.surface, color: T.textSoft, border: `1.5px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>← Back</button>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => sendClaimVerification(currentChurch.id)} disabled={claimSubmitting} style={{ padding: "10px 16px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.surface, color: T.textSoft, border: `1.5px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>Resend</button>
                          <button onClick={() => verifyClaimCode(currentChurch.id)} disabled={claimSubmitting || verifyCodeInput.length !== 6} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, opacity: (claimSubmitting || verifyCodeInput.length !== 6) ? 0.5 : 1 }}>{claimSubmitting ? "Verifying..." : "Verify & Continue to Payment →"}</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {claimStep === "done" && (
                    <div style={{ marginTop: 24, textAlign: "center", padding: "20px 0" }}>
                      <div style={{ width: 56, height: 56, borderRadius: 28, background: T.greenSoft, border: `2px solid ${T.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 16px" }}>✔</div>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.heading }}>Email verified!</div>
                      <div style={{ fontSize: 13, color: T.textSoft, marginTop: 4 }}>Redirecting you to set up your subscription...</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Report Church Modal */}
            {showReportModal && currentChurch && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowReportModal(false)}>
                <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: T.radius + 4, padding: "32px 28px", maxWidth: 480, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
                  {reportSubmitted ? (
                    <div style={{ textAlign: "center", padding: "12px 0" }}>
                      <div style={{ width: 56, height: 56, borderRadius: 28, background: T.greenSoft, border: `2px solid ${T.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 16px" }}>✔</div>
                      <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.03em" }}>Report received</h2>
                      <p style={{ fontSize: 14, color: T.textSoft, margin: "0 0 20px" }}>Thank you for helping us maintain the integrity of our platform. Our team will review this report.</p>
                      <button onClick={() => setShowReportModal(false)} style={{ padding: "10px 28px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.text, color: T.bg, border: "none", cursor: "pointer", fontFamily: T.body }}>Close</button>
                    </div>
                  ) : (
                    <>
                      <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.03em" }}>Report {currentChurch.name}</h2>
                      <p style={{ fontSize: 13, color: T.textSoft, margin: "0 0 20px" }}>Help us keep By Their Fruit accurate. Flag this church if something seems off.</p>

                      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 10 }}>What's the issue?</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                        {[
                          { value: "not_christian", label: "Not a Christian church" },
                          { value: "lgbtq_affirming", label: "LGBTQ+ affirming" },
                          { value: "false_teaching", label: "False teaching" },
                          { value: "cult_or_abusive", label: "Cult or abusive practices" },
                          { value: "closed_or_moved", label: "Closed or moved" },
                          { value: "duplicate", label: "Duplicate listing" },
                          { value: "other", label: "Other" },
                        ].map(opt => (
                          <button key={opt.value} onClick={() => setReportData(p => ({ ...p, reason: opt.value }))} style={{
                            padding: "7px 16px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.body, transition: "all 0.15s",
                            background: reportData.reason === opt.value ? T.red : T.surfaceAlt,
                            color: reportData.reason === opt.value ? "#fff" : T.textSoft,
                            border: `1px solid ${reportData.reason === opt.value ? T.red : T.border}`,
                          }}>{opt.label}</button>
                        ))}
                      </div>

                      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>Additional details (optional)</div>
                      <textarea value={reportData.description} onChange={e => setReportData(p => ({ ...p, description: e.target.value }))} placeholder="Provide any additional context..." rows={3} style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, border: `1.5px solid ${T.border}`, background: T.surfaceAlt, color: T.text, fontSize: 13, fontFamily: T.body, resize: "vertical", outline: "none", boxSizing: "border-box" }} />

                      <button disabled={!reportData.reason || reportSubmitting} onClick={async () => {
                        setReportSubmitting(true);
                        const { error } = await supabase.from("church_reports").insert({
                          church_id: currentChurch.id,
                          user_id: user?.id || null,
                          reason: reportData.reason,
                          description: reportData.description || null,
                        });
                        setReportSubmitting(false);
                        if (error) { showToast("Failed to submit report. Please try again.", "error"); }
                        else { setReportSubmitted(true); }
                      }} style={{
                        marginTop: 16, width: "100%", padding: "12px 24px", borderRadius: T.radiusFull, fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", fontFamily: T.body, transition: "all 0.2s",
                        background: T.red, color: "#fff",
                        opacity: (!reportData.reason || reportSubmitting) ? 0.5 : 1,
                      }}>{reportSubmitting ? "Submitting..." : "Submit Report"}</button>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="btf-profile-grid" style={{ display: "grid", gridTemplateColumns: "270px 1fr", gap: 20, alignItems: "start", marginTop: 24 }}>
              <FadeIn delay={120}>
                <div style={{ padding: "22px", borderRadius: T.radius, background: T.surface, border: `1.5px solid ${T.border}`, position: "sticky", top: 64 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, marginBottom: 14 }}>Congregation Assessment</div>
                  {rated ? CATEGORIES.map(cat => <ScoreBar key={cat.id} label={cat.label} score={c.scores[cat.id] || 0} />) : (
                    <div style={{ padding: "20px 0", textAlign: "center" }}>
                      <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 8 }}>Scores appear after {MIN_REVIEWS_FOR_SCORE} experiences</div>
                      <div style={{ width: "100%", height: 4, borderRadius: 2, background: T.surfaceAlt, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 2, width: `${(c.totalReviews / MIN_REVIEWS_FOR_SCORE) * 100}%`, background: T.accent, opacity: 0.5, transition: "width 0.5s" }} />
                      </div>
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{c.totalReviews} of {MIN_REVIEWS_FOR_SCORE}</div>
                    </div>
                  )}
                </div>
              </FadeIn>

              <div>
                <FadeIn delay={180}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h3 style={{ fontSize: 17, fontFamily: T.heading, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Experiences</h3>
                    {(() => {
                      const existing = user && userReviews[c.id];
                      const canEdit = existing && (Date.now() - existing.postedAt >= 7 * 24 * 60 * 60 * 1000);
                      const daysLeft = existing ? Math.ceil((7 * 24 * 60 * 60 * 1000 - (Date.now() - existing.postedAt)) / (24 * 60 * 60 * 1000)) : 0;
                      return existing ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {!canEdit && <span style={{ fontSize: 11, color: T.textMuted }}>Edit in {daysLeft}d</span>}
                          <button onClick={() => startRateFlow(c)} disabled={!canEdit} style={{ padding: "8px 18px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: canEdit ? T.accent : T.surfaceAlt, color: canEdit ? "#fff" : T.textMuted, border: "none", cursor: canEdit ? "pointer" : "not-allowed", fontFamily: T.body }}>Edit Your Experience</button>
                        </div>
                      ) : (
                        <button onClick={() => startRateFlow(c)} style={{ padding: "8px 18px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.text, color: T.bg, border: "none", cursor: "pointer", fontFamily: T.body }}>Share Your Experience</button>
                      );
                    })()}
                  </div>
                </FadeIn>

                {c.recentReviews.length === 0 && (
                  <div style={{ padding: "40px 20px", textAlign: "center", borderRadius: T.radius, background: T.surface, border: `1.5px dashed ${T.border}` }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: T.textSoft, marginBottom: 4 }}>No experiences yet</div>
                    <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 16 }}>Be the first to share your experience at {c.name}.</div>
                    <button onClick={() => startRateFlow(c)} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body }}>Share Your Experience</button>
                  </div>
                )}

                {c.recentReviews.map((rev, i) => {
                  const isOwner = user && c.claimedBy === user.id;
                  const enrichedRev = isOwner ? {
                    ...rev,
                    _isChurchOwner: true,
                    _showResponseForm: respondingTo === rev.id,
                    _responseText: responseText,
                    _responseSubmitting: responseSubmitting,
                    _onStartResponse: () => { setRespondingTo(rev.id); setResponseText(""); },
                    _onCancelResponse: () => { setRespondingTo(null); setResponseText(""); },
                    _onResponseChange: (val) => setResponseText(val),
                    _onSubmitResponse: () => submitChurchResponse(rev.id, c.id),
                  } : rev;
                  return <ReviewCard key={rev.id || i} rev={enrichedRev} delay={240 + i * 70} userId={user?.id} nameLevel={isOwner ? "church" : "public"} onDelete={(deletedId) => {
                    setChurches(prev => prev.map(ch => ch.id === c.id ? { ...ch, recentReviews: ch.recentReviews.filter(r => r.id !== deletedId) } : ch));
                    setUserReviews(prev => { const next = { ...prev }; delete next[c.id]; return next; });
                    showToast("Your review has been deleted", "info");
                  }} />;
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* RATE */}
      {!loading && page === "rate" && (
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "36px 24px" }}>
          <FadeIn>
            <div style={{ display: "flex", gap: 3, marginBottom: 32 }}>
              {["Find Church", "Share", "Done"].map((s, i) => {
                const stepMap = [0, 1, 3];
                const active = rateStep >= stepMap[i];
                return (
                <div key={i} style={{ flex: 1 }}>
                  <div style={{ height: 3, borderRadius: 2, marginBottom: 5, background: active ? T.accent : T.surfaceAlt, transition: "background 0.3s" }} />
                  <span style={{ fontSize: 10, fontFamily: T.heading, fontWeight: 600, letterSpacing: "0.04em", color: active ? T.accent : T.textMuted, textTransform: "uppercase" }}>{s}</span>
                </div>
                );
              })}
            </div>
          </FadeIn>

          {/* STEP 0: Search */}
          {rateStep === 0 && !showAddChurch && (
            <FadeIn>
              <h2 style={{ fontSize: 26, fontFamily: T.heading, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.03em" }}>Which church are you rating?</h2>
              <p style={{ fontSize: 14, color: T.textSoft, margin: "0 0 20px" }}>Search by name or city.</p>
              <div style={{ position: "relative", marginBottom: 16 }}>
                <input autoFocus value={rateSearch} onChange={e => setRateSearch(e.target.value)} placeholder="e.g. Grace Baptist Tampa..." style={{ width: "100%", padding: "14px 18px 14px 44px", borderRadius: T.radius, fontSize: 15, border: `1.5px solid ${rateSearch ? T.accentBorder : T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body, transition: "border-color 0.2s" }} />
                <svg style={{ position: "absolute", left: 16, top: 16, opacity: 0.3 }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.text} strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {rateSearchResults.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, marginBottom: 2, marginTop: 4 }}>On By Their Fruit</div>
                    {rateSearchResults.map(c => (
                      <div key={c.id} onClick={() => selectChurchToRate(c)} style={{ padding: "14px 18px", borderRadius: T.radius, cursor: "pointer", background: T.surface, border: `1.5px solid ${T.border}`, transition: "all 0.15s", display: "flex", justifyContent: "space-between", alignItems: "center" }} onMouseEnter={e => e.currentTarget.style.borderColor = T.accentBorder} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.heading, letterSpacing: "-0.02em" }}>{c.name}</div>
                          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{c.denomination} · {c.city}, {c.state}</div>
                        </div>
                        {c.totalReviews > 0 && <div style={{ padding: "3px 8px", borderRadius: T.radiusFull, fontSize: 10, background: T.surfaceAlt, color: T.textMuted, fontWeight: 600 }}>{c.totalReviews} experiences</div>}
                      </div>
                    ))}
                  </>
                )}
                {rateSearch.length === 0 && <div style={{ padding: "32px", textAlign: "center" }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={T.border} strokeWidth="1.5" style={{ margin: "0 auto 10px", display: "block" }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg><div style={{ fontSize: 13, color: T.textMuted }}>Type a church name or city to get started</div></div>}
              </div>
              <div style={{ marginTop: 24, padding: "18px 20px", borderRadius: T.radius, background: T.surface, border: `1.5px dashed ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", transition: "all 0.15s" }} onClick={() => { setShowAddChurch(true); setAddData(p => ({ ...p, name: rateSearch })); }} onMouseEnter={e => e.currentTarget.style.borderColor = T.accent} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                <div><div style={{ fontSize: 14, fontWeight: 600 }}>Don't see your church?</div><div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>Add it to By Their Fruit so others can find and share their experience too.</div></div>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: T.accentSoft, border: `1px solid ${T.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: T.accent, fontWeight: 300, flexShrink: 0 }}>+</div>
              </div>
            </FadeIn>
          )}

          {/* ADD CHURCH */}
          {rateStep === 0 && showAddChurch && (
            <FadeIn>
              <button onClick={() => setShowAddChurch(false)} style={{ background: "none", border: "none", color: T.accent, fontSize: 13, cursor: "pointer", fontWeight: 600, padding: 0, marginBottom: 16, fontFamily: T.body }}>← Back to search</button>
              <h2 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.03em" }}>Add a church</h2>
              <p style={{ fontSize: 13, color: T.textSoft, margin: "0 0 24px" }}>Fill in what you know — you can always update later.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div><label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>Church name *</label><input value={addData.name} onChange={e => setAddData(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Grace Community Church" style={{ width: "100%", padding: "11px 14px", borderRadius: T.radiusSm, fontSize: 14, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} /></div>
                <div><label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>Street address</label><input value={addData.address} onChange={e => setAddData(p => ({ ...p, address: e.target.value }))} placeholder="e.g. 4210 Bayshore Blvd" style={{ width: "100%", padding: "11px 14px", borderRadius: T.radiusSm, fontSize: 14, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 10 }}>
                  <div><label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>City *</label><input value={addData.city} onChange={e => setAddData(p => ({ ...p, city: e.target.value }))} placeholder="e.g. Tampa" style={{ width: "100%", padding: "11px 14px", borderRadius: T.radiusSm, fontSize: 14, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} /></div>
                  <div><label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>State</label><input value={addData.state} onChange={e => setAddData(p => ({ ...p, state: e.target.value }))} placeholder="FL" maxLength={2} style={{ width: "100%", padding: "11px 14px", borderRadius: T.radiusSm, fontSize: 14, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body, textTransform: "uppercase" }} /></div>
                </div>
                <div><label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>Denomination</label><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{["Non-Denominational", "Baptist", "Methodist", "Presbyterian", "Assemblies of God", "Catholic", "Lutheran", "Church of Christ", "Pentecostal", "Episcopal", "Reformed", "Other"].map(d => <Chip key={d} active={addData.denomination === d} onClick={() => setAddData(p => ({ ...p, denomination: d }))}>{d}</Chip>)}</div></div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
                <button onClick={() => setShowAddChurch(false)} style={{ padding: "10px 20px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.surface, color: T.textSoft, border: `1.5px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>Cancel</button>
                <button onClick={addManualChurch} disabled={!addData.name.trim() || !addData.city.trim()} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.text, color: T.bg, border: "none", cursor: "pointer", fontFamily: T.body, opacity: (!addData.name.trim() || !addData.city.trim()) ? 0.3 : 1 }}>Add Church & Rate →</button>
              </div>
            </FadeIn>
          )}

          {/* STEP 1: Rate */}
          {rateStep === 1 && rateChurch && (
            <FadeIn>
              <div style={{ padding: "14px 18px", borderRadius: T.radius, background: T.accentSoft, border: `1px solid ${T.accentBorder}`, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.heading, letterSpacing: "-0.02em" }}>{rateChurch.name}</div><div style={{ fontSize: 12, color: T.textSoft }}>{rateChurch.denomination} · {rateChurch.city}, {rateChurch.state}</div></div>
                <button onClick={() => setRateStep(0)} style={{ fontSize: 12, fontWeight: 600, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: T.body }}>Change</button>
              </div>

              {/* Before You Share - Matthew 18 Guidance & Community Guidelines */}
              <div style={{ padding: "16px 14px", borderRadius: T.radiusSm, background: T.surfaceAlt, border: `1px solid ${T.border}`, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 18, marginTop: 2 }}>📖</div>
                  <div>
                    <h3 style={{ fontSize: 13, fontWeight: 700, fontFamily: T.heading, margin: "0 0 6px", letterSpacing: "-0.01em" }}>Before You Share</h3>
                    <p style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.6, margin: "0 0 10px" }}>Scripture calls us to address personal grievances directly with our brothers and sisters before bringing them to a wider audience (Matthew 18:15-17). If your concern involves a specific person or a personal conflict, we encourage you to seek resolution privately first. This platform is for sharing your overall church experience, not for settling personal disputes.</p>
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 8, letterSpacing: "-0.01em" }}>Community Guidelines</div>
                <ul style={{ fontSize: 11, color: T.textSoft, lineHeight: 1.7, margin: "0 0 0 16px", paddingLeft: 0 }}>
                  <li>Share from your own firsthand experience — not secondhand stories or rumors</li>
                  <li>Focus on your experience, not doctrinal debates (e.g., Calvinism vs. Arminianism disagreements will not be published)</li>
                  <li>No naming specific individuals in a negative context</li>
                  <li>No personal attacks, threats, or inflammatory language</li>
                  <li>Coordinated experience campaigns will be detected and removed</li>
                  <li>Constructive criticism is welcome — help churches grow, don't tear them down</li>
                </ul>
              </div>

              <h2 style={{ fontSize: 22, fontFamily: T.heading, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.03em" }}>{isEditing ? "Update your ratings" : "Rate your church experience"}</h2>
              <p style={{ fontSize: 13, color: T.textSoft, margin: "0 0 20px" }}>Slide or tap stars. Only rate what you've experienced. Add optional comments to explain your rating.</p>

              {CATEGORY_GROUPS.map(group => (
                <div key={group.label} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, marginBottom: 8 }}>{group.label}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {group.ids.map(id => { const cat = CATEGORIES.find(c => c.id === id); return cat ? (
                      <RatingSlider key={id} label={cat.label} desc={cat.desc}
                        value={rateScores[id] || 0} onChange={v => setRateScores(p => ({ ...p, [id]: v }))}
                        comment={rateComments[id] || ""} onCommentChange={v => setRateComments(p => ({ ...p, [id]: v }))}
                        skipped={!!rateSkipped[id]} onSkipToggle={v => { setRateSkipped(p => ({ ...p, [id]: v })); if (v) { setRateScores(p => { const n = { ...p }; delete n[id]; return n; }); setRateComments(p => { const n = { ...p }; delete n[id]; return n; }); } }} />
                    ) : null; })}
                  </div>
                </div>
              ))}

              {(() => {
                const activeScores = Object.entries(rateScores).filter(([k]) => !rateSkipped[k]);
                const lowWithoutComment = activeScores.filter(([k, v]) => v <= 2.9 && !rateComments[k]?.trim());
                const canProceed = activeScores.length > 0 && lowWithoutComment.length === 0;
                return (
                  <div style={{ marginTop: 8 }}>
                    {lowWithoutComment.length > 0 && (
                      <div style={{ padding: "10px 14px", borderRadius: T.radiusSm, background: T.amberSoft, border: `1px solid ${T.amberBorder}`, marginBottom: 10, fontSize: 12, color: T.amber, fontWeight: 500 }}>
                        Please add a comment for {lowWithoutComment.length === 1 ? "the category" : "the categories"} you rated below 3.0: {lowWithoutComment.map(([k]) => CATEGORIES.find(c => c.id === k)?.label.split("&")[0].trim()).join(", ")}
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <button onClick={() => setRateStep(0)} style={{ padding: "10px 20px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.surface, color: T.textSoft, border: `1.5px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>← Back</button>
                      <button onClick={() => { if (canProceed) setRateStep(2); else showToast("Please add comments for all categories rated below 3.0", "warning"); }} disabled={activeScores.length === 0} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.text, color: T.bg, border: "none", cursor: "pointer", fontFamily: T.body, opacity: activeScores.length === 0 ? 0.3 : canProceed ? 1 : 0.6 }}>Continue →</button>
                    </div>
                  </div>
                );
              })()}
            </FadeIn>
          )}

          {/* STEP 2: Story */}
          {rateStep === 2 && rateChurch && (
            <FadeIn>
              <div style={{ padding: "14px 18px", borderRadius: T.radius, background: T.accentSoft, border: `1px solid ${T.accentBorder}`, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.heading, letterSpacing: "-0.02em" }}>{rateChurch.name}</div><div style={{ fontSize: 12, color: T.textSoft }}>{Object.keys(rateScores).filter(k => !rateSkipped[k]).length} rated · {Object.keys(rateSkipped).filter(k => rateSkipped[k]).length} skipped · Avg {(() => { const vals = Object.entries(rateScores).filter(([k]) => !rateSkipped[k]).map(([,v]) => v); return vals.length ? (vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(1) : "\u2014"; })()}</div></div>
                <button onClick={() => setRateStep(1)} style={{ fontSize: 12, fontWeight: 600, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: T.body }}>Edit Ratings</button>
              </div>
              <h2 style={{ fontSize: 22, fontFamily: T.heading, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.03em" }}>Share your experience</h2>
              <p style={{ fontSize: 13, color: T.textSoft, margin: "0 0 20px" }}>Your honest experience helps families find the right church and helps churches grow.</p>
              <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 7 }}>Your relationship</label><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{["First-time Visitor", "Repeat Visitor", "Member (< 1 yr)", "Member (1\u20133 yrs)", "Member (3+ yrs)", "Former Member"].map(r => <Chip key={r} active={rateRole === r} onClick={() => setRateRole(r)}>{r}</Chip>)}</div></div>
              <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 7 }}>Last visited</label><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{["This week", "This month", "1\u20133 months ago", "3\u20136 months ago", "6\u201312 months ago", "Over a year ago"].map(v => <Chip key={v} active={rateLastVisited === v} onClick={() => setRateLastVisited(v)}>{v}</Chip>)}</div></div>
              <div style={{ marginBottom: 8 }}><label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>Your experience <span style={{ fontWeight: 400, color: T.textMuted }}>(minimum 20 characters)</span></label><textarea value={rateText} onChange={e => setRateText(e.target.value)} placeholder="Share your experience — what stood out, what could improve, what should a visitor know?" rows={5} maxLength={2000} style={{ width: "100%", padding: "12px 16px", borderRadius: T.radius, fontSize: 14, border: `1.5px solid ${rateText.length > 0 && rateText.trim().length < 20 ? T.amber : T.border}`, background: T.surface, color: T.text, outline: "none", resize: "vertical", lineHeight: 1.65, fontFamily: T.body, boxSizing: "border-box" }} /></div>
              {rateText.length > 0 && rateText.trim().length < 20 ? (
                <div style={{ fontSize: 12, color: T.amber, fontWeight: 600, marginBottom: 20, display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {20 - rateText.trim().length} more characters needed (minimum 20)
                </div>
              ) : (
                <div style={{ fontSize: 11, color: rateText.length >= 2000 ? T.red : rateText.length > 1800 ? T.amber : T.textMuted, marginBottom: 20 }}>{rateText.length}/2,000 characters</div>
              )}
              {/* Photo upload */}
              <div style={{ padding: "14px 16px", borderRadius: T.radius, background: T.surfaceAlt, border: `1px solid ${T.border}`, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ratePhotos.length > 0 ? 12 : 0 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: T.heading, marginBottom: 2 }}>📸 Add photos</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>Optional — up to {MAX_REVIEW_PHOTOS} photos (5MB each, JPG/PNG/WebP)</div>
                  </div>
                  {ratePhotos.length < MAX_REVIEW_PHOTOS && (
                    <label style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 11, fontWeight: 600, background: T.accent, color: "#fff", cursor: "pointer", fontFamily: T.body, display: "inline-block" }}>
                      Add Photo
                      <input type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: "none" }} onChange={e => {
                        const files = Array.from(e.target.files || []);
                        const remaining = MAX_REVIEW_PHOTOS - ratePhotos.length;
                        const toAdd = files.slice(0, remaining);
                        const valid = toAdd.filter(f => {
                          if (f.size > 5 * 1024 * 1024) { showToast(`${f.name} exceeds 5MB limit`, "error"); return false; }
                          if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) { showToast(`${f.name} is not a supported format`, "error"); return false; }
                          return true;
                        });
                        if (valid.length > 0) {
                          setRatePhotos(prev => [...prev, ...valid.map(f => ({ file: f, preview: URL.createObjectURL(f) }))]);
                        }
                        e.target.value = "";
                      }} />
                    </label>
                  )}
                </div>
                {ratePhotos.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {ratePhotos.map((photo, i) => (
                      <div key={i} style={{ position: "relative", width: 80, height: 80, borderRadius: T.radiusSm, overflow: "hidden", border: `1.5px solid ${T.border}` }}>
                        <img src={photo.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button onClick={() => { URL.revokeObjectURL(photo.preview); setRatePhotos(prev => prev.filter((_, j) => j !== i)); }} style={{ position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, padding: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Location verification */}
              <div style={{ padding: "14px 16px", borderRadius: T.radius, background: T.surfaceAlt, border: `1px solid ${T.border}`, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: T.heading, marginBottom: 2 }}>📍 Verify your location</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>Optional — helps confirm you're near this church</div>
                  </div>
                  {locationStatus === "idle" && (
                    <button onClick={() => {
                      if (!navigator.geolocation) { setLocationStatus("unavailable"); return; }
                      setLocationStatus("requesting");
                      navigator.geolocation.getCurrentPosition(
                        (pos) => { setReviewerLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocationStatus("granted"); },
                        () => { setLocationStatus("denied"); },
                        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
                      );
                    }} style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 11, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body }}>Share Location</button>
                  )}
                  {locationStatus === "requesting" && <span style={{ fontSize: 11, color: T.textMuted }}>Requesting...</span>}
                  {locationStatus === "granted" && <span style={{ fontSize: 11, color: T.green, fontWeight: 600 }}>✓ Location shared</span>}
                  {locationStatus === "denied" && <span style={{ fontSize: 11, color: T.textMuted }}>Location declined</span>}
                  {locationStatus === "unavailable" && <span style={{ fontSize: 11, color: T.textMuted }}>Not available</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 20 }}>
                {Object.entries(rateScores).filter(([k]) => !rateSkipped[k]).map(([k, v]) => { const cat = CATEGORIES.find(c => c.id === k); const r = Math.round(v); return <span key={k} style={{ fontSize: 11, padding: "3px 10px", borderRadius: T.radiusFull, background: scoreBg(r), border: `1px solid ${scoreBorder2(r)}`, color: scoreColor(r), fontWeight: 700, fontFamily: T.heading }}>{cat?.label.split("&")[0].split("/")[0].trim()} {v.toFixed(1)}</span>; })}
                {Object.keys(rateSkipped).filter(k => rateSkipped[k]).length > 0 && (
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: T.radiusFull, background: T.surfaceAlt, border: `1px solid ${T.border}`, color: T.textMuted, fontWeight: 500 }}>
                    {Object.keys(rateSkipped).filter(k => rateSkipped[k]).length} marked "not sure"
                  </span>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={() => setRateStep(1)} style={{ padding: "10px 20px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.surface, color: T.textSoft, border: `1.5px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>← Back</button>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {!user && <span style={{ fontSize: 12, color: T.textMuted }}>Sign in required</span>}
                  <button onClick={handleRateSubmit} disabled={!rateRole || !rateLastVisited || rateText.trim().length < 20 || submitting} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, opacity: (!rateRole || !rateLastVisited || rateText.trim().length < 20 || submitting) ? 0.3 : 1, boxShadow: "0 2px 8px rgba(37,99,235,0.2)" }}>{submitting ? "Submitting..." : !user ? "Sign In & Submit" : isEditing ? "Update Experience" : "Submit Experience"}</button>
                </div>
              </div>
            </FadeIn>
          )}

          {/* STEP 3: Done */}
          {rateStep === 3 && (
            <FadeIn>
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ width: 64, height: 64, borderRadius: 32, background: T.greenSoft, border: `2px solid ${T.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 20px" }}>✔</div>
                <h2 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.03em" }}>{isEditing ? "Experience updated" : "Experience submitted!"}</h2>
                <p style={{ fontSize: 14, color: T.textSoft, margin: "0 0 4px" }}>Your experience with <strong>{rateChurch?.name}</strong> has been submitted and will be visible after admin approval.</p>
                <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 32px" }}>Our team reviews every submission to ensure quality and authenticity. This usually takes less than 24 hours.</p>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  <button onClick={() => { const c = churches.find(ch => ch.id === rateChurch?.id); if (c) viewChurch(c); }} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.text, color: T.bg, border: "none", cursor: "pointer", fontFamily: T.body }}>View Church Profile</button>
                  <button onClick={() => startRateFlow()} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.surface, color: T.textSoft, border: `1.5px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>Share Another Experience</button>
                </div>
              </div>
            </FadeIn>
          )}
        </div>
      )}

      {/* ABOUT */}
      {!loading && page === "about" && (
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "56px 24px" }}>
          <FadeIn>
            <h1 style={{ fontSize: 34, fontFamily: T.heading, fontWeight: 800, lineHeight: 1.12, margin: "0 0 28px", letterSpacing: "-0.04em" }}>How It Works</h1>
            <div style={{ fontSize: 15, color: T.textSoft, lineHeight: 1.75 }}>
              <p>Every church has a website that says the same things. <em>Welcoming community. Bible-based teaching. A place to belong.</em> But how do you know if it's true? The people who attend do.</p>
              <h3 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 10px", letterSpacing: "-0.03em", color: T.text }}>1. Find a church</h3>
              <p>Search by name, city, state, or denomination. Every church in our directory can be discovered and explored.</p>
              <h3 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 10px", letterSpacing: "-0.03em", color: T.text }}>2. Read real experiences</h3>
              <p>See structured, honest feedback from actual congregants and visitors across ten categories rooted in what scripture says a healthy church should look like.</p>
              <h3 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 10px", letterSpacing: "-0.03em", color: T.text }}>3. Share your own</h3>
              <p>Rate your church across ten biblical categories. Add comments to explain your ratings. Your experience helps others find the right church — and helps churches grow.</p>
              <h3 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 10px", letterSpacing: "-0.03em", color: T.text }}>4. Churches can respond</h3>
              <p>Verified church owners can claim their profile, respond to experiences publicly, and access insights about their congregation. They cannot delete, edit, or pay to suppress feedback.</p>
              <div style={{ padding: "28px", borderRadius: T.radius, background: T === DARK ? T.surfaceAlt : T.text, color: T === DARK ? T.text : T.bg, margin: "28px 0", textAlign: "center" }}>
                <p style={{ fontSize: 17, fontStyle: "italic", lineHeight: 1.6, margin: "0 0 8px", opacity: 0.85 }}>"Beware of false prophets, who come to you in sheep's clothing but inwardly are ravenous wolves. You will recognize them by their fruits."</p>
                <div style={{ fontSize: 12, opacity: 0.4, fontWeight: 600 }}>Matthew 7:15–16 ESV</div>
              </div>
              <h3 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "36px 0 14px", letterSpacing: "-0.03em" }}>The 10 Church Experiences</h3>
              {CATEGORY_GROUPS.map(group => (
                <div key={group.label} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, marginBottom: 8 }}>{group.label}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {group.ids.map(id => { const cat = CATEGORIES.find(c => c.id === id); const idx = CATEGORIES.indexOf(cat); return cat ? (
                      <div key={id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: T.radiusSm, background: T.surface, border: `1px solid ${T.border}` }}>
                        <div style={{ minWidth: 26, height: 26, borderRadius: 6, background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, fontFamily: T.heading, color: T.textMuted, border: `1px solid ${T.border}` }}>{String(idx + 1).padStart(2, "0")}</div>
                        <div><div style={{ fontWeight: 700, fontSize: 13.5, fontFamily: T.heading }}>{cat.label}</div><div style={{ fontSize: 13, color: T.textSoft, marginTop: 1 }}>{cat.desc}</div></div>
                      </div>
                    ) : null; })}
                  </div>
                </div>
              ))}
              <h3 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "36px 0 10px", letterSpacing: "-0.03em" }}>Moderation</h3>
              <p>Every experience submission is reviewed before publication. We filter personal attacks, coordinated campaigns, and doctrinal arguments disguised as experience ratings. Users can flag submissions they believe are inappropriate.</p>
              <p>Churches can respond to experiences publicly. They cannot delete, edit, or pay to suppress them.</p>
            </div>
          </FadeIn>
        </div>
      )}

      {/* SAVED CHURCHES */}
      {!loading && page === "saved" && user && (
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "36px 24px" }}>
          <FadeIn>
            <h1 style={{ fontSize: 30, fontFamily: T.heading, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.03em" }}>Saved Churches</h1>
            <p style={{ fontSize: 14, color: T.textMuted, margin: "0 0 28px" }}>Churches you've bookmarked for later</p>

            {/* Loading saved churches from favorites */}
            {savedChurches === null && <div style={{ textAlign: "center", padding: "60px 24px" }}><div style={{ display: "inline-block", width: 24, height: 24, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.6s linear infinite" }} /></div>}

            {savedChurches && savedChurches.length === 0 && (
              <div style={{ padding: "48px 24px", textAlign: "center", borderRadius: T.radius, background: T.surface, border: `1.5px dashed ${T.border}` }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>&#x2661;</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 4 }}>No saved churches yet</div>
                <div style={{ fontSize: 14, color: T.textMuted, marginBottom: 20 }}>Tap the heart on any church to save it here.</div>
                <button onClick={() => navigate("discover")} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, fontFamily: T.body, cursor: "pointer", background: T.accent, color: "#fff", border: "none" }}>Browse Churches</button>
              </div>
            )}

            {savedChurches && savedChurches.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {savedChurches.map(ch => (
                  <div key={ch.id} onClick={() => viewChurch(ch)} style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}`, cursor: "pointer", transition: "border-color 0.15s", position: "relative" }} onMouseEnter={e => e.currentTarget.style.borderColor = T.accent} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                    <button onClick={(e) => { e.stopPropagation(); toggleFavorite(ch.id); }} style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: 4, lineHeight: 1 }}>❤️</button>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.heading, color: T.text, marginBottom: 2 }}>{ch.name}</div>
                    <div style={{ fontSize: 13, color: T.textMuted }}>{ch.denomination} &middot; {ch.city}, {ch.state}</div>
                    {ch.scoreOverall && <div style={{ marginTop: 8, display: "inline-block", padding: "4px 10px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 700, fontFamily: T.heading, color: scoreColor(ch.scoreOverall), background: scoreBg(ch.scoreOverall), border: `1px solid ${scoreBorder2(ch.scoreOverall)}` }}>{ch.scoreOverall.toFixed(1)} &middot; {ch.totalReviews} experience{ch.totalReviews !== 1 ? "s" : ""}</div>}
                  </div>
                ))}
              </div>
            )}
          </FadeIn>
        </div>
      )}

      {/* INTELLIGENCE DASHBOARD */}
      {!loading && page === "dashboard" && user && hasClaimed && (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>
          <FadeIn>
            {myChurchesLoading && (
              <div style={{ textAlign: "center", padding: "60px 24px" }}>
                <div style={{ display: "inline-block", width: 24, height: 24, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
              </div>
            )}

            {!myChurchesLoading && myChurchesData.claimed.length > 0 && (() => {
              const oc = myChurchesData.claimed[0];
              const ocScores = {};
              SCORE_FIELDS.forEach(f => { if (oc[`score_${f}`] != null) ocScores[f] = parseFloat(oc[`score_${f}`]); });
              const overall = Object.values(ocScores).length > 0 ? Object.values(ocScores).reduce((a, b) => a + b, 0) / Object.values(ocScores).length : 0;
              const benchmarks = dashboardBenchmarks[benchmarkLevel] || {};

              const getTrend = (catId) => {
                const catSnaps = dashboardTrends.filter(s => s.category === catId);
                if (catSnaps.length < 2) return null;
                const recent = catSnaps.slice(-3);
                const older = catSnaps.slice(0, Math.max(1, Math.floor(catSnaps.length / 2)));
                const recentAvg = recent.reduce((acc, s) => acc + (parseFloat(s.score_value) || 0), 0) / recent.length;
                const olderAvg = older.reduce((acc, s) => acc + (parseFloat(s.score_value) || 0), 0) / older.length;
                return recentAvg - olderAvg;
              };

              const lowestCategories = CATEGORIES
                .map(cat => ({ ...cat, score: ocScores[cat.id] || 0 }))
                .filter(cat => cat.score > 0)
                .sort((a, b) => a.score - b.score)
                .slice(0, 3);

              const categoryInsights = {
                teaching: "Strong biblical teaching is foundational. Consider sermon recordings or study guides to deepen impact.",
                welcome: "First impressions matter. Train greeters and follow-up teams to strengthen visitor experience.",
                community: "Deep relationships are the heart of church life. Invest in small groups and discipleship.",
                worship: "Authentic worship connects people to God. Ensure music selections serve the message, not distract from it.",
                prayer: "Prayer is the breath of the church. Dedicate time and resources to corporate and personal intercession.",
                kids: "Children\u2019s ministry shapes the next generation. Ensure safety, teaching quality, and volunteer engagement.",
                youth: "Youth thrive with mentorship. Connect teens with mature believers and meaningful discipleship.",
                leadership: "Transparency builds trust. Communicate decisions, finances, and vision openly with your congregation.",
                service: "The gospel comes alive in action. Mobilize your congregation for local and global outreach.",
                finances: "Wise stewardship glorifies God. Annual reports and clear communication about giving build confidence.",
              };

              return (
                <div>
                  {/* HEADER */}
                  <div style={{ marginBottom: 32 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                          <h1 style={{ fontSize: 32, fontFamily: T.heading, fontWeight: 800, margin: 0, letterSpacing: "-0.035em" }}>{oc.name}</h1>
                          <span style={{ padding: "3px 10px", borderRadius: T.radiusFull, fontSize: 11, fontWeight: 700, background: T.greenSoft, color: T.green, border: `1px solid ${T.greenBorder}` }}>Verified Owner</span>
                        </div>
                        <div style={{ fontSize: 14, color: T.textSoft }}>{oc.denomination || "Non-Denominational"} &middot; {oc.city}, {oc.state}</div>
                      </div>
                      <div style={{ padding: "16px 24px", borderRadius: T.radius, textAlign: "center", background: scoreBg(overall), border: `1.5px solid ${scoreBorder2(overall)}` }}>
                        <div style={{ fontSize: 40, fontWeight: 800, fontFamily: T.heading, color: overall > 0 ? scoreColor(overall) : T.textMuted, lineHeight: 1 }}>
                          {overall > 0 ? overall.toFixed(1) : "\u2014"}
                        </div>
                        <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>{ownerReviews.length} review{ownerReviews.length !== 1 ? "s" : ""}</div>
                      </div>
                    </div>

                    {/* TAB NAVIGATION */}
                    <div style={{ display: "flex", gap: 8, borderBottom: `1.5px solid ${T.border}`, paddingBottom: 0 }}>
                      {["overview", "benchmarks", "experiences", "demographics"].map(tab => (
                        <button key={tab} onClick={() => setDashboardTab(tab)} style={{
                          padding: "12px 20px", background: "none", border: "none",
                          borderBottom: dashboardTab === tab ? `2px solid ${T.accent}` : "2px solid transparent",
                          color: dashboardTab === tab ? T.accent : T.textMuted,
                          fontSize: 14, fontWeight: dashboardTab === tab ? 600 : 500,
                          cursor: "pointer", fontFamily: T.body, transition: "all 0.2s",
                        }}>
                          {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ========== OVERVIEW TAB ========== */}
                  {dashboardTab === "overview" && (
                    <FadeIn>
                      {/* Quick Stats */}
                      <div className="btf-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
                        {[
                          { label: "Total Reviews", value: ownerReviews.length },
                          { label: "Avg Score", value: overall > 0 ? overall.toFixed(1) : "\u2014" },
                          { label: "Most Common Role", value: Object.entries(ownerDemographics?.roleCounts || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "\u2014" },
                          { label: "Trend", value: ownerReviews.length > 1 ? "Stable" : "New" },
                        ].map((stat, i) => (
                          <div key={i} style={{ padding: "16px", borderRadius: T.radius, background: T.surface, border: `1.5px solid ${T.border}` }}>
                            <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600, marginBottom: 6 }}>{stat.label}</div>
                            <div style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, color: T.text }}>{stat.value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Scorecard with Trends */}
                      <div style={{ marginBottom: 32, padding: "24px", borderRadius: T.radius, background: T.surface, border: `1.5px solid ${T.border}` }}>
                        <h3 style={{ fontSize: 16, fontFamily: T.heading, fontWeight: 700, margin: "0 0 20px", color: T.text }}>Church Health Scorecard</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                          {CATEGORIES
                            .map(cat => ({ ...cat, score: ocScores[cat.id] || 0 }))
                            .sort((a, b) => a.score - b.score)
                            .map(cat => {
                              const trend = getTrend(cat.id);
                              return (
                                <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontFamily: T.body, fontWeight: 500, color: T.text, marginBottom: 6 }}>{cat.label}</div>
                                    <div style={{ height: 6, borderRadius: 3, background: T.surfaceAlt, overflow: "hidden" }}>
                                      <div style={{ height: "100%", borderRadius: 3, width: `${(cat.score / 5) * 100}%`, background: cat.score > 0 ? scoreColor(cat.score) : T.surfaceAlt, transition: "width 0.6s ease" }} />
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 80 }}>
                                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.heading, color: cat.score > 0 ? scoreColor(cat.score) : T.textMuted, width: 28, textAlign: "right" }}>
                                      {cat.score > 0 ? cat.score.toFixed(1) : "\u2014"}
                                    </span>
                                    {trend !== null && (
                                      <span style={{ fontSize: 14, fontWeight: 700, color: trend > 0.1 ? T.green : trend < -0.1 ? T.red : T.textMuted }}>
                                        {trend > 0.1 ? "\u25B2" : trend < -0.1 ? "\u25BC" : "\u2014"}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      {/* Gap Analysis / Growth Opportunities */}
                      {lowestCategories.length > 0 && (
                        <div>
                          <h3 style={{ fontSize: 16, fontFamily: T.heading, fontWeight: 700, margin: "0 0 16px", color: T.text }}>Growth Opportunities</h3>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                            {lowestCategories.map(cat => {
                              const cityAvg = dashboardBenchmarks.city[cat.id]?.avg || 0;
                              const stateAvg = dashboardBenchmarks.state[cat.id]?.avg || 0;
                              const natAvg = dashboardBenchmarks.national[cat.id]?.avg || 0;
                              const isAboveCity = cat.score > cityAvg && cityAvg > 0;
                              return (
                                <FadeIn key={cat.id}>
                                  <div style={{
                                    padding: "20px", borderRadius: T.radius, background: T.surface,
                                    border: `1.5px solid ${cat.score < 3 ? (T.redBorder || T.border) : (T.amberBorder || T.border)}`,
                                    borderLeft: `4px solid ${scoreColor(cat.score)}`,
                                  }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                      <h4 style={{ fontSize: 14, fontFamily: T.heading, fontWeight: 700, margin: 0, color: T.text }}>{cat.label}</h4>
                                      <span style={{ fontSize: 16, fontWeight: 800, fontFamily: T.heading, color: scoreColor(cat.score) }}>{cat.score.toFixed(1)}</span>
                                    </div>
                                    <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 12, fontWeight: 500 }}>
                                      City avg: {cityAvg > 0 ? cityAvg.toFixed(1) : "\u2014"} &middot; State avg: {stateAvg > 0 ? stateAvg.toFixed(1) : "\u2014"} &middot; National avg: {natAvg > 0 ? natAvg.toFixed(1) : "\u2014"}
                                    </div>
                                    {cityAvg > 0 && (
                                      <div style={{
                                        padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 11, fontWeight: 600, marginBottom: 12,
                                        background: isAboveCity ? (T.greenSoft || "#e8f5e9") : (T.amberSoft || "#fff8e1"),
                                        border: `1px solid ${isAboveCity ? (T.greenBorder || T.border) : (T.amberBorder || T.border)}`,
                                        color: isAboveCity ? (T.green || "#2e7d32") : (T.amber || "#f57f17"),
                                      }}>
                                        {isAboveCity ? "\u2713 Above city average" : "Below city average"}
                                      </div>
                                    )}
                                    <p style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.5, margin: 0 }}>{categoryInsights[cat.id]}</p>
                                  </div>
                                </FadeIn>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </FadeIn>
                  )}

                  {/* ========== BENCHMARKS TAB ========== */}
                  {dashboardTab === "benchmarks" && (
                    <FadeIn>
                      <div style={{ marginBottom: 24 }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          {["city", "state", "national"].map(level => (
                            <button key={level} onClick={() => setBenchmarkLevel(level)} style={{
                              padding: "8px 16px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600,
                              background: benchmarkLevel === level ? T.text : T.surfaceAlt,
                              color: benchmarkLevel === level ? (T === DARK ? "#000" : "#fff") : T.textSoft,
                              border: `1.5px solid ${benchmarkLevel === level ? T.text : T.border}`,
                              cursor: "pointer", fontFamily: T.body, transition: "all 0.15s",
                            }}>
                              {level.charAt(0).toUpperCase() + level.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="btf-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
                        {CATEGORIES.map(cat => {
                          const churchScore = ocScores[cat.id] || 0;
                          const benchScore = benchmarks[cat.id]?.avg || 0;
                          const delta = churchScore - benchScore;
                          const isAbove = delta > 0;
                          return (
                            <FadeIn key={cat.id}>
                              <div style={{ padding: "18px", borderRadius: T.radius, background: T.surface, border: `1.5px solid ${T.border}` }}>
                                <div style={{ fontSize: 13, fontFamily: T.heading, fontWeight: 700, marginBottom: 14, color: T.text }}>{cat.label}</div>
                                <div style={{ display: "flex", gap: 16, alignItems: "flex-end", marginBottom: 12 }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>Your Score</div>
                                    <div style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, color: churchScore > 0 ? scoreColor(churchScore) : T.textMuted }}>{churchScore > 0 ? churchScore.toFixed(1) : "\u2014"}</div>
                                  </div>
                                  <div style={{ width: 2, height: 40, background: T.border }} />
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>{benchmarkLevel} Avg</div>
                                    <div style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, color: T.textMuted }}>{benchScore > 0 ? benchScore.toFixed(1) : "\u2014"}</div>
                                  </div>
                                </div>
                                {churchScore > 0 && benchScore > 0 && (
                                  <div style={{
                                    padding: "6px 10px", borderRadius: T.radiusSm, fontSize: 12, fontWeight: 700, textAlign: "center",
                                    background: isAbove ? (T.greenSoft || "#e8f5e9") : (T.amberSoft || "#fff8e1"),
                                    border: `1px solid ${isAbove ? (T.greenBorder || T.border) : (T.amberBorder || T.border)}`,
                                    color: isAbove ? (T.green || "#2e7d32") : (T.amber || "#f57f17"),
                                  }}>
                                    {isAbove ? "+" : ""}{delta.toFixed(2)} {isAbove ? "above" : "below"} average
                                  </div>
                                )}
                              </div>
                            </FadeIn>
                          );
                        })}
                      </div>
                      <div style={{ marginTop: 32, padding: "20px", borderRadius: T.radius, background: T.accentSoft || "rgba(59,130,246,0.08)", border: `1.5px solid ${T.accentBorder || T.border}` }}>
                        <div style={{ fontSize: 13, fontFamily: T.heading, fontWeight: 700, color: T.accent, marginBottom: 6 }}>Summary</div>
                        <div style={{ fontSize: 14, color: T.accent }}>
                          Your church ranks above the {benchmarkLevel} average in{" "}
                          <strong>{SCORE_FIELDS.filter(f => (ocScores[f] || 0) > (benchmarks[f]?.avg || 0)).length} of 10</strong>{" "}categories.
                        </div>
                      </div>
                    </FadeIn>
                  )}

                  {/* ========== EXPERIENCES TAB ========== */}
                  {dashboardTab === "experiences" && (
                    <FadeIn>
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {ownerReviews.length > 0 ? ownerReviews.map(rev => {
                          const revScores = SCORE_FIELDS.map(f => rev[`score_${f}`]).filter(v => v != null);
                          const revAvg = revScores.length > 0 ? revScores.reduce((a, b) => a + b, 0) / revScores.length : null;
                          return (
                            <div key={rev.id} style={{ borderRadius: T.radius, background: T.surface, border: `1.5px solid ${T.border}`, overflow: "hidden" }}>
                              {/* Collapsed Header */}
                              <div onClick={() => setExpandedReview(expandedReview === rev.id ? null : rev.id)} style={{
                                padding: "16px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                                background: expandedReview === rev.id ? T.surfaceAlt : T.surface, transition: "background 0.15s",
                              }}>
                                <div>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>{displayName(rev.profiles?.display_name, "church")}</div>
                                  <div style={{ fontSize: 12, color: T.textMuted }}>{rev.reviewer_role} &middot; {new Date(rev.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</div>
                                </div>
                                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                  {rev.status && rev.status !== "published" && (
                                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9999, fontWeight: 600, fontFamily: T.heading, background: rev.status === "pending" ? T.amberSoft : rev.status === "flagged" ? T.redSoft : T.surfaceAlt, color: rev.status === "pending" ? T.amber : rev.status === "flagged" ? T.red : T.textMuted, border: `1px solid ${rev.status === "pending" ? T.amberBorder : rev.status === "flagged" ? T.redBorder : T.border}` }}>{rev.status.charAt(0).toUpperCase() + rev.status.slice(1)}</span>
                                  )}
                                  {revAvg && (
                                    <div style={{ padding: "4px 12px", borderRadius: T.radiusSm, background: scoreBg(revAvg), border: `1px solid ${scoreBorder2(revAvg)}`, fontSize: 13, fontWeight: 700, color: scoreColor(revAvg) }}>{revAvg.toFixed(1)}</div>
                                  )}
                                  <span style={{ fontSize: 18, color: T.textMuted }}>{expandedReview === rev.id ? "\u25BC" : "\u25B6"}</span>
                                </div>
                              </div>

                              {/* Expanded Content */}
                              {expandedReview === rev.id && (
                                <div style={{ padding: "20px", borderTop: `1.5px solid ${T.border}` }}>
                                  {rev.text && <div style={{ marginBottom: 20, fontSize: 13, color: T.text, lineHeight: 1.6 }}>{rev.text}</div>}
                                  {/* Score Breakdown */}
                                  <div style={{ marginBottom: 20 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, marginBottom: 10, textTransform: "uppercase" }}>Category Scores</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                      {SCORE_FIELDS.map(f => {
                                        const s = rev[`score_${f}`];
                                        if (s == null) return null;
                                        const cat = CATEGORIES.find(c => c.id === f);
                                        return (
                                          <span key={f} style={{ fontSize: 11, padding: "4px 10px", borderRadius: T.radiusSm, background: scoreBg(s), border: `1px solid ${scoreBorder2(s)}`, color: scoreColor(s), fontWeight: 700 }}>
                                            {cat?.label.split("&")[0].split("/")[0].trim()} {s}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  {/* Response Section */}
                                  <div style={{ borderTop: `1.5px solid ${T.border}`, paddingTop: 16 }}>
                                    {respondingTo === rev.id ? (
                                      <div>
                                        <textarea value={responseText} onChange={e => setResponseText(e.target.value)} placeholder="Respond to this experience..." rows={4} style={{ width: "100%", padding: "12px 14px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.bg, color: T.text, outline: "none", fontFamily: T.body, resize: "vertical" }} />
                                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                          <button onClick={() => submitChurchResponse(rev.id, oc.id)} disabled={!responseText.trim() || responseSubmitting} style={{ padding: "8px 16px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, opacity: (!responseText.trim() || responseSubmitting) ? 0.5 : 1 }}>{responseSubmitting ? "Sending..." : "Send Response"}</button>
                                          <button onClick={() => { setRespondingTo(null); setResponseText(""); }} style={{ padding: "8px 16px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.surfaceAlt, color: T.textSoft, border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>Cancel</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button onClick={() => { setRespondingTo(rev.id); setResponseText(""); }} style={{ padding: "8px 16px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.accentSoft || "rgba(59,130,246,0.08)", color: T.accent, border: `1px solid ${T.accentBorder || T.border}`, cursor: "pointer", fontFamily: T.body }}>Respond</button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }) : (
                          <div style={{ padding: "40px", textAlign: "center", background: T.surface, borderRadius: T.radius, border: `1.5px dashed ${T.border}` }}>
                            <div style={{ fontSize: 14, color: T.textMuted }}>No reviews yet. When congregants share their experiences, they'll appear here.</div>
                          </div>
                        )}
                      </div>
                    </FadeIn>
                  )}

                  {/* ========== DEMOGRAPHICS TAB ========== */}
                  {dashboardTab === "demographics" && (
                    <FadeIn>
                      <div className="btf-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
                        {/* Reviewer Type */}
                        <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1.5px solid ${T.border}` }}>
                          <h4 style={{ fontSize: 14, fontFamily: T.heading, fontWeight: 700, marginBottom: 16, color: T.text }}>Reviewer Type</h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {Object.entries(ownerDemographics?.roleCounts || {}).sort((a, b) => b[1] - a[1]).map(([role, count]) => {
                              const pct = ownerReviews.length > 0 ? ((count / ownerReviews.length) * 100).toFixed(0) : 0;
                              return (
                                <div key={role}>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                                    <span style={{ fontWeight: 600, color: T.text }}>{role}</span>
                                    <span style={{ color: T.textMuted }}>{pct}%</span>
                                  </div>
                                  <div style={{ height: 6, borderRadius: 3, background: T.surfaceAlt }}>
                                    <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: T.accent }} />
                                  </div>
                                </div>
                              );
                            })}
                            {Object.keys(ownerDemographics?.roleCounts || {}).length === 0 && <div style={{ fontSize: 13, color: T.textMuted }}>No data yet</div>}
                          </div>
                        </div>

                        {/* Highest Rated Categories */}
                        <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1.5px solid ${T.border}` }}>
                          <h4 style={{ fontSize: 14, fontFamily: T.heading, fontWeight: 700, marginBottom: 16, color: T.text }}>Highest Rated Categories</h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {CATEGORIES
                              .map(cat => ({ ...cat, avgScore: ownerDemographics?.scoreAvgs?.[cat.id] || 0 }))
                              .filter(cat => cat.avgScore > 0)
                              .sort((a, b) => b.avgScore - a.avgScore)
                              .slice(0, 5)
                              .map(cat => (
                                <div key={cat.id}>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                                    <span style={{ fontWeight: 600, color: T.text }}>{cat.label}</span>
                                    <span style={{ fontWeight: 700, color: scoreColor(cat.avgScore) }}>{cat.avgScore.toFixed(1)}</span>
                                  </div>
                                  <div style={{ height: 4, borderRadius: 2, background: T.surfaceAlt }}>
                                    <div style={{ height: "100%", borderRadius: 2, width: `${(cat.avgScore / 5) * 100}%`, background: scoreColor(cat.avgScore) }} />
                                  </div>
                                </div>
                              ))}
                            {CATEGORIES.filter(cat => (ownerDemographics?.scoreAvgs?.[cat.id] || 0) > 0).length === 0 && <div style={{ fontSize: 13, color: T.textMuted }}>No scores yet</div>}
                          </div>
                        </div>

                        {/* Age Range */}
                        <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1.5px solid ${T.border}` }}>
                          <h4 style={{ fontSize: 14, fontFamily: T.heading, fontWeight: 700, marginBottom: 16, color: T.text }}>Age Range</h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {Object.entries(ownerDemographics?.ageCounts || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
                              const pct = ownerReviews.length > 0 ? ((v / ownerReviews.length) * 100).toFixed(0) : 0;
                              return (
                                <div key={k}>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                                    <span style={{ fontWeight: 600, color: T.text }}>{k}</span>
                                    <span style={{ color: T.textMuted }}>{pct}%</span>
                                  </div>
                                  <div style={{ height: 6, borderRadius: 3, background: T.surfaceAlt }}>
                                    <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: T.accent }} />
                                  </div>
                                </div>
                              );
                            })}
                            {Object.keys(ownerDemographics?.ageCounts || {}).length === 0 && <div style={{ fontSize: 13, color: T.textMuted }}>No data yet</div>}
                          </div>
                        </div>

                        {/* All Category Averages (full width) */}
                        <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1.5px solid ${T.border}` }}>
                          <h4 style={{ fontSize: 14, fontFamily: T.heading, fontWeight: 700, marginBottom: 16, color: T.text }}>Gender</h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {Object.entries(ownerDemographics?.genderCounts || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
                              const pct = ownerReviews.length > 0 ? ((v / ownerReviews.length) * 100).toFixed(0) : 0;
                              return (
                                <div key={k}>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                                    <span style={{ fontWeight: 600, color: T.text }}>{k}</span>
                                    <span style={{ color: T.textMuted }}>{pct}%</span>
                                  </div>
                                  <div style={{ height: 6, borderRadius: 3, background: T.surfaceAlt }}>
                                    <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: T.accent }} />
                                  </div>
                                </div>
                              );
                            })}
                            {Object.keys(ownerDemographics?.genderCounts || {}).length === 0 && <div style={{ fontSize: 13, color: T.textMuted }}>No data yet</div>}
                          </div>
                        </div>

                        {/* All Category Averages - full width */}
                        <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1.5px solid ${T.border}`, gridColumn: "1 / -1" }}>
                          <h4 style={{ fontSize: 14, fontFamily: T.heading, fontWeight: 700, marginBottom: 16, color: T.text }}>All Category Averages</h4>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                            {CATEGORIES.map(cat => {
                              const catAvg = ownerDemographics?.scoreAvgs?.[cat.id] || 0;
                              return (
                                <div key={cat.id}>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>{cat.label}</div>
                                  <div style={{ height: 20, borderRadius: T.radiusSm, background: T.surfaceAlt, display: "flex", alignItems: "center", padding: "0 6px" }}>
                                    <div style={{ height: 18, borderRadius: T.radiusSm, background: catAvg > 0 ? scoreColor(catAvg) : T.surfaceAlt, width: `${(catAvg / 5) * 100}%`, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 4 }}>
                                      {catAvg > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>{catAvg.toFixed(1)}</span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </FadeIn>
                  )}
                </div>
              );
            })()}

            {/* Reviewer History Modal */}
            {reviewerHistory && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setReviewerHistory(null)}>
                <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: T.radius + 4, padding: "28px 24px", maxWidth: 520, width: "100%", maxHeight: "80vh", overflow: "auto" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <div>
                      <h3 style={{ fontSize: 18, fontFamily: T.heading, fontWeight: 800, margin: "0 0 2px", letterSpacing: "-0.02em" }}>All experiences by {reviewerHistory.name}</h3>
                      <div style={{ fontSize: 12, color: T.textMuted }}>{reviewerHistory.reviews.length} experience{reviewerHistory.reviews.length !== 1 ? "s" : ""} across all churches</div>
                    </div>
                    <button onClick={() => setReviewerHistory(null)} style={{ fontSize: 18, background: "none", border: "none", color: T.textMuted, cursor: "pointer" }}>✕</button>
                  </div>
                  {reviewerHistoryLoading && <div style={{ textAlign: "center", padding: "30px 0", color: T.textMuted }}>Loading...</div>}
                  {!reviewerHistoryLoading && reviewerHistory.reviews.map(r => {
                    const scores = SCORE_FIELDS.map(f => r[`score_${f}`]).filter(v => v != null);
                    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
                    return (
                      <div key={r.id} style={{ padding: "14px 0", borderBottom: `1px solid ${T.borderLight}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: 13, fontFamily: T.heading }}>{r.churches?.name || "Unknown"}</span>
                            <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 8 }}>{r.churches?.city}, {r.churches?.state}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {avg && <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.heading, color: scoreColor(avg) }}>{avg.toFixed(1)}</span>}
                            <span style={{ fontSize: 11, color: T.textMuted }}>{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 4 }}>{r.reviewer_role}{r.last_visited ? ` · Last visited: ${r.last_visited}` : ""}</div>
                        {r.text && <p style={{ fontSize: 13, color: T.textSoft, margin: "4px 0 0", lineHeight: 1.6 }}>{r.text}</p>}
                      </div>
                    );
                  })}
                  {!reviewerHistoryLoading && reviewerHistory.reviews.length === 0 && (
                    <div style={{ textAlign: "center", padding: "30px 0", color: T.textMuted }}>No experiences found</div>
                  )}
                </div>
              </div>
            )}
          </FadeIn>
        </div>
      )}

      {/* FOR CHURCHES - BENEFITS & SUBSCRIBE */}
      {!loading && page === "for-churches" && (
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "56px 24px" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>For Church Leaders</div>
              <h1 style={{ fontSize: 34, fontFamily: T.heading, fontWeight: 800, margin: "0 0 12px", letterSpacing: "-0.03em" }}>Understand Your Congregation Like Never Before</h1>
              <p style={{ fontSize: 16, color: T.textSoft, maxWidth: 560, margin: "0 auto", lineHeight: 1.7 }}>By Their Fruit gives church leaders real, anonymous feedback from the people who attend — so you can grow with clarity and confidence.</p>
            </div>
          </FadeIn>

          <FadeIn delay={80}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 40 }}>
              {[
                { icon: "\u2705", title: "Verified Owner Badge", desc: "Show visitors your church is actively engaged and listening to its congregation." },
                { icon: "\uD83D\uDCAC", title: "Respond to Experiences", desc: "Publicly respond to feedback, thank members, and address concerns directly." },
                { icon: "\uD83D\uDCCA", title: "Insights Dashboard", desc: "See score breakdowns across 10 categories — teaching, worship, community, and more." },
                { icon: "\uD83D\uDC65", title: "Reviewer Demographics", desc: "Understand who is sharing feedback: age ranges, gender, roles, and income brackets." },
                { icon: "\uD83D\uDD14", title: "New Experience Alerts", desc: "Get notified when someone shares a new experience about your church." },
                { icon: "\u2B50", title: "Priority Listing", desc: "Verified churches appear first in search results, making it easier for visitors to find you." }
              ].map((b, i) => (
                <div key={i} style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 24, marginBottom: 10 }}>{b.icon}</div>
                  <div style={{ fontSize: 15, fontFamily: T.heading, fontWeight: 700, marginBottom: 4, letterSpacing: "-0.01em" }}>{b.title}</div>
                  <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.6 }}>{b.desc}</div>
                </div>
              ))}
            </div>
          </FadeIn>

          <FadeIn delay={160}>
            <div style={{ padding: "32px", borderRadius: T.radius + 4, background: T.surface, border: `2px solid ${T.accentBorder}`, textAlign: "center", marginBottom: 40 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Church Subscription</div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 48, fontFamily: T.heading, fontWeight: 800, letterSpacing: "-0.03em" }}>$39</span>
                <span style={{ fontSize: 16, color: T.textMuted }}>/month</span>
              </div>
              <p style={{ fontSize: 14, color: T.textSoft, marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>Everything you need to listen, respond, and grow your church with real feedback from real people.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 340, margin: "0 auto 24px", textAlign: "left" }}>
                {["Verified Owner badge on your profile", "Respond publicly to all experiences", "Full insights dashboard with score breakdowns", "Demographic analytics (age, gender, role, income)", "Priority placement in search results", "Email alerts for new experiences", "Cancel anytime — no contracts"].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ color: T.green, fontSize: 14, lineHeight: 1.6 }}>\u2713</span>
                    <span style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.6 }}>{item}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => { window.open("https://buy.stripe.com/14A7sL0wA03Ggr9epO4ow00", "_blank"); }} style={{ padding: "14px 36px", borderRadius: T.radiusFull, fontSize: 15, fontWeight: 700, fontFamily: T.body, cursor: "pointer", background: T.accent, color: "#fff", border: "none", boxShadow: "0 2px 16px rgba(37,99,235,0.25)", transition: "all 0.2s" }}>Subscribe Now</button>
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 12 }}>Secure payment via Stripe. Cancel anytime.</div>
            </div>
          </FadeIn>

          <FadeIn delay={240}>
            <div style={{ padding: "28px", borderRadius: T.radius, background: T.surfaceAlt, border: `1px solid ${T.border}`, marginBottom: 32 }}>
              <h3 style={{ fontSize: 18, fontFamily: T.heading, fontWeight: 700, margin: "0 0 12px", letterSpacing: "-0.02em" }}>How It Works for Churches</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  { step: "1", title: "Claim Your Church", desc: "Search for your church in our directory and submit a claim request with your church email." },
                  { step: "2", title: "Get Verified", desc: "Our team reviews your claim and verifies your ownership — typically within 24–48 hours." },
                  { step: "3", title: "Subscribe", desc: "Activate your subscription to unlock the full dashboard, response tools, and analytics." },
                  { step: "4", title: "Engage & Grow", desc: "Read experiences, respond to feedback, and use insights to strengthen your ministry." }
                ].map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 14, background: T.accentSoft, border: `1px solid ${T.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, fontFamily: T.heading, color: T.accent, flexShrink: 0 }}>{s.step}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.heading, marginBottom: 2 }}>{s.title}</div>
                      <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.6 }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={320}>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 14, color: T.textSoft, marginBottom: 16 }}>Already claimed your church? Go to your dashboard to manage your profile and subscription.</p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <button onClick={() => navigate("dashboard")} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, fontFamily: T.body, cursor: "pointer", background: T.surfaceAlt, color: T.text, border: `1px solid ${T.border}` }}>Go to Dashboard</button>
                <button onClick={() => navigate("discover")} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, fontFamily: T.body, cursor: "pointer", background: "transparent", color: T.accent, border: `1px solid ${T.accentBorder}` }}>Find Your Church</button>
              </div>
            </div>
          </FadeIn>
        </div>
      )}

            {/* TERMS OF SERVICE */}
      {!loading && page === "terms" && (
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "56px 24px" }}>
          <FadeIn>
            <h1 style={{ fontSize: 30, fontFamily: T.heading, fontWeight: 800, lineHeight: 1.15, margin: "0 0 8px", letterSpacing: "-0.03em" }}>Terms of Service</h1>
            <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 32 }}>Effective Date: March 13, 2026 &middot; Last Updated: March 13, 2026</div>
            <div style={{ fontSize: 14.5, color: T.textSoft, lineHeight: 1.8 }}>
              <p>Welcome to By Their Fruit ("we," "us," or "our"), operated at bytheirfruit.church. These Terms of Service ("Terms") govern your access to and use of our website, services, and any related applications (collectively, the "Service"). By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>1. Eligibility</h2>
              <p>You must be at least 18 years of age to create an account or submit content. By using the Service, you represent that you meet this requirement and that all information you provide is accurate and complete.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>2. Account Registration</h2>
              <p>To submit reviews or claim a church listing, you must create an account using Google Sign-In or another supported authentication method. You are responsible for maintaining the security of your account credentials and for all activity under your account. You agree to notify us immediately of any unauthorized access.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>3. User-Submitted Content</h2>
              <p>By submitting a review, rating, comment, or any other content ("User Content"), you grant By Their Fruit a non-exclusive, worldwide, royalty-free, perpetual, irrevocable license to use, display, reproduce, modify, and distribute your User Content in connection with operating and promoting the Service.</p>
              <p>You represent and warrant that: (a) you are the original author of the User Content; (b) the User Content is based on your genuine firsthand experience; (c) the User Content does not contain false, defamatory, or misleading statements; (d) the User Content does not violate any applicable law, regulation, or third-party right; and (e) the User Content does not contain personal attacks, threats, hate speech, or harassment.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>4. Review Guidelines and Moderation</h2>
              <p>All experiences are subject to automated and manual moderation. We reserve the right to remove, edit, or flag any content that violates these Terms, our community guidelines, or applicable law. Experiences must reflect genuine personal experience with the church being reviewed. You may submit one experience per church. You may submit up to three experiences per day across the platform.</p>
              <p>Prohibited content includes but is not limited to: spam or duplicate reviews, reviews submitted for a church you have not attended, content that is primarily doctrinal argument rather than experiential feedback, coordinated review campaigns, and content that contains personally identifiable information about third parties without their consent.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>5. Church Claiming and Paid Subscriptions</h2>
              <p>Church leaders may submit a claim request to manage their church's listing. Claiming a church listing requires identity verification and a paid subscription processed through Stripe. Subscription fees are billed on a recurring basis. By subscribing, you authorize us to charge your chosen payment method at the applicable rate.</p>
              <p>Claimed church listings grant the ability to respond to reviews, update church information, and access analytics. Claiming a church does not grant the ability to remove, suppress, or alter user-submitted reviews or ratings.</p>
              <p>Refunds may be issued at our sole discretion. You may cancel your subscription at any time through your Stripe account. Upon cancellation, your claimed listing features will remain active until the end of your current billing period.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>6. Prohibited Conduct</h2>
              <p>You agree not to: (a) use the Service for any unlawful purpose; (b) attempt to circumvent rate limits, moderation, or security measures; (c) impersonate another person or entity; (d) create multiple accounts to circumvent restrictions; (e) use automated tools, bots, or scripts to interact with the Service without our express written consent; (f) interfere with the operation or security of the Service; or (g) harvest, scrape, or collect data from the Service in bulk.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>7. Intellectual Property</h2>
              <p>The Service, including its design, branding, code, and original content, is owned by By Their Fruit and protected by copyright, trademark, and other intellectual property laws. You may not copy, reproduce, distribute, or create derivative works from the Service without our express written permission.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>8. Disclaimer of Warranties</h2>
              <p>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE. USER CONTENT REFLECTS THE OPINIONS OF INDIVIDUAL USERS AND NOT THE VIEWS OF BY THEIR FRUIT.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>9. Limitation of Liability</h2>
              <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, BY THEIR FRUIT AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU HAVE PAID US IN THE TWELVE MONTHS PRECEDING THE CLAIM, OR ONE HUNDRED DOLLARS ($100), WHICHEVER IS GREATER.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>10. Indemnification</h2>
              <p>You agree to indemnify, defend, and hold harmless By Their Fruit and its officers, directors, employees, and agents from and against any claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising from your use of the Service, your User Content, or your violation of these Terms.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>11. Termination</h2>
              <p>We may suspend or terminate your account and access to the Service at any time, with or without cause and with or without notice. Upon termination, your right to use the Service will immediately cease. Provisions of these Terms that by their nature should survive termination shall survive, including ownership, warranty disclaimers, indemnification, and limitations of liability.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>12. Governing Law and Disputes</h2>
              <p>These Terms shall be governed by and construed in accordance with the laws of the State of Florida, without regard to its conflict of laws principles. Any dispute arising under these Terms shall be resolved exclusively in the state or federal courts located in Florida. You waive any objection to venue and personal jurisdiction in such courts.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>13. Changes to These Terms</h2>
              <p>We may update these Terms from time to time. If we make material changes, we will notify you by posting the updated Terms on the Service with a revised "Last Updated" date. Your continued use of the Service after such changes constitutes your acceptance of the revised Terms.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>14. Contact</h2>
              <p>If you have questions about these Terms, please contact us at <a href="mailto:info@bytheirfruit.church" style={{ color: T.accent }}>info@bytheirfruit.church</a>.</p>
            </div>
          </FadeIn>
        </div>
      )}

      {/* PRIVACY POLICY */}
      {!loading && page === "privacy" && (
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "56px 24px" }}>
          <FadeIn>
            <h1 style={{ fontSize: 30, fontFamily: T.heading, fontWeight: 800, lineHeight: 1.15, margin: "0 0 8px", letterSpacing: "-0.03em" }}>Privacy Policy</h1>
            <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 32 }}>Effective Date: March 13, 2026 &middot; Last Updated: March 13, 2026</div>
            <div style={{ fontSize: 14.5, color: T.textSoft, lineHeight: 1.8 }}>
              <p>By Their Fruit ("we," "us," or "our") operates the website bytheirfruit.church (the "Service"). This Privacy Policy explains how we collect, use, disclose, and protect your personal information when you use the Service.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>1. Information We Collect</h2>
              <p><strong style={{ color: T.text }}>Information You Provide Directly:</strong> When you create an account, we collect your name, email address, and profile photo as provided by your authentication provider (e.g., Google). When you submit a review, we collect the content of your review, your ratings, and your stated relationship to the church. When you submit a church claim request, we collect your full name, role at the church, work email, phone number, and any message you provide.</p>
              <p><strong style={{ color: T.text }}>Payment Information:</strong> If you subscribe to a paid plan, payment is processed by Stripe, Inc. We do not store your credit card number, bank account details, or other sensitive payment information on our servers. We receive and store your Stripe customer ID, subscription ID, payment status, and transaction amounts for record-keeping purposes.</p>
              <p><strong style={{ color: T.text }}>Automatically Collected Information:</strong> When you use the Service, we may automatically collect your IP address, browser type and version, operating system, referring URLs, pages visited, and the dates and times of your visits. This information is collected through standard server logs and analytics tools.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>2. How We Use Your Information</h2>
              <p>We use the information we collect to: provide, operate, and maintain the Service; process and manage your account, reviews, and church claims; process payments and manage subscriptions; enforce our Terms of Service and community guidelines; detect and prevent fraud, abuse, and security incidents; communicate with you about your account, reviews, and the Service; comply with legal obligations; and improve and develop new features for the Service.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>3. How We Share Your Information</h2>
              <p><strong style={{ color: T.text }}>Publicly Visible Information:</strong> When you submit a review, your display name and review content are publicly visible on the Service. Your email address is not publicly displayed.</p>
              <p><strong style={{ color: T.text }}>Service Providers:</strong> We share information with third-party service providers who assist us in operating the Service, including: Supabase (database hosting and authentication), Stripe (payment processing), Cloudflare (hosting, DNS, and content delivery), and Google (authentication via Google Sign-In). These providers are contractually obligated to use your information only for the purpose of providing services to us.</p>
              <p><strong style={{ color: T.text }}>Legal Requirements:</strong> We may disclose your information if required by law, regulation, legal process, or governmental request, or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others.</p>
              <p><strong style={{ color: T.text }}>Business Transfers:</strong> In the event of a merger, acquisition, or sale of all or a portion of our assets, your information may be transferred as part of that transaction.</p>
              <p>We do not sell your personal information to third parties. We do not share your personal information with third parties for their direct marketing purposes.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>4. Data Retention</h2>
              <p>We retain your personal information for as long as your account is active or as needed to provide you with the Service. We may also retain certain information as required by law or for legitimate business purposes, such as resolving disputes and enforcing our agreements. If you request account deletion, we will delete your personal information within 30 days, except where retention is required by law. Published reviews may be anonymized rather than deleted to maintain the integrity of church ratings.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>5. Data Security</h2>
              <p>We implement reasonable technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. These measures include encryption of data in transit (TLS/SSL), row-level security policies on our database, and secure authentication protocols. However, no method of transmission over the internet or electronic storage is completely secure, and we cannot guarantee absolute security.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>6. Your Rights and Choices</h2>
              <p>Depending on your jurisdiction, you may have the right to: access, correct, or delete your personal information; object to or restrict certain processing of your information; request a portable copy of your information; and withdraw consent where processing is based on consent. To exercise any of these rights, contact us at <a href="mailto:info@bytheirfruit.church" style={{ color: T.accent }}>info@bytheirfruit.church</a>. We will respond to your request within 30 days.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>7. Cookies and Tracking Technologies</h2>
              <p>The Service uses cookies and similar technologies for authentication and session management. We use essential cookies required for the Service to function (such as login session tokens). We do not use advertising cookies or third-party tracking cookies for behavioral advertising. You can control cookies through your browser settings, but disabling essential cookies may prevent you from using certain features of the Service.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>8. Children's Privacy</h2>
              <p>The Service is not directed to children under the age of 18. We do not knowingly collect personal information from children under 18. If we learn that we have collected personal information from a child under 18, we will take steps to delete such information promptly. If you believe a child under 18 has provided us with personal information, please contact us at <a href="mailto:info@bytheirfruit.church" style={{ color: T.accent }}>info@bytheirfruit.church</a>.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>9. California Residents (CCPA)</h2>
              <p>If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA), including the right to know what personal information we collect, the right to request deletion, and the right to opt out of the sale of personal information. As stated above, we do not sell personal information. To exercise your CCPA rights, contact us at <a href="mailto:info@bytheirfruit.church" style={{ color: T.accent }}>info@bytheirfruit.church</a>.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>10. International Users</h2>
              <p>The Service is operated from the United States. If you are accessing the Service from outside the United States, please be aware that your information may be transferred to, stored, and processed in the United States, where data protection laws may differ from those in your jurisdiction. By using the Service, you consent to such transfer.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>11. Changes to This Policy</h2>
              <p>We may update this Privacy Policy from time to time. If we make material changes, we will notify you by posting the updated policy on the Service with a revised "Last Updated" date. Your continued use of the Service after any changes constitutes your acceptance of the revised policy.</p>

              <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "32px 0 12px", color: T.text, letterSpacing: "-0.02em" }}>12. Contact Us</h2>
              <p>If you have questions or concerns about this Privacy Policy or our data practices, please contact us at: <a href="mailto:info@bytheirfruit.church" style={{ color: T.accent }}>info@bytheirfruit.church</a></p>
            </div>
          </FadeIn>
        </div>
      )}

      {/* MY PROFILE PAGE */}
      {!loading && page === "myprofile" && user && (() => {
        function MyProfilePage() {
          const [profileData, setProfileData] = useState(null);
          const [displayName, setDisplayName] = useState("");
          const [email, setEmail] = useState("");
          const [phone, setPhone] = useState("");
          const [gender, setGender] = useState("");
          const [ageRange, setAgeRange] = useState("");
          const [incomeBracket, setIncomeBracket] = useState("");
          const [myReviews, setMyReviews] = useState([]);
          const [loadingReviews, setLoadingReviews] = useState(true);
          const [saving, setSaving] = useState(false);
          const [saved, setSaved] = useState(false);
          const [emailSent, setEmailSent] = useState(false);
          const [emailError, setEmailError] = useState("");
          const [loadingProfile, setLoadingProfile] = useState(true);

          useEffect(() => {
            async function loadProfile() {
              const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
              if (data) {
                setProfileData(data);
                setDisplayName(data.display_name || "");
                setPhone(data.phone || "");
                setGender(data.gender || "");
                setAgeRange(data.age_range || "");
                setIncomeBracket(data.income_bracket || "");
              }
              setEmail(user.email || "");
              setLoadingProfile(false);
            }
            loadProfile();
          }, []);

          useEffect(() => {
            async function loadMyReviews() {
              setLoadingReviews(true);
              const { data, error } = await supabase
                .from("reviews")
                .select("*, churches(id, name, city, state)")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false });
              if (!error && data) {
                setMyReviews(data);
              }
              setLoadingReviews(false);
            }
            loadMyReviews();
          }, []);

          const selectStyle = (selected) => ({
            padding: "8px 14px", borderRadius: T.radiusFull, fontSize: 12.5, fontWeight: 500,
            fontFamily: T.body, cursor: "pointer", transition: "all 0.15s",
            background: selected ? T.text : T.surfaceAlt, color: selected ? T.bg : T.textSoft,
            border: `1px solid ${selected ? T.text : T.border}`,
          });

          const inputStyle = {
            width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, fontSize: 14,
            fontFamily: T.body, border: `1.5px solid ${T.border}`, background: T.surfaceAlt,
            color: T.text, outline: "none", transition: "border-color 0.15s",
            boxSizing: "border-box",
          };

          const labelStyle = {
            fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block",
            marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em",
          };

          const handleSaveProfile = async () => {
            setSaving(true);
            setSaved(false);
            setEmailError("");

            // Update profile fields in profiles table
            const updates = { display_name: displayName };
            if (gender) updates.gender = gender;
            else updates.gender = null;
            if (ageRange) updates.age_range = ageRange;
            else updates.age_range = null;
            if (incomeBracket) updates.income_bracket = incomeBracket;
            else updates.income_bracket = null;
            if (phone) updates.phone = phone;
            else updates.phone = null;

            await supabase.from("profiles").update(updates).eq("id", user.id);

            // If email changed, update via Supabase Auth
            if (email && email !== user.email) {
              const { error } = await supabase.auth.updateUser({ email });
              if (error) {
                setEmailError(error.message);
              } else {
                setEmailSent(true);
              }
            }

            setSaving(false);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
          };

          if (loadingProfile) return (
            <div style={{ textAlign: "center", padding: "80px 24px" }}>
              <div style={{ fontSize: 14, color: T.textMuted }}>Loading profile...</div>
            </div>
          );

          return (
            <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 24px" }}>
              <button onClick={() => navigate("home")} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: T.textMuted, background: "none", border: "none", cursor: "pointer", fontFamily: T.body, padding: 0, marginBottom: 24 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                Back
              </button>

              <h1 style={{ fontSize: 28, fontFamily: T.heading, fontWeight: 800, lineHeight: 1.15, margin: "0 0 6px", letterSpacing: "-0.03em" }}>My Profile</h1>
              <p style={{ fontSize: 14, color: T.textMuted, margin: "0 0 32px" }}>Manage your account details and preferences</p>

              {/* Display Name */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Display Name</label>
                <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} style={inputStyle} placeholder="Your display name" />
              </div>

              {/* Email */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Email Address</label>
                <input type="email" value={email} onChange={e => { setEmail(e.target.value); setEmailSent(false); setEmailError(""); }} style={inputStyle} placeholder="your@email.com" />
                {email !== user.email && (
                  <div style={{ fontSize: 11.5, color: T.accent, marginTop: 6 }}>A confirmation email will be sent to verify the new address.</div>
                )}
                {emailSent && (
                  <div style={{ fontSize: 11.5, color: "#22c55e", marginTop: 6 }}>Confirmation email sent! Please check your inbox.</div>
                )}
                {emailError && (
                  <div style={{ fontSize: 11.5, color: T.red, marginTop: 6 }}>{emailError}</div>
                )}
              </div>

              {/* Phone */}
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Phone Number <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} placeholder="Enter your phone number" />
              </div>

              <div style={{ height: 1, background: T.border, margin: "8px 0 24px" }} />

              {/* Gender */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Gender</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["Male", "Female", "Prefer not to answer"].map(opt => (
                    <button key={opt} onClick={() => setGender(gender === opt ? "" : opt)} style={selectStyle(gender === opt)}>{opt}</button>
                  ))}
                </div>
              </div>

              {/* Age Range */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Age Range</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["18-24", "25-34", "35-44", "45-54", "55-64", "65+", "Prefer not to answer"].map(opt => (
                    <button key={opt} onClick={() => setAgeRange(ageRange === opt ? "" : opt)} style={selectStyle(ageRange === opt)}>{opt}</button>
                  ))}
                </div>
              </div>

              {/* Income */}
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Household Income</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["Under $25k", "$25k-$50k", "$50k-$75k", "$75k-$100k", "$100k-$150k", "$150k+", "Prefer not to answer"].map(opt => (
                    <button key={opt} onClick={() => setIncomeBracket(incomeBracket === opt ? "" : opt)} style={selectStyle(incomeBracket === opt)}>{opt}</button>
                  ))}
                </div>
              </div>

              {/* Privacy note */}
              <div style={{ padding: "12px 14px", borderRadius: T.radiusSm, background: T.surfaceAlt, border: `1px solid ${T.border}`, marginBottom: 24 }}>
                <p style={{ fontSize: 11.5, color: T.textMuted, lineHeight: 1.6, margin: 0 }}>
                  Your demographic information is optional and kept confidential. It is only used in aggregate to help churches better understand their communities.
                </p>
              </div>

              {/* Save button */}
              <button onClick={handleSaveProfile} disabled={saving || !displayName.trim()} style={{
                width: "100%", padding: "12px", borderRadius: T.radiusSm, fontSize: 15, fontWeight: 600,
                background: saved ? "#22c55e" : T.text, color: T.bg, border: "none",
                cursor: saving ? "wait" : "pointer", fontFamily: T.body,
                opacity: (saving || !displayName.trim()) ? 0.6 : 1, transition: "all 0.2s",
              }}>{saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}</button>

              {/* Account info */}
              <div style={{ marginTop: 32, padding: "16px", borderRadius: T.radiusSm, background: T.surfaceAlt, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Account Info</div>
                <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.8 }}>
                  <div>Signed in via <strong style={{ color: T.text }}>{profileData?.provider || "email"}</strong></div>
                  <div>Member since <strong style={{ color: T.text }}>{profileData?.created_at ? new Date(profileData.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—"}</strong></div>
                </div>
              </div>

              {/* My Shared Experiences */}
              <div style={{ marginTop: 32 }}>
                    <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.03em" }}>My Shared Experiences</h2>
                    <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 20px" }}>Reviews you've shared with the community</p>

                    {loadingReviews ? (
                      <div style={{ textAlign: "center", padding: "32px 0" }}>
                        <div style={{ display: "inline-block", width: 20, height: 20, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
                      </div>
                    ) : myReviews.length === 0 ? (
                      <div style={{ padding: "32px 16px", textAlign: "center", borderRadius: T.radiusSm, background: T.surfaceAlt, border: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: 28, marginBottom: 8 }}>📝</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 }}>No experiences shared yet</div>
                        <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 16 }}>Share your church experience to help others find the right community.</div>
                        <button onClick={() => startRateFlow()} style={{ padding: "8px 20px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body }}>Share Your Experience</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {myReviews.map(rev => {
                          const churchName = rev.churches?.name || "Unknown Church";
                          const churchCity = rev.churches?.city || "";
                          const churchState = rev.churches?.state || "";
                          const location = [churchCity, churchState].filter(Boolean).join(", ");
                          const dateStr = new Date(rev.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                          const scoredFields = SCORE_FIELDS.filter(f => rev[`score_${f}`] != null);
                          const avgScore = scoredFields.length > 0 ? scoredFields.reduce((sum, f) => sum + rev[`score_${f}`], 0) / scoredFields.length : null;

                          return (
                            <div key={rev.id} style={{ padding: "16px", borderRadius: T.radiusSm, background: T.surface, border: `1.5px solid ${T.border}`, transition: "border-color 0.15s", cursor: "pointer" }}
                              onClick={() => { const c = churches.find(ch => ch.id === rev.church_id) || (rev.churches ? dbChurchToLocal({ ...rev.churches, total_reviews: 0 }) : null); if (c) { selectChurch(c); } }}
                              onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
                              onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                                <div>
                                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.heading, color: T.text, letterSpacing: "-0.02em" }}>{churchName}</div>
                                  {location && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{location}</div>}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  {rev.status && rev.status !== "published" && (
                                    <div style={{ padding: "3px 10px", borderRadius: T.radiusFull, fontSize: 11, fontWeight: 600, background: rev.status === "pending" ? T.amberSoft : T.redSoft, color: rev.status === "pending" ? T.amber : T.red, border: `1px solid ${rev.status === "pending" ? T.amberBorder : T.redBorder}` }}>{rev.status === "pending" ? "Pending Approval" : rev.status.charAt(0).toUpperCase() + rev.status.slice(1)}</div>
                                  )}
                                  {avgScore !== null && (
                                    <div style={{ padding: "3px 10px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 700, fontFamily: T.heading, background: scoreBg(avgScore), color: scoreColor(avgScore), border: `1px solid ${scoreBorder2(avgScore)}` }}>{avgScore.toFixed(1)}</div>
                                  )}
                                </div>
                              </div>
                              {rev.text && (
                                <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.5, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{rev.text}</div>
                              )}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  <span style={{ padding: "2px 8px", borderRadius: T.radiusFull, fontSize: 11, fontWeight: 500, background: T.surfaceAlt, color: T.textMuted, border: `1px solid ${T.borderLight}` }}>{rev.reviewer_role || "Visitor"}</span>
                                  <span style={{ fontSize: 11, color: T.textMuted }}>{dateStr}</span>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); const c = churches.find(ch => ch.id === rev.church_id) || (rev.churches ? dbChurchToLocal({ ...rev.churches, total_reviews: 0 }) : null); if (c) selectChurchToRate(c); }}
                                  style={{ fontSize: 12, fontWeight: 600, color: T.accent, background: T.accentSoft, border: `1px solid ${T.accentBorder}`, borderRadius: T.radiusFull, cursor: "pointer", fontFamily: T.body, padding: "4px 12px" }}>Edit</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
              </div>
            </div>
          );
        }
        return <FadeIn><MyProfilePage /></FadeIn>;
      })()}

      {/* BLOG — temporarily hidden */}
      {false && !loading && page === "blog" && (() => {
        const articles = [
          {
            id: "how-to-find-the-right-church",
            title: "How to Find the Right Church for You and Your Family",
            date: "March 2026",
            readTime: "5 min read",
            intro: "Finding a church that feels like home can be one of the most meaningful \u2014 and overwhelming \u2014 decisions you make. Whether you\u2019re new to an area, returning to faith, or simply looking for a better fit, here are practical steps to guide your search.",
            sections: [
              { heading: "Know What Matters Most to You", body: "Before you start visiting churches, take a moment to think about what you\u2019re actually looking for. Is it strong Biblical teaching? A welcoming community for your kids? Vibrant worship? Financial transparency? Everyone\u2019s priorities are different, and that\u2019s okay. On By Their Fruit, churches are rated across 10 categories \u2014 from teaching and worship to youth programs and leadership \u2014 so you can find churches that align with what matters to you." },
              { heading: "Visit More Than Once", body: "A single visit rarely gives you the full picture. Your first Sunday might land on a guest speaker, a holiday service, or an off week. Try to visit at least 2\u20133 times before making a judgment. Pay attention to how you\u2019re greeted, how the message resonates, and whether you can see yourself building relationships there." },
              { heading: "Read What Others Say", body: "Just like you\u2019d read reviews before choosing a restaurant or a doctor, reading church reviews can save you a lot of time. Platforms like By Their Fruit let you see honest, structured feedback from people who actually attend \u2014 not just surface-level Google reviews, but detailed ratings on the things that matter." },
              { heading: "Talk to Members", body: "Don\u2019t be afraid to strike up a conversation after service. Ask people how long they\u2019ve been attending, what they love about the church, and what they wish were different. Most churchgoers are happy to share \u2014 and their honesty can be incredibly revealing." },
              { heading: "Trust Your Instincts", body: "At the end of the day, finding the right church is personal. If a church checks every box on paper but doesn\u2019t feel right, that\u2019s okay. Keep looking. The right fit is out there, and it\u2019s worth the search." },
            ],
          },
          {
            id: "what-makes-a-healthy-church",
            title: "10 Signs of a Healthy Church (And 5 Red Flags to Watch For)",
            date: "March 2026",
            readTime: "6 min read",
            intro: "Not all churches are created equal. Here are the hallmarks of a church that\u2019s truly thriving \u2014 and some warning signs that something might be off.",
            sections: [
              { heading: "Signs of a Healthy Church", body: "Strong, Bible-centered teaching that challenges and encourages. A genuine culture of welcome \u2014 not just a friendly greeting team, but real community. Transparency around finances and decision-making. Active investment in kids, youth, and the next generation. Leaders who serve rather than command. A congregation that cares for each other beyond Sunday mornings. Willingness to receive feedback and grow. Outward focus \u2014 serving the local community, not just themselves. Worship that\u2019s authentic, not performative. Diversity of thought and respectful dialogue." },
              { heading: "Red Flags to Watch For", body: "A culture of secrecy around finances or leadership decisions. Pressure to give beyond your means or to commit before you\u2019re ready. Leaders who are unapproachable or resistant to accountability. An \u201Cus vs. them\u201D mentality toward other churches or the outside world. High turnover among staff or long-time members \u2014 this often signals deeper issues." },
              { heading: "How Reviews Can Help", body: "One person\u2019s experience is anecdotal. But when you see patterns across multiple reviews \u2014 consistently high marks for community, or repeated concerns about leadership \u2014 that\u2019s data. That\u2019s what By Their Fruit is built for: giving you a clear, honest picture of what a church is really like from the people who know it best." },
            ],
          },
          {
            id: "why-church-reviews-matter",
            title: "Why Honest Church Reviews Matter More Than Ever",
            date: "March 2026",
            readTime: "4 min read",
            intro: "In every other area of life, we rely on reviews. Restaurants, doctors, employers, products \u2014 we read what others think before we commit. So why has church been the exception?",
            sections: [
              { heading: "The Information Gap", body: "When someone moves to a new city, they can find restaurant ratings in seconds. But finding a church? They\u2019re left with Google Maps listings, outdated websites, and word of mouth. There\u2019s no structured, honest feedback system \u2014 until now. By Their Fruit exists to close that gap." },
              { heading: "Reviews Help Churches Grow", body: "Honest feedback isn\u2019t just good for church-seekers \u2014 it\u2019s invaluable for church leaders. How do you know if your welcome team is actually welcoming? If your youth program is resonating? If people feel the teaching is strong? Reviews give churches a mirror they can\u2019t get any other way. The best churches will embrace it." },
              { heading: "Building Trust Through Transparency", body: "A church that welcomes reviews is a church that has nothing to hide. Claiming your page on By Their Fruit and responding to reviews signals to prospective visitors: \u201CWe care about your experience, and we\u2019re willing to listen.\u201D That kind of transparency builds trust \u2014 and trust is the foundation of any church community." },
              { heading: "By Their Fruit: Matthew 7:16", body: "The name says it all. \u201CBy their fruit you will recognize them.\u201D We believe that when churches live out their mission well, the fruit speaks for itself. And when it doesn\u2019t, honest feedback is the first step toward growth. That\u2019s what this platform is about." },
            ],
          },
          {
            id: "questions-to-ask-before-joining-a-church",
            title: "15 Questions to Ask Before Joining a Church",
            date: "March 2026",
            readTime: "6 min read",
            intro: "Joining a church is a big commitment. Before you sign up for membership, volunteer for a team, or put down roots, here are 15 questions worth asking \u2014 both to church leadership and to yourself.",
            sections: [
              { heading: "Questions About Teaching and Beliefs", body: "What does the church believe about core doctrines, and where can you read their statement of faith? How are sermons prepared \u2014 are they rooted in scripture or more topical? Is there room for questions and theological conversation, or is it a one-way street? These foundational questions help you understand whether the church\u2019s teaching aligns with your convictions and whether you\u2019ll be spiritually fed week after week." },
              { heading: "Questions About Community", body: "How do people actually build relationships here \u2014 is it mainly Sunday morning, or are there small groups and mid-week gatherings? What happens when someone goes through a hard time \u2014 does the community rally, or do people slip through the cracks? Is there a path for newcomers to get connected, or do you have to figure it out on your own? The answers reveal whether a church is truly a community or just a weekly event." },
              { heading: "Questions About Leadership", body: "Who makes the major decisions, and how transparent is that process? Is there accountability for the senior pastor and leadership team? How does the church handle conflict or disagreements? Can members access financial reports? Churches with healthy governance welcome these questions. If leadership gets defensive or evasive, that\u2019s a significant red flag." },
              { heading: "Questions About Growth and Serving", body: "Are there opportunities to use your gifts and serve, or are volunteer roles limited to a select few? Does the church invest in developing leaders from within the congregation? Is there a culture of mentorship? What does the church do for the local community beyond its own walls? A healthy church equips its people to grow \u2014 not just attend." },
              { heading: "How Reviews Can Answer These Questions", body: "You might not feel comfortable asking a pastor all 15 of these questions on your second visit. That\u2019s where church reviews come in. On By Their Fruit, real congregants share honest feedback across 10 structured categories \u2014 from teaching quality and financial transparency to youth programs and community culture. It\u2019s like getting answers from dozens of church members before you even walk through the door." },
            ],
          },
          {
            id: "how-to-leave-a-church-gracefully",
            title: "How to Leave a Church Gracefully (And When It\u2019s Time)",
            date: "March 2026",
            readTime: "5 min read",
            intro: "Leaving a church is one of the hardest decisions many Christians face. Whether you\u2019re moving, experiencing burnout, or realizing the church is no longer a healthy fit, here\u2019s how to navigate the transition with grace and integrity.",
            sections: [
              { heading: "Recognizing When It\u2019s Time", body: "Sometimes the signs are obvious: you dread going, the teaching no longer challenges you, or you\u2019ve witnessed patterns of unhealthy leadership. Other times it\u2019s more subtle \u2014 a slow drift where you realize you\u2019re no longer growing or feeling connected. There\u2019s no shame in acknowledging that a season has ended. Not every church is the right fit forever, and staying out of guilt or obligation isn\u2019t good for you or the church." },
              { heading: "Have an Honest Conversation", body: "If at all possible, talk to a pastor or leader before you leave. You don\u2019t owe anyone a detailed explanation, but a brief, honest conversation goes a long way. Something like: \u201CThis has been a meaningful season for us, but we feel led to explore other options.\u201D Most healthy leaders will receive that with grace. If they respond with guilt, manipulation, or anger \u2014 that\u2019s a confirmation you\u2019re making the right move." },
              { heading: "Don\u2019t Burn Bridges", body: "Resist the urge to leave with a list of grievances or to recruit others to leave with you. Even if your experience wasn\u2019t great, you can exit with dignity. Speak well of the good things you experienced. If there are serious concerns \u2014 like misconduct or financial impropriety \u2014 address them privately with the appropriate people, but don\u2019t turn your departure into a campaign." },
              { heading: "Find Your Next Community", body: "Don\u2019t let a bad church experience keep you from church altogether. Take a breather if you need to, but don\u2019t drift indefinitely. Use tools like By Their Fruit to read reviews and find churches where people are genuinely experiencing strong community, good teaching, and healthy leadership. The right church is out there \u2014 and having honest information makes the search a lot less daunting." },
              { heading: "Leave a Thoughtful Review", body: "Once you\u2019ve moved on, consider leaving an honest review of the church you left. Not as revenge, but as a service to others. Your experience \u2014 both the good and the difficult parts \u2014 can help someone else make a more informed decision. That\u2019s the heart of By Their Fruit: real experiences, shared with honesty and love." },
            ],
          },
          {
            id: "church-for-young-adults",
            title: "Finding a Church as a Young Adult: A Practical Guide",
            date: "March 2026",
            readTime: "5 min read",
            intro: "You\u2019re in your 20s or 30s, maybe fresh out of college, maybe starting a career or a family. Church feels different now than it did growing up \u2014 and finding one that fits this season of life comes with its own set of challenges.",
            sections: [
              { heading: "Why Young Adults Leave \u2014 and Why They Come Back", body: "Research consistently shows that a significant number of young adults step away from church after high school. The reasons vary: intellectual doubts, feeling judged, a lack of relevance, or simply the chaos of early adulthood. But many come back \u2014 often when they start a family, go through a crisis, or simply miss the sense of community. If that\u2019s you, welcome back. And if you never left but you\u2019re looking for a better fit, that\u2019s great too." },
              { heading: "What to Look For", body: "As a young adult, you probably want a church that takes your questions seriously without dismissing them. Look for a community where people your age are actually present and involved \u2014 not just a token \u201Cyoung adults group\u201D that meets once a month. Strong teaching matters, but so does a culture that feels authentic rather than performative. And if you\u2019re starting a family, kids and youth programs become a real factor." },
              { heading: "Don\u2019t Rule Out the Unexpected", body: "Some of the best church experiences come from places you wouldn\u2019t expect. A smaller, older congregation might have the kind of deep, intergenerational community that a trendy megachurch can\u2019t offer. A church with an outdated website might have the most genuine worship you\u2019ve ever experienced. Don\u2019t judge by the Instagram presence \u2014 judge by the fruit." },
              { heading: "Use Reviews to Cut Through the Noise", body: "Church websites are marketing tools \u2014 every church looks great on their own site. That\u2019s why peer reviews are so valuable. On By Their Fruit, you can see how real attendees rate a church across 10 specific categories. Want to know if the young adults group is actually active? If the welcome team is genuinely friendly? If the teaching is substantive? The reviews tell you what the website won\u2019t." },
              { heading: "Give It Time", body: "Finding the right church rarely happens overnight. Give yourself permission to visit several, and don\u2019t commit too quickly or give up too fast. Attend at least 3\u20134 times before deciding. Get involved in a small group or serve team to experience the church beyond Sunday morning. The right community is worth the search." },
            ],
          },
          {
            id: "what-church-leaders-can-learn-from-reviews",
            title: "What Church Leaders Can Learn From Honest Reviews",
            date: "March 2026",
            readTime: "5 min read",
            intro: "For church leaders, hearing honest feedback from your congregation can feel vulnerable. But the churches that thrive are the ones that listen. Here\u2019s why embracing reviews is one of the smartest things a church leader can do.",
            sections: [
              { heading: "The Feedback You\u2019re Not Getting on Sunday Morning", body: "Most church leaders rely on a few familiar channels for feedback: conversations after service, elder meetings, maybe an annual survey that gets a 15% response rate. But the truth is, the people most likely to share concerns are the ones who\u2019ve already decided to leave \u2014 or have already left. Structured review platforms give you insight from the broader congregation, including the quiet members who would never approach you directly but have valuable perspectives to share." },
              { heading: "Patterns Matter More Than Individual Reviews", body: "One negative review about parking is just one person having a bad morning. Five reviews mentioning that the welcome team feels cliquish? That\u2019s a pattern worth addressing. By Their Fruit\u2019s 10-category rating system helps you spot trends across teaching, worship, community, youth programs, leadership, and more. Instead of reacting to individual complaints, you can identify systemic strengths and weaknesses." },
              { heading: "Reviews Build Trust With Visitors", body: "When a prospective visitor is considering your church, what do they find online? If it\u2019s just your website and a few generic Google reviews, they\u2019re making a decision with very little information. But if they find detailed, honest reviews on By Their Fruit \u2014 and see that your church has claimed its page and engaged with feedback \u2014 that builds enormous trust before they ever walk through your doors." },
              { heading: "How to Respond Well", body: "The best response to a critical review isn\u2019t defensiveness \u2014 it\u2019s curiosity. Thank the reviewer for their honesty. Acknowledge the concern. Share what you\u2019re doing to address it if applicable. This kind of public response shows everyone \u2014 not just the reviewer \u2014 that your church takes feedback seriously. It\u2019s the same principle that makes great businesses stand out: how you handle criticism says more about you than how you handle praise." },
              { heading: "Claim Your Church Page", body: "If your church is listed on By Their Fruit, you can claim your page to respond to reviews, update your church information, and show visitors that you\u2019re engaged. It\u2019s free, it takes minutes, and it sends a powerful message: this is a church that cares about the experience of its people. Because the churches that are willing to listen are the churches that grow." },
            ],
          },
        ];
        const [selectedArticle, setSelectedArticle] = useState(() => {
          const h = window.location.hash;
          const m = h.match(/^#\/blog\/(.+)$/);
          return m ? m[1] : null;
        });
        const article = articles.find(a => a.id === selectedArticle);
        return (
          <div style={{ maxWidth: 800, margin: "0 auto", padding: "48px 24px" }}>
            {!article ? (
              <FadeIn>
                <div style={{ textAlign: "center", marginBottom: 48 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Blog</div>
                  <h1 style={{ fontSize: 32, fontFamily: T.heading, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.03em" }}>Church Life Insights</h1>
                  <p style={{ fontSize: 15, color: T.textSoft, margin: 0, maxWidth: 520, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>Guides, tips, and thoughts on finding the right church, understanding church culture, and growing in community.</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {articles.map((a, i) => (
                    <FadeIn key={a.id} delay={100 + i * 80}>
                      <div onClick={() => { setSelectedArticle(a.id); window.history.pushState(null, "", `#/blog/${a.id}`); }} style={{ padding: "24px 28px", borderRadius: T.radius, background: T.surface, border: `1.5px solid ${T.border}`, cursor: "pointer", transition: "all 0.2s" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.transform = "translateY(-1px)"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = "translateY(0)"; }}>
                        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, color: T.textMuted }}>{a.date}</span>
                          <span style={{ fontSize: 11, color: T.textMuted }}>{a.readTime}</span>
                        </div>
                        <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.02em", color: T.text }}>{a.title}</h2>
                        <p style={{ fontSize: 14, color: T.textSoft, margin: 0, lineHeight: 1.6 }}>{a.intro.substring(0, 180)}...</p>
                      </div>
                    </FadeIn>
                  ))}
                </div>
              </FadeIn>
            ) : (
              <FadeIn>
                <button onClick={() => { setSelectedArticle(null); window.history.pushState(null, "", "#/blog"); }} style={{ background: "none", border: "none", color: T.accent, fontSize: 13, cursor: "pointer", fontWeight: 600, padding: 0, marginBottom: 32, fontFamily: T.body }}>{"\u2190"} Back to Blog</button>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: T.textMuted }}>{article.date}</span>
                    <span style={{ fontSize: 12, color: T.textMuted }}>{article.readTime}</span>
                  </div>
                  <h1 style={{ fontSize: 30, fontFamily: T.heading, fontWeight: 800, margin: "0 0 16px", letterSpacing: "-0.03em", lineHeight: 1.2 }}>{article.title}</h1>
                  <p style={{ fontSize: 16, color: T.textSoft, lineHeight: 1.8, margin: "0 0 32px" }}>{article.intro}</p>
                </div>
                {article.sections.map((s, i) => (
                  <div key={i} style={{ marginBottom: 28 }}>
                    <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "0 0 8px", color: T.text, letterSpacing: "-0.02em" }}>{s.heading}</h2>
                    <p style={{ fontSize: 15, color: T.textSoft, lineHeight: 1.8, margin: 0 }}>{s.body}</p>
                  </div>
                ))}
                <div style={{ marginTop: 40, padding: "24px 28px", borderRadius: T.radius, background: T.accentSoft, border: `1.5px solid ${T.accentBorder}`, textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.heading, color: T.accent, marginBottom: 6 }}>Ready to find your church?</div>
                  <p style={{ fontSize: 14, color: T.textSoft, margin: "0 0 16px" }}>Search over 270,000 churches and read honest reviews from real congregants.</p>
                  <button onClick={() => navigate("discover")} style={{ padding: "10px 28px", borderRadius: T.radiusFull, fontSize: 14, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body }}>Find a Church</button>
                </div>
              </FadeIn>
            )}
          </div>
        );
      })()}

      <footer style={{ borderTop: `1px solid ${T.border}`, marginTop: 60 }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 32, marginBottom: 28 }}>
            {/* Brand column */}
            <div style={{ minWidth: 180 }}>
              <div style={{ marginBottom: 8 }}><Logo size={14} color={T.text} /></div>
              <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.5, maxWidth: 260 }}>Real experiences from real congregants — honest, structured, and built to help churches grow.</div>
            </div>
            {/* Navigation column */}
            <div style={{ minWidth: 120 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Explore</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[{ label: "Find a Church", page: "discover" }, { label: "Share Your Experience", page: "rate" }, { label: "How It Works", page: "about" }, { label: "For Churches", page: "for-churches" }].map(link => (
                  <button key={link.page} onClick={() => { if (link.page === "rate") startRateFlow(); else navigate(link.page); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, color: T.textSoft, fontFamily: T.body, textAlign: "left" }} onMouseEnter={e => e.currentTarget.style.color = T.accent} onMouseLeave={e => e.currentTarget.style.color = T.textSoft}>{link.label}</button>
                ))}
              </div>
            </div>
            {/* Contact column */}
            <div style={{ minWidth: 160 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Contact Us</div>
              <a href="mailto:info@bytheirfruit.church" style={{ fontSize: 13, color: T.accent, textDecoration: "none", fontFamily: T.body }} onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"} onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>info@bytheirfruit.church</a>
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 6, lineHeight: 1.5 }}>Questions, feedback, or partnership inquiries — we'd love to hear from you.</div>
            </div>
          </div>
          {/* Bottom bar */}
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 11, color: T.textMuted }}>&copy; {new Date().getFullYear()} By Their Fruit. All rights reserved.</div>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <button onClick={() => navigate("terms")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, color: T.textMuted, fontFamily: T.body }} onMouseEnter={e => e.currentTarget.style.color = T.accent} onMouseLeave={e => e.currentTarget.style.color = T.textMuted}>Terms of Service</button>
              <button onClick={() => navigate("privacy")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, color: T.textMuted, fontFamily: T.body }} onMouseEnter={e => e.currentTarget.style.color = T.accent} onMouseLeave={e => e.currentTarget.style.color = T.textMuted}>Privacy Policy</button>
              <div style={{ fontSize: 11, color: T.textMuted }}>Matthew 7:16</div>
            </div>
          </div>

          {/* Report Abuse */}
          <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 16, paddingTop: 16, textAlign: "center" }}>
            <button onClick={() => { setShowAbuseModal(true); setAbuseSubmitted(false); setAbuseData({ reportType: "", churchName: "", churchCity: "", churchState: "", description: "", contactMethod: "" }); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${T.redBorder}`, borderRadius: T.radiusFull, padding: "8px 18px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: T.red, fontFamily: T.body, transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = T.redSoft; }} onMouseLeave={e => { e.currentTarget.style.background = "none"; }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Report Abuse Anonymously
            </button>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 6 }}>If you or someone you know has experienced abuse at a church, we want to hear about it. No sign-in required. Your identity is never recorded.</div>
          </div>
        </div>
      </footer>

      {/* ANONYMOUS ABUSE REPORT MODAL */}
      {showAbuseModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", padding: 20 }} onClick={() => setShowAbuseModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, background: T.surface, borderRadius: 16, padding: "32px 28px", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 48px rgba(0,0,0,0.15)", animation: "modalIn 0.25s ease" }}>
            {abuseSubmitted ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ width: 56, height: 56, borderRadius: 28, background: T.greenSoft, border: `2px solid ${T.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 16px" }}>✓</div>
                <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.03em" }}>Report received</h2>
                <p style={{ fontSize: 14, color: T.textSoft, margin: "0 0 8px" }}>Your report has been securely submitted. No identifying information was stored.</p>
                <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 24px" }}>If you provided a way to contact you, we may reach out. Otherwise, we will investigate this matter privately.</p>
                <button onClick={() => setShowAbuseModal(false)} style={{ padding: "10px 28px", borderRadius: T.radiusFull, fontSize: 14, fontWeight: 600, background: T.text, color: T.bg, border: "none", cursor: "pointer", fontFamily: T.body }}>Close</button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 18, background: T.redSoft, border: `1.5px solid ${T.redBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  </div>
                  <h2 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: 0, letterSpacing: "-0.03em" }}>Report Abuse Anonymously</h2>
                </div>

                <div style={{ padding: "12px 14px", borderRadius: T.radiusSm, background: T.surfaceAlt, border: `1px solid ${T.border}`, margin: "16px 0 20px" }}>
                  <p style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.6, margin: 0 }}>
                    <strong style={{ color: T.text }}>Your privacy is protected.</strong> This form does not require sign-in. We do not store your identity, IP address, or any identifying information. Reports cannot be traced back to you. Only site administrators can view submissions.
                  </p>
                </div>

                {/* Type of abuse */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Type of Concern <span style={{ color: T.red }}>*</span></label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[
                      { value: "church_leader", label: "Leadership Abuse" },
                      { value: "financial", label: "Financial Misconduct" },
                      { value: "spiritual", label: "Spiritual Manipulation" },
                      { value: "sexual", label: "Sexual Misconduct" },
                      { value: "discrimination", label: "Discrimination" },
                      { value: "other", label: "Other" },
                    ].map(opt => (
                      <button key={opt.value} onClick={() => setAbuseData(p => ({ ...p, reportType: opt.value }))} style={{
                        padding: "7px 14px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 500,
                        fontFamily: T.body, cursor: "pointer", transition: "all 0.15s",
                        background: abuseData.reportType === opt.value ? T.red : T.surfaceAlt,
                        color: abuseData.reportType === opt.value ? "#fff" : T.textSoft,
                        border: `1px solid ${abuseData.reportType === opt.value ? T.red : T.border}`,
                      }}>{opt.label}</button>
                    ))}
                  </div>
                </div>

                {/* Church info */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Church Information <span style={{ fontWeight: 400, textTransform: "none" }}>(if known)</span></label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input value={abuseData.churchName} onChange={e => setAbuseData(p => ({ ...p, churchName: e.target.value }))} placeholder="Church name" style={{ flex: 2, minWidth: 160, padding: "9px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.surfaceAlt, color: T.text, outline: "none", fontFamily: T.body }} />
                    <input value={abuseData.churchCity} onChange={e => setAbuseData(p => ({ ...p, churchCity: e.target.value }))} placeholder="City" style={{ flex: 1, minWidth: 100, padding: "9px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.surfaceAlt, color: T.text, outline: "none", fontFamily: T.body }} />
                    <select value={abuseData.churchState} onChange={e => setAbuseData(p => ({ ...p, churchState: e.target.value }))} style={{ padding: "9px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.surfaceAlt, color: T.text, fontFamily: T.body, cursor: "pointer", minWidth: 70 }}>
                      <option value="">State</option>
                      {US_STATES.filter(s => s !== "All").map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>What happened? <span style={{ color: T.red }}>*</span></label>
                  <textarea value={abuseData.description} onChange={e => setAbuseData(p => ({ ...p, description: e.target.value }))} placeholder="Please describe what you experienced or witnessed. Include as much detail as you're comfortable sharing — dates, names, patterns of behavior. Everything here is anonymous." rows={5} style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.surfaceAlt, color: T.text, outline: "none", fontFamily: T.body, resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }} />
                  {abuseData.description.length > 0 && abuseData.description.length < 20 && (
                    <div style={{ fontSize: 11, color: T.amber, marginTop: 4 }}>Please provide at least 20 characters ({20 - abuseData.description.length} more needed)</div>
                  )}
                </div>

                {/* Optional contact */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>How can we follow up? <span style={{ fontWeight: 400, textTransform: "none" }}>(completely optional)</span></label>
                  <input value={abuseData.contactMethod} onChange={e => setAbuseData(p => ({ ...p, contactMethod: e.target.value }))} placeholder="Email, phone, or leave blank to remain fully anonymous" style={{ width: "100%", padding: "9px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.surfaceAlt, color: T.text, outline: "none", fontFamily: T.body, boxSizing: "border-box" }} />
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>If you provide contact info, only administrators will see it. It is never stored with your identity.</div>
                </div>

                {/* Submit */}
                <div style={{ display: "flex", gap: 10 }}>
                  <button disabled={!abuseData.reportType || abuseData.description.length < 20 || abuseSubmitting} onClick={async () => {
                    setAbuseSubmitting(true);
                    const { error } = await supabase.from("abuse_reports").insert({
                      report_type: abuseData.reportType,
                      church_name: abuseData.churchName || null,
                      church_city: abuseData.churchCity || null,
                      church_state: abuseData.churchState || null,
                      description: abuseData.description,
                      contact_method: abuseData.contactMethod || null,
                    });
                    setAbuseSubmitting(false);
                    if (error) {
                      showToast("Failed to submit report. Please try again.", "error");
                    } else {
                      setAbuseSubmitted(true);
                    }
                  }} style={{
                    flex: 1, padding: "12px", borderRadius: T.radiusSm, fontSize: 14, fontWeight: 600,
                    background: T.red, color: "#fff", border: "none",
                    cursor: abuseSubmitting ? "wait" : "pointer", fontFamily: T.body,
                    opacity: (!abuseData.reportType || abuseData.description.length < 20 || abuseSubmitting) ? 0.5 : 1,
                  }}>{abuseSubmitting ? "Submitting..." : "Submit Report"}</button>
                  <button onClick={() => setShowAbuseModal(false)} style={{
                    padding: "12px 24px", borderRadius: T.radiusSm, fontSize: 14, fontWeight: 500,
                    background: "transparent", color: T.textMuted, border: `1px solid ${T.border}`,
                    cursor: "pointer", fontFamily: T.body,
                  }}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
