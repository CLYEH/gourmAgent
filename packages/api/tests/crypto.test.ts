/**
 * Phase 3 tests — On-chain USDC crypto payment routes and UsdcPaymentManager.
 *
 * viem and evm.ts are mocked to avoid real RPC calls.  All blockchain
 * interactions are simulated through the mock watcher.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { keyStore } from "../src/keyStore.js";

// ---------------------------------------------------------------------------
// Mock stripe (required by paymentRoutes which imports it at the module level)
// ---------------------------------------------------------------------------
vi.mock("stripe", () => {
  const MockStripe = vi.fn(() => ({
    checkout: { sessions: { create: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
  }));
  return { default: MockStripe };
});

// ---------------------------------------------------------------------------
// Mock viem / evm.ts to avoid real RPC calls
// ---------------------------------------------------------------------------
vi.mock("../src/wallet/evm.js", () => ({
  createViemClient: vi.fn(() => ({
    getBlockNumber: vi.fn().mockResolvedValue(1000n),
    getLogs: vi.fn().mockResolvedValue([]),
  })),
  watchUsdcTransfer: vi.fn().mockResolvedValue({ stop: vi.fn() }),
}));

import { paymentRoutes } from "../src/routes/payments.js";
import { usdcPaymentManager } from "../src/wallet/usdc.js";
import { watchUsdcTransfer } from "../src/wallet/evm.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = Fastify({ logger: false });
  app.register(sensible);
  app.register(paymentRoutes);
  return app;
}

const FAKE_MASTER_KEY =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

// ---------------------------------------------------------------------------
// POST /payments/crypto/initiate
// ---------------------------------------------------------------------------

describe("POST /payments/crypto/initiate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WALLET_PRIVATE_KEY = FAKE_MASTER_KEY;
  });

  afterEach(() => {
    delete process.env.WALLET_PRIVATE_KEY;
  });

  it("returns 503 when WALLET_PRIVATE_KEY is not set", async () => {
    delete process.env.WALLET_PRIVATE_KEY;
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/payments/crypto/initiate",
      payload: { user_id: "u_crypto_1" },
    });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error).toMatch(/not configured/i);
  });

  it("returns 400 when user_id is missing", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/payments/crypto/initiate",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 200 with deposit address and amount when configured", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/payments/crypto/initiate",
      payload: { user_id: "u_crypto_2" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.deposit_address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(body.amount_usdc).toBe("0.10");
    expect(body.network).toBe("Base");
    expect(body.usdc_contract).toMatch(/^0x/);
    expect(body.expires_at).toBeTruthy();
    expect(body.retrieve_key_url).toContain("/payments/crypto/key");
  });

  it("starts a Transfer watcher on initiation", async () => {
    const app = buildApp();
    await app.inject({
      method: "POST",
      url: "/payments/crypto/initiate",
      payload: { user_id: "u_crypto_watcher" },
    });
    expect(watchUsdcTransfer).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /payments/crypto/verify
// ---------------------------------------------------------------------------

describe("POST /payments/crypto/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WALLET_PRIVATE_KEY = FAKE_MASTER_KEY;
  });

  afterEach(() => {
    delete process.env.WALLET_PRIVATE_KEY;
  });

  it("returns 400 for an invalid Ethereum address", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/payments/crypto/verify",
      payload: { deposit_address: "not-an-address" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown deposit address", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/payments/crypto/verify",
      payload: { deposit_address: "0x" + "b".repeat(40) },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found/i);
  });

  it("returns 200 with pending status for an active session", async () => {
    const app = buildApp();

    // Create a session first so the manager knows about this deposit address.
    const initRes = await app.inject({
      method: "POST",
      url: "/payments/crypto/initiate",
      payload: { user_id: "u_verify_test" },
    });
    const { deposit_address } = JSON.parse(initRes.body);

    const verifyRes = await app.inject({
      method: "POST",
      url: "/payments/crypto/verify",
      payload: { deposit_address },
    });

    expect(verifyRes.statusCode).toBe(200);
    const body = JSON.parse(verifyRes.body);
    expect(body.status).toBe("pending");
    expect(body.deposit_address).toBe(deposit_address);
    expect(body.amount_usdc).toBe("0.10");
  });
});

// ---------------------------------------------------------------------------
// GET /payments/crypto/key
// ---------------------------------------------------------------------------

describe("GET /payments/crypto/key", () => {
  it("returns 400 when deposit_address is missing", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/payments/crypto/key",
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an address with no confirmed payment", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/payments/crypto/key?deposit_address=0x" + "c".repeat(40),
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not.*found/i);
  });

  it("returns the API key once a payment is confirmed (via handleTransfer)", async () => {
    // Simulate a confirmed transfer directly through the manager.
    const userId = "u_confirmed";
    const fakeAddress = "0x" + "d".repeat(40);
    const cryptoSessionId = `crypto_${fakeAddress.toLowerCase()}`;

    // Pre-seed the keyStore as if handleTransfer had fired and issued a key.
    const issuedKey = keyStore.issue(userId, cryptoSessionId);

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/payments/crypto/key?deposit_address=${fakeAddress}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.api_key).toBe(issuedKey);
    expect(body.api_key).toMatch(/^ga_/);

    // The key is now consumed — second call must 404.
    const res2 = await app.inject({
      method: "GET",
      url: `/payments/crypto/key?deposit_address=${fakeAddress}`,
    });
    expect(res2.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// UsdcPaymentManager unit tests
// ---------------------------------------------------------------------------

describe("usdcPaymentManager.handleTransfer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WALLET_PRIVATE_KEY = FAKE_MASTER_KEY;
  });

  afterEach(() => {
    delete process.env.WALLET_PRIVATE_KEY;
  });

  it("issues an API key when the correct USDC amount is transferred", async () => {
    const { depositAddress } = await usdcPaymentManager.createSession(
      "u_transfer_ok",
    );

    const cryptoSessionId = usdcPaymentManager.handleTransfer(
      depositAddress,
      100_000n, // exactly 0.10 USDC
    );

    expect(cryptoSessionId).toBeTruthy();
    expect(cryptoSessionId).toMatch(/^crypto_0x/);

    // The key must now be retrievable from the store.
    const apiKey = keyStore.retrieveForSession(cryptoSessionId!);
    expect(apiKey).toBeTruthy();
    expect(apiKey).toMatch(/^ga_/);
    expect(keyStore.validate(apiKey!)).toBe(true);
  });

  it("does not issue a key when the transfer amount is insufficient", async () => {
    const { depositAddress } = await usdcPaymentManager.createSession(
      "u_transfer_low",
    );

    const result = usdcPaymentManager.handleTransfer(
      depositAddress,
      50_000n, // only 0.05 USDC — underpayment
    );

    expect(result).toBeNull();
  });

  it("accepts transfers that exceed the expected amount (overpayment)", async () => {
    const { depositAddress } = await usdcPaymentManager.createSession(
      "u_transfer_over",
    );

    const result = usdcPaymentManager.handleTransfer(
      depositAddress,
      200_000n, // 0.20 USDC — overpayment still accepted
    );

    expect(result).toBeTruthy();
  });

  it("returns null for an unknown deposit address", () => {
    const unknown = "0x" + "e".repeat(40) as `0x${string}`;
    const result = usdcPaymentManager.handleTransfer(unknown, 100_000n);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 402 response includes both card and crypto options
// ---------------------------------------------------------------------------

describe("x402 middleware — crypto option in 402 response", () => {
  beforeEach(() => {
    process.env.WALLET_PRIVATE_KEY = FAKE_MASTER_KEY;
  });

  afterEach(() => {
    delete process.env.WALLET_PRIVATE_KEY;
  });

  it("includes crypto payment option when WALLET_PRIVATE_KEY is set", async () => {
    // Import chat routes lazily to avoid Fastify plugin scoping issues.
    const { chatRoutes } = await import("../src/routes/chat.js");
    const app = Fastify({ logger: false });
    app.register(sensible);
    app.register(chatRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/chat",
      payload: { user_id: "u_402", message: "find me a burger", location: "NYC" },
    });

    // Without an API key the middleware returns 402.
    expect(res.statusCode).toBe(402);
    const body = JSON.parse(res.body);
    expect(body.payment.card).toBeTruthy();
    expect(body.payment.crypto).toBeTruthy();
    expect(body.payment.crypto.network).toBe("Base");
    expect(body.payment.crypto.token).toBe("USDC");
  });
});
