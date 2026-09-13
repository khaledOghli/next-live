import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LoadContext, Plugin } from '@docusaurus/types';
import { MODULES_ID } from './constants';

export interface NextLivePluginOptions {
  /** Path to a module registry file aliased as `@next-live-docusaurus/modules`. */
  modules?: string;
}

export default function nextLivePlugin(
  context: LoadContext,
  options: NextLivePluginOptions = {},
): Plugin {
  const distDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.join(distDir, '..');
  const themeDir = path.join(packageRoot, 'lib', 'theme');
  const tsThemeDir = path.join(packageRoot, 'src', 'theme');

  return {
    name: 'next-live-docusaurus',
    configureWebpack() {
      const stub = path.join(distDir, 'modules-stub.js');
      const resolved = options.modules
        ? path.resolve(context.siteDir, options.modules)
        : stub;
      return {
        resolve: {
          alias: {
            [MODULES_ID]: resolved,
          },
        },
      };
    },
    getThemePath() {
      return themeDir;
    },
    getTypeScriptThemePath() {
      return tsThemeDir;
    },
    getClientModules() {
      return [path.join(packageRoot, 'lib', 'theme', 'live-block.css')];
    },
  };
}

export { MODULES_ID } from './constants';
