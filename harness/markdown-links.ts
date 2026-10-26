import { existsSync, readdirSync, readFileSync } from 'node:fs';
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';

const ignoredDirectories = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
]);
const inlineLinkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
const referenceDefinitionPattern = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm;
const externalSchemePattern = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

export interface BrokenMarkdownLink {
  readonly source: string;
  readonly target: string;
  readonly resolvedTarget: string;
}

function listMarkdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      return [];
    }

    const entryPath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return listMarkdownFiles(entryPath);
    }

    return entry.isFile() && extname(entry.name).toLowerCase() === '.md'
      ? [entryPath]
      : [];
  });
}

function extractLinkTarget(rawTarget: string): string {
  const trimmedTarget = rawTarget.trim();

  if (trimmedTarget.startsWith('<')) {
    const closingBracketIndex = trimmedTarget.indexOf('>');
    return closingBracketIndex === -1
      ? trimmedTarget
      : trimmedTarget.slice(1, closingBracketIndex);
  }

  return trimmedTarget.split(/\s+/, 1)[0] ?? '';
}

function removeFencedCodeBlocks(markdown: string): string {
  const output: string[] = [];
  let fenceCharacter: '`' | '~' | undefined;
  let fenceLength = 0;

  for (const line of markdown.split(/(?<=\n)/)) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);

    if (fenceCharacter === undefined) {
      if (fenceMatch === null) {
        output.push(line);
        continue;
      }

      const marker = fenceMatch[1] ?? '';
      fenceCharacter = marker[0] as '`' | '~';
      fenceLength = marker.length;
      continue;
    }

    const closingFencePattern = new RegExp(
      `^\\s{0,3}\\${fenceCharacter}{${fenceLength},}\\s*$`,
    );

    if (closingFencePattern.test(line.trimEnd())) {
      fenceCharacter = undefined;
      fenceLength = 0;
    }
  }

  return output.join('');
}

function extractMarkdownTargets(markdown: string): string[] {
  const markdownWithoutFences = removeFencedCodeBlocks(markdown);
  const targets = new Set<string>();

  for (const match of markdownWithoutFences.matchAll(inlineLinkPattern)) {
    targets.add(extractLinkTarget(match[1] ?? ''));
  }

  for (const match of markdownWithoutFences.matchAll(
    referenceDefinitionPattern,
  )) {
    targets.add(extractLinkTarget(match[1] ?? ''));
  }

  return [...targets];
}

function resolveLocalTarget(
  sourcePath: string,
  target: string,
): string | undefined {
  if (
    target.length === 0 ||
    target.startsWith('#') ||
    target.startsWith('//') ||
    externalSchemePattern.test(target)
  ) {
    return undefined;
  }

  const pathWithoutFragment = target.split(/[?#]/, 1)[0] ?? '';
  if (pathWithoutFragment.length === 0) {
    return undefined;
  }

  try {
    return resolve(
      dirname(sourcePath),
      decodeURIComponent(pathWithoutFragment),
    );
  } catch {
    return resolve(dirname(sourcePath), pathWithoutFragment);
  }
}

export function findBrokenMarkdownLinks(
  rootDirectory: string,
): BrokenMarkdownLink[] {
  const normalizedRoot = resolve(rootDirectory);
  const brokenLinks: BrokenMarkdownLink[] = [];

  for (const markdownPath of listMarkdownFiles(normalizedRoot)) {
    const markdown = readFileSync(markdownPath, 'utf8');

    for (const target of extractMarkdownTargets(markdown)) {
      const resolvedTarget = resolveLocalTarget(markdownPath, target);

      if (resolvedTarget === undefined) {
        continue;
      }

      const repositoryRelativeTarget = relative(normalizedRoot, resolvedTarget);
      const isOutsideRepository =
        repositoryRelativeTarget === '..' ||
        repositoryRelativeTarget.startsWith(`..${sep}`) ||
        isAbsolute(repositoryRelativeTarget);

      if (isOutsideRepository || !existsSync(resolvedTarget)) {
        brokenLinks.push({
          source: relative(normalizedRoot, markdownPath),
          target,
          resolvedTarget: repositoryRelativeTarget,
        });
      }
    }
  }

  return brokenLinks;
}
