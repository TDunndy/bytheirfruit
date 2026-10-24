// weekly-digest — cron-triggered Monday mornings (pg_cron job
// "weekly-digest-job", see migrations/20261022000100_baseline.sql).
// Iterates claimed churches (only those with active subscriptions when
// BILLING_ENABLED=true; billing is off during the beta), gathers last-7-day
// reviews and score deltas, sends a digest email via Resend.
//
// Auth: invoked from pg_cron with a shared secret in the Authorization header.
// Set DIGEST_CRON_SECRET in Edge Function secrets and
// `alter database postgres set app.settings.digest_cron_secret = '<secret>'`.
//
// Required secrets: RESEND_API_KEY, DIGEST_CRON_SECRET
// Auto-provided:    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DIGEST_CRON_SECRET = Deno.env.get("DIGEST_CRON_SECRET");
const FROM_ADDRESS = Deno.env.get("NOTIFY_FROM_ADDRESS") ?? "By Their Fruit <notifications@bytheirfruit.church>";
const BILLING_ENABLED = Deno.env.get("BILLING_ENABLED") === "true";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SCORE_FIELDS = ["teaching", "welcome", "community", "worship", "prayer", "kids", "youth", "leadership", "service", "finances"];
const LABELS: Record<string, string> = {
  teaching: "Biblical Teaching", welcome: "Welcoming Spirit", community: "Community",
  worship: "Worship", prayer: "Prayer Life", kids: "Kids Ministry", youth: "Youth Ministry",
  leadership: "Leadership", service: "Service & Outreach", finances: "Financial Transparency",
};

function esc(s: string | null | undefined) {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type DigestReview = { created_at: string; reviewer_role: string | null; text: string | null; avg: number | null };

function renderHtml(args: {
  churchName: string; weekRange: string; newCount: number; totalCount: number;
  weekAvg: number | null; priorAvg: number | null; reviews: DigestReview[];
  weakest: { label: string; score: number } | null; dashboardUrl: string;
}) {
  const delta = args.weekAvg != null && args.priorAvg != null ? (args.weekAvg - args.priorAvg) : null;
  const deltaBadge = delta == null ? ""
    : delta > 0.1 ? `<span style="color:#16a34a;font-weight:700;">▲ +${delta.toFixed(2)}</span>`
    : delta < -0.1 ? `<span style="color:#dc2626;font-weight:700;">▼ ${delta.toFixed(2)}</span>`
    : `<span style="color:#666;">— unchanged</span>`;

  const reviewRows = args.reviews.length === 0
    ? `<tr><td style="padding:14px;color:#999;font-style:italic;">No new reviews this week.</td></tr>`
    : args.reviews.slice(0, 5).map(r => `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:10px 6px;font-size:11px;color:#666;width:90px;vertical-align:top;">${new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}<br/><span style="color:#999;font-size:10px;">${esc(r.reviewer_role || "")}</span></td>
          <td style="padding:10px 6px;font-size:13px;color:#1a1a1a;line-height:1.5;">${esc((r.text || "").slice(0, 220))}${(r.text || "").length > 220 ? "…" : ""}</td>
          <td style="padding:10px 6px;font-size:13px;font-weight:700;color:#16a34a;text-align:right;width:40px;vertical-align:top;">${r.avg ? r.avg.toFixed(1) : "—"}</td>
        </tr>`).join("");

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:580px;margin:0 auto;padding:32px 24px;background:#fff;">
    <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Weekly Digest · ${esc(args.weekRange)}</div>
    <h1 style="font-size:24px;color:#1a1a1a;margin:0 0 24px;font-weight:800;letter-spacing:-0.02em;">${esc(args.churchName)}</h1>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr>
        <td style="padding:16px;background:#f8f9fa;border-radius:8px 0 0 8px;width:50%;">
          <div style="font-size:11px;color:#666;font-weight:600;text-transform:uppercase;">New Reviews</div>
          <div style="font-size:28px;font-weight:800;color:#1a1a1a;margin-top:4px;">${args.newCount}</div>
          <div style="font-size:11px;color:#999;margin-top:2px;">${args.totalCount} all-time</div>
        </td>
        <td style="padding:16px;background:#f0f9ff;border-radius:0 8px 8px 0;width:50%;">
          <div style="font-size:11px;color:#666;font-weight:600;text-transform:uppercase;">Avg Score (week)</div>
          <div style="font-size:28px;font-weight:800;color:#16a34a;margin-top:4px;">${args.weekAvg != null ? args.weekAvg.toFixed(2) : "—"}</div>
          <div style="font-size:11px;color:#999;margin-top:2px;">${deltaBadge} vs prior week</div>
        </td>
      </tr>
    </table>
    ${args.weakest ? `
    <div style="padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin-bottom:24px;">
      <div style="font-size:11px;color:#92400e;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Lowest-rated category</div>
      <div style="font-size:14px;color:#78350f;"><strong>${esc(args.weakest.label)}</strong> — ${args.weakest.score.toFixed(2)} / 5</div>
    </div>` : ""}
    <h2 style="font-size:14px;color:#1a1a1a;margin:0 0 12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">This Week’s Reviews</h2>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;">${reviewRows}</table>
    <a href="${esc(args.dashboardUrl)}" style="display:inline-block;margin-top:28px;background:#16a34a;color:#fff;padding:12px 22px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:13px;">Open your dashboard</a>
    <p style="color:#999;font-size:11px;margin-top:32px;">By Their Fruit · You’re receiving this because you claimed ${esc(args.churchName)}.</p>
  </div>`;
}

function avgFor(rows: Array<Record<string, unknown>> | null | undefined) {
  if (!rows || rows.length === 0) return null;
  let sum = 0, n = 0;
  for (const r of rows) for (const f of SCORE_FIELDS) {
    const v = r[`score_${f}`];
    if (v != null) { sum += Number(v); n += 1; }
  }
  return n > 0 ? sum / n : null;
}

async function processChurch(church: { id: string; name: string; claim_email: string | null; email: string | null }) {
  const recipientEmail = church.claim_email || church.email;
  if (!recipientEmail) return { ok: false, reason: "no recipient email" };

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const { data: weekReviews } = await supabase.from("reviews").select("*")
    .eq("church_id", church.id).eq("status", "published").is("deleted_at", null)
    .gte("created_at", weekAgo.toISOString()).order("created_at", { ascending: false });
  const { count: totalCount } = await supabase.from("reviews").select("id", { count: "exact", head: true })
    .eq("church_id", church.id).eq("status", "published").is("deleted_at", null);
  const { data: priorReviews } = await supabase.from("reviews").select("*")
    .eq("church_id", church.id).eq("status", "published").is("deleted_at", null)
    .gte("created_at", twoWeeksAgo.toISOString()).lt("created_at", weekAgo.toISOString());

  const decorated: DigestReview[] = (weekReviews || []).map((r) => {
    const vals = SCORE_FIELDS.map(f => r[`score_${f}`]).filter((v): v is number => v != null);
    return { created_at: r.created_at, reviewer_role: r.reviewer_role, text: r.text,
      avg: vals.length ? vals.reduce((a, b) => Number(a) + Number(b), 0) / vals.length : null };
  });

  const { data: churchRow } = await supabase.from("churches").select("*").eq("id", church.id).maybeSingle();
  let weakest: { label: string; score: number } | null = null;
  if (churchRow) {
    for (const f of SCORE_FIELDS) {
      const s = churchRow[`score_${f}`];
      if (s != null && (!weakest || Number(s) < weakest.score)) weakest = { label: LABELS[f] || f, score: Number(s) };
    }
  }

  if ((weekReviews?.length ?? 0) === 0 && (totalCount ?? 0) === 0) return { ok: false, reason: "no reviews ever, skipping" };

  const weekRange = `${weekAgo.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const html = renderHtml({
    churchName: church.name, weekRange, newCount: weekReviews?.length ?? 0, totalCount: totalCount ?? 0,
    weekAvg: avgFor(weekReviews), priorAvg: avgFor(priorReviews), reviews: decorated, weakest,
    dashboardUrl: "https://bytheirfruit.church/#/dashboard",
  });
  const n = weekReviews?.length ?? 0;
  const subject = n > 0 ? `${n} new review${n === 1 ? "" : "s"} for ${church.name}` : `${church.name} weekly summary — no new reviews`;

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [recipientEmail], subject, html }),
  });
  if (!emailRes.ok) return { ok: false, reason: `Resend error: ${await emailRes.text()}` };
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (DIGEST_CRON_SECRET && (req.headers.get("authorization") || "") !== `Bearer ${DIGEST_CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let query = supabase.from("churches")
    .select("id, name, claim_email, email, subscription_status")
    .not("claimed_by", "is", null);
  if (BILLING_ENABLED) query = query.in("subscription_status", ["active", "trialing"]);
  const { data: churches, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const results: Array<{ church: string; ok: boolean; reason?: string }> = [];
  for (const ch of churches || []) {
    try { results.push({ church: ch.name, ...(await processChurch(ch)) }); }
    catch (e) { results.push({ church: ch.name, ok: false, reason: (e as Error).message }); }
  }
  return new Response(JSON.stringify({
    ran_at: new Date().toISOString(), processed: results.length,
    sent: results.filter(r => r.ok).length, skipped: results.filter(r => !r.ok).length, results,
  }), { headers: { "Content-Type": "application/json" } });
});
