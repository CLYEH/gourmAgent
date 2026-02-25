# gourmAgent — Full Project Roadmap Plan

## Context

gourmAgent is a greenfield AI-powered restaurant discovery agent. The README describes four ideas:
micropayments for API key access (x402), a restaurant recommendation agent, a crypto wallet for
on-chain payments, and support for both card and chainless USDC (justpay) payments. The user wants
a full project roadmap using **both TypeScript and Python**, with **Google Places API** as the
restaurant data source.

The repository currently has only `README.md` and `CLAUDE.md`. No code exists.

---

## Architecture Overview: Hybrid Monorepo

Use a **monorepo** with TypeScript and Python living side-by-side, each owning the domain it
excels at:

| Layer | Language | Rationale |
|---|---|---|
| AI agent core, preference learning | **Python** | Best LLM tooling (Anthropic SDK, LangChain), vector DB support |
| API gateway, payment middleware, web3 | **TypeScript (Node)** | Best x402, viem, Stripe ecosystem |
| Shared schemas/types | TypeScript + Python (kept in sync via JSON Schema) | Contract between services |

Communication between services: the TypeScript API gateway calls the Python agent over local HTTP
(FastAPI). In production they can be separate containers.

---

## Proposed Repository Structure

```
gourmAgent/
├── packages/
│   ├── agent/                    # Python — AI agent core
│   │   ├── src/gourmAgent/
│   │   │   ├── agent.py          # Main agent loop (Anthropic SDK)
│   │   │   ├── tools/
│   │   │   │   ├── places.py     # Google Places API tool
│   │   │   │   └── prefs.py      # Preference read/write tool
│   │   │   ├── memory/
│   │   │   │   └── store.py      # SQLite preference store (SQLAlchemy)
│   │   │   └── server.py         # FastAPI server (called by TS gateway)
│   │   ├── tests/
│   │   ├── pyproject.toml
│   │   └── .env.example
│   ├── api/                      # TypeScript — API gateway + payments
│   │   ├── src/
│   │   │   ├── server.ts         # Fastify server entry point
│   │   │   ├── middleware/
│   │   │   │   └── x402.ts       # x402 payment gating middleware
│   │   │   ├── routes/
│   │   │   │   ├── chat.ts       # POST /chat → proxies to Python agent
│   │   │   │   └── payments.ts   # Payment endpoints (card + crypto)
│   │   │   └── wallet/
│   │   │       ├── evm.ts        # viem wallet abstraction
│   │   │       └── usdc.ts       # USDC transfer detection
│   │   ├── tests/
│   │   └── package.json
│   └── shared/
│       └── schemas/
│           └── chat.json         # JSON Schema for request/response contract
├── .env.example                  # All env vars documented here
├── docker-compose.yml            # Runs both services locally
├── pnpm-workspace.yaml
├── README.md
└── CLAUDE.md                     # Update after each phase
```

---

## Environment Variables

All in `.env` (never commit):

```
# AI
ANTHROPIC_API_KEY=

# Restaurant Data
GOOGLE_PLACES_API_KEY=

# Payments — Card
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=

# Payments — Crypto
WALLET_PRIVATE_KEY=
RPC_URL=https://mainnet.base.org
USDC_CONTRACT_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

# Database
DATABASE_URL=sqlite:///./gourmAgent.db

# Services
PORT=3000
PYTHON_AGENT_URL=http://localhost:8000
```

---

## Phase 1 — MVP: Working Restaurant Agent (no payments)

**Goal**: A user can POST a message to the API and receive restaurant recommendations based on
their preferences.

### Files to Create

**Python agent** (`packages/agent/`):
- `src/gourmAgent/tools/places.py` — wraps `googlemaps` SDK; exposes `search_restaurants(query, location, radius)` and `get_details(place_id)` as Claude tools
- `src/gourmAgent/tools/prefs.py` — reads/writes user preference records; tools: `save_preference(user_id, liked, disliked)`, `get_preferences(user_id)`
- `src/gourmAgent/memory/store.py` — SQLAlchemy models: `User`, `Preference` (cuisine, price_range, dietary, liked_places, disliked_places)
- `src/gourmAgent/agent.py` — agentic loop using `anthropic` Python SDK with tool use; system prompt that instructs the model to ask about preferences, use tools, and return a ranked list
- `src/gourmAgent/server.py` — FastAPI with `POST /run` endpoint; accepts `{user_id, message, location}`, returns `{response, tool_calls}`

**TypeScript gateway** (`packages/api/`):
- `src/server.ts` — Fastify server
- `src/routes/chat.ts` — `POST /chat` that forwards to `PYTHON_AGENT_URL/run`

**Shared**:
- `packages/shared/schemas/chat.json` — defines `ChatRequest` and `ChatResponse` shapes

### Key Dependencies

```
# Python (pyproject.toml)
anthropic>=0.40
fastapi>=0.115
uvicorn[standard]
googlemaps
sqlalchemy>=2.0
pydantic>=2
python-dotenv

# TypeScript (package.json)
fastify
@fastify/sensible
undici   # fetch to Python agent
zod
```

### Tests — Phase 1
- Python: `pytest packages/agent/tests/` — mock Google Places API, assert agent returns structured results
- TypeScript: `vitest` — assert `/chat` proxies correctly and validates schema
- Manual: `curl -X POST http://localhost:3000/chat -d '{"user_id":"u1","message":"Find me a good ramen spot in SF","location":"San Francisco, CA"}'`

### Acceptance Criteria
- Agent responds with ≥3 ranked restaurant recommendations including name, address, rating
- Preferences are persisted across calls for the same `user_id`
- Both services start with `docker compose up`

---

## Phase 2 — Payments: x402 API Gating + Card

**Goal**: Unauthenticated requests return HTTP 402. Users pay with a card (Stripe) to receive an
API key; that key gates future requests.

### How x402 Works Here

1. Client hits `POST /chat` with no API key → TypeScript middleware returns `402 Payment Required`
   with a `Payment-Details` header (price, currency, payment URL)
2. Client POSTs to `POST /payments/card/create-session` → server creates a Stripe Checkout session,
   returns `redirect_url`
3. User completes Stripe checkout → Stripe webhook fires → server issues a signed API key and stores
   it in DB
4. Client retries `POST /chat` with `Authorization: Bearer <api-key>` → middleware validates key,
   allows through

### Files to Create / Modify

- `packages/api/src/middleware/x402.ts` — check for valid `Authorization` header; if missing/invalid, return 402 with payment details JSON
- `packages/api/src/routes/payments.ts` — Stripe Checkout session creation, webhook handler, API key issuance
- `packages/agent/src/gourmAgent/memory/store.py` — add `ApiKey` model (key_hash, user_id, created_at, expires_at, stripe_session_id)
- `.env.example` — add Stripe vars

### Key Dependencies (additions)

```
# TypeScript
stripe
@fastify/formbody
```

### Tests — Phase 2
- Unauthenticated request → assert 402 response with correct headers
- Stripe webhook simulation → assert API key created in DB
- Authenticated request with valid key → assert 200 pass-through

### Acceptance Criteria
- Unauthenticated users see a 402 with a link to pay
- After Stripe payment, user receives an API key via email (Stripe handles delivery)
- API key allows unlimited chat requests (or set a quota)

---

## Phase 3 — Crypto: On-Chain USDC + justpay

**Goal**: Users can also pay with USDC on Base (via viem) or chainless USDC (justpay) as an
alternative to Stripe.

### How On-Chain Payment Works

1. Server generates a one-time deposit address (or uses a deterministic address derived from session)
2. Client transfers USDC to that address on Base
3. Server watches for the transfer using `viem` event polling (or a webhook from justpay)
4. On confirmation, server issues an API key (same as Phase 2)

### Files to Create / Modify

- `packages/api/src/wallet/evm.ts` — viem `createPublicClient`, watch for `Transfer` events on USDC contract to the deposit address
- `packages/api/src/wallet/usdc.ts` — USDC-specific helpers: deposit address generation (HD wallet derivation), amount validation (price in USDC = price in USD via exchange rate oracle)
- `packages/api/src/routes/payments.ts` — add `POST /payments/crypto/initiate` (returns deposit address + amount) and `POST /payments/crypto/verify` (manual check endpoint)
- `packages/api/src/middleware/x402.ts` — update 402 response to include both Stripe and crypto payment options

### Key Dependencies (additions)

```
# TypeScript
viem
@justpay/sdk   # or justpay HTTP API
```

### Tests — Phase 3
- Mock viem event emission → assert API key issued on USDC transfer detection
- Invalid amount → no key issued
- justpay webhook → assert same flow as viem path

### Acceptance Criteria
- User can initiate a crypto payment and receive a deposit address
- Transfer of correct USDC amount triggers API key issuance (≤30s confirmation)
- Payment methods shown in 402 response: card (Stripe) and crypto (USDC)

---

## Monorepo Tooling Setup

| Tool | Purpose |
|---|---|
| `pnpm` + `pnpm-workspace.yaml` | TypeScript package management |
| `uv` (Python) | Python package management, virtual envs |
| `docker-compose.yml` | Run both services locally |
| `vitest` | TypeScript tests |
| `pytest` | Python tests |
| GitHub Actions | CI: lint + test on PR |

### `docker-compose.yml` (sketch)
```yaml
services:
  agent:
    build: packages/agent
    ports: ["8000:8000"]
    env_file: .env
  api:
    build: packages/api
    ports: ["3000:3000"]
    depends_on: [agent]
    env_file: .env
```

---

## Files to Create (Summary)

| File | Phase |
|---|---|
| `packages/agent/pyproject.toml` | 1 |
| `packages/agent/src/gourmAgent/tools/places.py` | 1 |
| `packages/agent/src/gourmAgent/tools/prefs.py` | 1 |
| `packages/agent/src/gourmAgent/memory/store.py` | 1 |
| `packages/agent/src/gourmAgent/agent.py` | 1 |
| `packages/agent/src/gourmAgent/server.py` | 1 |
| `packages/agent/tests/test_agent.py` | 1 |
| `packages/api/package.json` | 1 |
| `packages/api/src/server.ts` | 1 |
| `packages/api/src/routes/chat.ts` | 1 |
| `packages/shared/schemas/chat.json` | 1 |
| `docker-compose.yml` | 1 |
| `.env.example` | 1 |
| `packages/api/src/middleware/x402.ts` | 2 |
| `packages/api/src/routes/payments.ts` | 2 |
| `packages/api/src/wallet/evm.ts` | 3 |
| `packages/api/src/wallet/usdc.ts` | 3 |

Also update `README.md` and `CLAUDE.md` after each phase.

---

## Verification (End-to-End)

```bash
# 1. Copy and fill env vars
cp .env.example .env

# 2. Start services
docker compose up

# 3. Phase 1: unauthenticated agent query (no payments yet)
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test1","message":"I like spicy food, find me dinner in NYC","location":"New York, NY"}'
# Expected: 200 with restaurant recommendations

# 4. Phase 2: verify 402 gate
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test2","message":"Find me sushi"}'
# Expected: 402 with payment details

# 5. Phase 3: initiate crypto payment
curl -X POST http://localhost:3000/payments/crypto/initiate \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test2"}'
# Expected: {deposit_address, amount_usdc, expires_at}
```
