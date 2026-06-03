import { loadLanguage } from "./load-language.js";
import { hashSeed, mulberry32 } from "./random.js";

export type GenerateTimeWordsOptions = {
  /** Stable id (trace id) — same id yields same word sequence. */
  seed: string;
  language?: string;
  count: number;
  /** Only lowercase a-z words (contest-safe). */
  contestSafe?: boolean;
};

export function generateTimeWords(options: GenerateTimeWordsOptions): string[] {
  const language = options.language ?? "english_10k";
  const pool = loadLanguage(language).words;
  const filtered = options.contestSafe
    ? pool.filter((w) => /^[a-z]+$/.test(w))
    : pool;

  if (filtered.length === 0) {
    throw new Error(`No words available for language ${language}`);
  }

  const rand = mulberry32(hashSeed(options.seed));
  const words: string[] = [];
  for (let i = 0; i < options.count; i++) {
    words.push(filtered[Math.floor(rand() * filtered.length)] as string);
  }
  return words;
}
