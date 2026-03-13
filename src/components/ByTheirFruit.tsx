"use client"
// @ts-nocheck

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

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
  };
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
  };
}

/* --- HELPERS --- */
const avg = (s) => { const v = Object.values(s); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
const hasScores = (c) => c.totalReviews >= MIN_REVIEWS_FOR_SCORE && Object.keys(c.scores).length > 0;
const scoreColor = (s) => s >= 4.5 ? T.green : s >= 3.5 ? T.amber : T.red;
const scoreBg = (s) => s >= 4.5 ? T.greenSoft : s >= 3.5 ? T.amberSoft : T.redSoft;
const scoreBorder2 = (s) => s >= 4.5 ? T.greenBorder : s >= 3.5 ? T.amberBorder : T.redBorder;

/* --- RESPONSIVE --- */
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
      background: active ? T.text : T.surface, color: active ? "#fff" : T.textSoft,
      border: `1.5px solid ${active ? T.text : T.border}`, cursor: "pointer", transition: "all 0.15s",
    }}>{children}</button>
  );
}

/* --- RATING SLIDER WITH OPTIONAL COMMENT + NOT SURE --- */
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

/* --- SOCIAL ICONS --- */
function GoogleIcon() { return <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>; }
function AppleIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="#000"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>; }
function FacebookIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>; }
function MicrosoftIcon() { return <svg width="18" height="18" viewBox="0 0 24 24"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="13" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="13" width="10" height="10" fill="#00A4EF"/><rect x="13" y="13" width="10" height="10" fill="#FFB900"/></svg>; }

/* --- AUTH MODAL (REAL SUPABASE AUTH) --- */
function AuthModal({ onClose, onAuth, mode: im }) {
  const [mode, setMode] = useState(im || "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name, display_name: name },
          },
        });
        if (error) { setError(error.message); setLoading(false); return; }
        if (data?.user?.identities?.length === 0) {
          setError("An account with this email already exists.");
          setLoading(false);
          return;
        }
        // Check if email confirmation is required
        if (data?.user && !data.session) {
          setError("Check your email to confirm your account, then sign in.");
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
          <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>{mode === "signin" ? "Sign in to post your review" : "Sign up to share your experience"}</p>
        </div>
        {error && (
          <div style={{ padding: "10px 14px", borderRadius: T.radiusSm, background: T.redSoft, border: `1px solid ${T.redBorder}`, color: T.red, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>{error}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {[
            { p: "google", l: "Continue with Google", i: <GoogleIcon /> },
            { p: "apple", l: "Continue with Apple", i: <AppleIcon /> },
            { p: "facebook", l: "Continue with Facebook", i: <FacebookIcon /> },
            { p: "azure", l: "Continue with Microsoft", i: <MicrosoftIcon /> },
          ].map(({ p, l, i }) => (
            <button key={p} onClick={() => socialLogin(p)} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 16px", borderRadius: T.radiusSm, fontSize: 13.5, fontWeight: 500, fontFamily: T.body, background: T.surface, color: T.text, border: `1.5px solid ${T.border}`, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1, transition: "all 0.15s" }}>{i}{l}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}><div style={{ flex: 1, height: 1, background: T.border }} /><span style={{ fontSize: 11, color: T.textMuted, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>or</span><div style={{ flex: 1, height: 1, background: T.border }} /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {mode === "signup" && <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, fontSize: 13.5, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} />}
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" type="email" style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, fontSize: 13.5, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} />
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" onKeyDown={e => e.key === "Enter" && emailAuth()} style={{ width: "100%", padding: "10px 14px", borderRadius: T.radiusSm, fontSize: 13.5, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body }} />
          <button onClick={emailAuth} disabled={loading || !email || !password || (mode === "signup" && !name)} style={{ padding: "11px", borderRadius: T.radiusSm, fontSize: 14, fontWeight: 600, background: T.text, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, opacity: (loading || !email || !password) ? 0.35 : 1 }}>{loading ? "..." : (mode === "signin" ? "Sign In" : "Create Account")}</button>
        </div>
        <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: T.textMuted }}>{mode === "signin" ? "No account? " : "Have an account? "}<span onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }} style={{ color: T.accent, fontWeight: 600, cursor: "pointer" }}>{mode === "signin" ? "Sign Up" : "Sign In"}</span></div>
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

/* --- REVIEW CARD WITH FLAG + CATEGORY COMMENTS --- */
function ReviewCard({ rev, delay = 0, userId }) {
  const [flagged, setFlagged] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hasComments = rev.comments && Object.keys(rev.comments).length > 0;

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

        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
          {flagged ? (
            <span style={{ fontSize: 11, color: T.textMuted, fontStyle: "italic" }}>Flagged for review</span>
          ) : (
            <button onClick={handleFlag} style={{ fontSize: 11, color: T.textMuted, background: "none", border: "none", cursor: "pointer", fontFamily: T.body, padding: 0, transition: "color 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.color = T.red} onMouseLeave={e => e.currentTarget.style.color = T.textMuted}>
              Flag as inappropriate
            </button>
          )}
        </div>
      </div>
    </FadeIn>
  );
}

/* ===== MAIN ===== */
export default function ByTheirFruit() {
  const [page, setPage] = useState("home");
  const [selectedChurch, setSelectedChurch] = useState(null);
  const [churches, setChurches] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDenom, setFilterDenom] = useState("All");
  const [filterState, setFilterState] = useState("All");
  const [filterCity, setFilterCity] = useState("");
  const [filterZip, setFilterZip] = useState("");
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileComplete, setShowProfileComplete] = useState(false);
  const [pendingReview, setPendingReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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
  const [submitting, setSubmitting] = useState(false);

  // Track user reviews: { churchId: { review, postedAt } }
  const [userReviews, setUserReviews] = useState({});
  const [isEditing, setIsEditing] = useState(false);

  /* --- SEARCH CHURCHES FROM DB (server-side) --- */
  const [searchLoading, setSearchLoading] = useState(false);
  const [totalChurchCount, setTotalChurchCount] = useState(0);
  const [discoverSearchQuery, setDiscoverSearchQuery] = useState("");

  const fetchChurches = useCallback(async () => {
    try {
      // On initial load, just get total count — don't load all churches
      const { count, error } = await supabase
        .from("churches")
        .select("*", { count: "exact", head: true });
      if (error) {
        console.error("fetchChurches error:", error);
      }
      setTotalChurchCount(count || 0);
    } catch (err) {
      console.error("fetchChurches exception:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const searchChurchesDB = useCallback(async (query, denomination, state, city, zip) => {
    if (!query && (!denomination || denomination === "All") && (!state || state === "All") && !city && !zip) {
      setChurches([]);
      return;
    }
    setSearchLoading(true);
    let q = supabase.from("churches").select("*");
    if (query) {
      q = q.or(`name.ilike.%${query}%,city.ilike.%${query}%,denomination.ilike.%${query}%`);
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
    if (!error && data) {
      setChurches(data.map(dbChurchToLocal));
    }
    setSearchLoading(false);
  }, []);

  // Debounced search for Discover page
  useEffect(() => {
    if (page !== "discover") return;
    const timer = setTimeout(() => {
      searchChurchesDB(discoverSearchQuery, filterDenom, filterState, filterCity, filterZip);
    }, 300);
    return () => clearTimeout(timer);
  }, [discoverSearchQuery, filterDenom, filterState, filterCity, filterZip, page, searchChurchesDB]);

  // Debounced search for Rate flow
  const [rateSearchResults, setRateSearchResults] = useState([]);
  useEffect(() => {
    if (!rateSearch || rateSearch.length < 2) { setRateSearchResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("churches")
        .select("*")
        .or(`name.ilike.%${rateSearch}%,city.ilike.%${rateSearch}%`)
        .order("total_reviews", { ascending: false })
        .limit(20);
      if (data) setRateSearchResults(data.map(dbChurchToLocal));
    }, 300);
    return () => clearTimeout(timer);
  }, [rateSearch]);

  /* --- LOAD REVIEWS FOR A CHURCH --- */
  const fetchReviewsForChurch = useCallback(async (churchId) => {
    const { data, error } = await supabase
      .from("reviews")
      .select("*, profiles(display_name, avatar_url)")
      .eq("church_id", churchId)
      .eq("status", "published")
      .order("created_at", { ascending: false });
    if (!error && data) {
      const reviews = data.map(dbReviewToLocal);
      setChurches(prev => prev.map(c =>
        c.id === churchId ? { ...c, recentReviews: reviews } : c
      ));
    }
  }, []);

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

  /* --- AUTH STATE --- */
  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        const profile = {
          id: u.id,
          name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "User",
          email: u.email,
          avatar: (u.user_metadata?.full_name || u.user_metadata?.name || u.email || "U").charAt(0).toUpperCase(),
          provider: u.app_metadata?.provider || "email",
        };
        setUser(profile);
        fetchUserReviews(u.id);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        const u = session.user;
        const profile = {
          id: u.id,
          name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "User",
          email: u.email,
          avatar: (u.user_metadata?.full_name || u.user_metadata?.name || u.email || "U").charAt(0).toUpperCase(),
          provider: u.app_metadata?.provider || "email",
        };
        setUser(profile);
        setShowAuthModal(false);
        fetchUserReviews(u.id);

        // Check if user has filled demographics, if not show the profile complete modal
        const { data: profileData } = await supabase.from("profiles").select("gender,age_range,income_bracket").eq("id", u.id).single();
        if (profileData && !profileData.gender && !profileData.age_range && !profileData.income_bracket) {
          setShowProfileComplete(true);
        }

        // Process pending review from localStorage (for OAuth redirects)
        const pending = localStorage.getItem("btf_pending_review");
        if (pending) {
          localStorage.removeItem("btf_pending_review");
          try {
            const parsed = JSON.parse(pending);
            await submitReviewToDB(parsed, u.id);
          } catch (e) {
            console.error("Failed to process pending review:", e);
          }
        }
      }
      if (event === "SIGNED_OUT") {
        setUser(null);
        setUserReviews({});
      }
    });

    return () => subscription?.unsubscribe();
  }, [fetchUserReviews]);

  /* --- INITIAL DATA LOAD --- */
  useEffect(() => {
    if (mounted) fetchChurches();
  }, [mounted, fetchChurches]);

  /* --- SUBMIT REVIEW TO DB --- */
  const submitReviewToDB = async (reviewData, userId) => {
    const { churchId, scores, comments, text, role, isEdit } = reviewData;

    const row = {
      church_id: churchId,
      user_id: userId,
      reviewer_role: role,
      text,
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
        .upsert(row, { onConflict: "church_id,user_id" });
    } else {
      result = await supabase.from("reviews").insert(row);
    }

    if (result.error) {
      console.error("Review submit error:", result.error);
      alert("Failed to submit review: " + result.error.message);
      return false;
    }

    // Update total_reviews count locally
    setChurches(prev => prev.map(c =>
      c.id === churchId ? { ...c, totalReviews: c.totalReviews + (isEdit ? 0 : 1) } : c
    ));

    // Refresh reviews for this church
    await fetchReviewsForChurch(churchId);
    await fetchUserReviews(userId);
    return true;
  };

  /* --- HANDLE SIGN OUT --- */
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUserReviews({});
  };

  /* --- RATE FLOW --- */
  const startRateFlow = (preselect) => {
    const existingReview = preselect && user ? userReviews[preselect.id] : null;
    const canEdit = existingReview && (Date.now() - existingReview.postedAt >= 7 * 24 * 60 * 60 * 1000);

    if (existingReview && !canEdit) {
      const daysLeft = Math.ceil((7 * 24 * 60 * 60 * 1000 - (Date.now() - existingReview.postedAt)) / (24 * 60 * 60 * 1000));
      alert(`You've already reviewed this church. You can edit your review in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`);
      return;
    }

    setPage("rate"); setRateStep(preselect ? 1 : 0); setRateChurch(preselect || null);
    setRateSearch(""); setRateSkipped({});
    setShowAddChurch(false);
    setAddData({ name: "", address: "", city: "", state: "FL", denomination: "", size: "", serviceTimes: "" });

    if (existingReview && canEdit) {
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

  const viewChurch = (c) => {
    setSelectedChurch(churches.find(ch => ch.id === c.id) || c);
    setPage("profile");
    fetchReviewsForChurch(c.id);
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
      isEdit: isEditing,
    };

    if (!user) {
      // Store pending review for after auth
      localStorage.setItem("btf_pending_review", JSON.stringify(reviewData));
      setPendingReview(reviewData);
      setShowAuthModal(true);
      return;
    }

    setSubmitting(true);
    const success = await submitReviewToDB(reviewData, user.id);
    setSubmitting(false);
    if (success) setRateStep(3);
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

    if (error) { alert("Failed to add church: " + error.message); return; }
    const newChurch = dbChurchToLocal(data);
    setChurches(prev => [...prev, newChurch]);
    setShowAddChurch(false);
    selectChurchToRate(newChurch);
  };

  const filteredChurches = churches;
  const denoms = ["All", "Non-Denominational", "Baptist", "Catholic", "Methodist", "Lutheran", "Presbyterian", "Episcopal", "Pentecostal", "Assemblies of God", "Church of God", "Church of Christ", "Eastern Orthodox", "Calvary Chapel", "Apostolic", "Church of God in Christ", "AME", "Seventh-day Adventist", "United Methodist", "Vineyard", "Church of the Nazarene", "United Church of Christ"];
  const currentChurch = selectedChurch ? (churches.find(c => c.id === selectedChurch.id) || selectedChurch) : null;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.body, color: T.text }}>
      <style>{fonts}{responsiveCSS}{`::selection{background:${T.accentSoft};color:${T.accent}}input::placeholder,textarea::placeholder{color:${T.textMuted}}*{box-sizing:border-box}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {showAuthModal && <AuthModal onClose={() => { setShowAuthModal(false); setPendingReview(null); }} onAuth={() => {}} mode="signup" />}
      {showProfileComplete && user && <ProfileCompleteModal userId={user.id} onClose={() => setShowProfileComplete(false)} />}

      {/* NAV */}
      <nav style={{ padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border}`, background: "rgba(250,250,250,0.88)", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(16px)" }}>
        <div onClick={() => { setPage("home"); setSelectedChurch(null); }}><Logo size={16} /></div>
        <div className="btf-nav-links" style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button onClick={() => startRateFlow()} style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, fontFamily: T.body, cursor: "pointer", background: page === "rate" ? T.accent : T.accentSoft, color: page === "rate" ? "#fff" : T.accent, border: `1px solid ${page === "rate" ? T.accent : T.accentBorder}`, transition: "all 0.15s" }}>Rate a Church</button>
          {["discover", "about"].map(id => (
            <button key={id} onClick={() => setPage(id)} style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 500, fontFamily: T.body, cursor: "pointer", background: page === id ? T.text : "transparent", color: page === id ? "#fff" : T.textSoft, border: `1px solid ${page === id ? T.text : "transparent"}`, transition: "all 0.15s" }}>{id.charAt(0).toUpperCase() + id.slice(1)}</button>
          ))}
          <div style={{ width: 1, height: 20, background: T.border, margin: "0 4px" }} />
          {user ? <UserMenu user={user} onSignOut={handleSignOut} /> : <button onClick={() => setShowAuthModal(true)} style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, fontFamily: T.body, cursor: "pointer", background: T.accent, color: "#fff", border: "none" }}>Sign In</button>}
        </div>
      </nav>

      {/* LOADING */}
      {(!mounted || loading) && (
        <div style={{ textAlign: "center", padding: "120px 24px" }}>
          <div style={{ display: "inline-block", width: 24, height: 24, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
          <div style={{ fontSize: 14, color: T.textMuted, marginTop: 12 }}>Loading churches...</div>
        </div>
      )}

      {/* HOME */}
      {mounted && !loading && page === "home" && (
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "96px 24px 60px" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 64 }}>
              <div style={{ display: "inline-block", padding: "5px 14px", borderRadius: T.radiusFull, background: T.surfaceAlt, border: `1px solid ${T.border}`, fontSize: 12, fontWeight: 600, color: T.textSoft, marginBottom: 24 }}>Matthew 7:16</div>
              <h1 className="btf-hero-title" style={{ fontSize: 54, fontFamily: T.heading, fontWeight: 800, lineHeight: 1.06, margin: "0 0 20px", letterSpacing: "-0.045em" }}>You will recognize<br />them by their fruit.</h1>
              <p style={{ fontSize: 17, color: T.textSoft, lineHeight: 1.65, maxWidth: 480, margin: "0 auto 36px" }}>Churches tell you who they are. Their people show you. Real reviews from real congregants — honest, structured, and built to help churches grow.</p>
              <div className="btf-hero-buttons" style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <button onClick={() => startRateFlow()} style={{ padding: "12px 28px", borderRadius: T.radiusFull, fontSize: 14, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, boxShadow: "0 2px 12px rgba(37,99,235,0.2)" }}>Rate a Church</button>
                <button onClick={() => setPage("discover")} style={{ padding: "12px 28px", borderRadius: T.radiusFull, fontSize: 14, fontWeight: 600, background: T.text, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body }}>Find a Church</button>
                <button onClick={() => setPage("about")} style={{ padding: "12px 28px", borderRadius: T.radiusFull, fontSize: 14, fontWeight: 600, background: "transparent", color: T.text, border: `1.5px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>How It Works</button>
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
      {mounted && !loading && page === "discover" && (
        <div style={{ maxWidth: 840, margin: "0 auto", padding: "36px 24px" }}>
          <FadeIn>
            <h2 style={{ fontSize: 26, fontFamily: T.heading, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.03em" }}>Discover churches</h2>
            <p style={{ fontSize: 14, color: T.textSoft, margin: "0 0 20px" }}>Rated by the people who attend — not the church itself.</p>
          </FadeIn>
          <FadeIn delay={80}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              <input value={discoverSearchQuery} onChange={e => setDiscoverSearchQuery(e.target.value)} placeholder="Search church name..." style={{ width: "100%", padding: "11px 16px", borderRadius: T.radiusFull, fontSize: 14, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: T.body, boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select value={filterState} onChange={e => { setFilterState(e.target.value); setFilterCity(""); }} style={{ padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, fontFamily: T.body, cursor: "pointer", minWidth: 120 }}>
                  {US_STATES.map(s => <option key={s} value={s}>{s === "All" ? "All States" : `${s} — ${STATE_NAMES[s] || s}`}</option>)}
                </select>
                <input value={filterCity} onChange={e => setFilterCity(e.target.value)} placeholder="City" style={{ padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, fontFamily: T.body, width: 130 }} />
                <input value={filterZip} onChange={e => setFilterZip(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Zip code" style={{ padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, fontFamily: T.body, width: 90 }} />
                <select value={filterDenom} onChange={e => setFilterDenom(e.target.value)} style={{ padding: "8px 12px", borderRadius: T.radiusSm, fontSize: 13, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, fontFamily: T.body, cursor: "pointer", minWidth: 160 }}>
                  {denoms.map(d => <option key={d} value={d}>{d === "All" ? "All Denominations" : d}</option>)}
                </select>
                {(filterState !== "All" || filterCity || filterZip || filterDenom !== "All" || discoverSearchQuery) && (
                  <button onClick={() => { setFilterState("All"); setFilterCity(""); setFilterZip(""); setFilterDenom("All"); setDiscoverSearchQuery(""); }} style={{ padding: "8px 14px", borderRadius: T.radiusSm, fontSize: 12, fontWeight: 600, border: `1.5px solid ${T.border}`, background: T.surfaceAlt, color: T.textSoft, cursor: "pointer", fontFamily: T.body }}>Clear filters</button>
                )}
              </div>
            </div>
          </FadeIn>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredChurches.length === 0 && !searchLoading && !discoverSearchQuery && filterDenom === "All" && filterState === "All" && !filterCity && !filterZip && (
              <div style={{ padding: "48px 20px", textAlign: "center", borderRadius: T.radius, background: T.surface, border: `1.5px dashed ${T.border}` }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={T.border} strokeWidth="1.5" style={{ margin: "0 auto 14px", display: "block" }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <div style={{ fontSize: 17, fontWeight: 700, fontFamily: T.heading, color: T.text, marginBottom: 4 }}>Search {totalChurchCount.toLocaleString()} churches</div>
                <div style={{ fontSize: 13, color: T.textMuted }}>Type a church name, city, or denomination above to get started.</div>
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
                        <div style={{ fontSize: 13, color: T.textMuted }}>{church.denomination} · {church.city}, {church.state}{church.size ? ` · ${church.size}` : ""}</div>
                        {church.address && !church.address.toLowerCase().startsWith("po box") && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 1 }}>{church.address}</div>}
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
          <div style={{ marginTop: 20, padding: "18px 20px", borderRadius: T.radius, background: T.surface, border: `1.5px dashed ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", transition: "all 0.15s" }} onClick={() => startRateFlow()} onMouseEnter={e => e.currentTarget.style.borderColor = T.accent} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
            <div><div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Don't see your church?</div><div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>Rate a church or add a new one to our directory.</div></div>
            <div style={{ padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 600, background: T.accentSoft, color: T.accent, border: `1px solid ${T.accentBorder}`, flexShrink: 0 }}>Add Church</div>
          </div>
        </div>
      )}

      {/* PROFILE */}
      {mounted && !loading && page === "profile" && currentChurch && (() => {
        const c = currentChurch; const overall = avg(c.scores); const rated = hasScores(c);
        const mapUrl = c.address && c.city ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name}, ${c.address}, ${c.city}, ${c.state}`)}` : null;
        return (
          <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px" }}>
            <FadeIn>
              <button onClick={() => setPage("discover")} style={{ background: "none", border: "none", color: T.accent, fontSize: 13, cursor: "pointer", fontWeight: 600, padding: 0, marginBottom: 24, fontFamily: T.body }}>← Back</button>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <h1 style={{ fontSize: 30, fontFamily: T.heading, fontWeight: 800, margin: "0 0 5px", letterSpacing: "-0.035em" }}>{c.name}</h1>
                  <div style={{ fontSize: 14, color: T.textSoft, fontWeight: 500 }}>{c.denomination}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 10 }}>
                    {c.tags.map((tag, j) => <span key={j} style={{ fontSize: 11.5, padding: "4px 12px", borderRadius: T.radiusFull, background: T.accentSoft, color: T.accent, fontWeight: 600, border: `1px solid ${T.accentBorder}` }}>{tag}</span>)}
                  </div>
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
                  <div style={{ fontSize: 12, color: T.textMuted, fontStyle: "italic" }}>Contact information not yet available. If you attend this church, help us out by writing a review!</div>
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
            </FadeIn>

            <div className="btf-profile-grid" style={{ display: "grid", gridTemplateColumns: "270px 1fr", gap: 20, alignItems: "start", marginTop: 24 }}>
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
                </div>
              </FadeIn>

              <div>
                <FadeIn delay={180}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h3 style={{ fontSize: 17, fontFamily: T.heading, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Reviews</h3>
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

                {c.recentReviews.map((rev, i) => <ReviewCard key={rev.id || i} rev={rev} delay={240 + i * 70} userId={user?.id} />)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* RATE */}
      {mounted && !loading && page === "rate" && (
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
                {rateSearchResults.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, marginBottom: 2, marginTop: 4 }}>On By Their Fruit</div>
                    {rateSearchResults.map(c => (
                      <div key={c.id} onClick={() => selectChurchToRate(c)} style={{ padding: "14px 18px", borderRadius: T.radius, cursor: "pointer", background: T.surface, border: `1.5px solid ${T.border}`, transition: "all 0.15s", display: "flex", justifyContent: "space-between", alignItems: "center" }} onMouseEnter={e => e.currentTarget.style.borderColor = T.accentBorder} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.heading, letterSpacing: "-0.02em" }}>{c.name}</div>
                          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{c.denomination} · {c.city}, {c.state}</div>
                        </div>
                        {c.totalReviews > 0 && <div style={{ padding: "3px 8px", borderRadius: T.radiusFull, fontSize: 10, background: T.surfaceAlt, color: T.textMuted, fontWeight: 600 }}>{c.totalReviews} reviews</div>}
                      </div>
                    ))}
                  </>
                )}
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
                <button onClick={addManualChurch} disabled={!addData.name.trim() || !addData.city.trim()} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.text, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, opacity: (!addData.name.trim() || !addData.city.trim()) ? 0.3 : 1 }}>Add Church & Rate →</button>
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
                <button onClick={() => setRateStep(0)} style={{ padding: "10px 20px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.surface, color: T.textSoft, border: `1.5px solid ${T.border}`, cursor: "pointer", fontFamily: T.body }}>← Back</button>
                <button onClick={() => setRateStep(2)} disabled={Object.keys(rateScores).filter(k => !rateSkipped[k]).length === 0} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.text, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, opacity: Object.keys(rateScores).filter(k => !rateSkipped[k]).length === 0 ? 0.3 : 1 }}>Continue →</button>
              </div>
            </FadeIn>
          )}

          {/* STEP 2: Story */}
          {rateStep === 2 && rateChurch && (
            <FadeIn>
              <div style={{ padding: "14px 18px", borderRadius: T.radius, background: T.accentSoft, border: `1px solid ${T.accentBorder}`, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.heading, letterSpacing: "-0.02em" }}>{rateChurch.name}</div><div style={{ fontSize: 12, color: T.textSoft }}>{Object.keys(rateScores).filter(k => !rateSkipped[k]).length} rated · {Object.keys(rateSkipped).filter(k => rateSkipped[k]).length} skipped · Avg {(() => { const vals = Object.entries(rateScores).filter(([k]) => !rateSkipped[k]).map(([,v]) => v); return vals.length ? (vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(1) : "\u2014"; })()}</div></div>
                <button onClick={() => setRateStep(1)} style={{ fontSize: 12, fontWeight: 600, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: T.body }}>Edit Ratings</button>
              </div>
              <h2 style={{ fontSize: 22, fontFamily: T.heading, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.03em" }}>Tell your story</h2>
              <p style={{ fontSize: 13, color: T.textSoft, margin: "0 0 20px" }}>Help other visitors and help this church grow.</p>
              <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 7 }}>Your relationship</label><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{["First-time Visitor", "Repeat Visitor", "Member (< 1 yr)", "Member (1\u20133 yrs)", "Member (3+ yrs)", "Former Member"].map(r => <Chip key={r} active={rateRole === r} onClick={() => setRateRole(r)}>{r}</Chip>)}</div></div>
              <div style={{ marginBottom: 20 }}><label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>Your review</label><textarea value={rateText} onChange={e => setRateText(e.target.value)} placeholder="Be specific \u2014 what stood out, what could improve, what should a visitor know?" rows={5} style={{ width: "100%", padding: "12px 16px", borderRadius: T.radius, fontSize: 14, border: `1.5px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", resize: "vertical", lineHeight: 1.65, fontFamily: T.body }} /></div>
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
                  <button onClick={handleRateSubmit} disabled={!rateRole || !rateText.trim() || submitting} style={{ padding: "10px 24px", borderRadius: T.radiusFull, fontSize: 13, fontWeight: 600, background: T.accent, color: "#fff", border: "none", cursor: "pointer", fontFamily: T.body, opacity: (!rateRole || !rateText.trim() || submitting) ? 0.3 : 1, boxShadow: "0 2px 8px rgba(37,99,235,0.2)" }}>{submitting ? "Submitting..." : !user ? "Sign In & Submit" : isEditing ? "Update Review" : "Submit Review"}</button>
                </div>
              </div>
            </FadeIn>
          )}

          {/* STEP 3: Done */}
          {rateStep === 3 && (
            <FadeIn>
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ width: 64, height: 64, borderRadius: 32, background: T.greenSoft, border: `2px solid ${T.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 20px" }}>✔</div>
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
      {mounted && !loading && page === "about" && (
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "56px 24px" }}>
          <FadeIn>
            <h1 style={{ fontSize: 34, fontFamily: T.heading, fontWeight: 800, lineHeight: 1.12, margin: "0 0 28px", letterSpacing: "-0.04em" }}>The church doesn't get to grade its own homework.</h1>
            <div style={{ fontSize: 15, color: T.textSoft, lineHeight: 1.75 }}>
              <p>Every church in America has a website that says the same things. <em>Welcoming community. Bible-based teaching. A place to belong.</em> But how do you know if it's true?</p>
              <p><strong style={{ color: T.text }}>By Their Fruit</strong> exists because we believe the body of Christ — the actual people in the pews — are the most honest witnesses to what a church really is.</p>
              <p>Our platform gathers structured, thoughtful reviews from congregants and visitors across ten categories rooted in what scripture says a healthy church should look like. Reviews post immediately. scores update in real time as reviews are approved — giving a trustworthy, always-current picture.</p>
              <p>This isn't about tearing churches down. It's about building them up through honest feedback.</p>
              <div style={{ padding: "28px", borderRadius: T.radius, background: T.text, color: "#fff", margin: "28px 0", textAlign: "center" }}>
                <p style={{ fontSize: 17, fontStyle: "italic", lineHeight: 1.6, margin: "0 0 8px", color: "rgba(255,255,255,0.85)" }}>"Beware of false prophets, who come to you in sheep's clothing but inwardly are ravenous wolves. You will recognize them by their fruits."</p>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>Matthew 7:15–16 ESV</div>
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
        <div style={{ fontSize: 11, color: T.textMuted }}>Real reviews from real congregants · Matthew 7:16</div>
      </footer>
    </div>
  );
}
