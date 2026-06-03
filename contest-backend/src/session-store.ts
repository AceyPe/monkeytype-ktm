import {
  createValidatorState,
  validateKeystroke,
  type ContestValidatorState,
} from "@monkeytype/contest-validation";
import {
  createTrace,
  getWordChunk,
  type ContentTrace,
} from "@monkeytype/test-content";
import { config } from "./config.js";

export type ContestSession = {
  traceId: string;
  userId: string;
  channelId: string;
  trace: ContentTrace;
  validator: ContestValidatorState;
  createdAt: number;
  finished: boolean;
  lastProcessedSeq: number;
};

const sessions = new Map<string, ContestSession>();
const traces = new Map<string, ContentTrace>();

function pruneExpired(): void {
  const cutoff = Date.now() - config.sessionTtlMs;
  for (const [id, session] of sessions) {
    if (session.createdAt < cutoff) {
      sessions.delete(id);
      traces.delete(session.traceId);
    }
  }
}

export function createSession(userId: string): ContestSession {
  pruneExpired();
  const traceId = crypto.randomUUID();
  const trace = createTrace({
    traceId,
    mode: "time",
    language: "english_10k",
    wordCount: config.wordCount,
    contestSafe: true,
  });
  traces.set(traceId, trace);

  const session: ContestSession = {
    traceId,
    userId,
    channelId: `contest-${traceId}`,
    trace,
    validator: createValidatorState(trace.words),
    createdAt: Date.now(),
    finished: false,
    lastProcessedSeq: -1,
  };
  sessions.set(traceId, session);
  return session;
}

export function getSession(traceId: string): ContestSession | undefined {
  pruneExpired();
  return sessions.get(traceId);
}

export function getTrace(traceId: string): ContentTrace | undefined {
  pruneExpired();
  return traces.get(traceId);
}

export function getWordChunkForSession(
  traceId: string,
  userId: string,
  chunkIndex: number,
): ReturnType<typeof getWordChunk> | null {
  const session = getSession(traceId);
  if (session === undefined || session.userId !== userId) return null;
  return getWordChunk(session.trace, chunkIndex, config.chunkSize);
}

export function processKeystroke(
  traceId: string,
  char: string,
  seq: number,
): {
  correct: boolean;
  seq: number;
  errors: number;
  wordIndex: number;
  finished: boolean;
} | null {
  const session = getSession(traceId);
  if (session === undefined || session.finished) return null;

  if (seq <= session.lastProcessedSeq) {
    return {
      correct: true,
      seq,
      errors: session.validator.errors,
      wordIndex: session.validator.wordIndex,
      finished: session.finished,
    };
  }
  session.lastProcessedSeq = seq;

  const result = validateKeystroke(session.validator, char);
  session.validator = result.state;

  return {
    correct: result.correct,
    seq,
    errors: session.validator.errors,
    wordIndex: session.validator.wordIndex,
    finished: session.finished,
  };
}

export function finishSession(traceId: string): ContestSession | null {
  const session = getSession(traceId);
  if (session === undefined) return null;
  session.finished = true;
  return session;
}
