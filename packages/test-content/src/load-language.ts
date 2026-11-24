import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getStaticRoot } from "./static-root.js";

export type LanguageFile = {
  name: string;
  words: string[];
};

const cache = new Map<string, LanguageFile>();

export function loadLanguage(languageName: string): LanguageFile {
  const cached = cache.get(languageName);
  if (cached !== undefined) return cached;

  const path = join(getStaticRoot(), "languages", `${languageName}.json`);
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as { name?: string; words: string[] };
  const file: LanguageFile = {
    name: parsed.name ?? languageName,
    words: parsed.words,
  };
  cache.set(languageName, file);
  return file;
}
