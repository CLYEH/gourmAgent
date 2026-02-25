# gourmAgent

An AI-powered restaurant discovery agent that learns your food preferences and recommends restaurants you'll love. Monetized via micropayments (x402 protocol) with support for both crypto (on-chain USDC) and traditional card payments.

## Phase 1 — MVP (current)

A working restaurant agent: send a message, get back ranked recommendations based on your saved preferences.

### Quick start

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

### Architecture

```
Client → TypeScript API Gateway (Fastify, port 3000)
             ↓ POST /run
         Python Agent (FastAPI, port 8000)
             ↓ tool calls
         Google Places API + SQLite preference store
```

| Layer | Language | Purpose |
|---|---|---|
| `packages/api` | TypeScript (Fastify) | HTTP gateway, input validation, future payment middleware |
| `packages/agent` | Python (FastAPI + Anthropic SDK) | LLM agent loop, Google Places tools, preference memory |
| `packages/shared/schemas` | JSON Schema | Shared request/response contract |

### Development

```bash
# Python agent
cd packages/agent
pip install -e ".[dev]"
cp .env.example .env   # fill in keys
uvicorn gourmAgent.server:app --reload

# TypeScript gateway (separate terminal)
cd packages/api
pnpm install
pnpm dev
```

### Tests

```bash
# Python
cd packages/agent
pytest

# TypeScript
cd packages/api
pnpm test
```

## Roadmap

| Phase | Status | Description |
|---|---|---|
| 1 | ✅ Done | Working restaurant agent (no payments) |
| 2 | Planned | x402 payment gating + Stripe card payments |
| 3 | Planned | On-chain USDC (Base) + justpay chainless USDC |

## Features (planned)

1. **x402 micropayments** — pay-per-use API key access via the x402 micropayment protocol
2. **Restaurant discovery agent** — conversational AI that finds restaurants matching user taste preferences
3. **Built-in crypto wallet** — on-chain transaction support for payments
4. **Payment flexibility** — traditional card payments _or_ chainless USDC via justpay
