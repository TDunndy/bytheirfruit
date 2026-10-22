// send-verification-email — step 1 of claiming a church.
//
// Security model (verify_jwt = true):
//   * the claimant is whoever the JWT says, never a userId in the body
//   * the 6-digit code is generated with crypto.getRandomValues and only its
//     SHA-256 hash is stored; verification happens in verify_claim_code()
//   * a claim that belongs to someone else cannot be overwritten while it is
//     verified or still within its code window
//   * the work email must match the church website's domain; churches with
//     no website must use a non-free-mail domain (manual review still applies)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS = Deno.env.get("VERIFY_FROM_ADDRESS") ?? "By Their Fruit <verify@bytheirfruit.church>";

const CODE_TTL_MS = 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const FREE_MAIL = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com",
  "aol.com", "protonmail.com", "proton.me", "msn.com", "ymail.com", "mail.com", "gmx.com",
]);

// Hosts that are not the church's own domain, so they cannot prove ownership.
const PLATFORM_HOSTS = ["facebook.com", "instagram.com", "youtube.com", "twitter.com", "x.com",
  "linktr.ee", "sites.google.com", "wixsite.com", "squarespace.com", "weebly.com", "godaddysites.com",
  "churchcenter.com", "subsplash.com"];

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(100000 + (arr[0] % 900000));
}

function websiteDomain(website: string | null): string | null {
  if (!website) return null;
  try {
    const host = new URL(website.startsWith("http") ? website : `https://${website}`).hostname.toLowerCase().replace(/^www\./, "");
    if (PLATFORM_HOSTS.some((p) => host === p || host.endsWith("." + p))) return null;
    return host;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    // Who is calling? Trust the JWT, not the body.
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await caller.auth.getUser();
    if (userErr || !user) return reply({ error: "Please sign in to claim a church." }, 401);

    const body = await req.json().catch(() => ({}));
    const churchId = String(body.churchId ?? "");
    const claimEmail = String(body.claimEmail ?? "").trim().toLowerCase();
    if (!UUID_RE.test(churchId)) return reply({ error: "Invalid church." }, 400);
    if (!EMAIL_RE.test(claimEmail) || claimEmail.length > 254) return reply({ error: "Please enter a valid work email." }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: church, error: churchError } = await admin
      .from("churches").select("id, name, website, claimed_by").eq("id", churchId).maybeSingle();
    if (churchError || !church) return reply({ error: "Church not found." }, 404);
    if (church.claimed_by && church.claimed_by !== user.id) return reply({ error: "This church has already been claimed." }, 409);

    const emailDomain = claimEmail.split("@")[1];
    const siteDomain = websiteDomain(church.website);
    if (siteDomain) {
      if (emailDomain !== siteDomain && !emailDomain.endsWith("." + siteDomain)) {
        return reply({ error: `Your email must match the church website domain (@${siteDomain}).` }, 400);
      }
    } else if (FREE_MAIL.has(emailDomain)) {
      return reply({ error: "Please use your church's own email domain, not a personal email address." }, 400);
    }

    const { data: existing } = await admin
      .from("church_claims").select("id, user_id, verified, code_expires_at, created_at").eq("church_id", churchId).maybeSingle();
    const now = Date.now();
    if (existing && existing.user_id !== user.id) {
      const stillPending = existing.code_expires_at && new Date(existing.code_expires_at).getTime() > now;
      if (existing.verified || stillPending) {
        return reply({ error: "Another person is already verifying this church. Please try again later." }, 409);
      }
    }
    if (existing && existing.user_id === user.id && existing.code_expires_at) {
      const issuedAt = new Date(existing.code_expires_at).getTime() - CODE_TTL_MS;
      if (now - issuedAt < RESEND_COOLDOWN_MS) return reply({ error: "A code was just sent. Please wait a minute before requesting another." }, 429);
    }

    const code = randomCode();
    const { error: claimError } = await admin.from("church_claims").upsert({
      church_id: churchId,
      user_id: user.id,
      claim_email: claimEmail,
      verification_code_hash: await sha256Hex(code),
      code_expires_at: new Date(now + CODE_TTL_MS).toISOString(),
      verify_attempts: 0,
      verified: false,
      verified_at: null,
      subscription_status: "pending",
    }, { onConflict: "church_id" });
    if (claimError) {
      console.error("church_claims upsert failed", claimError);
      return reply({ error: "Could not start the claim. Please try again." }, 500);
    }

    if (!RESEND_API_KEY) return reply({ error: "Email is not configured." }, 500);
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [claimEmail],
        subject: "Your church verification code",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="font-size: 22px; margin: 0 0 8px;">Verify your church</h2>
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              Someone requested to claim <strong>${esc(church.name)}</strong> on By Their Fruit.
              Enter this code to verify your email:
            </p>
            <div style="background: #f4f4f5; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
              <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; font-family: monospace;">${code}</span>
            </div>
            <p style="color: #999; font-size: 12px;">This code expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
          </div>`,
      }),
    });
    if (!emailRes.ok) {
      console.error("Resend error", await emailRes.text());
      return reply({ error: "Could not send the verification email. Please try again." }, 502);
    }

    return reply({ success: true, message: "Verification code sent" });
  } catch (err) {
    console.error(err);
    return reply({ error: "Unexpected error." }, 500);
  }
});
