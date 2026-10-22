// notify-admin-report — emails the admin when a church is reported.
// Called from the app with the user's (or anon) JWT; verify_jwt = true.
// All user-supplied strings are HTML-escaped before they reach the email.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = Deno.env.get("ADMIN_NOTIFY_EMAIL") ?? "tylertex95@gmail.com";
const FROM_ADDRESS = Deno.env.get("NOTIFY_FROM_ADDRESS") ?? "By Their Fruit <notifications@bytheirfruit.church>";

const REASON_LABELS: Record<string, string> = {
  not_christian: "Not a Christian Church",
  lgbtq_affirming: "LGBTQ+ Affirming",
  false_teaching: "False Teaching",
  cult_or_abusive: "Cult or Abusive Practices",
  closed_or_moved: "Closed or Moved",
  duplicate: "Duplicate Listing",
  other: "Other",
};

function esc(s: unknown) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (!RESEND_API_KEY) return reply({ error: "Email not configured" }, 500);

  try {
    const body = await req.json().catch(() => ({}));
    const churchName = esc(body.churchName).slice(0, 200);
    const location = [esc(body.churchCity).slice(0, 100), esc(body.churchState).slice(0, 10)].filter(Boolean).join(", ");
    const reasonKey = String(body.reason ?? "other");
    const reasonLabel = esc(REASON_LABELS[reasonKey] ?? reasonKey).slice(0, 100);
    const description = esc(body.description).slice(0, 2000);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [ADMIN_EMAIL],
        subject: `Church report: ${churchName || "(unnamed)"}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 20px;">
            <h2 style="font-size: 20px; margin: 0 0 4px; color: #dc2626;">New Church Report</h2>
            <p style="color: #666; font-size: 13px; margin: 0 0 24px;">A user has flagged a church on By Their Fruit.</p>
            <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
              <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #999; margin-bottom: 4px;">Church</div>
              <div style="font-size: 16px; font-weight: 700; color: #111;">${churchName}</div>
              ${location ? `<div style="font-size: 13px; color: #666; margin-top: 2px;">${location}</div>` : ""}
            </div>
            <div style="background: #fef2f2; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
              <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #999; margin-bottom: 4px;">Reason</div>
              <div style="font-size: 15px; font-weight: 600; color: #dc2626;">${reasonLabel}</div>
            </div>
            ${description ? `
              <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #999; margin-bottom: 4px;">Description</div>
                <div style="font-size: 14px; color: #333; line-height: 1.6; white-space: pre-wrap;">${description}</div>
              </div>` : ""}
            <a href="https://bytheirfruit.church/admin" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; margin-top: 8px;">Review in Admin Dashboard</a>
            <p style="color: #999; font-size: 11px; margin-top: 24px;">This is an automated notification from By Their Fruit.</p>
          </div>`,
      }),
    });
    if (!res.ok) {
      console.error("Resend error", await res.text());
      return reply({ error: "Email delivery failed" }, 502);
    }
    return reply({ success: true });
  } catch (err) {
    console.error(err);
    return reply({ error: "Unexpected error" }, 500);
  }
});
