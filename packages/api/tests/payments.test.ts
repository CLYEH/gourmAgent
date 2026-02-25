import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { paymentRoutes } from "../src/routes/payments.js";
import { keyStore } from "../src/keyStore.js";

// ---------------------------------------------------------------------------
// Mock the stripe module so tests don't need real Stripe credentials
// ---------------------------------------------------------------------------
vi.mock("stripe", () => {
  const mockCreate = vi.fn();
  const mockConstructEvent = vi.fn();

  const MockStripe = vi.fn(() => ({
    checkout: { sessions: { create: mockCreate } },
    webhooks: { constructEvent: mockConstructEvent },
  }));

  return { default: MockStripe };
});

import Stripe from "stripe";
const MockStripe = Stripe as unknown as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = Fastify({ logger: false });
  app.register(sensible);
  app.register(paymentRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /payments/card/create-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_PRICE_ID = "price_fake123";
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_ID;
  });

  it("returns 503 when STRIPE_SECRET_KEY is not set", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/payments/card/create-session",
      payload: { user_id: "u1" },
    });
    expect(res.statusCode).toBe(503);
  });

  it("returns 503 when STRIPE_PRICE_ID is not set", async () => {
    delete process.env.STRIPE_PRICE_ID;
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/payments/card/create-session",
      payload: { user_id: "u1" },
    });
    expect(res.statusCode).toBe(503);
  });

  it("returns 400 when user_id is missing", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/payments/card/create-session",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 200 with redirect_url on success", async () => {
    const fakeUrl = "https://checkout.stripe.com/pay/cs_test_fake";
    MockStripe.mockReturnValue({
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: fakeUrl, id: "cs_test_fake" }),
        },
      },
      webhooks: { constructEvent: vi.fn() },
    });

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/payments/card/create-session",
      payload: { user_id: "u1" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.redirect_url).toBe(fakeUrl);
  });
});

describe("POST /payments/card/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/payments/card/webhook",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("stripe-signature");
  });

  it("returns 400 when webhook signature verification fails", async () => {
    MockStripe.mockReturnValue({
      checkout: { sessions: { create: vi.fn() } },
      webhooks: {
        constructEvent: vi.fn().mockImplementation(() => {
          throw new Error("invalid signature");
        }),
      },
    });

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/payments/card/webhook",
      headers: { "stripe-signature": "t=bad,v1=bad" },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("Webhook error");
  });

  it("issues an API key on checkout.session.completed and returns 200", async () => {
    const sessionId = "cs_test_phase2_webhook";
    const fakeEvent: Partial<Stripe.Event> = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          object: "checkout.session",
          metadata: { user_id: "u_webhook_test" },
        } as any,
      },
    };

    MockStripe.mockReturnValue({
      checkout: { sessions: { create: vi.fn() } },
      webhooks: {
        constructEvent: vi.fn().mockReturnValue(fakeEvent),
      },
    });

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/payments/card/webhook",
      headers: { "stripe-signature": "t=1,v1=sig" },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ received: true });

    // The key should now be retrievable from the store.
    const apiKey = keyStore.retrieveForSession(sessionId);
    expect(apiKey).toBeTruthy();
    expect(apiKey).toMatch(/^ga_/);
    // Validate it works for auth.
    expect(keyStore.validate(apiKey!)).toBe(true);
  });
});

describe("GET /payments/card/key", () => {
  it("returns 400 when session_id is not provided", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/payments/card/key",
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown session_id", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/payments/card/key?session_id=cs_unknown_xyz",
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns the API key and removes it from pending store (one-time retrieval)", async () => {
    const key = keyStore.issue("u_key_test", "cs_retrieve_test");
    // The key is placed in pending; retrieve it via the route.
    const app = buildApp();

    const res1 = await app.inject({
      method: "GET",
      url: "/payments/card/key?session_id=cs_retrieve_test",
    });
    expect(res1.statusCode).toBe(200);
    expect(JSON.parse(res1.body).api_key).toBe(key);

    // Second retrieval should 404 — already consumed.
    const res2 = await app.inject({
      method: "GET",
      url: "/payments/card/key?session_id=cs_retrieve_test",
    });
    expect(res2.statusCode).toBe(404);
  });
});

describe("GET /payments/card/success", () => {
  it("returns 200 with a retrieve_key_url", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/payments/card/success?session_id=cs_success_test",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.retrieve_key_url).toContain("cs_success_test");
  });
});

describe("GET /payments/card/cancel", () => {
  it("returns 200 with a cancellation message", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/payments/card/cancel",
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toContain("cancelled");
  });
});
