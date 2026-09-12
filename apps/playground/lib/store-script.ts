/**
 * Non-UI script served from /api/store/script and run via useLiveModule.
 * Kept here so the route and CI validation share one source of truth.
 */
export const storeScriptSource = `import { removeLastItem, getCartCount } from '@app/store';

export function run() {
  removeLastItem();
  return getCartCount();
}
`;
