import Fastify from 'fastify';
import { config } from './config.js';
import { createHandler } from './handler.js';
import { InMemoryAdapter } from './storage/memory.js';

// --- Storage ---
// Swap this one line to use any database:
//   import { FirebaseAdapter } from './storage/firebase.js';
//   const storage = new FirebaseAdapter(firebaseApp);
const storage = new InMemoryAdapter();

// --- Webhook handler ---
const handler = createHandler(storage);

// --- Fastify server ---
const app = Fastify({ logger: true });

// Parse raw body for HMAC signature verification
app.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  (_req, body, done) => done(null, body),
);

// Webhook endpoint — receives all Moeba A2A requests
app.post('/webhook', async (request, reply) => {
  const rawBody = request.body as string;
  const headers = request.headers as Record<string, string | undefined>;
  const response = await handler.handle(rawBody, headers);
  return reply.send(response);
});

// Health check
app.get('/health', async () => ({ status: 'ok', agent: 'Moeba Demo Agent' }));

// --- Start ---
const start = async () => {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`Moeba Demo Agent running on port ${config.port}`);
    console.log(`AI provider: ${config.aiProvider}`);
    console.log(`Proxy base URL: ${config.moeba.baseUrl}`);
    console.log(`Webhook endpoint: POST /webhook`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
