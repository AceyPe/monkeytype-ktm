# Contest backend

Isolated API for `/contest` typing validation.

## Run locally

```bash
pnpm install
pnpm dev-contest-be
```

Without Stream.io credentials, keystrokes use a native WebSocket at `ws://localhost:5050/ws`.

With [Stream Chat](https://getstream.io/chat/) credentials, the client sends keystrokes over Stream’s WebSocket (`channel.sendEvent`) and receives trusted acknowledgements via HTTP (and optionally Stream user custom events).

Create **`contest-backend/.env`** (copy from `.env.example`). Persist these variables there:

| Variable | Required | Description |
|----------|----------|-------------|
| `CONTEST_PORT` | no (default `5050`) | HTTP + WS port |
| `CONTEST_CORS_ORIGIN` | no (default `http://localhost:3000`) | Frontend origin for CORS |
| `CONTEST_SESSION_TTL_MS` | no (default `3600000`) | Session TTL in ms |
| `CONTEST_WORD_COUNT` | no (default `300`) | Words in the contest trace |
| `CONTEST_CHUNK_SIZE` | no (default `40`) | Words per chunk (`GET /trace/:id/chunk/:n`) |
| `STREAM_API_KEY` | no | GetStream Chat API key; empty = local `/ws` fallback |
| `STREAM_API_SECRET` | no | GetStream Chat API secret |
| `STREAM_WEBHOOK_SECRET` | no | Optional webhook signature verification |

Also add to the **repo root `.env`** (for the frontend via Vite):

```
CONTEST_BACKEND_URL=http://localhost:5050
```

`pnpm dev` (root) starts frontend, main backend, contest-backend, and package watchers.

Configure a Stream webhook pointing to `POST /api/contest/webhooks/stream` for redundant server-side ingestion of `contest_keystroke` events.

## API (trace-based)

Word lists are **not** returned in `POST /api/contest/session`. The server keeps the canonical trace (`@monkeytype/test-content`) and validates keystrokes against it.

- `POST /api/contest/session` → `{ traceId, userId, channelId, chunkSize, totalWords, … }`
- `GET /api/contest/trace/:traceId/chunk/:index?userId=` → word chunk for display
- `POST /api/contest/keystroke` → `{ traceId, userId, char, seq }`
- `POST /api/contest/trace/:traceId/finish` → trusted stats

Practice mode uses the same package on the main backend: `POST /test-content/trace` and `GET /test-content/trace/:traceId/chunk/:index`.
