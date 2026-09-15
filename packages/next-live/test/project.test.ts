import { describe, expect, it } from 'vitest';
import { LiveCompileError } from '../src/core/errors';
import {
  isProjectSpecifier,
  normalizeFiles,
  normalizeProjectPath,
  relativeSpecifier,
  resolveEntry,
  resolveProjectSpecifier,
} from '../src/core/project';

describe('normalizeProjectPath', () => {
  it.each([
    ['App.tsx', 'App.tsx'],
    ['./App.tsx', 'App.tsx'],
    ['/src//components/Card.tsx', 'src/components/Card.tsx'],
    ['src\\lib\\format.ts', 'src/lib/format.ts'],
    ['a/./b/../c.tsx', 'a/c.tsx'],
    ['./', ''],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeProjectPath(input)).toBe(expected);
  });

  it('returns null for a path above the root', () => {
    expect(normalizeProjectPath('../secrets.ts')).toBeNull();
    expect(normalizeProjectPath('a/../../b.ts')).toBeNull();
  });
});

describe('normalizeFiles', () => {
  it('indexes by normalized path but remembers the original key', () => {
    const files = normalizeFiles({ './App.tsx': 'a', 'lib\\util.ts': 'b' });
    expect([...files.keys()]).toEqual(['App.tsx', 'lib/util.ts']);
    expect(files.get('App.tsx')).toEqual({ key: './App.tsx', source: 'a' });
  });

  it('rejects two keys that are the same file', () => {
    expect(() => normalizeFiles({ 'App.tsx': 'a', './App.tsx': 'b' })).toThrow(
      "Files 'App.tsx' and './App.tsx' both resolve to 'App.tsx'.",
    );
  });

  it('rejects paths that escape the root or name nothing', () => {
    expect(() => normalizeFiles({ '../x.ts': '' })).toThrow(LiveCompileError);
    expect(() => normalizeFiles({ './': '' })).toThrow(/does not name a file/);
  });

  it('rejects non-string sources, naming the file', () => {
    try {
      normalizeFiles({ 'App.tsx': 42 as unknown as string });
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: 'COMPILE', file: 'App.tsx' });
    }
  });
});

describe('resolveProjectSpecifier', () => {
  const files = normalizeFiles({
    'App.tsx': '',
    'Button.tsx': '',
    'Button.ts': '',
    'components/Card.tsx': '',
    'components/index.ts': '',
    'lib/format.ts': '',
    'data.js': '',
  });

  it.each([
    ['App.tsx', './Button', 'Button.tsx'],
    ['App.tsx', './Button.ts', 'Button.ts'],
    ['App.tsx', './data', 'data.js'],
    ['App.tsx', './components', 'components/index.ts'],
    ['App.tsx', './components/Card', 'components/Card.tsx'],
    ['components/Card.tsx', '../lib/format', 'lib/format.ts'],
    ['components/Card.tsx', './', 'components/index.ts'],
    ['components/Card.tsx', '/App', 'App.tsx'],
  ])('from %s, %s resolves to %s', (importer, specifier, expected) => {
    expect(resolveProjectSpecifier(importer, specifier, files)).toBe(expected);
  });

  it('never resolves bare specifiers to files', () => {
    expect(resolveProjectSpecifier('App.tsx', 'Button', files)).toBeUndefined();
    expect(isProjectSpecifier('react')).toBe(false);
  });

  it('returns undefined for a missing file or one above the root', () => {
    expect(resolveProjectSpecifier('App.tsx', './Missing', files)).toBeUndefined();
    expect(resolveProjectSpecifier('App.tsx', '../App', files)).toBeUndefined();
  });
});

describe('resolveEntry', () => {
  const files = normalizeFiles({ 'App.tsx': '', 'Button.tsx': '' });

  it('defaults to the first key', () => {
    expect(resolveEntry(files)).toBe('App.tsx');
  });

  it('accepts a named entry in any spelling of its path', () => {
    expect(resolveEntry(files, './Button.tsx')).toBe('Button.tsx');
  });

  it('rejects an entry that is not a file, listing the ones that are', () => {
    expect(() => resolveEntry(files, 'Main.tsx')).toThrow(
      "Entry file 'Main.tsx' is not one of the project files: App.tsx, Button.tsx.",
    );
    expect(() => resolveEntry(normalizeFiles({}))).toThrow(/at least one file/);
  });
});

describe('relativeSpecifier', () => {
  it.each([
    ['App.tsx', 'Button.tsx', './Button'],
    ['App.tsx', 'components/Card.tsx', './components/Card'],
    ['components/Card.tsx', 'lib/format.ts', '../lib/format'],
    ['components/Card.tsx', 'components/Badge.tsx', './Badge'],
    ['a/b/c.tsx', 'd.ts', '../../d'],
  ])('from %s to %s is %s', (importer, path, expected) => {
    expect(relativeSpecifier(importer, path)).toBe(expected);
  });
});
