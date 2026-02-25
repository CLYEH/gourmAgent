import type { FastifyInstance } from "fastify";
import { fetch } from "undici";
import { z } from "zod";
import { x402Guard } from "../middleware/x402.js";

const ChatRequestSchema = z.object({
  user_id: z.string().min(1),
  message: z.string().min(1),
  location: z.string().min(1),
});

const ChatResponseSchema = z.object({
  response: z.string(),
  tool_calls: z.array(z.record(z.unknown())),
});

export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post("/chat", { onRequest: x402Guard }, async (request, reply) => {
    const parsed = ChatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const agentUrl = process.env.PYTHON_AGENT_URL ?? "http://localhost:8000";

    let agentResponse: Response;
    try {
      agentResponse = await fetch(`${agentUrl}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
    } catch (err) {
      fastify.log.error(err, "Failed to reach Python agent");
      return reply.status(502).send({ error: "Agent service unavailable" });
    }

    if (!agentResponse.ok) {
      const body = await agentResponse.text();
      fastify.log.error({ status: agentResponse.status, body }, "Agent returned error");
      return reply.status(502).send({ error: "Agent error", detail: body });
    }

    const raw = await agentResponse.json();
    const result = ChatResponseSchema.safeParse(raw);
    if (!result.success) {
      return reply.status(502).send({ error: "Unexpected agent response shape" });
    }

    return reply.status(200).send(result.data);
  });
}
