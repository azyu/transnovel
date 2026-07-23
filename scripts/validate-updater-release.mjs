import { readFile } from 'node:fs/promises';

const [metadataPath, expectedVersion, assetsPath] = process.argv.slice(2);

if (!metadataPath || !expectedVersion || !assetsPath) {
  console.error(
    'Usage: node scripts/validate-updater-release.mjs <latest.json> <version> <assets.json>',
  );
  process.exit(1);
}

const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
const releaseAssets = JSON.parse(await readFile(assetsPath, 'utf8'));
const assets = releaseAssets.assets ?? [];
const assetNames = new Set(assets.map((asset) => asset.name));
const requiredPlatforms = ['darwin-aarch64', 'windows-x86_64', 'windows-aarch64'];
const acceptedVersions = new Set([expectedVersion, `v${expectedVersion}`]);

if (!acceptedVersions.has(metadata.version)) {
  throw new Error(
    `latest.json version ${JSON.stringify(metadata.version)} does not match ${expectedVersion}`,
  );
}

if (typeof metadata.notes !== 'string' || !metadata.notes.trim()) {
  throw new Error('latest.json does not contain release notes');
}

if (!assetNames.has('latest.json')) {
  throw new Error('GitHub Release does not contain latest.json');
}

for (const platform of requiredPlatforms) {
  const entry = metadata.platforms?.[platform];
  if (!entry || typeof entry.url !== 'string' || typeof entry.signature !== 'string') {
    throw new Error(`latest.json is missing a complete ${platform} entry`);
  }
  if (!entry.signature.trim()) {
    throw new Error(`latest.json contains an empty ${platform} signature`);
  }

  const url = new URL(entry.url);
  if (url.protocol !== 'https:') {
    throw new Error(`${platform} updater URL is not HTTPS: ${entry.url}`);
  }

  const updaterAsset = assets.find(
    (asset) => asset.apiUrl === entry.url || asset.url === entry.url,
  );
  if (!updaterAsset) {
    throw new Error(`${platform} points outside the current GitHub Release: ${entry.url}`);
  }
  if (!assetNames.has(`${updaterAsset.name}.sig`)) {
    throw new Error(`GitHub Release is missing updater signature ${updaterAsset.name}.sig`);
  }
}

console.log(`Validated updater metadata for ${expectedVersion}`);
