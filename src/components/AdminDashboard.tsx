"use client"
// @ts-nocheck

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

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

const SCORE_FIELDS = ["teaching", "welcome", "community", "worship", "prayer", "kids", "youth", "leadership", "service", "finances"];

/* --- HELPERS --- */
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

/* --- MAIN DASHBOARD --- */
export default function AdminDashboard() {
  const [tab, setTab] = useState("overview");
  const [adminUser, setAdminUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Data from Supabase
  const [users, setUsers] = useState([]);
  const [churches, setChurches] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  /* --- AUTH CHECK --- */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAdminUser(session.user);
        // Check if user is admin
        supabase.from("profiles").select("role").eq("id", session.user.id).single().then(({ data }) => {
          setIsAdmin(data?.role === "admin" || data?.role === "moderator");
          setLoadingAuth(false);
        });
      } else {
        setLoadingAuth(false);
      }
    });
  }, []);

  /* --- FETCH DATA --- */
  const fetchData = useCallback(async () => {
    setLoadingData(true);
    const [usersRes, churchesRes, reviewsRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("churches").select("*").order("total_reviews", { ascending: false }),
      supabase.from("reviews").select("*, profiles(display_name)").order("created_at", { ascending: false }),
    ]);

    if (usersRes.data) setUsers(usersRes.data);
    if (churchesRes.data) setChurches(churchesRes.data);
    if (reviewsRes.data) setReviews(reviewsRes.data);
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (!loadingAuth) fetchData();
  }, [loadingAuth, fetchData]);

  // Computed stats
  const activeUsers = users.filter(u => u.status === "active").length;
  const publishedReviews = reviews.filter(r => r.status === "published").length;
  const flaggedReviews = reviews.filter(r => r.status === "flagged").length;
  const claimedChurches = churches.filter(c => c.claimed_by).length;
  const avgScore = churches.length > 0
    ? (churches.filter(c => c.score_overall).reduce((sum, c) => sum + parseFloat(c.score_overall || 0), 0) / (churches.filter(c => c.score_overall).length || 1)).toFixed(2)
    : "N/A";

  const updateReviewStatus = async (reviewId, status) => {
    const { error } = await supabase.from("reviews").update({ status }).eq("id", reviewId);
    if (!error) {
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, status } : r));
    }
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users" },
    { id: "churches", label: "Churches" },
    { id: "reviews", label: "Reviews" },
  ];

  if (loadingAuth) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.body, color: T.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 24, height: 24, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.6s linear infinite", margin: "0 auto 12px" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 14, color: T.textMuted }}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.body, color: T.text }}>
      <style>{fonts}{`::selection{background:${T.accentSoft};color:${T.accent}}*{box-sizing:border-box}input::placeholder,textarea::placeholder{color:${T.textMuted}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

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
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 12.5, fontWeight: 500,
              fontFamily: T.body, cursor: "pointer", transition: "all 0.15s",
              background: tab === t.id ? T.text : "transparent", color: tab === t.id ? T.bg : T.textMuted,
              border: "none",
            }}>{t.label}</button>
          ))}
          {adminUser && (
            <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} style={{
              marginLeft: 12, padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 500,
              fontFamily: T.body, cursor: "pointer", background: T.redSoft, color: T.red, border: "none",
            }}>Sign Out</button>
          )}
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>

        {loadingData && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ width: 24, height: 24, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.6s linear infinite", margin: "0 auto 12px" }} />
            <div style={{ fontSize: 14, color: T.textMuted }}>Loading data...</div>
          </div>
        )}

        {/* === OVERVIEW === */}
        {!loadingData && tab === "overview" && (
          <>
            <h1 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: "0 0 20px", letterSpacing: "-0.03em" }}>Dashboard</h1>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
              <Stat label="Active Users" value={activeUsers} sub={`${users.length} total`} color={T.accent} />
              <Stat label="Churches" value={churches.length} sub={`${claimedChurches} claimed`} />
              <Stat label="Published Reviews" value={publishedReviews} sub={`${flaggedReviews} flagged`} color={T.green} />
              <Stat label="Avg Score" value={avgScore} sub="Across all churches" color={T.amber} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Recent Reviews */}
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Recent Reviews</div>
                {reviews.slice(0, 5).map(r => {
                  const church = churches.find(c => c.id === r.church_id);
                  return (
                    <div key={r.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.borderLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{r.profiles?.display_name || "Anonymous"} <span style={{ fontWeight: 400, color: T.textMuted }}>\u2192 {church?.name || "Unknown"}</span></div>
                        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{r.reviewer_role} \u00b7 {new Date(r.created_at).toLocaleDateString()}</div>
                      </div>
                      <Badge status={r.status} />
                    </div>
                  );
                })}
                {reviews.length === 0 && <div style={{ fontSize: 13, color: T.textMuted, padding: "20px 0", textAlign: "center" }}>No reviews yet</div>}
              </div>

              {/* Flagged Items */}
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Flagged for Review</div>
                {reviews.filter(r => r.status === "flagged").map(r => {
                  const church = churches.find(c => c.id === r.church_id);
                  return (
                    <div key={r.id} style={{ padding: "12px", borderRadius: T.radiusSm, background: T.amberSoft, border: `1px solid rgba(245,158,11,0.2)`, marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.amber }}>{r.profiles?.display_name} \u2192 {church?.name}</div>
                      <div style={{ fontSize: 12, color: T.textSoft, marginTop: 4, lineHeight: 1.5 }}>{r.text?.slice(0, 120)}...</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <button onClick={() => updateReviewStatus(r.id, "removed")} style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: T.radiusFull, background: T.redSoft, color: T.red, border: "none", cursor: "pointer" }}>Remove</button>
                        <button onClick={() => updateReviewStatus(r.id, "published")} style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: T.radiusFull, background: T.greenSoft, color: T.green, border: "none", cursor: "pointer" }}>Approve</button>
                      </div>
                    </div>
                  );
                })}
                {reviews.filter(r => r.status === "flagged").length === 0 && <div style={{ fontSize: 13, color: T.textMuted, padding: "20px 0", textAlign: "center" }}>No flagged reviews</div>}
              </div>
            </div>
          </>
        )}

        {/* === USERS === */}
        {!loadingData && tab === "users" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h1 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: 0, letterSpacing: "-0.03em" }}>Users ({users.length})</h1>
            </div>
            <div style={{ borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "10px 16px", borderBottom: `1px solid ${T.border}`, fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                <span>Name</span><span>Provider</span><span>Joined</span><span>Status</span>
              </div>
              {users.map(u => (
                <div key={u.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "12px 16px", borderBottom: `1px solid ${T.borderLight}`, fontSize: 13, alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{u.display_name}</span>
                  <span style={{ fontSize: 11, color: T.textSoft }}>{u.provider || "email"}</span>
                  <span style={{ fontSize: 11, color: T.textMuted }}>{new Date(u.created_at).toLocaleDateString()}</span>
                  <Badge status={u.status} />
                </div>
              ))}
              {users.length === 0 && <div style={{ padding: "30px", textAlign: "center", color: T.textMuted }}>No users yet</div>}
            </div>
          </>
        )}

        {/* === CHURCHES === */}
        {!loadingData && tab === "churches" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h1 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: 0, letterSpacing: "-0.03em" }}>Churches ({churches.length})</h1>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {churches.map(c => (
                <div key={c.id} style={{ padding: "18px 20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.heading, letterSpacing: "-0.02em" }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{c.denomination} \u00b7 {c.city}, {c.state} \u00b7 Source: {c.source}{c.claimed_by ? " \u00b7 Claimed" : ""}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {c.score_overall && <span style={{ fontSize: 20, fontWeight: 800, fontFamily: T.heading, color: scoreColor(parseFloat(c.score_overall)) }}>{parseFloat(c.score_overall).toFixed(1)}</span>}
                      <span style={{ fontSize: 12, color: T.textMuted }}>{c.total_reviews || 0} reviews</span>
                    </div>
                  </div>
                </div>
              ))}
              {churches.length === 0 && <div style={{ padding: "40px", textAlign: "center", color: T.textMuted, borderRadius: T.radius, background: T.surface, border: `1.5px dashed ${T.border}` }}>No churches yet. Add some from the main site.</div>}
            </div>
          </>
        )}

        {/* === REVIEWS === */}
        {!loadingData && tab === "reviews" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h1 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: 0, letterSpacing: "-0.03em" }}>Reviews ({reviews.length})</h1>
              <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
                <span style={{ color: T.green }}>\u25cf {publishedReviews} published</span>
                <span style={{ color: T.amber }}>\u25cf {flaggedReviews} flagged</span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reviews.map(r => {
                const church = churches.find(c => c.id === r.church_id);
                const scores = {};
                SCORE_FIELDS.forEach(f => { if (r[`score_${f}`] != null) scores[f] = r[`score_${f}`]; });
                return (
                  <div key={r.id} style={{ padding: "18px 20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${r.status === "flagged" ? "rgba(245,158,11,0.3)" : T.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 14, background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: T.heading }}>{(r.profiles?.display_name || "A").charAt(0)}</div>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.heading }}>{r.profiles?.display_name || "Anonymous"}</span>
                          <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 8 }}>{r.reviewer_role}</span>
                          <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 8 }}>\u2192 {church?.name || "Unknown"}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge status={r.status} />
                        {r.flag_count > 0 && <span style={{ fontSize: 10, color: T.red, fontWeight: 600 }}>{r.flag_count} flags</span>}
                        <span style={{ fontSize: 11, color: T.textMuted }}>{new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <p style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.65, margin: "0 0 10px" }}>{r.text}</p>

                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 10 }}>
                      {Object.entries(scores).map(([k, v]) => (
                        <span key={k} style={{ fontSize: 10, padding: "2px 7px", borderRadius: T.radiusFull, background: scoreColor(v) === T.green ? T.greenSoft : scoreColor(v) === T.amber ? T.amberSoft : T.redSoft, color: scoreColor(v), fontWeight: 700, fontFamily: T.heading }}>{k.slice(0, 4)} {v}</span>
                      ))}
                    </div>

                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {r.status === "published" && <button onClick={() => updateReviewStatus(r.id, "removed")} style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: T.radiusFull, background: T.redSoft, color: T.red, border: "none", cursor: "pointer" }}>Remove</button>}
                      {r.status === "flagged" && <>
                        <button onClick={() => updateReviewStatus(r.id, "published")} style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: T.radiusFull, background: T.greenSoft, color: T.green, border: "none", cursor: "pointer" }}>Approve</button>
                        <button onClick={() => updateReviewStatus(r.id, "removed")} style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: T.radiusFull, background: T.redSoft, color: T.red, border: "none", cursor: "pointer" }}>Remove</button>
                      </>}
                      {r.status === "removed" && <button onClick={() => updateReviewStatus(r.id, "published")} style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: T.radiusFull, background: T.greenSoft, color: T.green, border: "none", cursor: "pointer" }}>Restore</button>}
                    </div>
                  </div>
                );
              })}
              {reviews.length === 0 && <div style={{ padding: "40px", textAlign: "center", color: T.textMuted, borderRadius: T.radius, background: T.surface, border: `1.5px dashed ${T.border}` }}>No reviews yet</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
