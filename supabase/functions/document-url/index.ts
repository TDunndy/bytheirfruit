// document-url — a short-lived link to one custody or medical document.
//
// The bucket chms-documents has no SELECT policy for the API, so every read
// goes through here: the caller's JWT must be allowed to read the
// person_documents row (log_document_access() checks custody.manage or
// kids.care and writes an access_log row), then the service role signs a
// URL that lives for two minutes.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await caller.auth.getUser();
    if (userErr || !user) return reply({ error: "Please sign in." }, 401);
    if (user.app_metadata?.kind === "station") return reply({ error: "Not allowed." }, 403);

    const body = await req.json().catch(() => ({}));
    const documentId = String(body.documentId ?? "");
    if (!UUID_RE.test(documentId)) return reply({ error: "Invalid document." }, 400);

    // Permission check and access log run as the caller, inside Postgres.
    const { data: path, error: rpcErr } = await caller.rpc("log_document_access", { p_document_id: documentId });
    if (rpcErr || !path) return reply({ error: "You can't open this document." }, 403);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await admin.storage.from("chms-documents").createSignedUrl(String(path), 120);
    if (error || !data?.signedUrl) return reply({ error: "The file could not be found." }, 404);
    return reply({ url: data.signedUrl });
  } catch (err) {
    console.error(err);
    return reply({ error: "Unexpected error." }, 500);
  }
});
