import { config, isStreamEnabled } from "./config.js";

function mask(value: string): string {
  if (value.length === 0) return "(not set)";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)} (set)`;
}

/** Logs contest-backend env at startup (secrets masked). */
export function logContestBackendEnv(): void {
  console.log("[contest-backend] Environment (from contest-backend/.env):");
  console.log(`  CONTEST_PORT=${config.port}`);
  console.log(`  CONTEST_CORS_ORIGIN=${config.corsOrigin}`);
  console.log(`  CONTEST_SESSION_TTL_MS=${config.sessionTtlMs}`);
  console.log(`  CONTEST_WORD_COUNT=${config.wordCount}`);
  console.log(`  CONTEST_CHUNK_SIZE=${config.chunkSize}`);
  console.log(`  STREAM_API_KEY=${mask(config.streamApiKey)}`);
  console.log(`  STREAM_API_SECRET=${mask(config.streamApiSecret)}`);
  console.log(`  STREAM_WEBHOOK_SECRET=${mask(config.streamWebhookSecret)}`);
  console.log(
    `  transport=${isStreamEnabled() ? "stream.io (+ HTTP validate)" : "websocket fallback (+ HTTP validate)"}`,
  );
  console.log(
    "[contest-backend] Frontend should set CONTEST_BACKEND_URL=http://localhost:" +
      config.port +
      " in the repo root .env (used by Vite env-config).",
  );
}
