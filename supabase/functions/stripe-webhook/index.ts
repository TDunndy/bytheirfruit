// stripe-webhook — verifies the Stripe signature, processes subscription
// lifecycle events, updates churches.subscription_status. Idempotent via
// subscription_events.stripe_event_id UNIQUE.
//
// This is the endpoint Stripe is configured to call (Supabase Edge Function,
// verify_jwt = false). It is the single source of truth for billing state;
// the organizations/subscriptions tables are kept in sync by a DB trigger.
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY         — sk_live_... (or sk_test_...)
//   STRIPE_WEBHOOK_SECRET     — whsec_... (endpoint signing secret)
//   SUPABASE_URL              — auto-provided
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided
//
// Events handled:
//   checkout.session.completed       → start subscription, link to church
//   customer.subscription.created/updated → status change
//   customer.subscription.deleted    → cancel
//   invoice.paid / payment_succeeded → extend current_period_end
//   invoice.payment_failed           → mark past_due

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@^17.5.0";
import { createClient } from "jsr:@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Records the event; returns true when it was already processed. */
async function logEvent(event: Stripe.Event, churchId: string | null, status: string, amountCents: number | null) {
  const { error } = await supabase.from("subscription_events").insert({
    church_id: churchId,
    stripe_event_id: event.id,
    event_type: event.type,
    status,
    amount_cents: amountCents,
    raw: event as unknown as Record<string, unknown>,
  });
  if (error && (error as { code?: string }).code !== "23505") {
    console.error("subscription_events insert error", error);
  }
  return (error as { code?: string } | null)?.code === "23505";
}

async function findChurchByCustomer(customerId: string) {
  const { data } = await supabase.from("churches").select("id").eq("stripe_customer_id", customerId).limit(1).maybeSingle();
  return data?.id as string | undefined;
}

async function findChurchBySubscription(subscriptionId: string) {
  const { data } = await supabase.from("churches").select("id").eq("stripe_subscription_id", subscriptionId).limit(1).maybeSingle();
  return data?.id as string | undefined;
}

async function findChurchByUserId(userId: string) {
  // verify_claim_code() stamps claimed_by before the user reaches Stripe, so
  // the most recently claimed church without a subscription is this checkout.
  const { data } = await supabase
    .from("churches")
    .select("id")
    .eq("claimed_by", userId)
    .is("stripe_subscription_id", null)
    .order("claimed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id as string | undefined;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return json({ error: "Missing stripe-signature header" }, 400);

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch (err) {
    console.error("Signature verification failed:", (err as Error).message);
    return json({ error: "Invalid signature" }, 400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
          await logEvent(event, null, `unpaid:${session.payment_status}`, session.amount_total ?? null);
          break;
        }
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const userId = session.client_reference_id ?? null;
        const customerEmail = session.customer_details?.email ?? session.customer_email ?? null;

        let churchId: string | undefined;
        if (subscriptionId) churchId = await findChurchBySubscription(subscriptionId);
        if (!churchId && customerId) churchId = await findChurchByCustomer(customerId);
        if (!churchId && userId) churchId = await findChurchByUserId(userId);

        if (!churchId) {
          console.warn("checkout.session.completed: no matching church for", { userId, customerId });
          await logEvent(event, null, "unmatched", session.amount_total ?? null);
          break;
        }

        let periodEnd: string | null = null;
        let status = "active";
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          status = sub.status;
          periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        }

        const { error } = await supabase.from("churches").update({
          subscription_status: status,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          current_period_end: periodEnd,
          claim_email: customerEmail ?? undefined,
        }).eq("id", churchId);
        if (error) throw error;

        await logEvent(event, churchId, status, session.amount_total ?? null);
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        let churchId = await findChurchBySubscription(sub.id);
        if (!churchId) churchId = await findChurchByCustomer(customerId);
        if (!churchId) {
          await logEvent(event, null, sub.status, null);
          break;
        }
        const { error } = await supabase.from("churches").update({
          subscription_status: sub.status,
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        }).eq("id", churchId);
        if (error) throw error;
        await logEvent(event, churchId, sub.status, null);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const churchId = await findChurchBySubscription(sub.id);
        if (churchId) {
          await supabase.from("churches").update({
            subscription_status: "canceled",
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          }).eq("id", churchId);
        }
        await logEvent(event, churchId ?? null, "canceled", null);
        break;
      }

      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (!subscriptionId) break;
        const churchId = await findChurchBySubscription(subscriptionId);
        if (churchId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await supabase.from("churches").update({
            subscription_status: sub.status,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          }).eq("id", churchId);
        }
        await logEvent(event, churchId ?? null, "paid", invoice.amount_paid ?? null);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (!subscriptionId) break;
        const churchId = await findChurchBySubscription(subscriptionId);
        if (churchId) {
          await supabase.from("churches").update({ subscription_status: "past_due" }).eq("id", churchId);
        }
        await logEvent(event, churchId ?? null, "past_due", invoice.amount_due ?? null);
        break;
      }

      default: {
        await logEvent(event, null, "ignored", null);
      }
    }

    return json({ received: true });
  } catch (err) {
    console.error("webhook handler error:", err);
    return json({ error: (err as Error).message }, 500); // 5xx → Stripe retries
  }
});
