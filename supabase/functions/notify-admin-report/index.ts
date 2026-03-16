const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REASON_LABELS: Record<string, string> = {
  not_christian: "Not a Christian Church",
  lgbtq_affirming: "LGBTQ+ Affirming",
  false_teaching: "False Teaching",
  cult_or_abusive: "Cult or Abusive Practices",
  closed_or_moved: "Closed or Moved",
  duplicate: "Duplicate Listing",
  other: "Other",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { churchName, churchCity, churchState, reason, description } = await req.json();

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "Email not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reasonLabel = REASON_LABELS[reason] || reason;
    const location = [churchCity, churchState].filter(Boolean).join(", ");

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "By Their Fruit <onboarding@resend.dev>",
        to: ["tylertex95@gmail.com"],
        subject: `🚩 Church Report: ${churchName}`,
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
                <div style="font-size: 14px; color: #333; line-height: 1.6;">${description}</div>
              </div>
            ` : ""}

            <a href="https://bytheirfruit.church/#/admin" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; margin-top: 8px;">Review in Admin Dashboard</a>

            <p style="color: #999; font-size: 11px; margin-top: 24px;">This is an automated notification from By Their Fruit.</p>
          </div>
        `,
      }),
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
