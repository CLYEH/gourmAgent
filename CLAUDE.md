# CLAUDE.md — gourmAgent

> This file provides guidance for AI assistants (Claude and others) working in this repository.

## Project Overview

**gourmAgent** is an AI-powered restaurant discovery agent that helps users find restaurants they will enjoy. The project aims to integrate micropayments and on-chain transactions to handle API key monetization and user payments.

### Core Concept

A conversational agent that learns user food preferences and recommends restaurants, monetized via micropayments (x402 protocol) and supporting both crypto (on-chain USDC) and traditional card payments.

---

## Current State

**Phase: Early Ideation**

The repository contains only a `README.md` with the initial idea list. No code has been written yet. All architectural decisions are open.

### Planned Features (from README)

1. **x402 micropayments** — pay-per-use API key access via the x402 micropayment protocol
2. **Restaurant discovery agent** — conversational AI that finds restaurants matching user taste preferences
3. **Built-in crypto wallet** — on-chain transaction support for payments
4. **Payment flexibility** — traditional card payments _or_ chainless USDC via justpay

---

## Repository Structure

```
gourmAgent/
├── README.md       # Project ideas and feature notes
└── CLAUDE.md       # This file (AI assistant guidance)
```

As the project grows, the expected structure is:

```
gourmAgent/
├── CLAUDE.md
├── README.md
├── package.json / pyproject.toml   # depending on chosen stack
├── src/
│   ├── agent/          # Core LLM agent logic
│   ├── payments/       # x402 + crypto wallet + card payment integrations
│   ├── restaurants/    # Restaurant search / recommendation logic
│   └── api/            # API layer (REST or GraphQL)
├── tests/
└── docs/
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

## Getting Started (Once Stack Is Chosen)

This section should be updated with actual setup steps once the project is initialized. Typical steps will include:

```bash
# Clone
git clone <repo-url>
cd gourmAgent

# Install dependencies
npm install   # or: pip install -e ".[dev]"

# Copy env template
cp .env.example .env
# Fill in API keys in .env

# Run tests
npm test   # or: pytest

# Start dev server
npm run dev   # or: python -m gourmAgent
```

---

*Last updated: 2026-02-25*
