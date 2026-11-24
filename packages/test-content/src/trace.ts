import { randomUUID } from "node:crypto";
import { generateQuoteWords } from "./generate-quote-words.js";
import { generateTimeWords } from "./generate-time-words.js";

export type TestContentMode = "time" | "quote";

export type CreateTraceOptions = {
  mode: TestContentMode;
  language?: string;
  wordCount?: number;
  quoteLengths?: number[];
  /** Use contest-safe word pool (lowercase a-z only). */
  contestSafe?: boolean;
  traceId?: string;
};

export type ContentTrace = {
  traceId: string;
  mode: TestContentMode;
  language: string;
  words: string[];
  quoteId?: number;
  quoteSource?: string;
  quoteText?: string;
  quoteLength?: number;
};

export function createTrace(options: CreateTraceOptions): ContentTrace {
  const traceId = options.traceId ?? randomUUID();
  const language = options.language ?? "english_10k";

  if (options.mode === "quote") {
    const quoteLanguage = language.replace(/_\d+k$/i, "").replace(/_10k$/i, "");
    const { words, quote } = generateQuoteWords({
      seed: traceId,
      language: quoteLanguage,
      quoteLengths: options.quoteLengths,
    });
    return {
      traceId,
      mode: "quote",
      language,
      words,
      quoteId: quote.id,
      quoteSource: quote.source,
      quoteText: quote.text,
      quoteLength: quote.length,
    };
  }

  const words = generateTimeWords({
    seed: traceId,
    language,
    count: options.wordCount ?? 300,
    contestSafe: options.contestSafe ?? false,
  });

  return {
    traceId,
    mode: "time",
    language,
    words,
  };
}

export function getWordChunk(
  trace: ContentTrace,
  chunkIndex: number,
  chunkSize: number,
): {
  chunkIndex: number;
  words: string[];
  totalWords: number;
  hasMore: boolean;
} {
  const start = chunkIndex * chunkSize;
  const words = trace.words.slice(start, start + chunkSize);
  return {
    chunkIndex,
    words,
    totalWords: trace.words.length,
    hasMore: start + chunkSize < trace.words.length,
  };
}
