# CLAUDE.md — gourmAgent

> This file provides guidance for AI assistants (Claude and others) working in this repository.

## Project Overview

**gourmAgent** is an AI-powered restaurant discovery agent that helps users find restaurants they will enjoy. The project aims to integrate micropayments and on-chain transactions to handle API key monetization and user payments.

### Core Concept

A conversational agent that learns user food preferences and recommends restaurants, monetized via micropayments (x402 protocol) and supporting both crypto (on-chain USDC) and traditional card payments.

---

## Current State

**Phase: 1 complete — MVP working restaurant agent (no payments)**

### Stack (decided)

| Concern | Choice |
|---|---|
| Agent framework | Anthropic Python SDK (custom agentic loop) |
| Language | Python (agent) + TypeScript (API gateway) |
| Restaurant APIs | Google Places API |
| Database | SQLite via SQLAlchemy 2.0 |
| API gateway | Fastify (Node.js) |
| Package manager (TS) | pnpm workspaces |
| Package manager (Py) | uv / hatchling |

### Planned Features

1. **x402 micropayments** — pay-per-use API key access via the x402 micropayment protocol (Phase 2)
2. **Restaurant discovery agent** — conversational AI that finds restaurants matching user taste preferences ✅ Phase 1
3. **Built-in crypto wallet** — on-chain transaction support for payments (Phase 3)
4. **Payment flexibility** — traditional card payments _or_ chainless USDC via justpay (Phase 2/3)

---

## Repository Structure

```
gourmAgent/
├── .env.example                        # All env vars documented here (never commit .env)
├── .gitignore
├── docker-compose.yml                  # Run both services locally
├── pnpm-workspace.yaml
├── CLAUDE.md                           # This file
├── README.md
├── PLAN.md                             # Full project roadmap
└── packages/
    ├── agent/                          # Python — AI agent core
    │   ├── Dockerfile
    │   ├── pyproject.toml
    │   ├── src/gourmAgent/
    │   │   ├── agent.py                # Agentic loop (Anthropic SDK)
    │   │   ├── server.py               # FastAPI server  POST /run
    │   │   ├── tools/
    │   │   │   ├── places.py           # Google Places API tool
    │   │   │   └── prefs.py            # Preference read/write tool
    │   │   └── memory/
    │   │       └── store.py            # SQLAlchemy models (User, Preference)
    │   └── tests/
    │       └── test_agent.py
    ├── api/                            # TypeScript — API gateway
    │   ├── Dockerfile
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── src/
    │   │   ├── server.ts               # Fastify entry point
    │   │   └── routes/
    │   │       └── chat.ts             # POST /chat → proxies to Python agent
    │   └── tests/
    │       └── chat.test.ts
    └── shared/
        └── schemas/
            └── chat.json               # JSON Schema for ChatRequest / ChatResponse
```

---

## Development Workflow

### Branch Strategy

- **`main`** / **`master`** — stable, reviewed code only
- **`claude/<feature>-<id>`** — branches used by AI assistants (e.g., `claude/add-claude-documentation-DTymn`)
- Feature branches should be short-lived and merged via pull request

### Commit Style

Use clear, imperative commit messages:

```
add restaurant search module with Yelp API integration
fix: handle empty preference list in agent planner
feat: x402 micropayment middleware for API key validation
```

### Before Pushing

1. Ensure no secrets or API keys are committed (use environment variables)
2. Run linter and tests if they exist
3. Push to the designated feature branch: `git push -u origin <branch-name>`

---

## Key Conventions

### Security

- **Never commit API keys, wallet private keys, or secrets** — use `.env` files (add to `.gitignore`) or a secrets manager
- Validate all external inputs before passing to the agent or payment systems
- Payment flows must be audited carefully — treat all transaction code as high-risk

### Payments Architecture

- **x402** handles micropayment gating for API access (HTTP 402 Payment Required flow)
- **On-chain USDC** (chainless / justpay) for user-facing crypto payments
- **Card payments** as a fallback for non-crypto users
- Keep payment providers behind an interface/abstraction so they are swappable

### Agent Design

- Prefer a modular agent design: separate planning, tool-calling, and memory layers
- Store user preferences in a persistent, privacy-respecting store (ask user consent)
- Restaurant data should come from well-supported APIs (Yelp Fusion, Google Places, Foursquare, etc.)

### Language / Stack (TBD)

No stack has been chosen yet. When starting implementation, consider:

| Concern | Options |
|---|---|
| Agent framework | LangChain, LlamaIndex, custom Claude SDK agent |
| Language | TypeScript (Node) or Python |
| Payments | x402-js / x402-py, viem / ethers.js for on-chain |
| Restaurant APIs | Yelp Fusion, Google Places |
| Database | Postgres, SQLite, or a vector DB for preference embeddings |

Update this file once the stack is decided.

---

## Working with AI Assistants

- Update this `CLAUDE.md` file whenever significant architectural decisions are made
- Keep the "Current State" section up to date as the project evolves
- When adding new modules, document their purpose and key conventions here
- Prefer small, focused pull requests over large monolithic changes

---

## Getting Started

```bash
# Clone
git clone <repo-url>
cd gourmAgent

# Copy and fill env vars
cp .env.example .env
# Edit .env: add ANTHROPIC_API_KEY and GOOGLE_PLACES_API_KEY

# ── Option A: Docker (recommended) ──────────────────────────
docker compose up

# ── Option B: Local dev ──────────────────────────────────────
# Python agent
cd packages/agent
pip install -e ".[dev]"   # or: uv pip install -e ".[dev]"
uvicorn gourmAgent.server:app --reload --port 8000

# TypeScript gateway (separate terminal)
cd packages/api
pnpm install
pnpm dev   # runs on port 3000

# Test a query
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u1","message":"Find me ramen in SF","location":"San Francisco, CA"}'

# Run tests
cd packages/agent && pytest
cd packages/api   && pnpm test
```

---

*Last updated: 2026-02-25 — Phase 1 implemented*
