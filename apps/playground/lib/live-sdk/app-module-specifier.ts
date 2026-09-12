/** Maps a filename in `modules/` to the import specifier snippets use. */
export function filenameToAppSpecifier(filename: string): string | null {
  const name = filename.replace(/\.tsx?$/, '');
  return name ? `@app/${name}` : null;
}

/** Maps a glob path like `./modules/store.ts` to `@app/store`. */
export function pathToAppSpecifier(path: string): string | null {
  const filename = path.split('/').pop();
  return filename ? filenameToAppSpecifier(filename) : null;
}
