import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");
    const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    // For production: verify Stripe signature
    // For now, we parse the event directly
    // In production, use Stripe's signature verification
    const event = JSON.parse(body);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (userId) {
          // Update the church_claims record for this user
          await supabase
            .from("church_claims")
            .update({
              subscription_status: "active",
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
            })
            .eq("user_id", userId)
            .eq("subscription_status", "pending");

          // Also mark the church as claimed
          const { data: claim } = await supabase
            .from("church_claims")
            .select("church_id")
            .eq("user_id", userId)
            .single();

          if (claim) {
            await supabase
              .from("churches")
              .update({ claimed_by: userId, claimed_at: new Date().toISOString() })
              .eq("id", claim.church_id);
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const status = subscription.status; // active, past_due, canceled, unpaid
        const subscriptionId = subscription.id;

        await supabase
          .from("church_claims")
          .update({ subscription_status: status === "active" ? "active" : status })
          .eq("stripe_subscription_id", subscriptionId);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const subscriptionId = subscription.id;

        // Mark subscription as canceled
        const { data: claim } = await supabase
          .from("church_claims")
          .update({ subscription_status: "canceled" })
          .eq("stripe_subscription_id", subscriptionId)
          .select("church_id, user_id")
          .single();

        // Optionally unclaim the church
        if (claim) {
          await supabase
            .from("churches")
            .update({ claimed_by: null, claimed_at: null })
            .eq("id", claim.church_id);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;

        await supabase
          .from("church_claims")
          .update({ subscription_status: "past_due" })
          .eq("stripe_subscription_id", subscriptionId);
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
