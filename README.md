# gourmAgent

An AI-powered restaurant discovery agent that learns your food preferences and recommends restaurants you'll love. Monetized via micropayments (x402 protocol) with support for both crypto (on-chain USDC) and traditional card payments.

## Status — Phase 3 complete

| Phase | Status | Description |
|---|---|---|
| 1 | ✅ Done | Working restaurant agent (no payments) |
| 2 | ✅ Done | x402 payment gating + Stripe card payments |
| 3 | ✅ Done | On-chain USDC (Base network) via viem |

## Features

1. **Restaurant discovery agent** — conversational AI that finds restaurants matching your saved taste preferences
2. **x402 micropayments** — pay-per-use API key access via the x402 micropayment protocol
3. **Card payments** — traditional Stripe card payments as a fallback
4. **On-chain USDC** — deposit address per session, Transfer event polling on Base via viem

## Quick start

```bash
# 1. Copy and fill in env vars
cp .env.example .env

# 2. Start both services
docker compose up

# 3. Query the agent
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u1","message":"I love spicy food, find me dinner in NYC","location":"New York, NY"}'
```

## Architecture

```
Client → TypeScript API Gateway (Fastify, port 3000)
             ↓ x402 payment-gating middleware
             ↓ POST /run
         Python Agent (FastAPI, port 8000)
             ↓ tool calls
         Google Places API + SQLite preference store

Payment routes (port 3000):
  POST /payments/stripe   → Stripe card checkout
  POST /payments/crypto   → on-chain USDC deposit session (Base)
```

| Layer | Language | Purpose |
|---|---|---|
| `packages/api` | TypeScript (Fastify) | HTTP gateway, x402 middleware, Stripe + USDC payment routes |
| `packages/agent` | Python (FastAPI + Anthropic SDK) | LLM agent loop, Google Places tools, preference memory |
| `packages/shared/schemas` | JSON Schema | Shared request/response contract |

### Key modules

| Path | Description |
|---|---|
| `packages/api/src/middleware/x402.ts` | 402 payment-gating middleware |
| `packages/api/src/wallet/evm.ts` | viem public client + Transfer event poller |
| `packages/api/src/wallet/usdc.ts` | USDC deposit session manager |
| `packages/api/src/routes/payments.ts` | Stripe + on-chain USDC payment routes |
| `packages/agent/src/gourmAgent/agent.py` | Agentic loop (Anthropic SDK) |
| `packages/agent/src/gourmAgent/tools/places.py` | Google Places API tool |
| `packages/agent/src/gourmAgent/memory/store.py` | SQLAlchemy user preference store |

## Development

```bash
# Python agent
cd packages/agent
pip install -e ".[dev]"   # or: uv pip install -e ".[dev]"
cp .env.example .env      # fill in ANTHROPIC_API_KEY, GOOGLE_PLACES_API_KEY
uvicorn gourmAgent.server:app --reload --port 8000

# TypeScript gateway (separate terminal)
cd packages/api
pnpm install
pnpm dev   # runs on port 3000
```

## Tests

```bash
# Python
cd packages/agent
pytest

# TypeScript
cd packages/api
pnpm test
```

## Environment variables

See `.env.example` for all required variables. Never commit `.env` or any secrets.
