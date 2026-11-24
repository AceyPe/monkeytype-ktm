import {
  filterQuotesByLength,
  loadQuotes,
  quoteToWords,
  type QuoteEntry,
} from "./load-quotes.js";
import { hashSeed, mulberry32 } from "./random.js";

export type GenerateQuoteWordsOptions = {
  seed: string;
  language?: string;
  quoteLengths?: number[];
};

export type GenerateQuoteWordsResult = {
  words: string[];
  quote: QuoteEntry;
};

export function generateQuoteWords(
  options: GenerateQuoteWordsOptions,
): GenerateQuoteWordsResult {
  const language = options.language ?? "english";
  const collection = loadQuotes(language);
  if (collection.quotes.length === 0) {
    throw new Error(`No quotes for language ${language}`);
  }

  const filtered = filterQuotesByLength(
    collection.quotes,
    options.quoteLengths ?? [0, 1, 2, 3],
  );
  if (filtered.length === 0) {
    throw new Error(`No quotes match length filter for ${language}`);
  }

  const rand = mulberry32(hashSeed(options.seed));
  const quote = filtered[Math.floor(rand() * filtered.length)] as QuoteEntry;
  return {
    words: quoteToWords(quote),
    quote,
  };
}
