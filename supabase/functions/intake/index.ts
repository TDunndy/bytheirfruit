// intake — the public "I'm new" form (app.bytheirfruit.church/new?church=<slug>).
//
// verify_jwt = false: visitors have no account. Security comes from
// Cloudflare Turnstile when TURNSTILE_SECRET is set (the page then renders
// the widget and sends its token), a per-isolate throttle on submissions,
// and intake_first_visit(), which validates the payload, runs with the
// service role only, makes a guest family (never merged into existing
// records), records consent, opens the follow-up task and logs the intake.
//
//   GET  ?church=<slug>                       → { name, slug, turnstile: boolean }
//   POST { church, token?, adult, children, sms_consent, consent_version }
//                                             → { ok, repeat } or { error }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET") ?? "";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,80}$/;

// Per-isolate throttle: a burst from one address is slowed; the database
// also folds a repeated number into the same family for a day.
const attempts = new Map<string, { n: number; at: number }>();
function throttled(ip: string): boolean {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.at > 10 * 60_000) { attempts.set(ip, { n: 1, at: now }); return false; }
  a.n += 1;
  return a.n > 8;
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function turnstileOk(token: string, ip: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true;   // not configured yet: the form is open (see the runbook)
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const data = await res.json().catch(() => ({}));
    return data?.success === true;
  } catch (e) {
    console.error("turnstile", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    if (req.method === "GET") {
      const slug = new URL(req.url).searchParams.get("church") ?? "";
      if (!SLUG_RE.test(slug)) return reply({ error: "Unknown church." }, 404);
      const { data, error } = await admin.rpc("intake_church", { p_org_slug: slug });
      if (error || !data) return reply({ error: "Unknown church." }, 404);
      return reply({ ...(data as Record<string, unknown>), turnstile: Boolean(TURNSTILE_SECRET) });
    }
    if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (throttled(ip)) return reply({ error: "Too many sign-ups from this connection. Please try again in a few minutes." }, 429);
    const body = await req.json().catch(() => ({}));
    const slug = String(body.church ?? "");
    if (!SLUG_RE.test(slug)) return reply({ error: "Unknown church." }, 404);
    if (!(await turnstileOk(String(body.token ?? ""), ip))) return reply({ error: "Please complete the check and try again." }, 400);

    const payload = {
      adult: body.adult ?? {},
      children: Array.isArray(body.children) ? body.children.slice(0, 10) : [],
      sms_consent: body.sms_consent === true,
      consent_version: typeof body.consent_version === "string" ? body.consent_version.slice(0, 40) : "v1",
    };
    const { data, error } = await admin.rpc("intake_first_visit", { p_org_slug: slug, p: payload });
    if (error) { console.error("intake_first_visit", error); return reply({ error: "Could not save your details. Please try again." }, 500); }
    const r = (data ?? {}) as { ok?: boolean; error?: string; repeat?: boolean };
    if (!r.ok) {
      const message = r.error === "contact_required" ? "Please give a mobile number or an email address."
        : r.error === "invalid_email" ? "That email address does not look right."
        : r.error === "invalid_child" ? "Each child needs a first name and a birthdate."
        : r.error === "unknown_church" ? "Unknown church."
        : "Please check the form and try again.";
      return reply({ error: message, reason: r.error }, 400);
    }
    return reply({ ok: true, repeat: r.repeat === true });
  } catch (err) {
    console.error(err);
    return reply({ error: "Unexpected error." }, 500);
  }
});
