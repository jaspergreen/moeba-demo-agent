# Moeba Demo Agent

A reference implementation for building AI agents that integrate with [Moeba](https://moeba.co.za) — the communication channel for AI agents.

This agent demonstrates every Moeba capability: Gmail/Calendar/Outlook via proxy, OAuth connect flow, multi-step workflows, secure input, operator escalation, and contact resolution.

## Features

- **Model-agnostic** — Swap between Gemini, GPT-4o, Claude with a single env var
- **Database-agnostic** — Ships with in-memory storage; swap to any DB by implementing one interface
- **Gmail & Calendar** — Search, read, send emails; list and create calendar events
- **Microsoft Outlook** — Search, read, send Outlook emails
- **Contact resolution** — Look up contacts by name from sent mail history
- **Zero token management** — Moeba owns OAuth tokens; agent calls proxy endpoints via the SDK
- **OAuth flow** — Agent shows connect button → user authorizes → Moeba notifies agent → agent continues task
- **Moeba SDUI** — Workflows, OAuth buttons, secure input, operator escalation

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in your environment variables
cp .env.example .env

# 3. Start the dev server
npm run dev
```

Then in the [Moeba admin dashboard](https://admin.moeba.co.za):
1. Set your agent's webhook URL to `https://your-server/webhook`
2. Generate an agent API key (needed for proxy tools)
3. Invite a user to connect
4. Chat with the agent in the Moeba app

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_PROVIDER` | No | `google` (default), `openai`, or `anthropic` |
| `AI_MODEL` | No | Override default model (e.g. `gpt-4o`, `claude-sonnet-4-20250514`) |
| `GEMINI_API_KEY` | If google | Google AI Studio API key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | If google | Same key (required by @ai-sdk/google) |
| `OPENAI_API_KEY` | If openai | OpenAI API key |
| `ANTHROPIC_API_KEY` | If anthropic | Anthropic API key |
| `MOEBA_WEBHOOK_SECRET` | Yes | From Moeba admin dashboard |
| `MOEBA_API_KEY` | Yes | Agent API key (`mba_...`) for proxy tools and proactive messaging |
| `MOEBA_BASE_URL` | No | Moeba API URL (defaults to production) |
| `PORT` | No | Server port (default: 3001) |

## Architecture

```
User (Moeba App)
    ↕ JSON-RPC + HMAC
Moeba Server
    ↕ JSON-RPC + HMAC          ↕ OAuth tokens (owned by Moeba)
This Agent (Fastify)           Google/Microsoft APIs
    → Vercel AI SDK              ↑
    → MoebaClient.proxy() ───→ Moeba Proxy ───→ Gmail, Calendar, Outlook
    → StorageAdapter (history)
```

### Key Design Patterns

**Moeba Proxy** — The agent never touches OAuth tokens. It calls `moeba.searchEmail()`, `moeba.getCalendar()`, etc. via the SDK. Moeba handles token storage, refresh, and API calls. If the user hasn't connected, the proxy returns `not_connected` and the agent shows an OAuth button.

**StorageAdapter** — All persistence goes through a single interface (`src/storage/adapter.ts`). The in-memory adapter works out of the box. To use a real database, implement the interface and swap one line in `src/index.ts`.

**ToolContext** — Tools can't directly attach UI components to the AI SDK response. Instead, they push components onto `toolCtx.pendingComponents`, and the handler attaches them to the final JSON-RPC response after the agent loop completes.

**OAuth Continuation** — When a user connects an OAuth provider, Moeba sends an `oauth_complete` action to the agent. The agent runs the LLM with the conversation history so it can continue the user's original task (e.g. "fetch my email" → connect → auto-fetch after connect).

**Structured Search** — Email search uses structured parameters (`keywords`, `from`, `subject`, `newer_than`) instead of raw Gmail/Outlook query syntax. The proxy builds the platform-specific query.

**Contact Resolution** — Before sending email, the agent can look up contacts by name using `moeba.getContacts()`. This scans the user's sent mail to find real people (excludes noreply/spam addresses).

## Project Structure

```
src/
  index.ts              # Fastify server + webhook route
  agent.ts              # Vercel AI SDK agent loop
  handler.ts            # Moeba A2A protocol handler (messages, actions, OAuth continuation)
  config.ts             # Environment config + model selection
  system-prompt.ts      # Agent personality and instructions

  storage/
    adapter.ts          # StorageAdapter interface (implement for any DB)
    memory.ts           # In-memory adapter (default, data lost on restart)
    types.ts            # Conversation message types

  tools/
    context.ts          # ToolContext (pending components side-channel)
    moeba.ts            # MoebaClient singleton
    gmail.ts            # Gmail search, read, send, contacts (via proxy)
    calendar.ts         # Google Calendar list, create (via proxy)
    office365.ts        # Outlook search, read, send (via proxy)
    demo.ts             # Workflow demos, OAuth buttons, secret input, escalation
```

## Proxy Tools (via moeba-sdk)

The agent uses `MoebaClient` from `moeba-sdk` to access user data. No direct API calls, no token management.

```typescript
const moeba = new MoebaClient({ apiKey: 'mba_...', baseUrl: '...' });

// Search email with structured params
const results = await moeba.searchEmail(connectionId, {
  keywords: ['invoice', 'payment'],
  from: 'accounting',
  newer_than: '30d',
});

// Read full email
const email = await moeba.readEmail(connectionId, { messageId: '...', platform: 'gmail' });

// Send email
await moeba.sendEmail(connectionId, { to: 'user@example.com', subject: '...', body: '...' });

// Calendar
const events = await moeba.getCalendar(connectionId, { maxResults: 10 });
await moeba.createCalendarEvent(connectionId, { summary: '...', startTime: '...', endTime: '...' });

// Contact lookup (from sent mail, excludes spam)
const contacts = await moeba.getContacts(connectionId, { search: 'dana' });

// Check connections
const info = await moeba.getConnections(connectionId);
```

### Error Handling

The SDK only throws `MoebaApiError` for OAuth errors (`not_connected`, `token_expired`). All other errors (validation, API errors) are returned as `{ error, message }` so the LLM can self-correct.

```typescript
try {
  const result = await moeba.searchEmail(connectionId, { keywords: ['test'] });
  if ('error' in result) return `Error: ${result.message}`; // LLM sees this and adjusts
  // ... use result.messages
} catch (err) {
  if (err instanceof MoebaApiError && err.needsOAuth) {
    // Show OAuth connect button
    return promptConnect(toolCtx);
  }
}
```

## Implementing a Custom Storage Adapter

```typescript
import type { StorageAdapter } from './storage/adapter.js';

class PostgresAdapter implements StorageAdapter {
  async getHistory(sessionId) { /* SELECT FROM messages WHERE ... ORDER BY timestamp */ }
  async appendHistory(sessionId, messages) { /* INSERT INTO messages ... */ }
  async clearHistory(sessionId) { /* DELETE FROM messages WHERE ... */ }
  async get(key) { /* SELECT FROM kv WHERE key = ... */ }
  async set(key, value) { /* UPSERT INTO kv ... */ }
  async del(key) { /* DELETE FROM kv WHERE key = ... */ }
}

// In index.ts, swap one line:
const storage = new PostgresAdapter(pool);
```

## Deployment

### Google Cloud Run

```bash
# From the repo root:
gcloud builds submit --config examples/demo-agent/cloudbuild.yaml

# Then set env vars:
gcloud run services update moeba-demo-agent --region africa-south1 \
  --update-env-vars "GOOGLE_GENERATIVE_AI_API_KEY=...,MOEBA_WEBHOOK_SECRET=...,MOEBA_API_KEY=...,MOEBA_BASE_URL=https://moeba-api-999642860678.africa-south1.run.app"
```

### Local Development

```bash
# Run as part of the full Moeba stack:
npm run dev:all:local   # Starts API + demo agent + admin + mobile

# Or standalone:
cd examples/demo-agent && npm run dev
```

## License

MIT
