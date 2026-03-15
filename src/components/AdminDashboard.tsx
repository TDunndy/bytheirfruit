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
  purple: "#a855f7", purpleSoft: "rgba(168,85,247,0.12)",
  heading: "'Sora', sans-serif", body: "'Plus Jakarta Sans', sans-serif", mono: "'JetBrains Mono', monospace",
  radius: 10, radiusSm: 6, radiusFull: 9999,
};

const SCORE_FIELDS = ["teaching", "welcome", "community", "worship", "prayer", "kids", "youth", "leadership", "service", "finances"];
const SCORE_LABELS = { teaching: "Teaching", welcome: "Welcome", community: "Community", worship: "Worship", prayer: "Prayer", kids: "Kids Program", youth: "Youth Program", leadership: "Leadership", service: "Service", finances: "Finances" };

/* --- HELPERS --- */
const scoreColor = (s) => s >= 4.5 ? T.green : s >= 3.5 ? T.amber : T.red;
const formatDate = (d) => d ? new Date(d).toLocaleDateString() : "—";
const formatDateTime = (d) => d ? new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "—";

function Stat({ label, value, sub, color, icon }) {
  return (
    <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 32, fontWeight: 800, fontFamily: T.heading, color: color || T.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>{sub}</div>}
        </div>
        {icon && <div style={{ fontSize: 24, opacity: 0.3 }}>{icon}</div>}
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
    hidden: { bg: T.purpleSoft, color: T.purple, border: "transparent" },
    admin: { bg: T.accentSoft, color: T.accent, border: "transparent" },
    moderator: { bg: "rgba(102,205,170,0.12)", color: "#66cdaa", border: "transparent" },
    user: { bg: T.surfaceAlt, color: T.textMuted, border: T.border },
  }[status] || { bg: T.surfaceAlt, color: T.textMuted, border: T.border };
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: T.radiusFull, background: s.bg, color: s.color, border: `1px solid ${s.border}`, textTransform: "uppercase", letterSpacing: "0.04em", width: "fit-content", display: "inline-block" }}>{status}</span>;
}

function Button({ onClick, variant = "primary", children, disabled = false, style = {} }) {
  const variants = {
    primary: { bg: T.accent, color: T.bg, hoverBg: "#2563eb", borderColor: "transparent" },
    secondary: { bg: T.surfaceAlt, color: T.text, hoverBg: T.border, borderColor: T.border },
    green: { bg: T.green, color: "#000", hoverBg: "#16a34a", borderColor: "transparent" },
    red: { bg: T.red, color: "#fff", hoverBg: "#dc2626", borderColor: "transparent" },
    amber: { bg: T.amber, color: "#000", hoverBg: "#d97706", borderColor: "transparent" },
    purple: { bg: T.purple, color: "#fff", hoverBg: "#9333ea", borderColor: "transparent" },
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

function Modal({ isOpen, onClose, title, children, wide = false }) {
  if (!isOpen) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 50,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius,
        padding: 24, maxWidth: wide ? 800 : 600, width: "90%", maxHeight: "80vh", overflow: "auto",
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

function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmLabel = "Confirm", variant = "red" }) {
  if (!isOpen) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.6, margin: "0 0 20px" }}>{message}</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button onClick={onClose} variant="secondary">Cancel</Button>
        <Button onClick={() => { onConfirm(); onClose(); }} variant={variant}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

function MiniBar({ label, value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 6 }}>
      <span style={{ width: 120, color: T.textSoft, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: T.surfaceAlt }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: color || T.accent, transition: "width 0.3s" }} />
      </div>
      <span style={{ width: 40, textAlign: "right", fontWeight: 600, fontFamily: T.mono, color: T.text }}>{value}</span>
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
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [reviewDetailModal, setReviewDetailModal] = useState(null);
  const [churchReviewsModal, setChurchReviewsModal] = useState(null);
  const [churchReviewsList, setChurchReviewsList] = useState([]);
  const [toast, setToast] = useState(null);

  const showToast = (msg, color = T.green) => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3000);
  };

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
  const [totalChurchCount, setTotalChurchCount] = useState(0);
  const [denomCounts, setDenomCounts] = useState({});
  const [stateCounts, setStateCounts] = useState({});

  const fetchData = useCallback(async () => {
    setLoadingData(true);
    const [usersRes, churchCountRes, reviewsRes, flagsRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("churches").select("*", { count: "exact", head: true }),
      supabase.from("reviews").select("*, profiles(display_name, id), churches(name, id, city, state)").order("created_at", { ascending: false }),
      supabase.from("review_flags").select("*").order("created_at", { ascending: false }),
    ]);

    if (usersRes.data) setUsers(usersRes.data);
    setTotalChurchCount(churchCountRes.count || 0);
    setChurches([]);
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
  const hiddenReviews = reviews.filter(r => r.status === "hidden").length;

  // Reviews over time
  const reviewsByWeek = useMemo(() => {
    const weeks = {};
    reviews.forEach(r => {
      const d = new Date(r.created_at);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      weeks[key] = (weeks[key] || 0) + 1;
    });
    return Object.entries(weeks).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  }, [reviews]);

  // Denomination breakdown from reviews
  const reviewsByDenom = useMemo(() => {
    const counts = {};
    reviews.forEach(r => {
      const church = r.churches;
      if (church) {
        // We don't have denomination from the join, but we can count by church
      }
    });
    return counts;
  }, [reviews]);

  // User demographics
  const demographics = useMemo(() => {
    const gender = { Male: 0, Female: 0, "Prefer not to answer": 0, "Not set": 0 };
    const age = {};
    const income = {};
    users.forEach(u => {
      if (u.gender && gender[u.gender] !== undefined) gender[u.gender]++;
      else if (u.gender) gender[u.gender] = (gender[u.gender] || 0) + 1;
      else gender["Not set"]++;

      if (u.age_range) age[u.age_range] = (age[u.age_range] || 0) + 1;
      else age["Not set"] = (age["Not set"] || 0) + 1;

      if (u.income_bracket) income[u.income_bracket] = (income[u.income_bracket] || 0) + 1;
      else income["Not set"] = (income["Not set"] || 0) + 1;
    });
    return { gender, age, income };
  }, [users]);

  // Top reviewed churches
  const topReviewedChurches = useMemo(() => {
    const counts = {};
    reviews.forEach(r => {
      if (r.churches?.name) {
        const key = r.churches.id;
        if (!counts[key]) counts[key] = { name: r.churches.name, city: r.churches.city, state: r.churches.state, count: 0, totalScore: 0 };
        counts[key].count++;
        if (r.score_overall) counts[key].totalScore += parseFloat(r.score_overall);
      }
    });
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [reviews]);

  // User roles breakdown
  const roleBreakdown = useMemo(() => {
    const roles = { admin: 0, moderator: 0, user: 0 };
    users.forEach(u => { roles[u.role] = (roles[u.role] || 0) + 1; });
    return roles;
  }, [users]);

  // Review status breakdown
  const statusBreakdown = useMemo(() => {
    return { published: publishedReviews, pending: pendingReviews, flagged: flaggedReviews, removed: removedReviews, hidden: hiddenReviews };
  }, [publishedReviews, pendingReviews, flaggedReviews, removedReviews, hiddenReviews]);

  /* --- ACTIONS --- */
  const updateReviewStatus = async (reviewId, status) => {
    const { error } = await supabase.from("reviews").update({ status }).eq("id", reviewId);
    if (!error) {
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, status } : r));
      showToast(`Review ${status === "published" ? "published" : status === "hidden" ? "hidden" : status === "removed" ? "removed" : "updated"}`);
    }
  };

  const bulkUpdateReviews = async (status) => {
    const count = selectedReviews.size;
    for (const reviewId of selectedReviews) {
      await supabase.from("reviews").update({ status }).eq("id", reviewId);
    }
    setReviews(prev => prev.map(r => selectedReviews.has(r.id) ? { ...r, status } : r));
    setSelectedReviews(new Set());
    showToast(`${count} reviews ${status === "published" ? "published" : status === "removed" ? "removed" : status === "hidden" ? "hidden" : "updated"}`);
  };

  const deleteReview = async (reviewId) => {
    const { error } = await supabase.from("reviews").delete().eq("id", reviewId);
    if (!error) {
      setReviews(prev => prev.filter(r => r.id !== reviewId));
      showToast("Review permanently deleted", T.red);
    }
  };

  const resetChurchReviews = async (churchId, churchName) => {
    setConfirmDialog({
      title: "Reset All Reviews",
      message: `This will permanently delete ALL reviews for "${churchName}" and reset its scores to zero. This action cannot be undone.`,
      confirmLabel: "Reset All Reviews",
      variant: "red",
      onConfirm: async () => {
        const { error: delErr } = await supabase.from("reviews").delete().eq("church_id", churchId);
        if (!delErr) {
          const scoreReset = {};
          SCORE_FIELDS.forEach(f => { scoreReset[`score_${f}`] = null; });
          scoreReset.score_overall = null;
          scoreReset.total_reviews = 0;
          await supabase.from("churches").update(scoreReset).eq("id", churchId);
          setReviews(prev => prev.filter(r => r.church_id !== churchId));
          showToast(`All reviews for "${churchName}" have been reset`, T.amber);
        }
      },
    });
  };

  const viewChurchReviews = async (churchId, churchName) => {
    const { data } = await supabase.from("reviews").select("*, profiles(display_name)").eq("church_id", churchId).order("created_at", { ascending: false });
    setChurchReviewsList(data || []);
    setChurchReviewsModal({ id: churchId, name: churchName });
  };

  const updateUserRole = async (userId, role) => {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
    if (!error) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
      showToast(`User role updated to ${role}`);
    }
    setUserRoleModal(null);
  };

  const updateUserStatus = async (userId, status) => {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", userId);
    if (!error) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status } : u));
      showToast(`User status updated to ${status}`);
    }
  };

  const saveChurch = async (churchId, updates) => {
    const { error } = await supabase.from("churches").update(updates).eq("id", churchId);
    if (!error) {
      setChurches(prev => prev.map(c => c.id === churchId ? { ...c, ...updates } : c));
      setEditingChurch(null);
      showToast("Church updated");
    }
  };

  const deleteChurch = async (churchId, churchName) => {
    setConfirmDialog({
      title: "Delete Church",
      message: `This will permanently delete "${churchName}" and all its reviews. This action cannot be undone.`,
      confirmLabel: "Delete Forever",
      variant: "red",
      onConfirm: async () => {
        await supabase.from("reviews").delete().eq("church_id", churchId);
        const { error } = await supabase.from("churches").delete().eq("id", churchId);
        if (!error) {
          setChurches(prev => prev.filter(c => c.id !== churchId));
          showToast("Church deleted", T.red);
        }
      },
    });
  };

  const recalculateScores = async () => {
    setRecalculating(true);
    try {
      const { error } = await supabase.rpc("recalculate_church_scores");
      if (!error) {
        showToast("Scores recalculated");
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
        const text = r.text?.toLowerCase() || "";
        if (!churchName.includes(q) && !reviewerName.includes(q) && !text.includes(q)) return false;
      }
      return true;
    });
  }, [reviews, reviewStatusFilter, reviewSearchQuery]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (!userSearchQuery) return true;
      const q = userSearchQuery.toLowerCase();
      return u.display_name?.toLowerCase().includes(q) || u.id?.toLowerCase().includes(q);
    });
  }, [users, userSearchQuery]);

  const filteredChurches = churches;

  // Debounced server-side church search for admin
  useEffect(() => {
    if (tab !== "churches") return;
    const timer = setTimeout(() => {
      if (churchSearchQuery || churchDenomFilter !== "all") {
        let q = supabase.from("churches").select("*");
        if (churchSearchQuery) {
          q = q.or(`name.ilike.%${churchSearchQuery}%,city.ilike.%${churchSearchQuery}%`);
        }
        if (churchDenomFilter !== "all") {
          q = q.eq("denomination", churchDenomFilter);
        }
        q.order("total_reviews", { ascending: false }).limit(100).then(({ data }) => {
          if (data) setChurches(data);
        });
      } else {
        setChurches([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [churchSearchQuery, churchDenomFilter, tab]);

  const denominations = ["Non-Denominational", "Baptist", "Catholic", "Methodist", "Lutheran", "Presbyterian", "Episcopal", "Pentecostal", "Assemblies of God", "Church of God", "Church of Christ", "Orthodox", "Calvary Chapel", "Apostolic", "Church of God in Christ", "AME", "Seventh-day Adventist", "United Methodist", "Vineyard", "Church of the Nazarene", "United Church of Christ", "Southern Baptist", "Holiness", "Wesleyan", "Reformed", "Brethren", "Mennonite", "Foursquare", "Congregational"];

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "reviews", label: "Reviews" },
    { id: "users", label: "Users" },
    { id: "churches", label: "Churches" },
    { id: "demographics", label: "Demographics" },
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
          <div style={{ fontSize: 14, color: T.textMuted, marginBottom: 24 }}>You don't have permission to access the admin panel.</div>
          <Button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} variant="secondary">Sign Out</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.body, color: T.text }}>
      <style>{fonts}{`::selection{background:${T.accentSoft};color:${T.accent}}*{box-sizing:border-box}input::placeholder,textarea::placeholder{color:${T.textMuted}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 100, padding: "12px 20px",
          borderRadius: T.radius, background: T.surface, border: `1px solid ${toast.color}`,
          color: toast.color, fontSize: 13, fontWeight: 600, fontFamily: T.body,
          animation: "fadeIn 0.2s ease", boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        }}>{toast.msg}</div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          variant={confirmDialog.variant}
        />
      )}

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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
              <Stat label="Total Users" value={users.length} sub={`${activeUsers} active`} color={T.accent} icon="👥" />
              <Stat label="Churches" value={totalChurchCount.toLocaleString()} icon="⛪" />
              <Stat label="Total Reviews" value={reviews.length} sub={`${publishedReviews} published`} color={T.green} icon="📝" />
              <Stat label="Pending" value={pendingReviews} sub="Awaiting moderation" color={T.accent} icon="⏳" />
              <Stat label="Flagged" value={flaggedReviews} sub="Needs attention" color={T.amber} icon="⚠️" />
              <Stat label="Hidden" value={hiddenReviews} sub="Temporarily hidden" color={T.purple} icon="👁️" />
              <Stat label="Removed" value={removedReviews} sub="Permanently removed" color={T.red} icon="🗑️" />
            </div>

            {/* Review Status Breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.heading, marginBottom: 16, letterSpacing: "-0.02em" }}>Review Status Breakdown</div>
                {Object.entries(statusBreakdown).map(([status, count]) => (
                  <MiniBar key={status} label={status.charAt(0).toUpperCase() + status.slice(1)} value={count} max={reviews.length} color={
                    status === "published" ? T.green : status === "flagged" ? T.amber : status === "pending" ? T.accent : status === "hidden" ? T.purple : T.red
                  } />
                ))}
              </div>

              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.heading, marginBottom: 16, letterSpacing: "-0.02em" }}>User Roles</div>
                <MiniBar label="Admins" value={roleBreakdown.admin} max={users.length} color={T.accent} />
                <MiniBar label="Moderators" value={roleBreakdown.moderator} max={users.length} color="#66cdaa" />
                <MiniBar label="Users" value={roleBreakdown.user} max={users.length} color={T.textMuted} />
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.borderLight}` }}>
                  <div style={{ fontSize: 11, color: T.textMuted }}>User signups this week: {users.filter(u => new Date(u.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length}</div>
                </div>
              </div>

              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.heading, marginBottom: 16, letterSpacing: "-0.02em" }}>Reviews This Week</div>
                {reviewsByWeek.length > 0 ? (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80 }}>
                    {reviewsByWeek.map(([week, count]) => {
                      const maxCount = Math.max(...reviewsByWeek.map(w => w[1]));
                      const height = maxCount > 0 ? (count / maxCount) * 70 : 0;
                      return (
                        <div key={week} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <div style={{ fontSize: 9, color: T.textMuted, fontFamily: T.mono }}>{count}</div>
                          <div style={{ width: "100%", height: Math.max(height, 2), borderRadius: 2, background: T.accent }} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: T.textMuted, textAlign: "center", padding: "20px 0" }}>No review data yet</div>
                )}
                <div style={{ fontSize: 10, color: T.textMuted, textAlign: "center", marginTop: 6 }}>Last 12 weeks</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              {/* Top Reviewed Churches */}
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.heading, marginBottom: 12, letterSpacing: "-0.02em" }}>Top Reviewed Churches</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {topReviewedChurches.length > 0 ? topReviewedChurches.map((c, i) => (
                    <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${T.borderLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 10, color: T.textMuted }}>{c.city}, {c.state}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: T.heading, color: T.accent }}>{c.count} reviews</div>
                        <div style={{ fontSize: 10, color: T.textMuted }}>avg {(c.totalScore / c.count).toFixed(1)}</div>
                      </div>
                    </div>
                  )) : <div style={{ fontSize: 12, color: T.textMuted, textAlign: "center", padding: "20px 0" }}>No reviewed churches yet</div>}
                </div>
              </div>

              {/* Flagged Items Queue */}
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.heading, marginBottom: 12, letterSpacing: "-0.02em" }}>Moderation Queue ({flaggedReviews + pendingReviews})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {reviews.filter(r => r.status === "flagged" || r.status === "pending").slice(0, 6).map(r => (
                    <div key={r.id} style={{ padding: "12px", borderRadius: T.radiusSm, background: r.status === "flagged" ? T.amberSoft : T.accentSoft, border: `1px solid ${r.status === "flagged" ? "rgba(245,158,11,0.2)" : T.accentBorder}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: r.status === "flagged" ? T.amber : T.accent }}>{r.profiles?.display_name} → {r.churches?.name}</div>
                        <Badge status={r.status} />
                      </div>
                      <div style={{ fontSize: 11, color: T.textSoft, lineHeight: 1.5, marginBottom: 8 }}>{r.text?.slice(0, 80)}...</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button onClick={() => updateReviewStatus(r.id, "published")} variant="green">Approve</Button>
                        <Button onClick={() => updateReviewStatus(r.id, "hidden")} variant="purple">Hide</Button>
                        <Button onClick={() => updateReviewStatus(r.id, "removed")} variant="red">Remove</Button>
                      </div>
                    </div>
                  ))}
                  {flaggedReviews + pendingReviews === 0 && <div style={{ fontSize: 12, color: T.textMuted, padding: "20px 0", textAlign: "center" }}>Queue is clear!</div>}
                </div>
              </div>
            </div>

            {/* Recent Users */}
            <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.heading, marginBottom: 12, letterSpacing: "-0.02em" }}>Recent Users</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {users.slice(0, 6).map(u => (
                  <div key={u.id} style={{ padding: 12, borderRadius: T.radiusSm, background: T.surfaceAlt, border: `1px solid ${T.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{u.display_name}</div>
                      <Badge status={u.role} />
                    </div>
                    <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>{u.provider || "email"} · Joined {formatDate(u.created_at)}</div>
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
                <div style={{ display: "flex", gap: 8 }}>
                  {selectedReviews.size > 0 && (
                    <>
                      <Button onClick={() => bulkUpdateReviews("published")} variant="green">Approve ({selectedReviews.size})</Button>
                      <Button onClick={() => bulkUpdateReviews("hidden")} variant="purple">Hide ({selectedReviews.size})</Button>
                      <Button onClick={() => bulkUpdateReviews("removed")} variant="red">Remove ({selectedReviews.size})</Button>
                    </>
                  )}
                </div>
              </div>

              {/* Filters */}
              <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                <input type="text" placeholder="Search by church, reviewer, or text..." value={reviewSearchQuery} onChange={(e) => setReviewSearchQuery(e.target.value)} style={{
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
                  <option value="hidden">Hidden</option>
                  <option value="removed">Removed</option>
                </select>
                {selectedReviews.size === 0 && (
                  <Button onClick={() => {
                    const allIds = new Set(filteredReviews.map(r => r.id));
                    setSelectedReviews(allIds);
                  }} variant="secondary">Select All</Button>
                )}
                {selectedReviews.size > 0 && (
                  <Button onClick={() => setSelectedReviews(new Set())} variant="secondary">Deselect All</Button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredReviews.map(r => {
                const scores = {};
                SCORE_FIELDS.forEach(f => { if (r[`score_${f}`] != null) scores[f] = r[`score_${f}`]; });
                const isExpanded = expandedReview === r.id;
                return (
                  <div key={r.id} style={{ borderRadius: T.radius, background: T.surface, border: `1px solid ${r.status === "flagged" ? "rgba(245,158,11,0.3)" : r.status === "hidden" ? "rgba(168,85,247,0.3)" : T.border}`, overflow: "hidden" }}>
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
                              <a href={`/#/profile/${r.church_id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: T.accent, marginLeft: 8, textDecoration: "none", fontWeight: 600 }}>→ {r.churches?.name || "Unknown"}</a>
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
                        {r.status !== "published" && <Button onClick={() => updateReviewStatus(r.id, "published")} variant="green">{r.status === "removed" || r.status === "hidden" ? "Restore" : "Publish"}</Button>}
                        {r.status === "published" && <Button onClick={() => updateReviewStatus(r.id, "hidden")} variant="purple">Hide</Button>}
                        {r.status === "published" && <Button onClick={() => updateReviewStatus(r.id, "removed")} variant="red">Remove</Button>}
                        {r.status === "flagged" && <>
                          <Button onClick={() => updateReviewStatus(r.id, "published")} variant="green">Approve</Button>
                          <Button onClick={() => updateReviewStatus(r.id, "hidden")} variant="purple">Hide</Button>
                          <Button onClick={() => updateReviewStatus(r.id, "removed")} variant="red">Remove</Button>
                        </>}
                        {r.status === "pending" && <>
                          <Button onClick={() => updateReviewStatus(r.id, "published")} variant="green">Publish</Button>
                          <Button onClick={() => updateReviewStatus(r.id, "hidden")} variant="purple">Hide</Button>
                          <Button onClick={() => updateReviewStatus(r.id, "removed")} variant="red">Remove</Button>
                        </>}
                        {(r.status === "removed" || r.status === "hidden") && (
                          <Button onClick={() => setConfirmDialog({
                            title: "Permanently Delete Review",
                            message: "This will permanently delete this review from the database. This cannot be undone.",
                            confirmLabel: "Delete Forever",
                            variant: "red",
                            onConfirm: () => deleteReview(r.id),
                          })} variant="red" style={{ marginLeft: 8 }}>Delete Forever</Button>
                        )}
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
              <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 2fr) minmax(70px, 0.8fr) minmax(70px, 0.6fr) minmax(70px, 0.6fr) minmax(90px, 0.8fr) minmax(100px, 0.8fr)", gap: "0 12px", padding: "12px 16px", borderBottom: `1px solid ${T.border}`, fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                <span>Name</span><span>Provider</span><span>Role</span><span>Status</span><span>Joined</span><span>Actions</span>
              </div>
              {filteredUsers.map(u => (
                <div key={u.id}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 2fr) minmax(70px, 0.8fr) minmax(70px, 0.6fr) minmax(70px, 0.6fr) minmax(90px, 0.8fr) minmax(100px, 0.8fr)", gap: "0 12px", padding: "12px 16px", borderBottom: `1px solid ${T.borderLight}`, fontSize: 13, alignItems: "center" }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{u.display_name}</span>
                      {u.gender && <span style={{ fontSize: 10, color: T.textMuted, marginLeft: 6 }}>({u.gender})</span>}
                    </div>
                    <span style={{ fontSize: 11, color: T.textSoft }}>{u.provider || "email"}</span>
                    <Badge status={u.role} />
                    <Badge status={u.status} />
                    <span style={{ fontSize: 11, color: T.textMuted }}>{formatDate(u.created_at)}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)} style={{ fontSize: 11, color: expandedUser === u.id ? T.textMuted : T.accent, fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: T.body }}>{expandedUser === u.id ? "Hide" : "Details"}</button>
                      <span style={{ color: T.border }}>|</span>
                      <button onClick={() => setUserRoleModal(u)} style={{ fontSize: 11, color: T.accent, fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: T.body }}>Edit</button>
                    </div>
                  </div>
                  {expandedUser === u.id && (
                    <div style={{ padding: "16px", background: T.surfaceAlt, borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                        <div><span style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase" }}>Gender</span><br />{u.gender || "Not set"}</div>
                        <div><span style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase" }}>Age Range</span><br />{u.age_range || "Not set"}</div>
                        <div><span style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase" }}>Income</span><br />{u.income_bracket || "Not set"}</div>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 600, color: T.textMuted, fontSize: 11, marginBottom: 6, textTransform: "uppercase" }}>User Reviews ({reviews.filter(r => r.user_id === u.id).length})</div>
                        {reviews.filter(r => r.user_id === u.id).slice(0, 5).map(r => (
                          <a key={r.id} href={`/#/profile/${r.church_id}`} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none", color: "inherit", cursor: "pointer" }}>
                            <div>
                              <div style={{ fontWeight: 600, color: T.accent }}>{r.churches?.name}</div>
                              <div style={{ fontSize: 11, color: T.textMuted }}>{r.churches?.city}, {r.churches?.state} · {formatDate(r.created_at)}</div>
                            </div>
                            <Badge status={r.status} />
                          </a>
                        ))}
                        {reviews.filter(r => r.user_id === u.id).length === 0 && <div style={{ fontSize: 11, color: T.textMuted }}>No reviews</div>}
                      </div>
                    </div>
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
              <h1 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: 0, letterSpacing: "-0.03em" }}>Churches ({totalChurchCount.toLocaleString()} total)</h1>
            </div>

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
                          {c.denomination} · {c.city}, {c.state} {c.zip || ""} · {c.address || "No address"}<br />
                          Phone: {c.phone || "—"} · Website: {c.website ? "Yes" : "—"} · Source: {c.source}
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
                          {["name", "denomination", "address", "city", "state", "zip", "website", "phone", "email", "service_times", "service_style", "size"].map(field => (
                            <div key={field}>
                              <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, display: "block", marginBottom: 4, textTransform: "uppercase" }}>{field.replace("_", " ")}</label>
                              {field === "service_style" ? (
                                <select value={c[field] || ""} onChange={(e) => setChurches(prev => prev.map(ch => ch.id === c.id ? { ...ch, [field]: e.target.value } : ch))} style={{
                                  width: "100%", padding: "8px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                                  color: T.text, fontFamily: T.body, fontSize: 12,
                                }}>
                                  <option value="">—</option>
                                  {["Contemporary", "Traditional", "Blended", "Charismatic", "Liturgical"].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              ) : field === "denomination" ? (
                                <select value={c[field] || ""} onChange={(e) => setChurches(prev => prev.map(ch => ch.id === c.id ? { ...ch, [field]: e.target.value } : ch))} style={{
                                  width: "100%", padding: "8px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                                  color: T.text, fontFamily: T.body, fontSize: 12,
                                }}>
                                  <option value="">—</option>
                                  {denominations.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              ) : (
                                <input value={c[field] || ""} onChange={(e) => setChurches(prev => prev.map(ch => ch.id === c.id ? { ...ch, [field]: e.target.value } : ch))} style={{
                                  width: "100%", padding: "8px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                                  color: T.text, fontFamily: T.body, fontSize: 12,
                                }} />
                              )}
                            </div>
                          ))}
                          <div style={{ display: "flex", gap: 6 }}>
                            <Button onClick={() => saveChurch(c.id, {
                              name: c.name, denomination: c.denomination, address: c.address, city: c.city,
                              state: c.state, zip: c.zip, website: c.website, phone: c.phone, email: c.email,
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
                                {!SCORE_FIELDS.some(f => c[`score_${f}`]) && <span style={{ fontSize: 11, color: T.textMuted }}>No scores yet</span>}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <Button onClick={() => setEditingChurch(c.id)} variant="secondary">Edit</Button>
                              <Button onClick={() => viewChurchReviews(c.id, c.name)} variant="primary">View Reviews</Button>
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: T.textMuted, paddingTop: 8, borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between" }}>
                            <span>Lat: {c.latitude?.toFixed(4)} · Lng: {c.longitude?.toFixed(4)} · Updated: {formatDate(c.scores_updated_at)}</span>
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                            <Button onClick={() => resetChurchReviews(c.id, c.name)} variant="amber">Reset Reviews</Button>
                            <Button onClick={() => deleteChurch(c.id, c.name)} variant="red">Delete Church</Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {filteredChurches.length === 0 && <div style={{ padding: "40px", textAlign: "center", color: T.textMuted, borderRadius: T.radius, background: T.surface, border: `1.5px dashed ${T.border}` }}>{churchSearchQuery || churchDenomFilter !== "all" ? "No churches found" : "Search for a church by name or city"}</div>}
            </div>

            {/* Church Reviews Modal */}
            <Modal isOpen={!!churchReviewsModal} onClose={() => setChurchReviewsModal(null)} title={`Reviews for ${churchReviewsModal?.name}`} wide>
              {churchReviewsList.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {churchReviewsList.map(r => (
                    <div key={r.id} style={{ padding: 14, borderRadius: T.radiusSm, background: T.surfaceAlt, border: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{r.profiles?.display_name || "Anonymous"}</span>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <Badge status={r.status} />
                          <span style={{ fontSize: 11, color: T.textMuted }}>{formatDate(r.created_at)}</span>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.6, margin: "4px 0 8px" }}>{r.text}</p>
                      <div style={{ display: "flex", gap: 6 }}>
                        {r.status !== "published" && <Button onClick={() => { updateReviewStatus(r.id, "published"); setChurchReviewsList(prev => prev.map(cr => cr.id === r.id ? {...cr, status: "published"} : cr)); }} variant="green">Publish</Button>}
                        {r.status !== "hidden" && <Button onClick={() => { updateReviewStatus(r.id, "hidden"); setChurchReviewsList(prev => prev.map(cr => cr.id === r.id ? {...cr, status: "hidden"} : cr)); }} variant="purple">Hide</Button>}
                        {r.status !== "removed" && <Button onClick={() => { updateReviewStatus(r.id, "removed"); setChurchReviewsList(prev => prev.map(cr => cr.id === r.id ? {...cr, status: "removed"} : cr)); }} variant="red">Remove</Button>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ textAlign: "center", color: T.textMuted, padding: "20px 0" }}>No reviews for this church</div>}
            </Modal>
          </>
        )}

        {/* === DEMOGRAPHICS === */}
        {!loadingData && tab === "demographics" && (
          <>
            <h1 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: "0 0 20px", letterSpacing: "-0.03em" }}>User Demographics</h1>
            <div style={{ padding: "12px 16px", borderRadius: T.radiusSm, background: T.accentSoft, border: `1px solid ${T.accentBorder}`, marginBottom: 20, fontSize: 12, color: T.accent, lineHeight: 1.6 }}>
              All demographic data is anonymous and aggregated. Individual user data is never shared or sold. This data helps churches understand their community better.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {/* Gender */}
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.heading, marginBottom: 16, letterSpacing: "-0.02em" }}>Gender</div>
                {Object.entries(demographics.gender).filter(([_, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                  <MiniBar key={label} label={label} value={count} max={users.length} color={label === "Male" ? T.accent : label === "Female" ? T.purple : T.textMuted} />
                ))}
                {Object.values(demographics.gender).every(v => v === 0) && <div style={{ fontSize: 12, color: T.textMuted, textAlign: "center", padding: "20px 0" }}>No data yet</div>}
              </div>

              {/* Age Range */}
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.heading, marginBottom: 16, letterSpacing: "-0.02em" }}>Age Range</div>
                {Object.entries(demographics.age).filter(([_, v]) => v > 0).sort((a, b) => {
                  const order = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+", "Prefer not to answer", "Not set"];
                  return order.indexOf(a[0]) - order.indexOf(b[0]);
                }).map(([label, count]) => (
                  <MiniBar key={label} label={label} value={count} max={users.length} color={label === "Not set" ? T.textMuted : T.green} />
                ))}
                {Object.values(demographics.age).every(v => v === 0) && <div style={{ fontSize: 12, color: T.textMuted, textAlign: "center", padding: "20px 0" }}>No data yet</div>}
              </div>

              {/* Income */}
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.heading, marginBottom: 16, letterSpacing: "-0.02em" }}>Income Bracket</div>
                {Object.entries(demographics.income).filter(([_, v]) => v > 0).sort((a, b) => {
                  const order = ["Under $25k", "$25k-$50k", "$50k-$75k", "$75k-$100k", "$100k-$150k", "$150k+", "Prefer not to answer", "Not set"];
                  return order.indexOf(a[0]) - order.indexOf(b[0]);
                }).map(([label, count]) => (
                  <MiniBar key={label} label={label} value={count} max={users.length} color={label === "Not set" ? T.textMuted : T.amber} />
                ))}
                {Object.values(demographics.income).every(v => v === 0) && <div style={{ fontSize: 12, color: T.textMuted, textAlign: "center", padding: "20px 0" }}>No data yet</div>}
              </div>
            </div>

            <div style={{ marginTop: 20, padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.heading, marginBottom: 12, letterSpacing: "-0.02em" }}>Completion Rate</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                {[
                  { label: "Gender", filled: users.filter(u => u.gender && u.gender !== "Prefer not to answer").length },
                  { label: "Age Range", filled: users.filter(u => u.age_range && u.age_range !== "Prefer not to answer").length },
                  { label: "Income", filled: users.filter(u => u.income_bracket && u.income_bracket !== "Prefer not to answer").length },
                ].map(({ label, filled }) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 800, fontFamily: T.heading, color: T.accent }}>{users.length > 0 ? Math.round((filled / users.length) * 100) : 0}%</div>
                    <div style={{ fontSize: 12, color: T.textMuted }}>{label} provided</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>{filled} of {users.length}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* === SETTINGS === */}
        {!loadingData && tab === "settings" && (
          <>
            <h1 style={{ fontSize: 24, fontFamily: T.heading, fontWeight: 800, margin: "0 0 20px", letterSpacing: "-0.03em" }}>Settings</h1>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Data Management */}
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, fontFamily: T.heading, margin: "0 0 16px", letterSpacing: "-0.02em" }}>Data Management</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <Button onClick={recalculateScores} disabled={recalculating} variant="primary">
                      {recalculating ? "Recalculating..." : "Recalculate All Church Scores"}
                    </Button>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>Recomputes all church scores from published reviews</div>
                  </div>
                  <div>
                    <Button onClick={() => setConfirmDialog({
                      title: "Remove All Flagged Reviews",
                      message: "This will change the status of all flagged reviews to 'removed'. This is reversible — you can restore individual reviews later.",
                      confirmLabel: "Remove All Flagged",
                      variant: "amber",
                      onConfirm: async () => {
                        const flaggedIds = reviews.filter(r => r.status === "flagged").map(r => r.id);
                        for (const id of flaggedIds) {
                          await supabase.from("reviews").update({ status: "removed" }).eq("id", id);
                        }
                        setReviews(prev => prev.map(r => r.status === "flagged" ? { ...r, status: "removed" } : r));
                        showToast(`${flaggedIds.length} flagged reviews removed`);
                      },
                    })} variant="amber" disabled={flaggedReviews === 0}>
                      Remove All Flagged Reviews ({flaggedReviews})
                    </Button>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>Move all flagged reviews to removed status</div>
                  </div>
                  <div>
                    <Button onClick={() => setConfirmDialog({
                      title: "Publish All Pending Reviews",
                      message: "This will publish all pending reviews. Make sure you've reviewed them for inappropriate content first.",
                      confirmLabel: "Publish All Pending",
                      variant: "green",
                      onConfirm: async () => {
                        const pendingIds = reviews.filter(r => r.status === "pending").map(r => r.id);
                        for (const id of pendingIds) {
                          await supabase.from("reviews").update({ status: "published" }).eq("id", id);
                        }
                        setReviews(prev => prev.map(r => r.status === "pending" ? { ...r, status: "published" } : r));
                        showToast(`${pendingIds.length} pending reviews published`);
                      },
                    })} variant="green" disabled={pendingReviews === 0}>
                      Publish All Pending Reviews ({pendingReviews})
                    </Button>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>Approve and publish all pending reviews at once</div>
                  </div>
                </div>
              </div>

              {/* Moderation Quick Actions */}
              <div style={{ padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, fontFamily: T.heading, margin: "0 0 16px", letterSpacing: "-0.02em" }}>Moderation Info</h3>
                <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.7 }}>
                  <p style={{ margin: "0 0 12px" }}>Review statuses explained:</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Badge status="published" /> <span>Visible to all users, counted in scores</span></div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Badge status="pending" /> <span>Awaiting moderation before appearing</span></div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Badge status="flagged" /> <span>Reported by users, needs attention</span></div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Badge status="hidden" /> <span>Temporarily hidden, can be restored</span></div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Badge status="removed" /> <span>Permanently removed from view</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Export Data */}
            <div style={{ marginTop: 20, padding: "20px", borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}` }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, fontFamily: T.heading, margin: "0 0 16px", letterSpacing: "-0.02em" }}>Export Data</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button onClick={async () => {
                  const { data } = await supabase.from("profiles").select("display_name,role,status,gender,age_range,income_bracket,provider,created_at");
                  if (data) {
                    const csv = "Name,Role,Status,Gender,Age,Income,Provider,Joined\n" + data.map(u =>
                      `"${u.display_name}",${u.role},${u.status},${u.gender || ""},${u.age_range || ""},${u.income_bracket || ""},${u.provider || ""},${u.created_at}`
                    ).join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = "users_export.csv"; a.click();
                    showToast("Users exported");
                  }
                }} variant="secondary">Export Users (CSV)</Button>
                <Button onClick={async () => {
                  const { data } = await supabase.from("reviews").select("*, profiles(display_name), churches(name, city, state)").order("created_at", { ascending: false });
                  if (data) {
                    const csv = "Reviewer,Church,City,State,Status,Score,Text,Date\n" + data.map(r =>
                      `"${r.profiles?.display_name || ""}","${r.churches?.name || ""}","${r.churches?.city || ""}","${r.churches?.state || ""}",${r.status},${r.score_overall || ""},"${(r.text || "").replace(/"/g, '""').slice(0, 200)}",${r.created_at}`
                    ).join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = "reviews_export.csv"; a.click();
                    showToast("Reviews exported");
                  }
                }} variant="secondary">Export Reviews (CSV)</Button>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
