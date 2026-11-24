import type { ContentTrace } from "@monkeytype/test-content";
import { Router } from "express";
import { z } from "zod";
import {
  createPracticeTrace,
  getPracticeChunk,
} from "../../services/test-content-store.js";

const CHUNK_SIZE = 80;

const router = Router();

const createSchema = z.object({
  mode: z.enum(["time", "quote"]),
  language: z.string().min(1).optional(),
  wordCount: z.number().int().positive().optional(),
  quoteLengths: z.array(z.number().int()).optional(),
});

router.post("/trace", (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid trace request" });
    return;
  }

  try {
    const trace: ContentTrace = createPracticeTrace({
      mode: parsed.data.mode,
      language: parsed.data.language,
      wordCount: parsed.data.wordCount,
      quoteLengths: parsed.data.quoteLengths,
    });

    res.status(200).json({
      traceId: trace.traceId,
      mode: trace.mode,
      language: trace.language,
      totalWords: trace.words.length,
      chunkSize: CHUNK_SIZE,
      quote:
        trace.mode === "quote"
          ? {
              id: trace.quoteId,
              text: trace.quoteText,
              source: trace.quoteSource,
              length: trace.quoteLength,
            }
          : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Trace creation failed";
    res.status(500).json({ message });
  }
});

router.get("/trace/:traceId/chunk/:chunkIndex", (req, res) => {
  const schema = z.object({
    traceId: z.string().uuid(),
    chunkIndex: z.coerce.number().int().nonnegative(),
  });

  const parsed = schema.safeParse({
    traceId: req.params.traceId,
    chunkIndex: req.params.chunkIndex,
  });

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid chunk request" });
    return;
  }

  const chunk = getPracticeChunk(
    parsed.data.traceId,
    parsed.data.chunkIndex,
    CHUNK_SIZE,
  );

  if (chunk === null) {
    res.status(404).json({ message: "Trace not found" });
    return;
  }

  res.status(200).json(chunk);
});

export default router;
