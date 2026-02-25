import "dotenv/config";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import formbody from "@fastify/formbody";
import { chatRoutes } from "./routes/chat.js";
import { paymentRoutes } from "./routes/payments.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
});

await fastify.register(sensible);
await fastify.register(formbody);
await fastify.register(chatRoutes);
await fastify.register(paymentRoutes);

fastify.get("/health", async () => ({ status: "ok" }));

try {
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`gourmAgent API gateway listening on ${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
