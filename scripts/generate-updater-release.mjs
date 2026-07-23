import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [outputDir, expectedVersion, notesPath, assetsPath, tauriConfigPath] = process.argv.slice(2);

if (!outputDir || !expectedVersion || !notesPath || !assetsPath || !tauriConfigPath) {
  console.error(
    'Usage: node scripts/generate-updater-release.mjs <output-dir> <version> <notes.md> <assets.json> <tauri.conf.json>',
  );
  process.exit(1);
}

const notes = await readFile(notesPath, 'utf8');
const releaseAssets = JSON.parse(await readFile(assetsPath, 'utf8'));
const tauriConfig = JSON.parse(await readFile(tauriConfigPath, 'utf8'));
const assets = releaseAssets.assets ?? [];

const platformMatchers = {
  'darwin-aarch64': /_aarch64\.app\.tar\.gz$/,
  'windows-x86_64': /_x64-setup\.exe$/,
  'windows-aarch64': /_arm64-setup\.exe$/,
};

const platforms = {};
const selectedAssetNames = [];

for (const [platform, matcher] of Object.entries(platformMatchers)) {
  const matches = assets.filter((asset) => typeof asset.name === 'string' && matcher.test(asset.name));
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${platform} updater asset, found ${matches.length}: ${matches.map((asset) => asset.name).join(', ')}`,
    );
  }

  const updaterAsset = matches[0];
  const signatureAssetName = `${updaterAsset.name}.sig`;
  if (!assets.some((asset) => asset.name === signatureAssetName)) {
    throw new Error(`GitHub Release is missing updater signature ${signatureAssetName}`);
  }

  const downloadUrl = updaterAsset.apiUrl ?? updaterAsset.url;
  if (typeof downloadUrl !== 'string') {
    throw new Error(`GitHub Release asset ${updaterAsset.name} does not have a download URL`);
  }

  const signature = await readFile(path.join(outputDir, signatureAssetName), 'utf8');
  if (!signature.trim()) {
    throw new Error(`GitHub Release contains an empty updater signature ${signatureAssetName}`);
  }

  platforms[platform] = {
    signature: signature.trim(),
    url: downloadUrl,
  };
  selectedAssetNames.push(updaterAsset.name);
}

const publicKey = tauriConfig.plugins?.updater?.pubkey;
if (typeof publicKey !== 'string' || !publicKey.trim()) {
  throw new Error('tauri.conf.json does not contain plugins.updater.pubkey');
}

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(
    path.join(outputDir, 'latest.json'),
    `${JSON.stringify(
      {
        version: expectedVersion,
        notes,
        pub_date: new Date().toISOString(),
        platforms,
      },
      null,
      2,
    )}\n`,
  ),
  writeFile(path.join(outputDir, 'selected-updater-assets.txt'), `${selectedAssetNames.join('\n')}\n`),
  writeFile(path.join(outputDir, 'updater.pub'), Buffer.from(publicKey, 'base64')),
]);

console.log(`Generated updater metadata for ${expectedVersion}`);
