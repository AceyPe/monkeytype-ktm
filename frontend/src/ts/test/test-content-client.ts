import { envConfig } from "virtual:env-config";
import { Language } from "@monkeytype/schemas/languages";
import * as Strings from "../utils/strings";

export type PracticeTraceResponse = {
  traceId: string;
  mode: "time" | "quote";
  language: string;
  totalWords: number;
  chunkSize: number;
  quote?: {
    id: number;
    text: string;
    source: string;
    length: number;
  };
};

export type WordChunkResponse = {
  chunkIndex: number;
  words: string[];
  totalWords: number;
  hasMore: boolean;
};

function getBackendUrl(): string {
  return envConfig.backendUrl.replace(/\/$/, "");
}

export async function createQuoteTrace(
  language: Language,
  quoteLengths: number[],
): Promise<PracticeTraceResponse> {
  const res = await fetch(`${getBackendUrl()}/test-content/trace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "quote",
      language: Strings.removeLanguageSize(language),
      quoteLengths,
    }),
  });

  if (!res.ok) {
    throw new Error(`Quote trace failed (${res.status})`);
  }

  return (await res.json()) as PracticeTraceResponse;
}

export async function fetchAllTraceWords(traceId: string): Promise<string[]> {
  const words: string[] = [];
  let chunkIndex = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(
      `${getBackendUrl()}/test-content/trace/${traceId}/chunk/${chunkIndex}`,
    );
    if (!res.ok) {
      throw new Error(`Trace chunk failed (${res.status})`);
    }
    const chunk = (await res.json()) as WordChunkResponse;
    words.push(...chunk.words);
    hasMore = chunk.hasMore;
    chunkIndex++;
  }

  return words;
}
