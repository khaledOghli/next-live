import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RUNTIME_VERSION } from '../src/sandbox/protocol/messages';

/**
 * Version facts that live in more than one file.
 *
 * The sandbox handshake sends `RUNTIME_VERSION` so a host and a sandbox on
 * different releases can say which versions they are. It is a literal rather
 * than an import of `package.json`, which would reach outside `src` in every
 * build, so this is what keeps the two equal when a release bumps the version.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');

describe('release consistency', () => {
  it('sends the package version in the sandbox handshake', () => {
    expect(RUNTIME_VERSION).toBe(manifest.version);
  });

  it('has a changelog section for the package version, which the publish workflow requires', () => {
    const escaped = manifest.version.replace(/\./g, '\\.');
    expect(changelog).toMatch(new RegExp(`^## \\[${escaped}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm'));
  });

  it('links that section, and Unreleased compares from its tag', () => {
    const version = manifest.version;
    expect(changelog).toContain(`[unreleased]: https://github.com/khaledOghli/next-live/compare/v${version}...HEAD`);
    expect(changelog).toMatch(new RegExp(`^\\[${version.replace(/\./g, '\\.')}\\]: https://github\\.com/khaledOghli/next-live/compare/v`, 'm'));
  });
});
