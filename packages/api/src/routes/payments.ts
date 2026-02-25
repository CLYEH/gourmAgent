/**
 * Payment routes — Phase 2: Stripe card payments.
 *
 * Flow:
 *  1. POST /payments/card/create-session  → Stripe Checkout session, returns redirect_url
 *  2. User completes Stripe checkout
 *  3. POST /payments/card/webhook         → Stripe fires this; server issues an API key
 *  4. GET  /payments/card/key?session_id= → Client retrieves the API key (one-time)
 *  5. GET  /payments/card/success         → Stripe success redirect page
 *  6. GET  /payments/card/cancel          → Stripe cancel redirect page
 */

import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { z } from "zod";
import { keyStore } from "../keyStore.js";

const CreateSessionSchema = z.object({
  user_id: z.string().min(1),
});

/** Build a Stripe client from env vars.  Returns null when vars are missing. */
function buildStripe(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey, { apiVersion: "2024-11-20.acacia" as any });
}

export async function paymentRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Raw-body capture for Stripe webhook signature verification ─────────────
  // Scoped to this plugin only; other plugins keep the default JSON parser.
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      try {
        const json = JSON.parse((body as Buffer).toString());
        // Attach raw buffer so the webhook handler can verify the signature.
        (req as any).rawBody = body;
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // ─── POST /payments/card/create-session ─────────────────────────────────────
  fastify.post("/payments/card/create-session", async (request, reply) => {
    const stripe = buildStripe();
    if (!stripe) {
      return reply.status(503).send({ error: "Stripe is not configured on this server" });
    }

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      return reply
        .status(503)
        .send({ error: "STRIPE_PRICE_ID is not configured on this server" });
    }

    const parsed = CreateSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const base =
      process.env.API_BASE_URL ??
      `http://localhost:${process.env.PORT ?? 3000}`;

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${base}/payments/card/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/payments/card/cancel`,
        metadata: { user_id: parsed.data.user_id },
      });

      return reply.status(200).send({ redirect_url: session.url });
    } catch (err: any) {
      fastify.log.error(err, "Stripe session creation failed");
      return reply.status(500).send({ error: "Failed to create Stripe Checkout session" });
    }
  });

  // ─── POST /payments/card/webhook ────────────────────────────────────────────
  fastify.post("/payments/card/webhook", async (request, reply) => {
    const stripe = buildStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripe || !webhookSecret) {
      return reply.status(503).send({ error: "Stripe webhook is not configured" });
    }

    const sig = request.headers["stripe-signature"];
    if (!sig || typeof sig !== "string") {
      return reply.status(400).send({ error: "Missing stripe-signature header" });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        (request as any).rawBody as Buffer,
        sig,
        webhookSecret,
      );
    } catch (err: any) {
      fastify.log.warn(err, "Stripe webhook signature verification failed");
      return reply.status(400).send({ error: `Webhook error: ${err.message}` });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id ?? "unknown";
      keyStore.issue(userId, session.id);
      fastify.log.info(
        { userId, sessionId: session.id },
        "API key issued after successful payment",
      );
    }

    return reply.status(200).send({ received: true });
  });

  // ─── GET /payments/card/key ──────────────────────────────────────────────────
  // One-time retrieval of the plaintext API key tied to a completed Stripe session.
  fastify.get("/payments/card/key", async (request, reply) => {
    const { session_id } = request.query as { session_id?: string };

    if (!session_id) {
      return reply.status(400).send({ error: "session_id query parameter is required" });
    }

    const apiKey = keyStore.retrieveForSession(session_id);
    if (!apiKey) {
      return reply
        .status(404)
        .send({ error: "No API key found for this session. It may have already been retrieved." });
    }

    return reply.status(200).send({ api_key: apiKey });
  });

  // ─── GET /payments/card/success ─────────────────────────────────────────────
  fastify.get("/payments/card/success", async (request, reply) => {
    const { session_id } = request.query as { session_id?: string };
    return reply.status(200).send({
      message: "Payment successful! Retrieve your API key with the URL below.",
      retrieve_key_url: `/payments/card/key?session_id=${session_id ?? ""}`,
      session_id: session_id ?? null,
    });
  });

  // ─── GET /payments/card/cancel ──────────────────────────────────────────────
  fastify.get("/payments/card/cancel", async (_request, reply) => {
    return reply.status(200).send({ message: "Payment cancelled. No charges were made." });
  });
}
