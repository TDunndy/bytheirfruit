import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { churchId, claimEmail, userId } = await req.json();

    if (!churchId || !claimEmail || !userId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get the church to validate domain
    const { data: church, error: churchError } = await supabase
      .from("churches")
      .select("name, website")
      .eq("id", churchId)
      .single();

    if (churchError || !church) {
      return new Response(JSON.stringify({ error: "Church not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate email domain matches church website
    if (church.website) {
      const websiteDomain = new URL(
        church.website.startsWith("http") ? church.website : `https://${church.website}`
      ).hostname.replace(/^www\./, "");
      const emailDomain = claimEmail.split("@")[1]?.toLowerCase();

      if (emailDomain !== websiteDomain) {
        return new Response(
          JSON.stringify({ error: `Email domain must match the church website (${websiteDomain})` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Generate 6-digit verification code
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Upsert the claim record
    const { error: claimError } = await supabase.from("church_claims").upsert(
      {
        church_id: churchId,
        user_id: userId,
        claim_email: claimEmail,
        verification_code: code,
        verified: false,
        subscription_status: "pending",
      },
      { onConflict: "church_id" }
    );

    if (claimError) {
      return new Response(JSON.stringify({ error: claimError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send verification email via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "By Their Fruit <verify@bytheirfruit.church>",
          to: [claimEmail],
          subject: "Your church verification code",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
              <h2 style="font-size: 22px; margin: 0 0 8px;">Verify your church</h2>
              <p style="color: #666; font-size: 14px; line-height: 1.6;">
                Someone requested to claim <strong>${church.name}</strong> on By Their Fruit.
                Enter this code to verify your email:
              </p>
              <div style="background: #f4f4f5; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; font-family: monospace;">${code}</span>
              </div>
              <p style="color: #999; font-size: 12px;">This code expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
        }),
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: "Verification code sent" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
