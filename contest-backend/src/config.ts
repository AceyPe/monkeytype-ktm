function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: envInt("CONTEST_PORT", 5050),
  corsOrigin: process.env["CONTEST_CORS_ORIGIN"] ?? "http://localhost:3000",
  streamApiKey: process.env["STREAM_API_KEY"] ?? "",
  streamApiSecret: process.env["STREAM_API_SECRET"] ?? "",
  streamWebhookSecret: process.env["STREAM_WEBHOOK_SECRET"] ?? "",
  sessionTtlMs: envInt("CONTEST_SESSION_TTL_MS", 3_600_000),
  wordCount: envInt("CONTEST_WORD_COUNT", 300),
  chunkSize: envInt("CONTEST_CHUNK_SIZE", 40),
};

export function isStreamEnabled(): boolean {
  return config.streamApiKey.length > 0 && config.streamApiSecret.length > 0;
}
