"use client"
// @ts-nocheck

import { useState, useEffect, useCallback, useMemo } from "react";
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
const SCORE_LABELS = { teaching: "Teaching", welcome: "Welcome", community: "Community", worship: "Worship", prayer: "Prayer", kids: "Kids Program", youth: "Youth Program", leadership: "Leadership", service: "Service", finances: "Finances" };

/* --- HELPERS --- */
const scoreColor = (s) => s >= 4.5 ? T.green : s >= 3.5 ? T.amber : T.red;
const formatDate = (d) => d ? new Date(d).toLocaleDateString() : "—";
const formatDateTime = (d) => d ? new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "—";

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
    admin: { bg: T.accentSoft, color: T.accent, border: "transparent" },
    moderator: { bg: "rgba(102,205,170,0.12)", color: "#66cdaa", border: "transparent" },
    user: { bg: T.surfaceAlt, color: T.textMuted, border: T.border },
  }[status] || { bg: T.surfaceAlt, color: T.textMuted, border: T.border };
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: T.radiusFull, background: s.bg, color: s.color, border: `1px solid ${s.border}`, textTransform: "uppercase", letterSpacing: "0.04em" }}>{status}</span>;
}

function Button({ onClick, variant = "primary", children, disabled = false, style = {} }) {
  const variants = {
    primary: { bg: T.accent, color: T.bg, hoverBg: "#2563eb", borderColor: "transparent" },
    secondary: { bg: T.surfaceAlt, color: T.text, hoverBg: T.border, borderColor: T.border },
    green: { bg: T.green, color: "#000", hoverBg: "#16a34a", borderColor: "transparent" },
    red: { bg: T.red, color: "#fff", hoverBg: "#dc2626", borderColor: "transparent" },
    amber: { bg: T.amber, color: "#000", hoverBg: "#d97706", borderColor: "transparent" },
  };
  const v = variants[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: T.radiusFull,
      background: v.bg, color: v.color, border: `1px solid ${v.borderColor}`,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      fontFamily: T.body, transition: "all 0.15s",
      ...style,
    }}>{children}</button>
  );
}

function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 50,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius,
        padding: 24, maxWidth: 600, width: "90%", maxHeight: "80vh", overflow: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, fontFamily: T.heading, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: T.textMuted }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* --- LOGIN FORM --- */
function LoginForm({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      setLoading(false);
    } else {
      onLoginSuccess();
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.body, color: T.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{fonts}</style>
      <div style={{ width: "100%", maxWidth: 400, padding: "40px 24px" }}>
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8 }}>By Their Fruit</div>
          <div style={{ fontSize: 14, color: T.textMuted }}>Admin Portal</div>
        </div>
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{
              width: "100%", padding: "10px 12px", background: T.surfaceAlt, border: `1px solid ${T.border}`,
              borderRadius: T.radiusSm, color: T.text, fontFamily: T.body, fontSize: 14,
              transition: "border-color 0.15s",
            }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{
              width: "100%", padding: "10px 12px", background: T.surfaceAlt, border: `1px solid ${T.border}`,
              borderRadius: T.radiusSm, color: T.text, fontFamily: T.body, fontSize: 14,
            }} />
          </div>
          {error && <div style={{ padding: "10px 12px", borderRadius: T.radiusSm, background: T.redSoft, color: T.red, fontSize: 13 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{
            padding: "10px 16px", background: T.accent, color: T.bg, border: "none",
            borderRadius: T.radiusSm, fontWeight: 600, fontFamily: T.body, cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1, marginTop: 8,
          }}>{loading ? "Signing in..." : "Sign In"}</button>
        </form>
      </div>
    </div>
  );
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
  const [reviewFlags, setReviewFlags] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // UI state
  const [expandedReview, setExpandedReview] = useState(null);
  const [expandedUser, setExpandedUser] = useState(null);
  const [expandedChurch, setExpandedChurch] = useState(null);
  const [editingChurch, setEditingChurch] = useState(null);
  const [churchSearchQuery, setChurchSearchQuery] = useState("");
  const [churchDenomFilter, setChurchDenomFilter] = useState("all");
  const [reviewStatusFilter, setReviewStatusFilter] = useState("all");
  const [reviewSearchQuery, setReviewSearchQuery] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [selectedReviews, setSelectedReviews] = useState(new Set());
  const [userRoleModal, setUserRoleModal] = useState(null);
  const [recalculating, setRecalculating] = useState(false);

  /* --- AUTH CHECK --- */
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setAdminUser(session.user);
        const { data } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
        const hasAccess = data?.role === "admin" || data?.role === "moderator";
        setIsAdmin(hasAccess);
      }
      setLoadingAuth(false);
    };
    checkAuth();
  }, []);

  /* --- FETCH DATA --- */
  const fetchData = useCallback(async () => {
    setLoadingData(true);
    const [usersRes, churchesRes, reviewsRes, flagsRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("churches").select("*").order("total_reviews", { ascending: false }),
      supabase.from("reviews").select("*, profiles(display_name, id), churches(name, id)").order("created_at", { ascending: false }),
      supabase.from("review_flags").select("*").order("created_at", { ascending: false }),
    ]);

    if (usersRes.data) setUsers(usersRes.data);
    if (churchesRes.data) setChurches(churchesRes.data);
    if (reviewsRes.data) setReviews(reviewsRes.data);
    if (flagsRes.data) setReviewFlags(flagsRes.data);
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (!loadingAuth && isAdmin) fetchData();
  }, [loadingAuth, isAdmin, fetchData]);

  /* --- COMPUTED STATS --- */
  const activeUsers = users.filter(u => u.status === "active").length;
  const publishedReviews = reviews.filter(r => r.status === "published").length;
  const pendingReviews = reviews.filter(r => r.status === "pending").length;
  const flaggedReviews = reviews.filter(r => r.status === "flagged").length;
  const removedReviews = reviews.filter(r => r.status === "removed").length;
  const claimedChurches = churches.filter(c => c.claimed_by).length;
  const avgScore = churches.length > 0
    ? (churches.filter(c => c.score_overall).reduce((sum, c) => sum + parseFloat(c.score_overall || 0), 0) / (churches.filter(c => c.score_overall).length || 1)).toFixed(2)
    : "N/A";

  /* --- ACTIONS --- */
  const updateReviewStatus = async (reviewId, status) => {
    const { error } = await supabase.from("reviews").update({ status }).eq("id", reviewId);
    if (!error) {
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, status } : r));
    }
  };

  const bulkUpdateReviews = async (status) => {
    for (const reviewId of selectedReviews) {
      await supabase.from("reviews").update({ status }).eq("id", reviewId);
    }
    setReviews(prev => prev.map(r => selectedReviews.has(r.id) ? { ...r, status } : r));
    setSelectedReviews(new Set());
  };

  const updateUserRole = async (userId, role) => {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
    if (!error) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    }
    setUserRoleModal(null);
  };

  const updateUserStatus = async (userId, status) => {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", userId);
    if (!error) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status } : u));
    }
  };

  const saveChurch = async (churchId, updates) => {
    const { error } = await supabase.from("churches").update(updates).eq("id", churchId);
    if (!error) {
      setChurches(prev => prev.map(c => c.id === churchId ? { ...c, ...updates } : c));
      setEditingChurch(null);
    }
  };

  const deleteChurch = async (churchId) => {
    if (!window.confirm("Are you sure? This will delete the church and all its reviews.")) return;
    const { error } = await supabase.from("churches").delete().eq("id", churchId);
    if (!error) {
      setChurches(prev => prev.filter(c => c.id !== churchId));
    }
  };

  const recalculateScores = async () => {
    setRecalculating(true);
    try {
      const { error } = await supabase.rpc("recalculate_church_scores");
      if (!error) {
        setTimeout(() => fetchData(), 500);
      }
    } catch (e) {
      console.error("Error recalculating scores:", e);
    }
    setRecalculating(false);
  };

  /* --- FILTERS & SEARCH --- */
  const filteredReviews = useMemo(() => {
    return reviews.filter(r => {
      if (reviewStatusFilter !== "all" && r.status !== reviewStatusFilter) return false;
      if (reviewSearchQuery) {
        const q = reviewSearchQuery.toLowerCase();
        const churchName = r.churches?.name?.toLowerCase() || "";
        const reviewerName = r.profiles?.display_name?.toLowerCase() || "";
        if (!churchName.includes(q) && !reviewerName.includes(q)) return false;
      }
      return true;
    });
  }, [reviews, reviewStatusFilter, reviewSearchQuery]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (!userSearchQuery) return true;
      const q = userSearchQuery.toLowerCase();
      return u.display_name?.toLowerCase().includes(q);
    });
  }, [users, userSearchQuery]);

  const filteredChurches = useMemo(() => {
    return churches.filter(c => {
      if (churchDenomFilter !== "all" && c.denomination !== churchDenomFilter) return false;
      if (churchSearchQuery) {
        const q = churchSearchQuery.toLowerCase();
        return c.name?.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [churches, churchDenomFilter, churchSearchQuery]);

  const denominations = useMemo(() => {
    const denoms = new Set(churches.map(c => c.denomination).filter(Boolean));
    return Array.from(denoms).sort();
  }, [churches]);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "reviews", label: "Reviews" },
    { id: "users", label: "Users" },
    { id: "churches", label: "Churches" },
    { id: "settings", label: "Settings" },
  ];

  if (loadingAuth) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.body, color: T.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{fonts}</style>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 24, height: 24, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.6s linear infinite", margin: "0 auto 12px" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 14, color: T.textMuted }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (!adminUser) {
    return <LoginForm onLoginSuccess={() => window.location.reload()} />;
  }

  if (!isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.body, color: T.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{fonts}</style>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 12 }}>Access Denied</div>
          <div style={{ fontSize: 14, color: T.textMuted, marginBottom: 24 }}>You don't have permission to access the admin panel. This area is restricted to administrators and moderators only.</div>
          <Button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} variant="secondary">Sign Out</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.body, color: T.text }}>
      <style>{fonts}{`::selection{background:${T.accentSoft};color:${T.accent}}*{box-sizing:border-box}input::placeholder,textarea::placeholder{color:${T.textMuted}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* --- NAVIGATION --- */}
      <nav style={{ padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, background: T.bg, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
            <rect x="1" y="1" width="26" height="26" rx="7" stroke={T.text} strokeWidth="1.5" />
            <path d="M14 7 C14 7, 9 13, 9 17 C9 19.76 11.24 22 14 22 C16.76 22 19 19.76 19 17 C19 13 14 7 14 7Z" fill={T.text} opacity="0.85" />
          </svg>
          <span style={{ fontSize: 16, fontFamily: T.heading, fontWeight: 700, letterSpacing: "-0.03em" }}>By Their Fruit</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: T.radiusFull, background: T.accentSoft, color: T.accent, border: `1px solid ${T.accentBorder}` }}>Admin</span>
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
          <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} style={{
            marginLeft: 12, padding: "6px 14px", borderRadius: T.radiusFull, fontSize: 12, fontWeight: 500,
            fontFamily: T.body, cursor: "pointer", background: T.redSoft, color: T.red, border: "none",
          }}>Sign Out</button>
        </div>
      </nav>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 24px" }}>

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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
              <Stat label="Active Users" value={activeUsers} sub={`${users.length} total`} color={T.accent} />
              <Stat label="Churches" value={churches.length} sub={`${claimedChurches} claimed`} />
              <Stat label="Reviews" value={reviews.length} sub={`${publishedReviews} published`} color={T.green} />
              <Stat label="Flagged" value={flaggedReviews} sub={`${pendingReviews} pending`} color={T.amber} />
              <Stat label="Avg Score" value={avgScore} sub="Overall rating" color={T.amber} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              {/* Recent Activity */}
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.heading, marginBottom: 12, letterSpacing: "-0.02em" }}>Recent Reviews</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {reviews.slice(0, 8).map(r => (
                    <div key={r.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.borderLight}`, fontSize: 12 }}>
                      <div style={{ fontWeight: 600, color: T.text }}>{r.profiles?.display_name || "Anonymous"} → {r.churches?.name || "Unknown"}</div>
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{r.reviewer_role} · {formatDateTime(r.created_at)}</div>
                    </div>
                  ))}
                  {reviews.length === 0 && <div style={{ fontSize: 12, color: T.textMuted, padding: "20px 0", textAlign: "center" }}>No reviews yet</div>}
                </div>
              </div>

              {/* Flagged Items */}
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.heading, marginBottom: 12, letterSpacing: "-0.02em" }}>Flagged for Review</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {reviews.filter(r => r.status === "flagged").slice(0, 5).map(r => (
                    <div key={r.id} style={{ padding: "12px", borderRadius: T.radiusSm, background: T.amberSoft, border: `1px solid rgba(245,158,11,0.2)` }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.amber }}>{r.profiles?.display_name} → {r.churches?.name}</div>
                      <div style={{ fontSize: 11, color: T.textSoft, marginTop: 4, lineHeight: 1.5 }}>{r.text?.slice(0, 100)}...</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <Button onClick={() => updateReviewStatus(r.id, "removed")} variant="red">Remove</Button>
                        <Button onClick={() => updateReviewStatus(r.id, "published")} variant="green">Approve</Button>
                      </div>
                    </div>
                  ))}
                  {reviews.filter(r => r.status === "flagged").length === 0 && <div style={{ fontSize: 12, color: T.textMuted, padding: "20px 0", textAlign: "center" }}>No flagged reviews</div>}
                </div>
              </div>
            </div>

            {/* Recent Users */}
            <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.heading, marginBottom: 12, letterSpacing: "-0.02em" }}>Recent Users</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {users.slice(0, 6).map(u => (
                  <div key={u.id} style={{ padding: 12, borderRadius: T.radiusSm, background: T.surfaceAlt, border: `1px solid ${T.border}` }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{u.display_name}</div>
                    <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>{u.provider || "email"}</div>
                    <div style={{ fontSize: 10, color: T.textMuted }}>Joined {formatDate(u.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* === REVIEWS === */}
        {!loadingData && tab === "reviews" && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h1 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: 0, letterSpacing: "-0.03em" }}>Reviews ({filteredReviews.length})</h1>
                {selectedReviews.size > 0 && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button onClick={() => bulkUpdateReviews("published")} variant="green">Approve All ({selectedReviews.size})</Button>
                    <Button onClick={() => bulkUpdateReviews("removed")} variant="red">Remove All ({selectedReviews.size})</Button>
                  </div>
                )}
              </div>

              {/* Filters */}
              <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                <input type="text" placeholder="Search by church or reviewer..." value={reviewSearchQuery} onChange={(e) => setReviewSearchQuery(e.target.value)} style={{
                  padding: "8px 12px", background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                  color: T.text, fontFamily: T.body, fontSize: 13, flex: 1, minWidth: 200,
                }} />
                <select value={reviewStatusFilter} onChange={(e) => setReviewStatusFilter(e.target.value)} style={{
                  padding: "8px 12px", background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                  color: T.text, fontFamily: T.body, fontSize: 13,
                }}>
                  <option value="all">All Statuses</option>
                  <option value="published">Published</option>
                  <option value="pending">Pending</option>
                  <option value="flagged">Flagged</option>
                  <option value="removed">Removed</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredReviews.map(r => {
                const scores = {};
                SCORE_FIELDS.forEach(f => { if (r[`score_${f}`] != null) scores[f] = r[`score_${f}`]; });
                const isExpanded = expandedReview === r.id;
                return (
                  <div key={r.id} style={{ borderRadius: T.radius, background: T.surface, border: `1px solid ${r.status === "flagged" ? "rgba(245,158,11,0.3)" : T.border}`, overflow: "hidden" }}>
                    <div style={{ padding: "16px 20px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <input type="checkbox" checked={selectedReviews.has(r.id)} onChange={(e) => {
                              const newSet = new Set(selectedReviews);
                              e.target.checked ? newSet.add(r.id) : newSet.delete(r.id);
                              setSelectedReviews(newSet);
                            }} style={{ cursor: "pointer" }} />
                            <div style={{ width: 28, height: 28, borderRadius: 14, background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: T.heading }}>{(r.profiles?.display_name || "A").charAt(0)}</div>
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 700 }}>{r.profiles?.display_name || "Anonymous"}</span>
                              <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 8 }}>{r.reviewer_role}</span>
                              <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 8 }}>→ {r.churches?.name || "Unknown"}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <Badge status={r.status} />
                          {r.flag_count > 0 && <span style={{ fontSize: 10, color: T.red, fontWeight: 600 }}>{r.flag_count} flags</span>}
                          <span style={{ fontSize: 11, color: T.textMuted }}>{formatDate(r.created_at)}</span>
                        </div>
                      </div>

                      <p style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.65, margin: "8px 0", maxHeight: isExpanded ? "none" : 60, overflow: "hidden" }}>{r.text}</p>

                      {!isExpanded && r.text?.length > 150 && (
                        <button onClick={() => setExpandedReview(r.id)} style={{ fontSize: 11, color: T.accent, fontWeight: 600, background: "none", border: "none", cursor: "pointer", marginBottom: 8 }}>Show more</button>
                      )}
                      {isExpanded && (
                        <button onClick={() => setExpandedReview(null)} style={{ fontSize: 11, color: T.accent, fontWeight: 600, background: "none", border: "none", cursor: "pointer", marginBottom: 8 }}>Show less</button>
                      )}

                      {isExpanded && (
                        <div style={{ marginBottom: 12, padding: 12, borderRadius: T.radiusSm, background: T.surfaceAlt, border: `1px solid ${T.border}` }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Category Comments</div>
                          {SCORE_FIELDS.map(f => (
                            r[`comment_${f}`] && (
                              <div key={f} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${T.borderLight}` }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{SCORE_LABELS[f]}</div>
                                <div style={{ fontSize: 11, color: T.textSoft, marginTop: 2, lineHeight: 1.5 }}>{r[`comment_${f}`]}</div>
                              </div>
                            )
                          ))}
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 10 }}>
                        {Object.entries(scores).map(([k, v]) => (
                          <span key={k} style={{ fontSize: 9, padding: "2px 6px", borderRadius: T.radiusFull, background: scoreColor(v) === T.green ? T.greenSoft : scoreColor(v) === T.amber ? T.amberSoft : T.redSoft, color: scoreColor(v), fontWeight: 700, fontFamily: T.heading }}>{k.slice(0, 3).toUpperCase()} {v}</span>
                        ))}
                      </div>

                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {r.status === "published" && <Button onClick={() => updateReviewStatus(r.id, "removed")} variant="red">Remove</Button>}
                        {r.status === "flagged" && <>
                          <Button onClick={() => updateReviewStatus(r.id, "published")} variant="green">Approve</Button>
                          <Button onClick={() => updateReviewStatus(r.id, "removed")} variant="red">Remove</Button>
                        </>}
                        {r.status === "pending" && <>
                          <Button onClick={() => updateReviewStatus(r.id, "published")} variant="green">Publish</Button>
                          <Button onClick={() => updateReviewStatus(r.id, "removed")} variant="red">Remove</Button>
                        </>}
                        {r.status === "removed" && <Button onClick={() => updateReviewStatus(r.id, "published")} variant="green">Restore</Button>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredReviews.length === 0 && <div style={{ padding: "40px", textAlign: "center", color: T.textMuted, borderRadius: T.radius, background: T.surface, border: `1.5px dashed ${T.border}` }}>No reviews found</div>}
            </div>
          </>
        )}

        {/* === USERS === */}
        {!loadingData && tab === "users" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h1 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: 0, letterSpacing: "-0.03em" }}>Users ({filteredUsers.length})</h1>
            </div>

            <input type="text" placeholder="Search by name..." value={userSearchQuery} onChange={(e) => setUserSearchQuery(e.target.value)} style={{
              width: "100%", maxWidth: 300, padding: "8px 12px", background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
              color: T.text, fontFamily: T.body, fontSize: 13, marginBottom: 16,
            }} />

            <div style={{ borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1.2fr 1.2fr 1.2fr 0.8fr", padding: "12px 16px", borderBottom: `1px solid ${T.border}`, fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                <span>Name</span><span>Provider</span><span>Role</span><span>Status</span><span>Joined</span><span>Actions</span>
              </div>
              {filteredUsers.map(u => (
                <div key={u.id}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1.2fr 1.2fr 1.2fr 0.8fr", padding: "12px 16px", borderBottom: `1px solid ${T.borderLight}`, fontSize: 13, alignItems: "center" }}>
                    <span style={{ fontWeight: 600 }}>{u.display_name}</span>
                    <span style={{ fontSize: 11, color: T.textSoft }}>{u.provider || "email"}</span>
                    <Badge status={u.role} />
                    <Badge status={u.status} />
                    <span style={{ fontSize: 11, color: T.textMuted }}>{formatDate(u.created_at)}</span>
                    <button onClick={() => setUserRoleModal(u)} style={{ fontSize: 11, color: T.accent, fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>Edit</button>
                  </div>
                  {expandedUser === u.id && (
                    <div style={{ padding: "16px", background: T.surfaceAlt, borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 600, color: T.textMuted, fontSize: 11, marginBottom: 6, textTransform: "uppercase" }}>User Reviews</div>
                        {reviews.filter(r => r.user_id === u.id).slice(0, 5).map(r => (
                          <div key={r.id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                            <div style={{ fontWeight: 600 }}>{r.churches?.name}</div>
                            <div style={{ fontSize: 11, color: T.textMuted }}>Status: {r.status}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button onClick={() => setExpandedUser(null)} variant="secondary">Hide</Button>
                      </div>
                    </div>
                  )}
                  {expandedUser !== u.id && (
                    <button onClick={() => setExpandedUser(u.id)} style={{ width: "100%", padding: "8px", fontSize: 11, color: T.accent, fontWeight: 600, background: "none", border: `1px dashed ${T.border}`, cursor: "pointer", fontFamily: T.body }}>Show reviews</button>
                  )}
                </div>
              ))}
              {filteredUsers.length === 0 && <div style={{ padding: "30px", textAlign: "center", color: T.textMuted }}>No users found</div>}
            </div>

            <Modal isOpen={!!userRoleModal} onClose={() => setUserRoleModal(null)} title={`Edit ${userRoleModal?.display_name}`}>
              {userRoleModal && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 8 }}>Role</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {["user", "moderator", "admin"].map(role => (
                        <button key={role} onClick={() => updateUserRole(userRoleModal.id, role)} style={{
                          padding: "8px 12px", borderRadius: T.radiusSm, fontFamily: T.body, fontWeight: 600, fontSize: 12,
                          background: userRoleModal.role === role ? T.accent : T.surfaceAlt, color: userRoleModal.role === role ? T.bg : T.text,
                          border: `1px solid ${userRoleModal.role === role ? T.accent : T.border}`, cursor: "pointer",
                        }}>{role.charAt(0).toUpperCase() + role.slice(1)}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 8 }}>Status</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {["active", "suspended", "banned"].map(status => (
                        <button key={status} onClick={() => updateUserStatus(userRoleModal.id, status)} style={{
                          padding: "8px 12px", borderRadius: T.radiusSm, fontFamily: T.body, fontWeight: 600, fontSize: 12,
                          background: userRoleModal.status === status ? T.amber : T.surfaceAlt, color: userRoleModal.status === status ? "#000" : T.text,
                          border: `1px solid ${userRoleModal.status === status ? T.amber : T.border}`, cursor: "pointer",
                        }}>{status.charAt(0).toUpperCase() + status.slice(1)}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Modal>
          </>
        )}

        {/* === CHURCHES === */}
        {!loadingData && tab === "churches" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h1 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: 0, letterSpacing: "-0.03em" }}>Churches ({filteredChurches.length})</h1>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <input type="text" placeholder="Search by name or city..." value={churchSearchQuery} onChange={(e) => setChurchSearchQuery(e.target.value)} style={{
                padding: "8px 12px", background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                color: T.text, fontFamily: T.body, fontSize: 13, flex: 1, minWidth: 200,
              }} />
              <select value={churchDenomFilter} onChange={(e) => setChurchDenomFilter(e.target.value)} style={{
                padding: "8px 12px", background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                color: T.text, fontFamily: T.body, fontSize: 13,
              }}>
                <option value="all">All Denominations</option>
                {denominations.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredChurches.map(c => (
                <div key={c.id}>
                  <div style={{ padding: "18px 20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.heading, letterSpacing: "-0.02em" }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4, lineHeight: 1.6 }}>
                          {c.denomination} · {c.city}, {c.state} · {c.address}<br />
                          Size: {c.size || "—"} · Style: {c.service_style || "—"} · Source: {c.source}
                          {c.claimed_by && <span> · Claimed by {c.claimed_at ? formatDate(c.claimed_at) : "unknown"}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                        {c.score_overall && <span style={{ fontSize: 28, fontWeight: 800, fontFamily: T.heading, color: scoreColor(parseFloat(c.score_overall)) }}>{parseFloat(c.score_overall).toFixed(1)}</span>}
                        <span style={{ fontSize: 12, color: T.textMuted }}>{c.total_reviews || 0} reviews</span>
                      </div>
                    </div>
                  </div>
                  {expandedChurch !== c.id && (
                    <button onClick={() => setExpandedChurch(c.id)} style={{ width: "100%", padding: "8px", fontSize: 11, color: T.accent, fontWeight: 600, background: "none", border: `1px dashed ${T.border}`, cursor: "pointer", fontFamily: T.body }}>Details & Edit</button>
                  )}
                  {expandedChurch === c.id && (
                    <div style={{ padding: "16px", background: T.surfaceAlt, borderRadius: "0 0 10px 10px", border: `1px solid ${T.border}`, borderTop: "none" }}>
                      {editingChurch === c.id ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          {["name", "denomination", "address", "city", "state", "zip", "website", "phone", "service_times", "service_style", "size"].map(field => (
                            <div key={field}>
                              <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 4, textTransform: "uppercase" }}>{field}</label>
                              {field === "service_style" ? (
                                <select value={c[field] || ""} onChange={(e) => setChurches(prev => prev.map(ch => ch.id === c.id ? { ...ch, [field]: e.target.value } : ch))} style={{
                                  width: "100%", padding: "8px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                                  color: T.text, fontFamily: T.body, fontSize: 12,
                                }}>
                                  <option value="">—</option>
                                  {["Contemporary", "Traditional", "Blended", "Charismatic", "Liturgical"].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              ) : (
                                <input type={field === "service_times" ? "text" : "text"} value={c[field] || ""} onChange={(e) => setChurches(prev => prev.map(ch => ch.id === c.id ? { ...ch, [field]: e.target.value } : ch))} style={{
                                  width: "100%", padding: "8px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                                  color: T.text, fontFamily: T.body, fontSize: 12,
                                }} />
                              )}
                            </div>
                          ))}
                          <div style={{ display: "flex", gap: 6 }}>
                            <Button onClick={() => saveChurch(c.id, {
                              name: c.name, denomination: c.denomination, address: c.address, city: c.city,
                              state: c.state, zip: c.zip, website: c.website, phone: c.phone,
                              service_times: c.service_times, service_style: c.service_style, size: c.size,
                            })} variant="green">Save</Button>
                            <Button onClick={() => setEditingChurch(null)} variant="secondary">Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 4 }}>Score Breakdown</div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {SCORE_FIELDS.map(f => (
                                  c[`score_${f}`] && (
                                    <span key={f} style={{ fontSize: 10, padding: "3px 8px", borderRadius: T.radiusFull, background: scoreColor(parseFloat(c[`score_${f}`])) === T.green ? T.greenSoft : scoreColor(parseFloat(c[`score_${f}`])) === T.amber ? T.amberSoft : T.redSoft, color: scoreColor(parseFloat(c[`score_${f}`])), fontWeight: 700, fontFamily: T.heading }}>{f.slice(0, 3).toUpperCase()} {parseFloat(c[`score_${f}`]).toFixed(1)}</span>
                                  )
                                ))}
                              </div>
                            </div>
                            <Button onClick={() => setEditingChurch(c.id)} variant="secondary">Edit</Button>
                          </div>
                          <div style={{ fontSize: 11, color: T.textMuted, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>Last updated: {formatDate(c.scores_updated_at)}</div>
                          <div style={{ marginTop: 8 }}>
                            <Button onClick={() => deleteChurch(c.id)} variant="red">Delete Church</Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {filteredChurches.length === 0 && <div style={{ padding: "40px", textAlign: "center", color: T.textMuted, borderRadius: T.radius, background: T.surface, border: `1.5px dashed ${T.border}` }}>No churches found</div>}
            </div>
          </>
        )}

        {/* === SETTINGS === */}
        {!loadingData && tab === "settings" && (
          <>
            <h1 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: "0 0 20px", letterSpacing: "-0.03em" }}>Settings</h1>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Site Configuration */}
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, fontFamily: T.heading, margin: "0 0 16px", letterSpacing: "-0.02em" }}>Site Configuration</h3>
                <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.6 }}>
                  <p>Placeholder for future site settings such as:</p>
                  <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
                    <li>Review moderation settings</li>
                    <li>Notification preferences</li>
                    <li>Email templates</li>
                    <li>API rate limits</li>
                  </ul>
                </div>
              </div>

              {/* Data Management */}
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, fontFamily: T.heading, margin: "0 0 16px", letterSpacing: "-0.02em" }}>Data Management</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Button onClick={recalculateScores} disabled={recalculating} variant="primary">
                    {recalculating ? "Recalculating..." : "Recalculate All Scores"}
                  </Button>
                  <div style={{ fontSize: 11, color: T.textMuted }}>Recomputes all church scores based on published reviews</div>
                </div>
              </div>
            </div>

            {/* Activity Log */}
            <div style={{ marginTop: 20, padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, fontFamily: T.heading, margin: "0 0 16px", letterSpacing: "-0.02em" }}>Admin Activity Log</h3>
              <div style={{ fontSize: 13, color: T.textMuted, textAlign: "center", padding: "40px 0" }}>
                Placeholder for future admin activity logging
              </div>
            </div>

            {/* Export Data */}
            <div style={{ marginTop: 20, padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, fontFamily: T.heading, margin: "0 0 16px", letterSpacing: "-0.02em" }}>Export Data</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="secondary">Export Users (CSV)</Button>
                <Button variant="secondary">Export Churches (CSV)</Button>
                <Button variant="secondary">Export Reviews (JSON)</Button>
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 12 }}>Export buttons are placeholders for future implementation</div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
