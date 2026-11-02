// pair-station — binds a device to a station, and unbinds it.
//
// verify_jwt = false: a device that is not yet paired has no token. Security
// comes from the pairing code (eight characters, hashed in Postgres, ten
// minutes, one use) and from claim_pairing_code(), which only the service
// role may call.
//
//   { action: "pair", code, platform?, app_version? }
//     creates an auth user station-<uuid>@stations.invalid with
//     app_metadata.kind = 'station' (no profile, walled off from the review
//     site), claims the code, and returns a session minted from a one-time
//     magic link. The device keeps the refresh token and nothing else.
//   { action: "unpair", station_id }   (Authorization: the manager's JWT)
//     unpair_station() runs as the manager (checkin.manage, in Postgres);
//     then every revoked device's auth user is banned so its refresh token
//     stops working too.
//
// A re-pair retires the device paired before; its user is banned on the
// next call here (pair or unpair), so a revoked token never outlives the
// next pairing action by more than my_station() already denies it.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAN = "876000h"; // a hundred years: the user is never used again

// Per-isolate throttle on code guesses (the code space is 23^8 and a code
// lives ten minutes, so this only blunts a burst).
const attempts = new Map<string, { n: number; at: number }>();
function throttled(ip: string): boolean {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.at > 60_000) { attempts.set(ip, { n: 1, at: now }); return false; }
  a.n += 1;
  return a.n > 10;
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function short(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t ? t.slice(0, max) : null;
}

async function banRevoked(admin: SupabaseClient) {
  const { data, error } = await admin.rpc("revoked_station_users");
  if (error) { console.error("revoked_station_users", error); return; }
  for (const userId of (data ?? []) as string[]) {
    const { error: banErr } = await admin.auth.admin.updateUserById(userId, { ban_duration: BAN });
    if (banErr) { console.error("ban failed", userId, banErr); continue; }
    const { error: okErr } = await admin.rpc("confirm_station_revocation", { p_user_id: userId });
    if (okErr) console.error("confirm_station_revocation", userId, okErr);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    if (action === "pair") {
      const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      if (throttled(ip)) return reply({ error: "Too many tries. Wait a minute and try again." }, 429);
      const code = String(body.code ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (code.length !== 8) return reply({ error: "Enter the eight-character code from the Stations screen." }, 400);
      const platform = short(body.platform, 40);
      const appVersion = short(body.app_version, 40);

      const email = `station-${crypto.randomUUID()}@stations.invalid`;
      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        app_metadata: { kind: "station" },
        user_metadata: { platform: platform ?? undefined },
      });
      if (created.error || !created.data.user) {
        console.error("createUser", created.error);
        return reply({ error: "Could not set this device up. Please try again." }, 500);
      }
      const userId = created.data.user.id;

      const claim = await admin.rpc("claim_pairing_code", { p_code: code, p_user_id: userId, p_platform: platform, p_app_version: appVersion });
      const result = (claim.data ?? null) as { ok?: boolean; error?: string; station_id?: string; org_id?: string; name?: string; mode?: string } | null;
      if (claim.error || !result?.ok) {
        await admin.auth.admin.deleteUser(userId).catch((e) => console.error("deleteUser", e));
        if (claim.error) { console.error("claim_pairing_code", claim.error); return reply({ error: "Could not pair. Please try again." }, 500); }
        const reason = result?.error ?? "code_invalid";
        const message = reason === "station_inactive" ? "That station is switched off. Turn it on in the church app first."
          : "That code is not valid. Ask for a new one on the Stations screen.";
        return reply({ error: message, reason }, 400);
      }

      // A session for the device: a one-time magic link, verified here.
      const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
      const tokenHash = link.data?.properties?.hashed_token;
      if (link.error || !tokenHash) {
        console.error("generateLink", link.error);
        return reply({ error: "Paired, but no session could be issued. Ask for a new code." }, 500);
      }
      const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const verified = await anon.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (verified.error || !verified.data.session) {
        console.error("verifyOtp", verified.error);
        return reply({ error: "Paired, but no session could be issued. Ask for a new code." }, 500);
      }
      await banRevoked(admin);
      const s = verified.data.session;
      return reply({
        ok: true,
        session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, expires_in: s.expires_in, token_type: s.token_type },
        station: { id: result.station_id, org_id: result.org_id, name: result.name, mode: result.mode },
      });
    }

    if (action === "unpair") {
      const authHeader = req.headers.get("Authorization") ?? "";
      const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
      const { data: { user }, error: userErr } = await caller.auth.getUser();
      if (userErr || !user) return reply({ error: "Please sign in." }, 401);
      if (user.app_metadata?.kind === "station") return reply({ error: "Not allowed." }, 403);
      const stationId = String(body.station_id ?? "");
      if (!UUID_RE.test(stationId)) return reply({ error: "Invalid station." }, 400);
      // Permission check and the log run as the caller, inside Postgres.
      const { error: rpcErr } = await caller.rpc("unpair_station", { p_station_id: stationId });
      if (rpcErr) return reply({ error: "You can't unpair this station." }, 403);
      await banRevoked(admin);
      return reply({ ok: true });
    }

    return reply({ error: "Unknown action." }, 400);
  } catch (err) {
    console.error(err);
    return reply({ error: "Unexpected error." }, 500);
  }
});
