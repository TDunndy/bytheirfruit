// notify-new-review — emails the admin when a review lands in the queue.
// Invoked by the notify_new_review() DB trigger through pg_net.
//
// Secrets: RESEND_API_KEY, ADMIN_NOTIFY_EMAIL (optional),
//          NOTIFY_WEBHOOK_SECRET (optional; when set the trigger must send
//          `Authorization: Bearer <secret>` — see docs/RUNBOOK-migrations.md)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = Deno.env.get("ADMIN_NOTIFY_EMAIL") ?? "tylertex95@gmail.com";
const FROM_ADDRESS = Deno.env.get("NOTIFY_FROM_ADDRESS") ?? "By Their Fruit <notifications@bytheirfruit.church>";
const WEBHOOK_SECRET = Deno.env.get("NOTIFY_WEBHOOK_SECRET");

function esc(s: unknown) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (WEBHOOK_SECRET && req.headers.get("authorization") !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const record = payload.record;
    if (!record) {
      return new Response(JSON.stringify({ error: "No record in payload" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not set");
      return new Response(JSON.stringify({ error: "Email not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const churchName = esc(record.church_name || "a church").slice(0, 200);
    const reviewerName = esc((record.reviewer_name || "Someone").split(/\s+/)[0]);
    const reviewText = String(record.text || "(no text)");
    const truncated = esc(reviewText.length > 200 ? reviewText.slice(0, 200) + "..." : reviewText);

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [ADMIN_EMAIL],
        subject: `New Review Pending: ${churchName}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1a1a1a; font-size: 18px; margin-bottom: 16px;">New Review Needs Approval</h2>
            <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
              <p style="margin: 0 0 8px;"><strong>Church:</strong> ${churchName}</p>
              <p style="margin: 0 0 8px;"><strong>Reviewer:</strong> ${reviewerName}</p>
              <p style="margin: 0; color: #555; font-style: italic;">&ldquo;${truncated}&rdquo;</p>
            </div>
            <a href="https://bytheirfruit.church/admin" style="display: inline-block; background: #16a34a; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Review Now</a>
            <p style="color: #999; font-size: 11px; margin-top: 24px;">By Their Fruit &middot; Admin Notification</p>
          </div>`,
      }),
    });
    if (!emailRes.ok) console.error("Resend error", await emailRes.text());

    return new Response(JSON.stringify({ success: emailRes.ok }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
