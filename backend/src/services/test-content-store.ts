import {
  createTrace,
  getWordChunk,
  type ContentTrace,
  type CreateTraceOptions,
} from "@monkeytype/test-content";

const traces = new Map<string, ContentTrace>();
const TTL_MS = 60 * 60 * 1000;
const createdAt = new Map<string, number>();

function prune(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, at] of createdAt) {
    if (at < cutoff) {
      traces.delete(id);
      createdAt.delete(id);
    }
  }
}

export function createPracticeTrace(options: CreateTraceOptions): ContentTrace {
  prune();
  const trace = createTrace(options);
  traces.set(trace.traceId, trace);
  createdAt.set(trace.traceId, Date.now());
  return trace;
}

export function getPracticeTrace(traceId: string): ContentTrace | undefined {
  prune();
  return traces.get(traceId);
}

export function getPracticeChunk(
  traceId: string,
  chunkIndex: number,
  chunkSize: number,
): ReturnType<typeof getWordChunk> | null {
  const trace = getPracticeTrace(traceId);
  if (trace === undefined) return null;
  return getWordChunk(trace, chunkIndex, chunkSize);
}
