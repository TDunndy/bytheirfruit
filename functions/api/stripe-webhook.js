// Cloudflare Pages Function — Stripe Webhook Handler
// Endpoint: POST /api/stripe-webhook
// This runs as a serverless function on Cloudflare's edge network.

// Stripe requires HMAC-SHA256 signature verification
async function verifyStripeSignature(payload, sigHeader, secret) {
  const parts = sigHeader.split(",").reduce((acc, part) => {
    const [key, value] = part.split("=");
    acc[key.trim()] = value;
    return acc;
  }, {});

  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  // Tolerance: reject events older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const expectedSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return expectedSig === signature;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Environment variables (set in Cloudflare Pages dashboard)
  const STRIPE_WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;
  const SUPABASE_URL = env.SUPABASE_URL || "https://ffqmbhftivmiubvtzhhr.supabase.co";
  const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!STRIPE_WEBHOOK_SECRET || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Read raw body for signature verification
  const payload = await request.text();
  const sigHeader = request.headers.get("stripe-signature");

  if (!sigHeader) {
    return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify signature
  const isValid = await verifyStripeSignature(payload, sigHeader, STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const event = JSON.parse(payload);

  // Handle relevant Stripe events
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.client_reference_id;
    const customerEmail = session.customer_email || session.customer_details?.email;
    const subscriptionId = session.subscription;
    const customerId = session.customer;
    const amountTotal = session.amount_total; // in cents
    const paymentStatus = session.payment_status; // "paid"

    if (!userId) {
      console.log("No client_reference_id found, skipping");
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // Insert payment record
    const paymentRes = await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_session_id: session.id,
        customer_email: customerEmail,
        amount_cents: amountTotal,
        currency: session.currency || "usd",
        payment_status: paymentStatus,
        event_type: event.type,
      }),
    });

    if (!paymentRes.ok) {
      console.error("Failed to insert payment:", await paymentRes.text());
    }

    // Update the user's most recent pending claim_request with payment_verified = true
    const claimRes = await fetch(
      `${SUPABASE_URL}/rest/v1/claim_requests?user_id=eq.${userId}&status=eq.pending&order=created_at.desc&limit=1`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          payment_verified: true,
          stripe_subscription_id: subscriptionId,
        }),
      }
    );

    if (!claimRes.ok) {
      console.error("Failed to update claim:", await claimRes.text());
    }
  }

  // Handle subscription cancellation / payment failure
  if (event.type === "customer.subscription.deleted" || event.type === "invoice.payment_failed") {
    const obj = event.data.object;
    const subscriptionId = event.type === "customer.subscription.deleted" ? obj.id : obj.subscription;

    if (subscriptionId) {
      // Log the event
      const logRes = await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          stripe_subscription_id: subscriptionId,
          stripe_session_id: obj.id,
          payment_status: event.type === "customer.subscription.deleted" ? "cancelled" : "failed",
          event_type: event.type,
          amount_cents: 0,
          currency: "usd",
        }),
      });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Reject non-POST requests
export async function onRequestGet() {
  return new Response("Stripe webhook endpoint. POST only.", { status: 405 });
}
