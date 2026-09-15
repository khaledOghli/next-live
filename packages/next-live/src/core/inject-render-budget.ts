/**
 * Inserts `__liveTick()` at the top of component function bodies so the render
 * budget counts every render without calling components as plain functions
 * (which breaks hooks under React 19).
 *
 * The call goes on the same line as the opening brace. Error mapping relies on
 * generated line N being source line N, and inserting a newline here used to
 * shift every line below it, which made `mapPosition` discard the position.
 */
export function injectRenderBudgetTick(source: string): string {
  let out = source;

  out = out.replace(
    /export\s+default\s+function\s+(\w*)\s*\([^)]*\)\s*\{/g,
    (match) => `${match} __liveTick();`,
  );

  out = out.replace(
    /export\s+default\s*(?:async\s+)?(?:function\s*)?\([^)]*\)\s*=>\s*\{/g,
    (match) => `${match} __liveTick();`,
  );

  out = out.replace(
    /^export\s+function\s+([A-Z]\w*)\s*\([^)]*\)\s*\{/gm,
    (match) => `${match} __liveTick();`,
  );

  return out;
}
