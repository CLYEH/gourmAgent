import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { chatRoutes } from "../src/routes/chat.js";

// ---------------------------------------------------------------------------
// Mock undici fetch so tests don't hit real network
// ---------------------------------------------------------------------------
vi.mock("undici", () => ({
  fetch: vi.fn(),
}));

import { fetch } from "undici";
const mockFetch = fetch as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = Fastify({ logger: false });
  app.register(sensible);
  app.register(chatRoutes);
  return app;
}

const validBody = {
  user_id: "u1",
  message: "Find me ramen in SF",
  location: "San Francisco, CA",
};

const agentSuccessPayload = {
  response: "Here are 3 great ramen spots in San Francisco!",
  tool_calls: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("proxies a valid request to the Python agent and returns 200", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => agentSuccessPayload,
    });

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/chat",
      payload: validBody,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.response).toBe(agentSuccessPayload.response);
    expect(Array.isArray(body.tool_calls)).toBe(true);
  });

  it("returns 400 for a missing required field", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/chat",
      payload: { user_id: "u1", message: "Find me ramen" }, // missing location
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 502 when the Python agent is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/chat",
      payload: validBody,
    });

    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Agent service unavailable");
  });

  it("returns 502 when the agent returns a non-ok status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/chat",
      payload: validBody,
    });

    expect(res.statusCode).toBe(502);
  });
});

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ status: "ok" });
  });
});
