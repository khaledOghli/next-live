/**
 * Inserts `__liveTick()` at the top of component function bodies so the render
 * budget counts every render without calling components as plain functions
 * (which breaks hooks under React 19).
 */
export function injectRenderBudgetTick(source: string): string {
  let out = source;

  out = out.replace(
    /export\s+default\s+function\s+(\w*)\s*\([^)]*\)\s*\{/g,
    (match) => `${match}\n  __liveTick();`,
  );

  out = out.replace(
    /export\s+default\s*(?:async\s+)?(?:function\s*)?\([^)]*\)\s*=>\s*\{/g,
    (match) => `${match}\n  __liveTick();`,
  );

  out = out.replace(
    /^export\s+function\s+([A-Z]\w*)\s*\([^)]*\)\s*\{/gm,
    (match) => `${match}\n  __liveTick();`,
  );

  return out;
}
