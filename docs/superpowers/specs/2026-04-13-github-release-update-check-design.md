# GitHub Release Update Check Design

Date: 2026-04-13
Status: Approved for implementation

## Goal

Add a minimal in-app update check that compares the installed app version with the latest stable GitHub Release and offers a link to the release page.

## Scope

Included:

- An `업데이트 확인` action in the settings `정보` tab
- Backend fetch of the latest stable GitHub Release for `azyu/transnovel`
- Version comparison between the installed app version and the latest release tag
- UI states for idle, checking, update available, up to date, and check failure
- A `릴리즈 열기` action that opens the GitHub Release page in the system browser

Excluded:

- Automatic background update checks on startup
- In-app asset download
- Automatic install, restart, or updater plugin integration
- Release notes rendering inside the app

## Product Rules

- Only stable releases count for update checks.
- Draft and prerelease releases must not be treated as install targets.
- The update flow must remain optional and user-initiated.
- If the check fails, the existing app information view must remain usable.

## Architecture

### Backend

- Add a thin Tauri command in `src-tauri/src/commands/settings.rs` that requests `https://api.github.com/repos/azyu/transnovel/releases/latest`.
- Parse only the fields needed by the UI:
  - `tag_name`
  - `html_url`
  - `name`
- Normalize the release version from `vX.Y.Z` to `X.Y.Z`.
- Return `Result<T, String>` with Korean user-facing error messages on failure.

### Frontend

- Extend `src/components/settings/AboutSettings.tsx` to:
  - keep loading the current installed version with `getVersion()`
  - call the new backend command only when the user presses `업데이트 확인`
  - compare the installed version with the returned release version
  - render a short status message and `릴리즈 열기` button when an update is available
- Keep the existing visual structure of the information card and add one small status block below the version text.

### Version Comparison

- Compare only numeric `major.minor.patch` segments.
- Strip a leading `v` from the GitHub tag before comparing.
- If the latest release version is greater than the installed version, show it as available.
- Equal versions are treated as up to date.

## Risks

- GitHub API failures or rate limits can block the check. The UI should show a short failure message and allow retry.
- Release tags must stay in `vMAJOR.MINOR.PATCH` form for comparison to work predictably.

## Verification

Design-level acceptance criteria:

- Clicking `업데이트 확인` calls the backend command once.
- If the latest stable release is newer than the installed version, the UI shows the new version and `릴리즈 열기`.
- If the versions match, the UI says the app is up to date.
- If the check fails, the UI shows an error message without breaking the rest of the page.
