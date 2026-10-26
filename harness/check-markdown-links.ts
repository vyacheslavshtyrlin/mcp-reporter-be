import { pathToFileURL } from 'node:url';
import { findBrokenMarkdownLinks } from './markdown-links.js';

export function checkMarkdownLinks(rootDirectory: string): number {
  const brokenLinks = findBrokenMarkdownLinks(rootDirectory);

  if (brokenLinks.length === 0) {
    console.log('Markdown links: OK');
    return 0;
  }

  console.error(
    `Markdown links: found ${brokenLinks.length} broken local link(s)`,
  );

  for (const link of brokenLinks) {
    console.error(`- ${link.source}: ${link.target} -> ${link.resolvedTarget}`);
  }

  return 1;
}

const entryPoint = process.argv[1];

if (
  entryPoint !== undefined &&
  import.meta.url === pathToFileURL(entryPoint).href
) {
  process.exitCode = checkMarkdownLinks(process.cwd());
}
