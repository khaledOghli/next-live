/** Strip quoted metastring segments so `title="live demo"` / `title='live demo'` do not match `live`. */
export function stripQuotedStrings(metastring: string): string {
  return metastring
    .replace(/"(?:\\.|[^"\\])*"/g, ' ')
    .replace(/'(?:\\.|[^'\\])*'/g, ' ');
}

export function isLiveBlock(metastring?: string): boolean {
  if (!metastring) return false;
  return stripQuotedStrings(metastring).split(/\s+/).includes('live');
}
