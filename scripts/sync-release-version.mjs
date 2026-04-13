import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  let root = process.cwd();
  const args = [];

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') {
      root = path.resolve(argv[i + 1] ?? '');
      i += 1;
      continue;
    }

    args.push(argv[i]);
  }

  if (args.length !== 1) {
    throw new Error('Usage: node scripts/sync-release-version.mjs [--root <path>] <version>');
  }

  const version = args[0];
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid version: ${version}`);
  }

  return { root, version };
}

async function updateJsonVersion(filePath, version) {
  const source = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(source);

  if (parsed.version === version) {
    return false;
  }

  parsed.version = version;
  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
  return true;
}

async function updateRegex(filePath, pattern, replacement) {
  const source = await readFile(filePath, 'utf8');
  if (!pattern.test(source)) {
    throw new Error(`Expected version pattern not found in ${filePath}`);
  }
  const next = source.replace(pattern, replacement);

  if (next === source) {
    return false;
  }

  await writeFile(filePath, next);
  return true;
}

const { root, version } = parseArgs(process.argv.slice(2));

const updates = await Promise.all([
  updateJsonVersion(path.join(root, 'package.json'), version),
  updateJsonVersion(path.join(root, 'src-tauri', 'tauri.conf.json'), version),
  updateRegex(
    path.join(root, 'src-tauri', 'Cargo.toml'),
    /(^version = ")[^"]+(")/m,
    `$1${version}$2`,
  ),
  updateRegex(
    path.join(root, 'src-tauri', 'Cargo.lock'),
    /(\[\[package\]\]\nname = "transnovel"\nversion = ")[^"]+(")/,
    `$1${version}$2`,
  ),
]);

const changedFiles = [
  'package.json',
  'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
].filter((_, index) => updates[index]);

console.log(
  changedFiles.length === 0
    ? `Version already synced to ${version}`
    : `Updated ${changedFiles.join(', ')} to ${version}`,
);
