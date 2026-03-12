"use client"

import { useState, useEffect } from "react";

const fonts = `@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');`;

const T = {
  bg: "#fafafa", surface: "#ffffff", surfaceAlt: "#f4f4f5",
  border: "#e4e4e7", borderLight: "#f0f0f2",
  text: "#18181b", textSoft: "#52525b", textMuted: "#a1a1aa",
  accent: "#2563eb", accentSoft: "#eff4ff", accentBorder: "#bfdbfe",
  green: "#16a34a", greenSoft: "#f0fdf4", greenBorder: "#bbf7d0",
  amber: "#d97706", amberSoft: "#fffbeb", amberBorder: "#fde68a",
  red: "#dc2626", redSoft: "#fef2f2", redBorder: "#fecaca",
  heading: "'Sora', sans-serif", body: "'Plus Jakarta Sans', sans-serif",
  radius: 12, radiusSm: 8, radiusFull: 9999,
};

const MIN_REVIEWS_FOR_SCORE = 3;

const CATEGORY_GROUPS = [
  { label: "Sunday Experience", ids: ["teaching", "worship", "prayer", "welcome"] },
  { label: "Community & Care", ids: ["community", "kids", "youth"] },
  { label: "Governance", ids: ["leadership", "finances", "service"] },
];

const CATEGORIES = [
  { id: "teaching", label: "Teaching & Scripture", desc: "Is the teaching rooted in scripture? Does the pastor handle God's word faithfully?" },
  { id: "welcome", label: "Visitor Experience", desc: "Were you greeted warmly? Could you find your way? Did someone reach out after?" },
  { id: "community", label: "Genuine Community", desc: "Do relationships go beyond Sunday? Is there real depth and care?" },
  { id: "worship", label: "Worship", desc: "Is worship authentic and God-focused? Is it about performance or genuine praise?" },
  { id: "prayer", label: "Prayer Life", desc: "Is there space and priority for prayer? Are prayer requests taken seriously and followed up on?" },
  { id: "kids", label: "Children's Ministry", desc: "Are children safe, loved, and taught well? Are there proper check-in and safety protocols?" },
  { id: "youth", label: "Youth Ministry", desc: "Are teenagers engaged and discipled? Is there real mentorship or just entertainment?" },
  { id: "leadership", label: "Leadership & Integrity", desc: "Is leadership transparent, accountable, and servant-hearted?" },
  { id: "service", label: "Local Outreach", desc: "Is this church active in the community? Do they serve beyond their walls?" },
  { id: "finances", label: "Financial Transparency", desc: "Is there openness about how tithes and offerings are used?" },
];

const SAMPLE_CHURCHES = [
  {
    id: 1, name: "Harbor Grace Fellowship", denomination: "Non-Denominational",
    city: "Tampa", state: "FL", address: "4210 Bayshore Blvd, Tampa, FL 33611",
    size: "150â€“300", serviceStyle: "Contemporary", serviceTimes: "Sun 9 AM, 11 AM",
    totalReviews: 47,
    scores: { teaching: 4.6, welcome: 4.8, community: 4.5, worship: 4.3, prayer: 4.0, kids: 4.7, youth: 4.1, leadership: 4.2, service: 4.4, finances: 3.9 },
    tags: ["Expository Teaching", "Young Families", "Active Small Groups", "Strong Kids Program"],
    recentReviews: [
      { author: "Sarah M.", role: "Member Â· 2 yrs", date: "Feb 2026", text: "Our family found a real home here. The children's ministry is outstanding â€” our kids actually ask to go to church. The youth group is newer and still finding its footing, but the heart is there. Pastor David teaches verse by verse and doesn't shy away from hard passages. The only area I'd love to see growth is more transparency around the annual budget.", scores: { teaching: 5, welcome: 5, community: 5, kids: 5, youth: 3, leadership: 4, finances: 3 }, comments: { kids: "Miss Rachel in the preschool room is incredible.", finances: "No public budget report that I've seen." } },
      { author: "James T.", role: "First-time Visitor", date: "Jan 2026", text: "Visited on a Sunday morning with my wife. We were greeted at the door, someone walked us to the kids' check-in, and a couple invited us to sit with them. After the service, a pastor personally thanked us for coming. Got a text follow-up on Tuesday.", scores: { teaching: 4, welcome: 5, community: 4, worship: 4, prayer: 3, kids: 5 }, comments: { welcome: "The couple who sat with us made all the difference.", prayer: "No dedicated prayer time in the service." } },
      { author: "Michael R.", role: "Former Member", date: "Dec 2025", text: "Attended for a year. Teaching is solid and the people are kind. I left because the leadership structure felt top-heavy â€” elders weren't accessible and major decisions happened without congregation input.", scores: { teaching: 5, welcome: 4, community: 4, leadership: 3, finances: 3 }, comments: { leadership: "Tried to meet with an elder twice and was redirected to staff." } },
    ],
  },
  {
    id: 2, name: "Christ Redeemer Bible Church", denomination: "Reformed Baptist",
    city: "St. Petersburg", state: "FL", address: "1802 4th Street N, St. Petersburg, FL 33704",
    size: "75â€“150", serviceStyle: "Traditional / Blended", serviceTimes: "Sun 10:30 AM, Wed 7 PM",
    totalReviews: 31,
    scores: { teaching: 4.9, welcome: 3.8, community: 4.6, worship: 4.1, prayer: 4.7, kids: 3.5, youth: 2.8, leadership: 4.7, service: 4.3, finances: 4.8 },
    tags: ["Deep Doctrine", "Verse-by-Verse", "Elder Led", "Financially Transparent", "Strong Prayer Culture"],
    recentReviews: [
      { author: "Daniel K.", role: "Member Â· 4 yrs", date: "Feb 2026", text: "If you want expository preaching that doesn't water down the gospel, this is it. Pastor Williams spends 20+ hours preparing each sermon and it shows. The church publishes full financial reports quarterly. Prayer is woven into everything.", scores: { teaching: 5, community: 5, prayer: 5, leadership: 5, finances: 5 }, comments: { prayer: "Wednesday nights are entirely devoted to corporate prayer â€” it's beautiful.", finances: "Full quarterly reports emailed to members." } },
      { author: "Emily W.", role: "Visitor Â· 3 visits", date: "Jan 2026", text: "The preaching is incredible but I'll be honest â€” the first Sunday felt a bit cold. Nobody introduced themselves until I went up to someone after the service. Kids' ministry is very small and there's essentially no youth program.", scores: { teaching: 5, welcome: 3, community: 3, worship: 4, kids: 3, youth: 2 }, comments: { welcome: "Felt invisible the first visit. Better by the third.", youth: "My 14-year-old sat in the main service â€” no teen program at all." } },
    ],
  },
  {
    id: 3, name: "New Life Community Church", denomination: "Assemblies of God",
    city: "Lakewood Ranch", state: "FL", address: "7535 Lorraine Rd, Lakewood Ranch, FL 34202",
    size: "500â€“1,000", serviceStyle: "Contemporary", serviceTimes: "Sun 9 AM, 10:45 AM, 6 PM",
    totalReviews: 83,
    scores: { teaching: 4.1, welcome: 4.7, community: 4.0, worship: 4.8, prayer: 3.3, kids: 4.6, youth: 4.5, leadership: 3.6, service: 4.5, finances: 3.2 },
    tags: ["Energetic Worship", "Large Kids Program", "Active Youth Group", "Community Events"],
    recentReviews: [
      { author: "Christina L.", role: "Member Â· 1 yr", date: "Mar 2026", text: "The worship experience here is powerful and the production quality is top-notch. My teenager actually wants to go to youth group. My concern is that sermons sometimes feel more motivational than biblical. No real corporate prayer time, and I have no idea what the budget looks like.", scores: { teaching: 3, welcome: 5, worship: 5, prayer: 2, kids: 5, youth: 5, leadership: 4, finances: 2 }, comments: { teaching: "Topical series are fun but I miss verse-by-verse.", prayer: "Zero corporate prayer in any service I've attended.", worship: "Band is genuinely talented and the sets feel Spirit-led." } },
      { author: "Robert P.", role: "First-time Visitor", date: "Feb 2026", text: "Brought my family of five. The facility is amazing, the greeters were fantastic, kids' check-in was smooth and secure. My teenagers actually enjoyed the youth service.", scores: { welcome: 5, kids: 5, youth: 5, worship: 5 }, comments: {} },
    ],
  },
];

/* â”€â”€â”€ HELPERS â”€â”€â”€ */
const avg = (s) => { const v = Object.values(s); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
const hasScores = (c) => c.totalReviews >= MIN_REVIEWS_FOR_SCORE && Object.keys(c.scores).length > 0;
const scoreColor = (s) => s >= 4.5 ? T.green : s >= 3.5 ? T.amber : T.red;
const scoreBg = (s) => s >= 4.5 ? T.greenSoft : s >= 3.5 ? T.amberSoft : T.redSoft;
const scoreBorder2 = (s) => s >= 4.5 ? T.greenBorder : s >= 3.5 ? T.amberBorder : T.redBorder;

/* â”€â”€â”€ RESPONSIVE â”€â”€â”€ */
const responsiveCSS = `
@media(max-width:768px){
  .btf-grid-3{grid-template-columns:1fr!important}
  .btf-grid-2{grid-template-columns:1fr!important}
  .btf-profile-grid{grid-template-columns:1fr!important}
  .btf-hero-title{font-size:36px!important}
  .btf-hero-buttons{flex-direction:column!important;align-items:stretch!important}
  .btf-nav-links{gap:2px!important}
  .btf-cat-grid{grid-template-columns:1fr!important}
  .btf-score-mini{display:none!important}
}`;

/* â”€â”€â”€ COMPONENTS â”€â”€â”€ */
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
      background: active ? T.text : T.surface, color: active ? "#fff" : T.textSoft,
      border: `1.5px solid ${active ? T.text : T.border}`, cursor: "pointer", transition: "all 0.15s",
    }}>{children}</button>
  );
}

/* â”€â”€â”€ RATING SLIDER WITH OPTIONAL COMMENT + NOT SURE â”€â”€â”€ */
function RatingSlider({ label, desc, value, onChange, comment, onCommentChange, skipped, onSkipToggle }) {
  const starValue = Math.round(value);
  const sliderColor = value >= 4.5 ? T.green : value >= 3.5 ? T.amber : value >= 1 ? T.red : T.border;
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

      {/* Not sure checkbox */}
      <div
        onClick={() => onSkipToggle(!skipped)}
        style={{
          display: "flex", alignItems: "center", gap: 8, margin: "8px 0",
          cursor: "pointer", userSelect: "none",
        }}
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
          Not sure â€” I can't speak to this yet
        </span>
      </div>

      {/* Rating controls â€” hidden when skipped */}
      {!skipped && (
        <>
          <div style={{ display: "flex", gap: 3, margin: "6px 0 8px" }}>
            {[1, 2, 3, 4, 5].map(n => (
              <span key={n} onClick={() => onChange(n)} style={{ fontSize: 22, cursor: "pointer", color: n <= starValue ? "#f59e0b" : T.border, transition: "color 0.15s" }}>â˜…</span>
            ))}
          </div>
          <div style={{ position: "relative", height: 28, display: "flex", alignItems: "center" }}>
            <div style={{ position: "absolute", left: 0, right: 0, height: 6, borderRadius: 3, background: T.surfaceAlt, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, width: `${fillPct}%`, background: `linear-gradient(90deg, ${sliderColor}cc, ${sliderColor})`, transition: "width 0.15s ease" }} />
            </div>
            <input type="range" min="1" max="5" step="0.1" value={value || 1} onChange={e => onChange(parseFloat(e.target.value))}
              style={{ position: "absolute", left: -2, right: -2, top: 0, width: "calc(100% + 4px)", height: 28, opacity: 0, cursor: "pointer", margin: 0 }} />
            {value > 0 && (
              <div style={{ position: "absolute", left: `${fillPct}%`, transform: "translateX(-50%)", width: 16, height: 16, borderRadius: 8, background: sliderColor, border: "2px solid #fff", boxShadow: `0 1px 4px ${sliderColor}44`, transition: "left 0.15s ease", pointerEvents: "none" }} />
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, marginBottom: value > 0 ? 6 : 0 }}>
            <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 500 }}>Poor</span>
            <span style={{ fontSize: 9, color: T.textMuted, fontWeight: 500 }}>Excellent</span>
          </div>
          {/* Optional comment */}
          {value > 0 && !showComment && (
            <button onClick={() => setShowComment(true)} style={{
              marginTop: 4, fontSize: 11, color: T.accent, background: "none", border: "none",
              cursor: "pointer", fontFamily: T.body, fontWeight: 600, padding: 0,
            }}>+ Add a comment about {label.split("&")[0].split("/")[0].trim().toLowerCase()}</button>
          )}
          {value > 0 && showComment && (
            <input
              value={comment || ""} onChange={e => onCommentChange(e.target.value)}
              placeholder={`Optional: what specifically about ${label.toLowerCase().split("&")[0].trim()}?`}
              style={{
                width: "100%", marginTop: 6, padding: "8px 12px", borderRadius: T.radiusSm,
                fontSize: 12, border: `1px solid ${T.borderLight}`, background: T.surfaceAlt,
                color: T.text, outline: "none", fontFamily: T.body,
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

/* â”€â”€â”€ SOCIAL ICONS â”€â”€â”€ */
function GoogleIcon() { return <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>; }
function AppleIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="#000"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>; }
function FacebookIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>; }
function MicrosoftIcon() { return <svg width="18" height="18" viewBox="0 0 24 24"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="13" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="13" width="10" height="10" fill="#00A4EF"/><rect x="13" y="13" width="10" height="10" fill="#FFB900"/></svg>; }

function AuthModal({ onClose, onAuth, mode: im }) {
  const [mode, setMode] = useState(im || "signin");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState(""); const [loading, setLoading] = useState(false);
  const social = (p) => { setLoading(true); setTimeout(() => onAuth({ name: "User", email: `user@${p}.com`, provider: p, avatar: "U" }), 800); };
  const emailAuth = () => { if (!email || !password) return; setLoading(true); setTimeout(() => onAuth({ name: mode === "signup" ? name : email.split("@")[0], email, provider: "email", avatar: (name || email).charAt(0).toUpperCase() }), 600); };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, background: T.surface, borderRadius: 16, padding: "36px 32px", boxShadow: "0 24px 48px rgba(0,0,0,0.12)", animation: "modalIn 0.25s ease" }}>
        <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.95) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><Logo size={15} /></div>
          <h2 style={{ fontSize: 22, fontFamily: T.heading, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.03em" }}>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
          <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>{mode === "signin" ? "Sign in to post your review" : "Sign up to share your experience"}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {[{ p: "google", l: "Continue with Google", i: <GoogleIcon /> }, { p: "apple", l: "Continue with Apple", i: <AppleIcon /> }, { p: "facebook", l: "Continue with Facebook", i: <FacebookIcon /> }, { p: "microsoft", l: "Continue with Microsoft", i: <MicrosoftIcon /> }].map(({ p, l, i }) => (
            <button key={p} onClick={() => social(p)} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 16px", borderRadius: T.radiusSm, fontSize: 13.5, fontWeight: 500, fontFamily: T.body, background: T.surface, color: T.text, border: `1.5px solid ${T.border}`, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1, transition: "all 0.15s" }}>{i}{l}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}><div style={{ flex: 1, height: 1, background: T.border }} /><span style={{ fontSize: 11, color: T.textMuted, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>or</span><div style={{ flex: 1, height: 1, background: T.border }} /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {mode === "signup" && <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, fontSize: 13.5, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} />}
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" type="email" style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, fontSize: 13.5, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} />
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, fontSize: 13.5, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} />
          <button onClick={emailAuth} disabled={loading || !email || !password || (mode === "signup" && !name)} style={{ padding: "11px", borderRadius: T.radiusSm, fontSize: 14, fontWeight: 600, background: T.text, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, opacity: (loading || !email || !password) ? 0.35 : 1 }}>{loading ? "..." : (mode === "signin" ? "Sign In" : "Create Account")}</button>
        </div>
        <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: T.textMuted }}>{mode === "signin" ? "No account? " : "Have an account? "}<span onClick={() => setMode(mode === "signin" ? "signup" : "signin")} style={{ color: T.accent, fontWeight: 600, cursor: "pointer" }}>{mode === "signin" ? "Sign Up" : "Sign In"}</span></div>
      </div>
    </div>
  );
}

function UserMenu({ user, onSignOut }) {
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
        <button onClick={() => { onSignOut(); setOpen(false); }} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 13, fontWeight: 500, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", color: T.red, fontFamily: T.body }}>Sign Out</button>
      </div>}
    </div>
  );
}

/* â”€â”€â”€ REVIEW CARD WITH FLAG + CATEGORY COMMENTS â”€â”€â”€ */
function ReviewCard({ rev, delay = 0 }) {
  const [flagged, setFlagged] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hasComments = rev.comments && Object.keys(rev.comments).length > 0;

  return (
    <FadeIn delay={delay}>
      <div style={{ padding: "20px 22px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}`, marginBottom: 8, position: "relative" }}>
        {rev.pending && (
          <div style={{ position: "absolute", top: 12, right: 14, padding: "3px 8px", borderRadius: T.radiusFull, background: T.amberSoft, border: `1px solid ${T.amberBorder}`, fontSize: 10, fontWeight: 600, color: T.amber }}>Score pending Saturday</div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 13, background: rev.pending ? T.accent : T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: rev.pending ? "#fff" : T.textMuted, fontFamily: T.heading, border: rev.pending ? "none" : `1px solid ${T.border}` }}>{rev.author.charAt(0)}</div>
            <div>
              <span style={{ fontSize: 13.5, fontWeight: 700, fontFamily: T.heading }}>{rev.author}</span>
              <span style={{ fontSize: 12, color: T.textMuted, marginLeft: 8 }}>{rev.role}</span>
            </div>
          </div>
          <span style={{ fontSize: 11, color: T.textMuted }}>{rev.date}</span>
        </div>
        <p style={{ fontSize: 13.5, color: T.textSoft, lineHeight: 1.7, margin: "0 0 12px" }}>{rev.text}</p>

        {/* Score pills */}
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

        {/* Category comments (expandable) */}
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

        {/* Flag */}
        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
          {flagged ? (
            <span style={{ fontSize: 11, color: T.textMuted, fontStyle: "italic" }}>Flagged for review</span>
          ) : (
            <button onClick={() => setFlagged(true)} style={{ fontSize: 11, color: T.textMuted, background: "none", border: "none", cursor: "pointer", fontFamily: T.body, padding: 0, transition: "color 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.color = T.red} onMouseLeave={e => e.currentTarget.style.color = T.textMuted}>
              Flag as inappropriate
            </button>
          )}
        </div>
      </div>
    </FadeIn>
  );
}

/* â•â•â• MAIN â•â•â• */
export default function ByTheirFruit() {
  const [page, setPage] = useState("home");
  const [selectedChurch, setSelectedChurch] = useState(null);
  const [churches, setChurches] = useState(SAMPLE_CHURCHES);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDenom, setFilterDenom] = useState("All");
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingReview, setPendingReview] = useState(null);

  // Rate flow
  const [rateStep, setRateStep] = useState(0);
  const [rateChurch, setRateChurch] = useState(null);
  const [rateSearch, setRateSearch] = useState("");
  const [rateScores, setRateScores] = useState({});
  const [rateComments, setRateComments] = useState({});
  const [rateSkipped, setRateSkipped] = useState({});
  const [rateText, setRateText] = useState("");
  const [rateRole, setRateRole] = useState("");
  const [showAddChurch, setShowAddChurch] = useState(false);
  const [addData, setAddData] = useState({ name: "", address: "", city: "", state: "FL", denomination: "", size: "", serviceTimes: "" });
  const [googleResults, setGoogleResults] = useState([]);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleSearched, setGoogleSearched] = useState(false);

  // Track user reviews: { churchId: { review, postedAt } }
  const [userReviews, setUserReviews] = useState({});
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (page !== "rate" || rateStep !== 0 || rateSearch.length < 3) { setGoogleResults([]); setGoogleSearched(false); return; }
    const t = setTimeout(() => searchGoogle(rateSearch), 700);
    return () => clearTimeout(t);
  }, [rateSearch, page, rateStep]);

  const searchGoogle = async (q) => {
    setGoogleLoading(true); setGoogleSearched(true);
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, tools: [{ type: "web_search_20250305", name: "web_search" }], messages: [{ role: "user", content: `Find real churches matching "${q}". Return ONLY a JSON array with up to 6 results. Each: {name, address, city, state, denomination}. No markdown.` }] }) });
      const d = await r.json(); const txt = d.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      const m = txt.match(/\[[\s\S]*\]/);
      if (m) { const p = JSON.parse(m[0]); const ln = churches.map(c => c.name.toLowerCase()); setGoogleResults(p.filter(x => !ln.includes(x.name?.toLowerCase())).map((x, i) => ({ id: `g_${Date.now()}_${i}`, name: x.name, address: x.address || "", city: x.city || "", state: x.state || "", denomination: x.denomination || "Non-Denominational", source: "google", size: "", serviceStyle: "", serviceTimes: "", totalReviews: 0, scores: {}, tags: ["New on By Their Fruit"], recentReviews: [] }))); }
    } catch (e) { setGoogleResults([]); } finally { setGoogleLoading(false); }
  };

  const startRateFlow = (preselect) => {
    const existingReview = preselect && user ? userReviews[preselect.id] : null;
    const canEdit = existingReview && (Date.now() - existingReview.postedAt >= 7 * 24 * 60 * 60 * 1000);

    if (existingReview && !canEdit) {
      // Can't edit yet â€” calculate days remaining
      const daysLeft = Math.ceil((7 * 24 * 60 * 60 * 1000 - (Date.now() - existingReview.postedAt)) / (24 * 60 * 60 * 1000));
      alert(`You've already reviewed this church. You can edit your review in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`);
      return;
    }

    setPage("rate"); setRateStep(preselect ? 1 : 0); setRateChurch(preselect || null);
    setRateSearch(""); setRateSkipped({});
    setShowAddChurch(false); setGoogleResults([]); setGoogleSearched(false);
    setAddData({ name: "", address: "", city: "", state: "FL", denomination: "", size: "", serviceTimes: "" });

    if (existingReview && canEdit) {
      // Pre-fill for editing
      setIsEditing(true);
      setRateScores(existingReview.review.scores || {});
      setRateComments(existingReview.review.comments || {});
      setRateText(existingReview.review.text || "");
      setRateRole(existingReview.review.role || "");
    } else {
      setIsEditing(false);
      setRateScores({}); setRateComments({}); setRateText(""); setRateRole("");
    }
  };

  const selectChurchToRate = (c) => {
    const existing = user ? userReviews[c.id] : null;
    if (existing) {
      const canEdit = Date.now() - existing.postedAt >= 7 * 24 * 60 * 60 * 1000;
      if (!canEdit) {
        const daysLeft = Math.ceil((7 * 24 * 60 * 60 * 1000 - (Date.now() - existing.postedAt)) / (24 * 60 * 60 * 1000));
        alert(`You've already reviewed ${c.name}. You can edit your review in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`);
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

  const viewChurch = (c) => { setSelectedChurch(churches.find(ch => ch.id === c.id) || c); setPage("profile"); };

  const postReview = (review, churchId) => {
    setChurches(prev => prev.map(ch => ch.id === churchId ? { ...ch, totalReviews: ch.totalReviews + 1, recentReviews: [review, ...ch.recentReviews] } : ch));
  };

  const handleRateSubmit = () => {
    // Filter out skipped categories from scores and comments
    const filteredScores = Object.fromEntries(
      Object.entries(rateScores).filter(([k]) => !rateSkipped[k]).map(([k, v]) => [k, Math.round(v)])
    );
    const filteredComments = Object.fromEntries(
      Object.entries(rateComments).filter(([k, v]) => !rateSkipped[k] && v)
    );

    const review = { author: user?.name || "Anonymous", role: rateRole, date: "Mar 2026", text: rateText, scores: filteredScores, comments: filteredComments, pending: true };

    if (!user) { setPendingReview({ ...review, _cid: rateChurch.id, _isEdit: isEditing }); setShowAuthModal(true); return; }

    if (isEditing) {
      // Replace existing review
      setChurches(prev => prev.map(ch => {
        if (ch.id === rateChurch.id) {
          const updated = ch.recentReviews.map(r => r._reviewerId === user.email ? { ...review, author: user.name, _reviewerId: user.email } : r);
          return { ...ch, recentReviews: updated };
        }
        return ch;
      }));
    } else {
      postReview({ ...review, author: user.name, _reviewerId: user.email }, rateChurch.id);
    }

    // Track this user's review
    setUserReviews(prev => ({ ...prev, [rateChurch.id]: { review: { ...review, author: user.name }, postedAt: Date.now() } }));
    setRateStep(3);
  };

  const handleAuth = (u) => {
    setUser(u); setShowAuthModal(false);
    if (pendingReview) {
      const r = { ...pendingReview, author: u.name, _reviewerId: u.email }; const cid = r._cid; const wasEdit = r._isEdit; delete r._cid; delete r._isEdit;
      if (wasEdit) {
        setChurches(prev => prev.map(ch => {
          if (ch.id === cid) {
            const updated = ch.recentReviews.map(rev => rev._reviewerId === u.email ? r : rev);
            return { ...ch, recentReviews: updated };
          }
          return ch;
        }));
      } else {
        postReview(r, cid);
      }
      setUserReviews(prev => ({ ...prev, [cid]: { review: r, postedAt: Date.now() } }));
      setPendingReview(null); setRateStep(3);
    }
  };

  const addManualChurch = () => {
    if (!addData.name || !addData.city) return;
    const nc = { id: `m_${Date.now()}`, ...addData, serviceStyle: "", totalReviews: 0, scores: {}, tags: ["New on By Their Fruit"], recentReviews: [] };
    setChurches(prev => [...prev, nc]); setShowAddChurch(false); selectChurchToRate(nc);
  };

  const selectGoogle = (gc) => { if (!churches.find(c => c.id === gc.id)) setChurches(prev => [...prev, gc]); selectChurchToRate(gc); };

  const filteredChurches = churches.filter(c => { const q = searchQuery.toLowerCase(); return (!q || c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q) || c.denomination.toLowerCase().includes(q)) && (filterDenom === "All" || c.denomination === filterDenom); });
  const denoms = ["All", ...new Set(churches.map(c => c.denomination))];
  const currentChurch = selectedChurch ? (churches.find(c => c.id === selectedChurch.id) || selectedChurch) : null;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.body, color: T.text }}>
      <style>{fonts}{responsiveCSS}{`::selection{background:${T.accentSoft};color:${T.accent}}input::placeholder,textarea::placeholder{color:${T.textMuted}}*{box-sizing:border-box}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {showAuthModal && <AuthModal onClose={() => { setShowAuthModal(false); setPendingReview(null); }} onAuth={handleAuth} mode="signup" />}

      {/* NAV */}
      <nav style={{ padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border}`, background: "rgba(250,250,250,0.88)", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(16px)" }}>
        <div onClick={() => { setPage("home"); setSelectedChurch(null); }}><Logo size={16} /></div>
        <div className="btf-nav-links" style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button onClick={() => startRateFlow()} style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, fontFamily: T.body, cursor: "pointer", background: page === "rate" ? T.accent : T.accentSoft, color: page === "rate" ? "#fff" : T.accent, border: `1px solid ${page === "rate" ? T.accent : T.accentBorder}`, transition: "all 0.15s" }}>Rate a Church</button>
          {["discover", "about"].map(id => (
            <button key={id} onClick={() => setPage(id)} style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 500, fontFamily: T.body, cursor: "pointer", background: page === id ? T.text : "transparent", color: page === id ? "#fff" : T.textSoft, border: `1px solid ${page === id ? T.text : "transparent"}`, transition: "all 0.15s" }}>{id.charAt(0).toUpperCase() + id.slice(1)}</button>
          ))}
          <div style={{ width: 1, height: 20, background: T.border, margin: "0 4px" }} />
          {user ? <UserMenu user={user} onSignOut={() => setUser(null)} /> : <button onClick={() => setShowAuthModal(true)} style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, fontFamily: T.body, cursor: "pointer", background: T.accent, color: "#fff", border: "none" }}>Sign In</button>}
        </div>
      </nav>

      {/* HOME */}
      {page === "home" && (
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "96px 24px 60px" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 64 }}>
              <div style={{ display: "inline-block", padding: "5px 14px", borderRadius: T.radiusFull, background: T.surfaceAlt, border: `1px solid ${T.border}`, fontSize: 12, fontWeight: 600, color: T.textSoft, marginBottom: 24 }}>Matthew 7:16</div>
              <h1 className="btf-hero-title" style={{ fontSize: 54, fontFamily: T.heading, fontWeight: 800, lineHeight: 1.06, margin: "0 0 20px", letterSpacing: "-0.045em" }}>You will recognize<br />them by their fruit.</h1>
              <p style={{ fontSize: 17, color: T.textSoft, lineHeight: 1.65, maxWidth: 480, margin: "0 auto 36px" }}>Churches tell you who they are. Their people show you. Real reviews from real congregants â€” honest, structured, and built to help churches grow.</p>
              <div className="btf-hero-buttons" style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <button onClick={() => startRateFlow()} style={{ padding: "12px 28px", borderRadius: T.radiusFull, fontSize: 14, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, boxShadow: "0 2px 12px rgba(37,99,235,0.2)" }}>Rate a Church</button>
                <button onClick={() => setPage("discover")} style={{ padding: "12px 28px", borderRadius: T.radiusFull, fontSize: 14, fontWeight: 600, background: T.text, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body }}>Find a Church</button>
                <button onClick={() => setPage("about")} style={{ padding: "12px 28px", borderRadius: T.radiusFull, fontSize: 14, fontWeight: 600, background: "transparent", color: T.text, border: `1.5px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>How It Works</button>
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={180}>
            <div className="btf-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
              {[{ n: "01", title: "People-sourced truth", desc: "They say they're welcoming â€” but are they? Reviews from visitors and members reveal what walking through the doors actually feels like." }, { n: "02", title: "Scripture as standard", desc: "Structured feedback on whether teaching is faithful to God's word. Not opinion â€” accountability to the text." }, { n: "03", title: "Light builds trust", desc: "Transparency about finances, leadership, and community isn't criticism â€” it's how the body of Christ grows." }].map((c, i) => (
                <div key={i} style={{ padding: "24px 20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: T.heading, color: T.textMuted, marginBottom: 14 }}>{c.n}</div>
                  <h3 style={{ fontSize: 15, fontFamily: T.heading, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.02em" }}>{c.title}</h3>
                  <p style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.55, margin: 0 }}>{c.desc}</p>
                </div>
              ))}
            </div>
          </FadeIn>
          <FadeIn delay={300}>
            <div style={{ marginTop: 48, padding: "36px 32px", borderRadius: 14, background: T.text }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Framework</div>
              <h2 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.03em", color: "#fff" }}>The 10 Measures</h2>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "0 0 24px" }}>Ten categories rooted in what scripture says a church should be.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6 }}>
                {CATEGORIES.map((cat, i) => <div key={i} style={{ padding: "9px 13px", borderRadius: T.radiusSm, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}><span style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{cat.label}</span></div>)}
              </div>
            </div>
          </FadeIn>
        </div>
      )}

      {/* DISCOVER */}
      {page === "discover" && (
        <div style={{ maxWidth: 840, margin: "0 auto", padding: "36px 24px" }}>
          <FadeIn>
            <h2 style={{ fontSize: 26, fontFamily: T.heading, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.03em" }}>Discover churches</h2>
            <p style={{ fontSize: 14, color: T.textSoft, margin: "0 0 20px" }}>Rated by the people who attend â€” not the church itself.</p>
          </FadeIn>
          <FadeIn delay={80}>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search name, city, denomination..." style={{ flex: 1, minWidth: 200, padding: "9px 16px", borderRadius: T.radiusFull, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} />
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{denoms.map(d => <Chip key={d} active={filterDenom === d} onClick={() => setFilterDenom(d)}>{d}</Chip>)}</div>
            </div>
          </FadeIn>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredChurches.map((church, i) => {
              const overall = avg(church.scores);
              const rated = hasScores(church);
              return (
                <FadeIn key={church.id} delay={120 + i * 70}>
                  <div onClick={() => viewChurch(church)} style={{ padding: "22px", borderRadius: T.radius, cursor: "pointer", background: T.surface, border: `1.5px solid ${T.border}`, transition: "all 0.2s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = T.accentBorder; e.currentTarget.style.boxShadow = "0 2px 16px rgba(37,99,235,0.05)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "none"; }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: 18, fontFamily: T.heading, fontWeight: 700, margin: "0 0 3px", letterSpacing: "-0.02em" }}>{church.name}</h3>
                        <div style={{ fontSize: 13, color: T.textMuted }}>{church.denomination} Â· {church.city}, {church.state}{church.size ? ` Â· ${church.size}` : ""}</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                          {church.tags.slice(0, 4).map((tag, j) => <span key={j} style={{ fontSize: 11, padding: "2px 9px", borderRadius: T.radiusFull, background: T.surfaceAlt, color: T.textSoft, fontWeight: 500, border: `1px solid ${T.borderLight}` }}>{tag}</span>)}
                        </div>
                      </div>
                      {rated ? (
                        <div style={{ padding: "8px 14px", borderRadius: T.radiusSm, textAlign: "center", background: scoreBg(overall), border: `1px solid ${scoreBorder2(overall)}`, minWidth: 58 }}>
                          <div style={{ fontSize: 24, fontWeight: 800, fontFamily: T.heading, color: scoreColor(overall), lineHeight: 1 }}>{overall.toFixed(1)}</div>
                          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>{church.totalReviews} reviews</div>
                        </div>
                      ) : (
                        <div style={{ padding: "10px 14px", borderRadius: T.radiusSm, textAlign: "center", background: T.surfaceAlt, border: `1.5px dashed ${T.border}`, minWidth: 58 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, lineHeight: 1.3 }}>Not yet<br />rated</div>
                          {church.totalReviews > 0 && <div style={{ fontSize: 10, color: T.textMuted, marginTop: 3 }}>{church.totalReviews}/{MIN_REVIEWS_FOR_SCORE} reviews</div>}
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
          {/* Don't see your church? */}
          <div style={{ marginTop: 20, padding: "18px 20px", borderRadius: T.radius, background: T.surface, border: `1.5px dashed ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", transition: "all 0.15s" }} onClick={() => startRateFlow()} onMouseEnter={e => e.currentTarget.style.borderColor = T.accent} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
            <div><div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Don't see your church?</div><div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>Rate a church or add a new one to our directory.</div></div>
            <div style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.accentSoft, color: T.accent, border: `1px solid ${T.accentBorder}`, flexShrink: 0 }}>Add Church</div>
          </div>
        </div>
      )}

      {/* PROFILE */}
      {page === "profile" && currentChurch && (() => {
        const c = currentChurch; const overall = avg(c.scores); const rated = hasScores(c);
        return (
          <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px" }}>
            <FadeIn>
              <button onClick={() => setPage("discover")} style={{ background: "none", border: "none", color: T.accent, fontSize: 13, cursor: "pointer", fontWeight: 600, padding: 0, marginBottom: 24, fontFamily: T.body }}>â† Back</button>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
                <div>
                  <h1 style={{ fontSize: 30, fontFamily: T.heading, fontWeight: 800, margin: "0 0 5px", letterSpacing: "-0.035em" }}>{c.name}</h1>
                  <div style={{ fontSize: 13, color: T.textSoft }}>{c.denomination}{c.size ? ` Â· ${c.size}` : ""}{c.serviceStyle ? ` Â· ${c.serviceStyle}` : ""}</div>
                  <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{c.address}{c.serviceTimes ? ` Â· ${c.serviceTimes}` : ""}</div>
                </div>
                {rated ? (
                  <div style={{ padding: "12px 20px", borderRadius: T.radius, textAlign: "center", background: scoreBg(overall), border: `1.5px solid ${scoreBorder2(overall)}` }}>
                    <div style={{ fontSize: 36, fontWeight: 800, fontFamily: T.heading, color: scoreColor(overall), lineHeight: 1 }}>{overall.toFixed(1)}</div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>{c.totalReviews} reviews</div>
                  </div>
                ) : (
                  <div style={{ padding: "14px 20px", borderRadius: T.radius, textAlign: "center", background: T.surfaceAlt, border: `1.5px dashed ${T.border}` }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.textSoft }}>Not yet rated</div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{c.totalReviews > 0 ? `${c.totalReviews}/${MIN_REVIEWS_FOR_SCORE} reviews needed` : "Be the first to review"}</div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "12px 0 28px" }}>
                {c.tags.map((tag, j) => <span key={j} style={{ fontSize: 11.5, padding: "4px 12px", borderRadius: T.radiusFull, background: T.accentSoft, color: T.accent, fontWeight: 600, border: `1px solid ${T.accentBorder}` }}>{tag}</span>)}
              </div>
            </FadeIn>

            <div className="btf-profile-grid" style={{ display: "grid", gridTemplateColumns: "270px 1fr", gap: 20, alignItems: "start" }}>
              <FadeIn delay={120}>
                <div style={{ padding: "22px", borderRadius: T.radius, background: T.surface, border: `1.5px solid ${T.border}`, position: "sticky", top: 64 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, marginBottom: 14 }}>Congregation Assessment</div>
                  {rated ? CATEGORIES.map(cat => <ScoreBar key={cat.id} label={cat.label} score={c.scores[cat.id] || 0} />) : (
                    <div style={{ padding: "20px 0", textAlign: "center" }}>
                      <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 8 }}>Scores appear after {MIN_REVIEWS_FOR_SCORE} reviews</div>
                      <div style={{ width: "100%", height: 4, borderRadius: 2, background: T.surfaceAlt, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 2, width: `${(c.totalReviews / MIN_REVIEWS_FOR_SCORE) * 100}%`, background: T.accent, opacity: 0.5, transition: "width 0.5s" }} />
                      </div>
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{c.totalReviews} of {MIN_REVIEWS_FOR_SCORE}</div>
                    </div>
                  )}
                  <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: T.radiusSm, background: T.amberSoft, border: `1px solid ${T.amberBorder}`, fontSize: 11, color: T.amber, lineHeight: 1.5, fontWeight: 500 }}>Scores update every Saturday.</div>
                </div>
              </FadeIn>

              <div>
                <FadeIn delay={180}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h3 style={{ fontSize: 17, fontFamily: T.heading, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Reviews</h3>
                    {/* Route to unified rate flow */}
                    {(() => {
                      const existing = user && userReviews[c.id];
                      const canEdit = existing && (Date.now() - existing.postedAt >= 7 * 24 * 60 * 60 * 1000);
                      const daysLeft = existing ? Math.ceil((7 * 24 * 60 * 60 * 1000 - (Date.now() - existing.postedAt)) / (24 * 60 * 60 * 1000)) : 0;
                      return existing ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {!canEdit && <span style={{ fontSize: 11, color: T.textMuted }}>Edit in {daysLeft}d</span>}
                          <button onClick={() => startRateFlow(c)} disabled={!canEdit} style={{ padding: "8px 18px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: canEdit ? T.accent : T.surfaceAlt, color: canEdit ? "#fff" : T.textMuted, border: "none", cursor: canEdit ? "pointer" : "not-allowed", fontFamily: T.body }}>Edit Your Review</button>
                        </div>
                      ) : (
                        <button onClick={() => startRateFlow(c)} style={{ padding: "8px 18px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.text, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body }}>Write a Review</button>
                      );
                    })()}
                  </div>
                </FadeIn>

                {c.recentReviews.length === 0 && (
                  <div style={{ padding: "40px 20px", textAlign: "center", borderRadius: T.radius, background: T.surface, border: `1.5px dashed ${T.border}` }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: T.textSoft, marginBottom: 4 }}>No reviews yet</div>
                    <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 16 }}>Be the first to share your experience at {c.name}.</div>
                    <button onClick={() => startRateFlow(c)} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body }}>Write the First Review</button>
                  </div>
                )}

                {c.recentReviews.map((rev, i) => <ReviewCard key={i} rev={rev} delay={240 + i * 70} />)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* RATE */}
      {page === "rate" && (
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "36px 24px" }}>
          <FadeIn>
            <div style={{ display: "flex", gap: 3, marginBottom: 32 }}>
              {["Find Church", "Rate", "Your Story", "Done"].map((s, i) => (
                <div key={i} style={{ flex: 1 }}>
                  <div style={{ height: 3, borderRadius: 2, marginBottom: 5, background: i <= rateStep ? T.accent : T.surfaceAlt, transition: "background 0.3s" }} />
                  <span style={{ fontSize: 10, fontFamily: T.heading, fontWeight: 600, letterSpacing: "0.04em", color: i <= rateStep ? T.accent : T.textMuted, textTransform: "uppercase" }}>{s}</span>
                </div>
              ))}
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
                {rateSearch.length > 0 && (() => {
                  const q = rateSearch.toLowerCase();
                  const local = churches.filter(c => c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q) || c.denomination.toLowerCase().includes(q));
                  return local.length > 0 ? <><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, marginBottom: 2, marginTop: 4 }}>On By Their Fruit</div>
                    {local.map(c => <div key={c.id} onClick={() => selectChurchToRate(c)} style={{ padding: "14px 18px", borderRadius: T.radius, cursor: "pointer", background: T.surface, border: `1.5px solid ${T.border}`, transition: "all 0.15s", display: "flex", justifyContent: "space-between", alignItems: "center" }} onMouseEnter={e => e.currentTarget.style.borderColor = T.accentBorder} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}><div><div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.heading, letterSpacing: "-0.02em" }}>{c.name}</div><div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{c.denomination} Â· {c.city}, {c.state}</div></div>{c.totalReviews > 0 && <div style={{ padding: "3px 8px", borderRadius: T.radiusFull, fontSize: 10, background: T.surfaceAlt, color: T.textMuted, fontWeight: 600 }}>{c.totalReviews} reviews</div>}</div>)}</> : null;
                })()}
                {rateSearch.length >= 3 && googleLoading && <div style={{ padding: "16px", textAlign: "center", color: T.textMuted, fontSize: 13 }}><div style={{ display: "inline-block", width: 16, height: 16, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.6s linear infinite", marginRight: 8, verticalAlign: "middle" }} />Searching Google...</div>}
                {rateSearch.length >= 3 && !googleLoading && googleSearched && googleResults.length > 0 && <><div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, marginBottom: 2 }}><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted }}>Found on Google</div><div style={{ flex: 1, height: 1, background: T.border }} /></div>
                  {googleResults.map(gc => <div key={gc.id} onClick={() => selectGoogle(gc)} style={{ padding: "14px 18px", borderRadius: T.radius, cursor: "pointer", background: T.surface, border: `1.5px solid ${T.border}`, transition: "all 0.15s", display: "flex", justifyContent: "space-between", alignItems: "center" }} onMouseEnter={e => e.currentTarget.style.borderColor = T.accentBorder} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}><div><div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.heading }}>{gc.name}</div><div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{gc.denomination} Â· {gc.city}, {gc.state}</div></div><div style={{ padding: "3px 8px", borderRadius: T.radiusFull, fontSize: 10, background: T.accentSoft, color: T.accent, fontWeight: 600, border: `1px solid ${T.accentBorder}` }}>New</div></div>)}</>}
                {rateSearch.length === 0 && <div style={{ padding: "32px", textAlign: "center" }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={T.border} strokeWidth="1.5" style={{ margin: "0 auto 10px", display: "block" }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg><div style={{ fontSize: 13, color: T.textMuted }}>Type a church name or city to get started</div></div>}
              </div>
              <div style={{ marginTop: 24, padding: "18px 20px", borderRadius: T.radius, background: T.surface, border: `1.5px dashed ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", transition: "all 0.15s" }} onClick={() => { setShowAddChurch(true); setAddData(p => ({ ...p, name: rateSearch })); }} onMouseEnter={e => e.currentTarget.style.borderColor = T.accent} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                <div><div style={{ fontSize: 14, fontWeight: 600 }}>Don't see your church?</div><div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>Add it to By Their Fruit so others can find and review it too.</div></div>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: T.accentSoft, border: `1px solid ${T.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: T.accent, fontWeight: 300, flexShrink: 0 }}>+</div>
              </div>
            </FadeIn>
          )}

          {/* ADD CHURCH */}
          {rateStep === 0 && showAddChurch && (
            <FadeIn>
              <button onClick={() => setShowAddChurch(false)} style={{ background: "none", border: "none", color: T.accent, fontSize: 13, cursor: "pointer", fontWeight: 600, padding: 0, marginBottom: 16, fontFamily: T.body }}>â† Back to search</button>
              <h2 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.03em" }}>Add a church</h2>
              <p style={{ fontSize: 13, color: T.textSoft, margin: "0 0 24px" }}>Fill in what you know â€” you can always update later.</p>
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
                <button onClick={addManualChurch} disabled={!addData.name.trim() || !addData.city.trim()} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.text, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, opacity: (!addData.name.trim() || !addData.city.trim()) ? 0.3 : 1 }}>Add Church & Rate â†’</button>
              </div>
            </FadeIn>
          )}

          {/* STEP 1: Rate â€” Grouped with sliders + comments */}
          {rateStep === 1 && rateChurch && (
            <FadeIn>
              <div style={{ padding: "14px 18px", borderRadius: T.radius, background: T.accentSoft, border: `1px solid ${T.accentBorder}`, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.heading, letterSpacing: "-0.02em" }}>{rateChurch.name}</div><div style={{ fontSize: 12, color: T.textSoft }}>{rateChurch.denomination} Â· {rateChurch.city}, {rateChurch.state}</div></div>
                <button onClick={() => setRateStep(0)} style={{ fontSize: 12, fontWeight: 600, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: T.body }}>Change</button>
              </div>
              <h2 style={{ fontSize: 22, fontFamily: T.heading, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.03em" }}>{isEditing ? "Update your ratings" : "Rate your experience"}</h2>
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

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <button onClick={() => setRateStep(0)} style={{ padding: "10px 20px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.surface, color: T.textSoft, border: `1.5px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>â† Back</button>
                <button onClick={() => setRateStep(2)} disabled={Object.keys(rateScores).filter(k => !rateSkipped[k]).length === 0} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.text, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, opacity: Object.keys(rateScores).filter(k => !rateSkipped[k]).length === 0 ? 0.3 : 1 }}>Continue â†’</button>
              </div>
            </FadeIn>
          )}

          {/* STEP 2: Story */}
          {rateStep === 2 && rateChurch && (
            <FadeIn>
              <div style={{ padding: "14px 18px", borderRadius: T.radius, background: T.accentSoft, border: `1px solid ${T.accentBorder}`, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.heading, letterSpacing: "-0.02em" }}>{rateChurch.name}</div><div style={{ fontSize: 12, color: T.textSoft }}>{Object.keys(rateScores).filter(k => !rateSkipped[k]).length} rated Â· {Object.keys(rateSkipped).filter(k => rateSkipped[k]).length} skipped Â· Avg {(() => { const vals = Object.entries(rateScores).filter(([k]) => !rateSkipped[k]).map(([,v]) => v); return vals.length ? (vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(1) : "â€”"; })()}</div></div>
                <button onClick={() => setRateStep(1)} style={{ fontSize: 12, fontWeight: 600, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: T.body }}>Edit Ratings</button>
              </div>
              <h2 style={{ fontSize: 22, fontFamily: T.heading, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.03em" }}>Tell your story</h2>
              <p style={{ fontSize: 13, color: T.textSoft, margin: "0 0 20px" }}>Help other visitors and help this church grow.</p>
              <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 7 }}>Your relationship</label><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{["First-time Visitor", "Repeat Visitor", "Member (< 1 yr)", "Member (1â€“3 yrs)", "Member (3+ yrs)", "Former Member"].map(r => <Chip key={r} active={rateRole === r} onClick={() => setRateRole(r)}>{r}</Chip>)}</div></div>
              <div style={{ marginBottom: 20 }}><label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>Your review</label><textarea value={rateText} onChange={e => setRateText(e.target.value)} placeholder="Be specific â€” what stood out, what could improve, what should a visitor know?" rows={5} style={{ width: "100%", padding: "12px 16px", borderRadius: T.radius, fontSize: 14, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", resize: "vertical", lineHeight: 1.65, fontFamily: T.body }} /></div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 20 }}>
                {Object.entries(rateScores).filter(([k]) => !rateSkipped[k]).map(([k, v]) => { const cat = CATEGORIES.find(c => c.id === k); const r = Math.round(v); return <span key={k} style={{ fontSize: 11, padding: "3px 10px", borderRadius: T.radiusFull, background: scoreBg(r), border: `1px solid ${scoreBorder2(r)}`, color: scoreColor(r), fontWeight: 700, fontFamily: T.heading }}>{cat?.label.split("&")[0].split("/")[0].trim()} {v.toFixed(1)}</span>; })}
                {Object.keys(rateSkipped).filter(k => rateSkipped[k]).length > 0 && (
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: T.radiusFull, background: T.surfaceAlt, border: `1px solid ${T.border}`, color: T.textMuted, fontWeight: 500 }}>
                    {Object.keys(rateSkipped).filter(k => rateSkipped[k]).length} marked "not sure"
                  </span>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={() => setRateStep(1)} style={{ padding: "10px 20px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.surface, color: T.textSoft, border: `1.5px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>â† Back</button>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {!user && <span style={{ fontSize: 12, color: T.textMuted }}>Sign in required</span>}
                  <button onClick={handleRateSubmit} disabled={!rateRole || !rateText.trim()} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, opacity: (!rateRole || !rateText.trim()) ? 0.3 : 1, boxShadow: "0 2px 8px rgba(37,99,235,0.2)" }}>{!user ? "Sign In & Submit" : isEditing ? "Update Review" : "Submit Review"}</button>
                </div>
              </div>
            </FadeIn>
          )}

          {/* STEP 3: Done */}
          {rateStep === 3 && (
            <FadeIn>
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ width: 64, height: 64, borderRadius: 32, background: T.greenSoft, border: `2px solid ${T.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 20px" }}>âœ“</div>
                <h2 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.03em" }}>{isEditing ? "Review updated" : "Review submitted"}</h2>
                <p style={{ fontSize: 14, color: T.textSoft, margin: "0 0 4px" }}>Your review of <strong>{rateChurch?.name}</strong> has been {isEditing ? "updated" : "posted"}.</p>
                <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 32px" }}>Scores will be recalculated this Saturday.</p>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  <button onClick={() => { const c = churches.find(ch => ch.id === rateChurch?.id); if (c) viewChurch(c); }} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.text, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body }}>View Church Profile</button>
                  <button onClick={() => startRateFlow()} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.surface, color: T.textSoft, border: `1.5px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>Rate Another</button>
                </div>
              </div>
            </FadeIn>
          )}
        </div>
      )}

      {/* ABOUT */}
      {page === "about" && (
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "56px 24px" }}>
          <FadeIn>
            <h1 style={{ fontSize: 34, fontFamily: T.heading, fontWeight: 800, lineHeight: 1.12, margin: "0 0 28px", letterSpacing: "-0.04em" }}>The church doesn't get to grade its own homework.</h1>
            <div style={{ fontSize: 15, color: T.textSoft, lineHeight: 1.75 }}>
              <p>Every church in America has a website that says the same things. <em>Welcoming community. Bible-based teaching. A place to belong.</em> But how do you know if it's true?</p>
              <p><strong style={{ color: T.text }}>By Their Fruit</strong> exists because we believe the body of Christ â€” the actual people in the pews â€” are the most honest witnesses to what a church really is.</p>
              <p>Our platform gathers structured, thoughtful reviews from congregants and visitors across ten categories rooted in what scripture says a healthy church should look like. Reviews post immediately. Scores update every Saturday â€” preventing gaming and giving a stable, trustworthy picture over time.</p>
              <p>This isn't about tearing churches down. It's about building them up through honest feedback.</p>
              <div style={{ padding: "28px", borderRadius: T.radius, background: T.text, color: "#fff", margin: "28px 0", textAlign: "center" }}>
                <p style={{ fontSize: 17, fontStyle: "italic", lineHeight: 1.6, margin: "0 0 8px", color: "rgba(255,255,255,0.85)" }}>"Beware of false prophets, who come to you in sheep's clothing but inwardly are ravenous wolves. You will recognize them by their fruits."</p>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>Matthew 7:15â€“16 ESV</div>
              </div>
              <h3 style={{ fontSize: 20, fontFamily: T.heading, fontWeight: 700, margin: "36px 0 14px", letterSpacing: "-0.03em" }}>The 10 Measures</h3>
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
              <p>Every review passes through AI moderation. We filter personal attacks, coordinated campaigns, and doctrinal arguments disguised as reviews. Users can flag reviews they believe are inappropriate.</p>
              <p>Churches can respond to reviews publicly. They cannot delete, edit, or pay to suppress them.</p>
            </div>
          </FadeIn>
        </div>
      )}

      <footer style={{ padding: "24px", textAlign: "center", borderTop: `1px solid ${T.border}`, marginTop: 60 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}><Logo size={13} color={T.textMuted} /></div>
        <div style={{ fontSize: 11, color: T.textMuted }}>Real reviews from real congregants Â· Matthew 7:16</div>
      </footer>
    </div>
  );
}
