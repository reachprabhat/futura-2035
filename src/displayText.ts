/** Rewrites the old single-year wording only at the point it is displayed. */
export function displayAiText(value: string): string {
  return value
    .replace(/\b(in|by|during|throughout|across|into|for|from|until|after|before)\s+(?:the\s+)?2035\b/gi, (_match, preposition: string) => `${preposition} the 2030s`)
    .replace(/\bthe\s+2035\b/gi, match => `${match[0] === match[0].toUpperCase() ? "The" : "the"} 2030s`)
    .replace(/\b2035\b/g, (match, offset: number, original: string) => {
      const before = original.slice(0, offset);
      return /(?:^|[.!?]\s+)$/.test(before) ? "The 2030s" : "the 2030s";
    })
    .replace(/\b(the)\s+the\s+(2030s)\b/gi, (_match, article: string) => `${article} 2030s`);
}
