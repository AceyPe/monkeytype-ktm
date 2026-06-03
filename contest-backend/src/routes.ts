import { Router } from "express";
import { z } from "zod";
import { config, isStreamEnabled } from "./config.js";
import { handleKeystroke } from "./keystroke-handler.js";
import {
  createSession,
  finishSession,
  getSession,
  getWordChunkForSession,
} from "./session-store.js";
import {
  ensureContestChannel,
  getStreamServerClient,
} from "./stream-client.js";

const router = Router();

const sessionBodySchema = z.object({
  userId: z.string().min(1).optional(),
});

const finishBodySchema = z.object({
  userId: z.string().min(1).optional(),
});

const streamKeystrokeEventSchema = z.object({
  type: z.literal("contest_keystroke"),
  traceId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  contest_session_id: z.string().uuid().optional(),
  user_id: z.string().min(1).optional(),
  user: z.object({ id: z.string().min(1) }).optional(),
  char: z.string().length(1),
  seq: z.number().int().nonnegative(),
});

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    stream: isStreamEnabled(),
    transport: isStreamEnabled() ? "stream.io" : "websocket",
  });
});

router.post("/session", async (req, res) => {
  const parsedBody = sessionBodySchema.safeParse(req.body);
  const userId =
    parsedBody.success && parsedBody.data.userId !== undefined
      ? parsedBody.data.userId
      : crypto.randomUUID();

  const session = createSession(userId);
  const streamClient = getStreamServerClient();
  let streamToken: string | undefined;
  let streamApiKey: string | undefined;

  if (streamClient !== null) {
    await streamClient.upsertUser({ id: userId });
    streamApiKey = config.streamApiKey;
    streamToken = streamClient.createToken(userId);
    await ensureContestChannel(session.traceId, userId, session.channelId);
  }

  res.json({
    traceId: session.traceId,
    userId,
    channelId: session.channelId,
    streamApiKey,
    streamToken,
    transport: streamClient !== null ? "stream.io" : "websocket",
    chunkSize: config.chunkSize,
    totalWords: session.trace.words.length,
    durationSeconds: 60,
  });
});

router.get("/trace/:traceId/chunk/:chunkIndex", (req, res) => {
  const schema = z.object({
    traceId: z.string().uuid(),
    chunkIndex: z.coerce.number().int().nonnegative(),
    userId: z.string().min(1),
  });

  const parsed = schema.safeParse({
    traceId: req.params.traceId,
    chunkIndex: req.params.chunkIndex,
    userId: req.query["userId"],
  });

  if (!parsed.success) {
    res.status(400).json({ error: "Invalid chunk request" });
    return;
  }

  const chunk = getWordChunkForSession(
    parsed.data.traceId,
    parsed.data.userId,
    parsed.data.chunkIndex,
  );

  if (chunk === null) {
    res.status(404).json({ error: "Trace not found" });
    return;
  }

  res.json(chunk);
});

router.post("/keystroke", (req, res) => {
  const schema = z.object({
    traceId: z.string().uuid(),
    userId: z.string().min(1),
    char: z.string().length(1),
    seq: z.number().int().nonnegative(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid keystroke payload" });
    return;
  }

  const session = getSession(parsed.data.traceId);
  if (session === undefined || session.userId !== parsed.data.userId) {
    res.status(404).json({ error: "Trace not found" });
    return;
  }

  const ack = handleKeystroke(parsed.data);
  if (ack === null) {
    res.status(409).json({ error: "Trace unavailable" });
    return;
  }

  res.json(ack);
});

router.post("/trace/:traceId/finish", (req, res) => {
  const traceIdResult = z.string().uuid().safeParse(req.params.traceId);
  if (!traceIdResult.success) {
    res.status(400).json({ error: "Invalid trace id" });
    return;
  }

  const parsedBody = finishBodySchema.safeParse(req.body);
  const userId =
    parsedBody.success && parsedBody.data.userId !== undefined
      ? parsedBody.data.userId
      : undefined;

  const session = finishSession(traceIdResult.data);

  if (session === null) {
    res.status(404).json({ error: "Trace not found" });
    return;
  }

  if (userId !== undefined && session.userId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json({
    traceId: session.traceId,
    errors: session.validator.errors,
    totalKeypresses: session.validator.totalKeypresses,
    trustedKeypresses: session.validator.trustedKeypresses,
    wordIndex: session.validator.wordIndex,
  });
});

/** Stream Chat webhook: custom contest_keystroke events from the client. */
router.post("/webhooks/stream", async (req, res) => {
  if (!isStreamEnabled()) {
    res.status(503).json({ error: "Stream is not configured" });
    return;
  }

  const events = Array.isArray(req.body) ? req.body : [req.body];

  for (const event of events) {
    const parsed = streamKeystrokeEventSchema.safeParse(event);
    if (!parsed.success) continue;

    const traceId =
      parsed.data.traceId ??
      parsed.data.contest_session_id ??
      parsed.data.sessionId;
    const userId = parsed.data.user?.id ?? parsed.data.user_id;

    if (traceId === undefined || userId === undefined) continue;

    handleKeystroke({
      traceId,
      userId,
      char: parsed.data.char,
      seq: parsed.data.seq,
    });
  }

  res.status(200).json({ ok: true });
});

export default router;
