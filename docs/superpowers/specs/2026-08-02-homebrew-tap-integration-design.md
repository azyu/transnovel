# Homebrew Tap Integration Design

Date: 2026-08-02
Status: Approved for implementation
Issue: https://github.com/azyu/transnovel/issues/65

## Goal

Distribute the Apple Silicon build of TransNovel through `azyu/homebrew-tap` so users can install it with:

```bash
brew install --cask azyu/tap/transnovel
```

After each successful TransNovel release, update the tap automatically from the published DMG version and SHA256 digest.

## Scope

Included:

- An Apple Silicon-only Homebrew cask for TransNovel
- A cask template whose version and SHA256 are rendered by the release workflow
- Direct updates to `azyu/homebrew-tap` after a TransNovel GitHub Release is published
- Homebrew install, upgrade, uninstall, and current Gatekeeper guidance in the tap README
- Verification of cask syntax, release asset identity, digest, and app bundle installation

Excluded:

- Intel macOS builds
- Apple Developer signing and notarization
- Submission to the public `homebrew/cask` repository
- A Homebrew Formula; TransNovel is a GUI app and must use a cask
- A second update service; the existing Tauri updater remains active

## Decisions

### Cask layout

Use the standard cask location in the tap:

```text
homebrew-tap/
└── Casks/
    ├── transnovel.rb
    └── transnovel.rb.template
```

Existing CLI formulae remain at their current paths. Moving them is unrelated to this change.

`transnovel.rb` declares:

- `version` rendered from the `vMAJOR.MINOR.PATCH` release tag without the leading `v`
- `sha256` from the matching GitHub Release asset digest
- A URL for `TransNovel_#{version}_aarch64.dmg`
- `name "TransNovel"`
- The GitHub repository as homepage
- `auto_updates true`, because the bundled Tauri updater can replace the application
- `depends_on arch: :arm64`, so Intel Macs fail with an explicit unsupported-architecture message
- `app "TransNovel.app"`

No `zap` stanza is added. A normal uninstall removes the application but preserves user configuration and translation state. Destructive removal of user data is outside this integration.

### Release ownership

The TransNovel release workflow owns cask version updates. This matches the existing `skillctl` release convention:

1. Publish and validate the TransNovel GitHub Release.
2. Start a `homebrew-tap` job that depends on the successful `release` job.
3. Check out `azyu/homebrew-tap` using a fine-grained `HOMEBREW_TAP_TOKEN` secret.
4. Read the published release asset metadata with `gh release view --json assets`.
5. Select exactly `TransNovel_<version>_aarch64.dmg`.
6. Remove the `sha256:` prefix from its GitHub-provided digest.
7. Render `Casks/transnovel.rb.template` into `Casks/transnovel.rb`.
8. Commit and push only `Casks/transnovel.rb` when its content changed.

The initial cask, template, and README changes are committed directly in `homebrew-tap`. Subsequent releases change only the rendered cask.

### Authentication

`HOMEBREW_TAP_TOKEN` is a fine-grained token scoped to `azyu/homebrew-tap` with repository contents write permission. It is stored as a TransNovel Actions secret.

A missing token is a release integration failure, not a successful skip. The GitHub Release can remain published, but the failed `homebrew-tap` job must make tap drift visible.

## Data Flow

```text
vMAJOR.MINOR.PATCH tag
        |
        v
TransNovel release workflow
        |
        +--> build TransNovel_<version>_aarch64.dmg
        |
        +--> publish GitHub Release
        |
        +--> read published asset digest
        |
        +--> render Casks/transnovel.rb
        |
        v
azyu/homebrew-tap main
        |
        v
brew install/upgrade --cask azyu/tap/transnovel
```

The published GitHub Release is the source of truth. The workflow does not hash a separate local build artifact because that could diverge from the asset users download.

## Failure Handling

The Homebrew update job fails when:

- `HOMEBREW_TAP_TOKEN` is unset
- the expected ARM64 DMG is absent
- the release asset digest is absent or is not a SHA256 digest
- a cask template placeholder remains after rendering
- checkout, commit, or push fails

If the rendered cask is unchanged, the job exits successfully without creating an empty commit.

Concurrent release workflows retain the existing release concurrency policy. Each job renders from its own release tag. Direct push is acceptable because releases are serialized by normal versioning practice; a push conflict fails visibly rather than overwriting remote changes.

## Gatekeeper Behavior

The current Tauri configuration uses ad-hoc signing with `signingIdentity: "-"` and does not notarize the macOS artifact. Homebrew can install the DMG, but macOS may block the quarantined app or show an unidentified/developer verification warning.

After the normal Homebrew installation, users should locate `TransNovel` in Finder, Control-click it, choose **Open**, and confirm **Open**. Alternatively, open **System Settings > Privacy & Security** and choose **Open Anyway** for TransNovel. The tap README must not imply that the application is Apple-notarized; users should only bypass the warning if they trust the published artifact. Proper Developer ID signing and notarization remain separate follow-up work.

## Verification

### Cask definition

- A cask audit passes after staging the local cask in a temporary named tap.
- The cask version equals the selected GitHub Release version.
- The cask SHA256 equals the published DMG asset digest.
- The cask rejects non-ARM64 installations through its architecture dependency.

For the passing local audit, stage and audit the cask by qualified name:

```bash
brew tap-new --no-git azyu/transnovel-local
install -m 0644 Casks/transnovel.rb "$(brew --repository azyu/transnovel-local)/Casks/transnovel.rb"
brew audit --cask --strict azyu/transnovel-local/transnovel
brew untap azyu/transnovel-local
```

### Installation

- Installing the local cask on Apple Silicon stages `TransNovel.app` in the Homebrew application target.
- Standard installation preserves quarantine; `xattr -p com.apple.quarantine` verifies the attribute and `spctl --assess --type execute` rejects the current ad-hoc signed, non-notarized bundle.
- Removing quarantine only from the isolated test copy allows the app to launch. This removal is test-only; end-user guidance uses Finder Control-click **Open** and confirm **Open**, or **System Settings > Privacy & Security > Open Anyway**.
- Uninstall removes the app without deleting user configuration or translation data.

### Automation

- Rendering against the latest stable release produces the committed cask exactly.
- A missing token, asset, digest, or unresolved placeholder returns a non-zero status.
- A no-change render exits without a commit.
- The update commit contains only `Casks/transnovel.rb`.

## Documentation

The tap README adds TransNovel under a separate cask/application section and includes:

- standard install command
- Finder Control-click **Open** and confirm **Open** guidance, with **System Settings > Privacy & Security > Open Anyway** as an alternative, plus the ad-hoc/non-notarized security warning
- `brew upgrade --cask --greedy transnovel`, because `auto_updates true` otherwise excludes it from normal cask upgrades
- uninstall command
- Apple Silicon-only support statement
