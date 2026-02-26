/**
 * x402 payment-gating middleware.
 *
 * Attaches to any route as an `onRequest` hook.  If the request carries a
 * valid `Authorization: Bearer <api-key>` header the request passes through.
 * Otherwise a 402 Payment Required response is returned with a JSON body
 * describing how to pay.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { keyStore } from "../keyStore.js";

export async function x402Guard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = request.headers.authorization;

  if (auth?.startsWith("Bearer ")) {
    const key = auth.slice(7);
    if (keyStore.validate(key)) return; // authorized — let request through
  }

  const base =
    process.env.API_BASE_URL ??
    `http://localhost:${process.env.PORT ?? 3000}`;

  const paymentOptions: Record<string, unknown> = {
    card: {
      create_session_url: `${base}/payments/card/create-session`,
      price_usd: 0.1,
      currency: "usd",
    },
  };

  // Include the crypto option only when the server is configured for it.
  if (process.env.WALLET_PRIVATE_KEY) {
    paymentOptions.crypto = {
      initiate_url: `${base}/payments/crypto/initiate`,
      network: "Base",
      token: "USDC",
      price_usdc: "0.10",
    };
  }

  return reply.status(402).send({
    error: "Payment Required",
    message:
      "A valid API key is required to use this endpoint. " +
      "Purchase one via one of the payment options below.",
    payment: paymentOptions,
  });
}
