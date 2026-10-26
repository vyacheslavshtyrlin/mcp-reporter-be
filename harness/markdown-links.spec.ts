import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findBrokenMarkdownLinks } from './markdown-links.js';

const temporaryDirectories: string[] = [];

function createTemporaryRepository(): string {
  const directory = mkdtempSync(join(tmpdir(), 'mcp-reporter-harness-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('findBrokenMarkdownLinks', () => {
  it('accepts files, directories, anchors and external links', () => {
    const repository = createTemporaryRepository();
    const docsDirectory = join(repository, 'docs');
    mkdirSync(docsDirectory);
    writeFileSync(join(repository, 'README.md'), '# Root');
    writeFileSync(
      join(docsDirectory, 'guide.md'),
      '[root](../README.md) [docs](./) [anchor](#section) [web](https://example.com)',
    );

    expect(findBrokenMarkdownLinks(repository)).toEqual([]);
  });

  it('reports a missing local target with a repository-relative source', () => {
    const repository = createTemporaryRepository();
    writeFileSync(
      join(repository, 'README.md'),
      '[missing](./docs/missing.md)',
    );

    expect(findBrokenMarkdownLinks(repository)).toEqual([
      {
        source: 'README.md',
        target: './docs/missing.md',
        resolvedTarget: join('docs', 'missing.md'),
      },
    ]);
  });

  it('supports angle-bracket links containing spaces', () => {
    const repository = createTemporaryRepository();
    writeFileSync(join(repository, 'My Guide.md'), '# Guide');
    writeFileSync(join(repository, 'README.md'), '[guide](<./My Guide.md>)');

    expect(findBrokenMarkdownLinks(repository)).toEqual([]);
  });

  it('ignores link examples inside fenced code blocks', () => {
    const repository = createTemporaryRepository();
    writeFileSync(
      join(repository, 'README.md'),
      ['```md', '[example](./missing.md)', '```'].join('\n'),
    );

    expect(findBrokenMarkdownLinks(repository)).toEqual([]);
  });

  it('rejects targets outside the repository even when they exist', () => {
    const workspace = createTemporaryRepository();
    const repository = join(workspace, 'repository');
    mkdirSync(repository);
    writeFileSync(join(workspace, 'outside.md'), '# Outside');
    writeFileSync(join(repository, 'README.md'), '[outside](../outside.md)');

    expect(findBrokenMarkdownLinks(repository)).toEqual([
      {
        source: 'README.md',
        target: '../outside.md',
        resolvedTarget: join('..', 'outside.md'),
      },
    ]);
  });

  it('checks reference-style link definitions', () => {
    const repository = createTemporaryRepository();
    writeFileSync(
      join(repository, 'README.md'),
      ['[guide][missing]', '', '[missing]: ./missing.md'].join('\n'),
    );

    expect(findBrokenMarkdownLinks(repository)).toEqual([
      {
        source: 'README.md',
        target: './missing.md',
        resolvedTarget: join('missing.md'),
      },
    ]);
  });
});
