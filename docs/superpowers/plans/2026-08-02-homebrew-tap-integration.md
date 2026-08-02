# Homebrew Tap Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an Apple Silicon TransNovel Homebrew cask and update it automatically after every successful GitHub Release.

**Architecture:** `azyu/homebrew-tap` stores a versioned cask plus a substitution-token template. The TransNovel release workflow reads the published DMG digest, renders the template with a tested Node script, and pushes only the generated cask back to the tap.

**Tech Stack:** Homebrew Cask Ruby DSL, GitHub Actions, Node.js 24 ESM, Node built-in test runner, GitHub CLI

## Global Constraints

- Support Apple Silicon only with `depends_on arch: :arm64`.
- Use `TransNovel_<version>_aarch64.dmg` from the published GitHub Release.
- Keep the existing Tauri updater active and declare `auto_updates true`.
- Do not add Intel builds, Apple Developer signing, notarization, a Formula, or a second update service.
- Fail the Homebrew update job when its token, expected asset, SHA256 digest, or rendered output is invalid.
- Preserve user configuration and translation data on uninstall; do not add a destructive `zap` stanza.
- Track progress and verification in https://github.com/azyu/transnovel/issues/65.

---

### Task 1: Add the TransNovel cask and tap documentation

**Files:**
- Create: `/Users/azyu/code/github/azyu/homebrew-tap/Casks/transnovel.rb`
- Create: `/Users/azyu/code/github/azyu/homebrew-tap/Casks/transnovel.rb.template`
- Modify: `/Users/azyu/code/github/azyu/homebrew-tap/README.md`

**Interfaces:**
- Consumes: GitHub Release `v0.1.5`, asset `TransNovel_0.1.5_aarch64.dmg`, digest `beb30c30f445166477d4a4af0d2611c01dc9ed9fc567e3e4fd27fa01879c0374`.
- Produces: `Casks/transnovel.rb.template` with `{{VERSION}}` and `{{MACOS_ARM64_SHA256}}` substitution tokens; generated `Casks/transnovel.rb` consumed by Homebrew.

- [ ] **Step 1: Confirm the absent cask baseline**

Run:

```bash
cd /Users/azyu/code/github/azyu/homebrew-tap
brew audit --cask --strict Casks/transnovel.rb
```

Expected: non-zero status because `Casks/transnovel.rb` does not exist.

- [ ] **Step 2: Create the generated cask**

Create `/Users/azyu/code/github/azyu/homebrew-tap/Casks/transnovel.rb` with:

```ruby
cask "transnovel" do
  version "0.1.5"
  sha256 "beb30c30f445166477d4a4af0d2611c01dc9ed9fc567e3e4fd27fa01879c0374"

  url "https://github.com/azyu/transnovel/releases/download/v#{version}/TransNovel_#{version}_aarch64.dmg"
  name "TransNovel"
  desc "AI-powered Japanese web novel translator"
  homepage "https://github.com/azyu/transnovel"

  auto_updates true
  depends_on arch: :arm64

  app "TransNovel.app"
end
```

- [ ] **Step 3: Create the cask template**

Create `/Users/azyu/code/github/azyu/homebrew-tap/Casks/transnovel.rb.template` with:

```ruby
cask "transnovel" do
  version "{{VERSION}}"
  sha256 "{{MACOS_ARM64_SHA256}}"

  url "https://github.com/azyu/transnovel/releases/download/v#{version}/TransNovel_#{version}_aarch64.dmg"
  name "TransNovel"
  desc "AI-powered Japanese web novel translator"
  homepage "https://github.com/azyu/transnovel"

  auto_updates true
  depends_on arch: :arm64

  app "TransNovel.app"
end
```

- [ ] **Step 4: Replace the tap README with formula and cask instructions**

Write `/Users/azyu/code/github/azyu/homebrew-tap/README.md` as:

````markdown
# homebrew-tap

Homebrew tap for Azyu tools and applications.

## Available formulae

- `bb` — [bb-cli](https://github.com/azyu/bb-cli), Bitbucket Cloud CLI
- `kis` — [kis-cli](https://github.com/azyu/kis-cli), Korea Investment & Securities Open API CLI
- `krx` — [krx-cli](https://github.com/azyu/krx-cli), Korea Exchange Open API CLI
- `toss` — [tossinvest-cli](https://github.com/azyu/tossinvest-cli), Toss Securities Open API CLI

## Available casks

- `transnovel` — [TransNovel](https://github.com/azyu/transnovel), AI-powered Japanese web novel translator for Apple Silicon Macs

## Install

Install directly:

```bash
brew install azyu/tap/bb
brew install azyu/tap/kis
brew install azyu/tap/krx
brew install azyu/tap/toss
brew install --cask azyu/tap/transnovel
```

Or tap first:

```bash
brew tap azyu/tap
brew install bb
brew install kis
brew install krx
brew install toss
brew install --cask transnovel
```

TransNovel is currently ad-hoc signed and not Apple-notarized. If macOS blocks the quarantined app after the standard `brew install --cask azyu/tap/transnovel`, review the source and release before allowing it to open:

1. Locate `TransNovel` in Finder.
2. Control-click the app, choose **Open**, then confirm **Open**.
3. Alternatively, open **System Settings > Privacy & Security** and choose **Open Anyway** for TransNovel.

Only bypass this warning if you trust the published artifact.

## Upgrade

```bash
brew upgrade bb
brew upgrade kis
brew upgrade krx
brew upgrade toss
brew upgrade --cask --greedy transnovel
```

`transnovel` declares `auto_updates true` because the app includes its own updater. `--greedy` asks Homebrew to upgrade auto-updating casks as well.

## Uninstall

```bash
brew uninstall bb
brew uninstall kis
brew uninstall krx
brew uninstall toss
brew uninstall --cask transnovel
brew untap azyu/tap
```
````

- [ ] **Step 5: Validate cask syntax and style**

Run:

```bash
cd /Users/azyu/code/github/azyu/homebrew-tap
ruby -c Casks/transnovel.rb
brew tap-new --no-git azyu/transnovel-local
install -m 0644 Casks/transnovel.rb "$(brew --repository azyu/transnovel-local)/Casks/transnovel.rb"
brew audit --cask --strict azyu/transnovel-local/transnovel
brew untap azyu/transnovel-local
```

Expected:

```text
Syntax OK
```

`brew audit` exits with status 0 and reports no cask errors.

- [ ] **Step 6: Commit the tap cask and documentation**

```bash
cd /Users/azyu/code/github/azyu/homebrew-tap
git add Casks/transnovel.rb Casks/transnovel.rb.template README.md
git commit -m "feat: add TransNovel cask"
```

Expected: one commit containing only the two cask files and tap README.

---

### Task 2: Add a tested cask renderer

**Files:**
- Create: `/Users/azyu/code/github/azyu/transnovel/scripts/render-homebrew-cask.mjs`
- Create: `/Users/azyu/code/github/azyu/transnovel/scripts/render-homebrew-cask.test.mjs`

**Interfaces:**
- Consumes: `renderHomebrewCask(tag: string, release: { assets: Array<{ name: string, digest: string }> }, template: string)`.
- Produces: rendered cask text with an exact semantic version and a lowercase 64-character SHA256; CLI usage `node scripts/render-homebrew-cask.mjs <tag> <release-json> <template> <output>`.

- [ ] **Step 1: Write renderer contract tests**

Create `/Users/azyu/code/github/azyu/transnovel/scripts/render-homebrew-cask.test.mjs` with:

```javascript
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
```

- [ ] **Step 2: Run the renderer tests to verify they fail**

Run:

```bash
cd /Users/azyu/code/github/azyu/transnovel
node --test scripts/render-homebrew-cask.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/render-homebrew-cask.mjs`.

- [ ] **Step 3: Implement the renderer and CLI**

Create `/Users/azyu/code/github/azyu/transnovel/scripts/render-homebrew-cask.mjs` with:

```javascript
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const SHA256_PATTERN = /^sha256:([0-9a-f]{64})$/;
const TOKEN_PATTERN = /{{[A-Z0-9_]+}}/g;

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
```

- [ ] **Step 4: Run the renderer contract tests**

Run:

```bash
cd /Users/azyu/code/github/azyu/transnovel
node --test scripts/render-homebrew-cask.test.mjs
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 5: Verify the renderer against the published v0.1.5 release**

Run:

```bash
cd /Users/azyu/code/github/azyu/transnovel
gh release view v0.1.5 --repo azyu/transnovel --json assets > /tmp/transnovel-v0.1.5-assets.json
node scripts/render-homebrew-cask.mjs \
  v0.1.5 \
  /tmp/transnovel-v0.1.5-assets.json \
  /Users/azyu/code/github/azyu/homebrew-tap/Casks/transnovel.rb.template \
  /tmp/transnovel.rb
cmp /tmp/transnovel.rb /Users/azyu/code/github/azyu/homebrew-tap/Casks/transnovel.rb
```

Expected:

```text
Rendered transnovel.rb for v0.1.5
```

`cmp` exits with status 0, proving the committed cask matches the published asset metadata.

- [ ] **Step 6: Commit the renderer and tests**

```bash
cd /Users/azyu/code/github/azyu/transnovel
git add scripts/render-homebrew-cask.mjs scripts/render-homebrew-cask.test.mjs
git commit -m "feat(release): render Homebrew cask"
```

Expected: one commit containing the renderer and its contract tests.

---

### Task 3: Connect the release workflow to the tap

**Files:**
- Modify: `/Users/azyu/code/github/azyu/transnovel/.github/workflows/release.yml:218`

**Interfaces:**
- Consumes: `prepare.outputs.tag`, published release asset metadata, `scripts/render-homebrew-cask.mjs`, the tap template, and Actions secret `HOMEBREW_TAP_TOKEN`.
- Produces: a direct `main`-branch commit in `azyu/homebrew-tap` changing only `Casks/transnovel.rb`.

- [ ] **Step 1: Add the Homebrew tap job after the release job**

Insert the following job between `release` and `sync-main-version` in `/Users/azyu/code/github/azyu/transnovel/.github/workflows/release.yml`:

```yaml
  homebrew-tap:
    name: Update Homebrew Tap
    needs:
      - prepare
      - release
    runs-on: ubuntu-latest
    permissions:
      contents: read
    env:
      HOMEBREW_TAP_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}

    steps:
      - name: Ensure Homebrew tap token is configured
        shell: bash
        run: |
          set -euo pipefail
          if [[ -z "${HOMEBREW_TAP_TOKEN}" ]]; then
            echo "HOMEBREW_TAP_TOKEN is not configured."
            exit 1
          fi

      - name: Checkout TransNovel release
        uses: actions/checkout@v5
        with:
          ref: ${{ needs.prepare.outputs.tag }}
          path: transnovel

      - name: Checkout homebrew-tap
        uses: actions/checkout@v5
        with:
          repository: azyu/homebrew-tap
          token: ${{ env.HOMEBREW_TAP_TOKEN }}
          path: homebrew-tap
          ref: main

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: 24
          package-manager-cache: false

      - name: Load published release assets
        env:
          GH_TOKEN: ${{ github.token }}
          RELEASE_TAG: ${{ needs.prepare.outputs.tag }}
        run: gh release view "${RELEASE_TAG}" --repo "${GITHUB_REPOSITORY}" --json assets > homebrew-release.json

      - name: Render cask from published DMG digest
        env:
          RELEASE_TAG: ${{ needs.prepare.outputs.tag }}
        run: |
          node transnovel/scripts/render-homebrew-cask.mjs \
            "${RELEASE_TAG}" \
            homebrew-release.json \
            homebrew-tap/Casks/transnovel.rb.template \
            homebrew-tap/Casks/transnovel.rb

      - name: Commit and push cask update
        shell: bash
        working-directory: homebrew-tap
        env:
          RELEASE_TAG: ${{ needs.prepare.outputs.tag }}
        run: |
          set -euo pipefail

          if git diff --quiet -- Casks/transnovel.rb; then
            echo "Homebrew cask already matches ${RELEASE_TAG}."
            exit 0
          fi

          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add Casks/transnovel.rb
          git commit -m "chore: update transnovel to ${RELEASE_TAG#v}"
          git push origin HEAD:main
```

- [ ] **Step 2: Validate workflow YAML syntax**

Run:

```bash
cd /Users/azyu/code/github/azyu/transnovel
ruby -e 'require "yaml"; YAML.parse_file(ARGV.fetch(0))' .github/workflows/release.yml
```

Expected: exit status 0 with no output.

- [ ] **Step 3: Re-run renderer tests after workflow integration**

Run:

```bash
cd /Users/azyu/code/github/azyu/transnovel
node --test scripts/render-homebrew-cask.test.mjs
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 4: Commit the release workflow integration**

```bash
cd /Users/azyu/code/github/azyu/transnovel
git add .github/workflows/release.yml
git commit -m "feat(release): update Homebrew tap"
```

Expected: one commit adding only the `homebrew-tap` release job.

---

### Task 4: Configure authentication and verify end to end

**Files:**
- Modify through GitHub API: TransNovel Actions secret `HOMEBREW_TAP_TOKEN`
- Update through GitHub API: `azyu/transnovel` Issue #65

**Interfaces:**
- Consumes: a fine-grained GitHub token scoped to `azyu/homebrew-tap` with repository contents write permission.
- Produces: cross-repository release write access and evidence that the public tap installs the expected application.

- [ ] **Step 1: Configure the required Actions secret**

Create a fine-grained GitHub token restricted to `azyu/homebrew-tap` with **Contents: Read and write**, then run without placing the token in shell history:

```bash
cd /Users/azyu/code/github/azyu/transnovel
gh secret set HOMEBREW_TAP_TOKEN --repo azyu/transnovel
```

Expected: `gh secret list --repo azyu/transnovel` includes `HOMEBREW_TAP_TOKEN`. Never print or read back the token value.

- [ ] **Step 2: Run TransNovel repository verification**

Run:

```bash
cd /Users/azyu/code/github/azyu/transnovel
node --test scripts/render-homebrew-cask.test.mjs
pnpm run lint
pnpm run build
pnpm run test
cd src-tauri
cargo test
cargo clippy -- -D warnings
```

Expected:

- renderer: 4 passed, 0 failed
- ESLint: exit status 0
- TypeScript/Vite build: exit status 0
- Vitest: all existing tests pass
- Cargo tests: all tests pass
- Clippy: exit status 0 with no warnings

If Clippy still fails only for the repository-wide Rust 1.97 `too_many_arguments` baseline, record the exact output against existing Issue #56; do not weaken lint settings in this change.

- [ ] **Step 3: Run tap verification**

Run:

```bash
cd /Users/azyu/code/github/azyu/homebrew-tap
ruby -c Casks/transnovel.rb
brew tap-new --no-git azyu/transnovel-local
install -m 0644 Casks/transnovel.rb "$(brew --repository azyu/transnovel-local)/Casks/transnovel.rb"
brew audit --cask --strict --online azyu/transnovel-local/transnovel
brew untap azyu/transnovel-local
```

Expected: `Syntax OK`; Homebrew audit exits with status 0.

- [ ] **Step 4: Request an independent completed-change review**

Ask a separate review agent to inspect both repositories for:

- cask correctness and Homebrew conventions
- asset-name and digest validation
- workflow permission scope and secret handling
- update ordering after release publication
- unintended files in either commit

Apply valid findings, rerun the affected checks, and record the review result in Issue #65.

- [ ] **Step 5: Publish the reviewed commits**

Push the reviewed TransNovel and homebrew-tap commits through the repository's selected integration path. Confirm both remote branches contain the commits before exercising the public tap.

Expected: GitHub serves `Casks/transnovel.rb` from `azyu/homebrew-tap`, and the TransNovel release workflow contains the `homebrew-tap` job.

- [ ] **Step 6: Install from the public tap without replacing the existing app**

The workstation already has `/Applications/TransNovel.app`, so install into an isolated application directory:

```bash
mkdir -p /tmp/transnovel-homebrew-apps
brew update
brew install --yes --cask --appdir=/tmp/transnovel-homebrew-apps azyu/tap/transnovel
test -d /tmp/transnovel-homebrew-apps/TransNovel.app
xattr -p com.apple.quarantine /tmp/transnovel-homebrew-apps/TransNovel.app
spctl --assess --type execute /tmp/transnovel-homebrew-apps/TransNovel.app
```

Expected:

- Homebrew downloads `TransNovel_0.1.5_aarch64.dmg` and validates its checksum.
- `/tmp/transnovel-homebrew-apps/TransNovel.app` exists.
- `xattr -p` prints the quarantine attribute for the installed bundle.
- `spctl` returns non-zero for the current ad-hoc signed, non-notarized bundle, matching the README warning. This expected Gatekeeper result does not make the installation check fail.

Before launching the isolated app, remove quarantine only from the isolated test copy:

```bash
xattr -dr com.apple.quarantine /tmp/transnovel-homebrew-apps/TransNovel.app
open /tmp/transnovel-homebrew-apps/TransNovel.app
```

The quarantine removal is test-only. End-user documentation uses Finder Control-click **Open** and confirm **Open**, or **System Settings > Privacy & Security > Open Anyway**.

Expected: TransNovel opens from the isolated path after quarantine is removed from the test copy.

- [ ] **Step 7: Remove the isolated verification installation**

Run:

```bash
brew uninstall --cask transnovel
```

Expected: the isolated Homebrew-managed app is removed; the pre-existing `/Applications/TransNovel.app` and its user data remain untouched.

- [ ] **Step 8: Record completion evidence**

Comment on Issue #65 with:

- renderer test count
- frontend lint, build, and test results
- Cargo test and Clippy results or the exact #56 baseline failure
- Homebrew audit result
- isolated install, checksum, app launch, Gatekeeper observation, and uninstall results
- review result
- both commit or PR links

Close Issue #65 only after every acceptance criterion is met.
