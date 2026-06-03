export { getStaticRoot } from "./static-root.js";
export { loadLanguage, type LanguageFile } from "./load-language.js";
export {
  loadQuotes,
  filterQuotesByLength,
  quoteToWords,
  type QuoteEntry,
  type QuoteCollection,
} from "./load-quotes.js";
export { splitTextToWords } from "./split-text.js";
export {
  generateTimeWords,
  type GenerateTimeWordsOptions,
} from "./generate-time-words.js";
export {
  generateQuoteWords,
  type GenerateQuoteWordsOptions,
  type GenerateQuoteWordsResult,
} from "./generate-quote-words.js";
export {
  createTrace,
  getWordChunk,
  type ContentTrace,
  type CreateTraceOptions,
  type TestContentMode,
} from "./trace.js";
