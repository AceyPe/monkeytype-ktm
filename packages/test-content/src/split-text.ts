/** Split typing text into word tokens (space-separated, preserves newlines/tabs in tokens). */
export function splitTextToWords(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  return trimmed.split(/\s+/u);
}
