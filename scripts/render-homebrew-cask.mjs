import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const SHA256_PATTERN = /^sha256:([0-9a-f]{64})$/;
const TOKEN_PATTERN = /{{[A-Z0-9_]+}}/g;

function assertExactlyOneToken(template, token) {
  const firstIndex = template.indexOf(token);
  if (firstIndex === -1) {
    throw new Error(`Missing mandatory template token: ${token}`);
  }
  if (firstIndex !== template.lastIndexOf(token)) {
    throw new Error(`Duplicate mandatory template token: ${token}`);
  }
}

export function renderHomebrewCask(tag, release, template) {
  const version = tag.startsWith('v') ? tag.slice(1) : tag;
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid release tag: ${tag}`);
  }

  if (!release || !Array.isArray(release.assets)) {
    throw new Error('Release metadata must contain an assets array');
  }

  const assetName = `TransNovel_${version}_aarch64.dmg`;
  const asset = release.assets.find((candidate) => candidate.name === assetName);
  if (!asset) {
    throw new Error(`Missing release asset: ${assetName}`);
  }

  const digestMatch = SHA256_PATTERN.exec(asset.digest ?? '');
  if (!digestMatch) {
    throw new Error(`Invalid SHA256 digest for ${assetName}`);
  }

  assertExactlyOneToken(template, '{{VERSION}}');
  assertExactlyOneToken(template, '{{MACOS_ARM64_SHA256}}');

  const rendered = template
    .replaceAll('{{VERSION}}', version)
    .replaceAll('{{MACOS_ARM64_SHA256}}', digestMatch[1]);
  const unresolvedTokens = rendered.match(TOKEN_PATTERN) ?? [];
  if (unresolvedTokens.length > 0) {
    throw new Error(`Unresolved template tokens: ${unresolvedTokens.join(', ')}`);
  }

  return rendered;
}

async function main(argv) {
  if (argv.length !== 4) {
    throw new Error(
      'Usage: node scripts/render-homebrew-cask.mjs <tag> <release-json> <template> <output>',
    );
  }

  const [tag, releasePath, templatePath, outputPath] = argv;
  const [releaseSource, template] = await Promise.all([
    readFile(releasePath, 'utf8'),
    readFile(templatePath, 'utf8'),
  ]);
  const release = JSON.parse(releaseSource);
  const rendered = renderHomebrewCask(tag, release, template);

  await writeFile(outputPath, rendered);
  console.log(`Rendered ${path.basename(outputPath)} for ${tag}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
