import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QuoteDataSchema } from "@monkeytype/schemas/quotes";
import { getStaticRoot } from "./static-root.js";
import { splitTextToWords } from "./split-text.js";

export type QuoteEntry = {
  id: number;
  text: string;
  source: string;
  length: number;
};

export type QuoteCollection = {
  language: string;
  quotes: QuoteEntry[];
};

const cache = new Map<string, QuoteCollection>();

function normalizeQuoteLanguage(language: string): string {
  if (language.startsWith("swiss_german")) return "german";
  return language.replace(/_\d+k$/i, "").replace(/_/g, "_");
}

export function loadQuotes(language: string): QuoteCollection {
  const key = normalizeQuoteLanguage(language);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const path = join(getStaticRoot(), "quotes", `${key}.json`);
  const raw = readFileSync(path, "utf8");
  const parsed = QuoteDataSchema.parse(JSON.parse(raw));

  const collection: QuoteCollection = {
    language: parsed.language,
    quotes: parsed.quotes.map((q) => ({
      id: q.id,
      text: q.text,
      source: q.source,
      length: q.length,
    })),
  };
  cache.set(key, collection);
  return collection;
}

export function filterQuotesByLength(
  quotes: QuoteEntry[],
  quoteLengths: number[],
): QuoteEntry[] {
  if (quoteLengths.includes(-2) || quoteLengths.includes(-3)) {
    return quotes;
  }
  if (quoteLengths.length === 0) return quotes;

  const inGroup = (length: number, group: number): boolean => {
    if (group === 0) return length < 101;
    if (group === 1) return length > 100 && length < 251;
    if (group === 2) return length > 250 && length < 501;
    if (group === 3) return length > 500;
    return true;
  };

  return quotes.filter((q) => quoteLengths.some((g) => inGroup(q.length, g)));
}

export function quoteToWords(quote: QuoteEntry): string[] {
  return splitTextToWords(quote.text);
}
