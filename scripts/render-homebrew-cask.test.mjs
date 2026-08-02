import assert from 'node:assert/strict';
import test from 'node:test';

import { renderHomebrewCask } from './render-homebrew-cask.mjs';

const template = `cask "transnovel" do
  version "{{VERSION}}"
  sha256 "{{MACOS_ARM64_SHA256}}"
end
`;

const digest = 'a'.repeat(64);

function releaseWith(asset) {
  return { assets: [asset] };
}

test('renders the exact ARM64 DMG version and SHA256', () => {
  const rendered = renderHomebrewCask(
    'v1.2.3',
    releaseWith({
      name: 'TransNovel_1.2.3_aarch64.dmg',
      digest: `sha256:${digest}`,
    }),
    template,
  );

  assert.equal(
    rendered,
    `cask "transnovel" do
  version "1.2.3"
  sha256 "${digest}"
end
`,
  );
});

test('rejects a release without the exact ARM64 DMG', () => {
  assert.throws(
    () =>
      renderHomebrewCask(
        'v1.2.3',
        releaseWith({
          name: 'TransNovel_1.2.3_aarch64.app.tar.gz',
          digest: `sha256:${digest}`,
        }),
        template,
      ),
    /Missing release asset: TransNovel_1\.2\.3_aarch64\.dmg/,
  );
});

test('rejects a missing or malformed GitHub SHA256 digest', () => {
  assert.throws(
    () =>
      renderHomebrewCask(
        'v1.2.3',
        releaseWith({
          name: 'TransNovel_1.2.3_aarch64.dmg',
          digest: 'sha256:not-a-digest',
        }),
        template,
      ),
    /Invalid SHA256 digest/,
  );
});

test('rejects unresolved template substitution tokens', () => {
  assert.throws(
    () =>
      renderHomebrewCask(
        'v1.2.3',
        releaseWith({
          name: 'TransNovel_1.2.3_aarch64.dmg',
          digest: `sha256:${digest}`,
        }),
        `${template}{{UNRESOLVED_TOKEN}}\n`,
      ),
    /Unresolved template tokens: \{\{UNRESOLVED_TOKEN\}\}/,
  );
});
