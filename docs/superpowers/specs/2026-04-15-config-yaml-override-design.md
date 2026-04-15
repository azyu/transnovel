# Config YAML Override Design

Date: 2026-04-15
Status: Approved for implementation

## Goal

Add an advanced-user configuration file at `~/.config/transnovel/config.yaml` that can override the app's LLM provider/model graph without replacing the existing SQLite-backed app state.

The override is intentionally narrow:

- If the file does not exist, the app behaves exactly as it does today.
- If the file exists, the file becomes the source of truth for the entire LLM settings UI and the translation runtime provider/model selection.

## Scope

Included:

- A new YAML config file at `~/.config/transnovel/config.yaml`
- A repo-level `config.example.yaml` that users can copy and edit
- Runtime loading of YAML-managed LLM settings from Rust
- Override of the active model when the file exists
- Override of provider-specific API keys and OpenAI-compatible base URLs when defined in the file
- Locking the entire LLM settings UI when the file exists
- Clear user-facing notice that LLM settings are managed by the file

Excluded:

- Replacing SQLite for non-LLM settings
- Moving OAuth tokens, API logs, or watchlist data to YAML
- Supporting arbitrary nested provider schemas beyond the fields required now
- Live file watching or automatic hot reload while the app is open

## Config Schema

The supported file shape is:

```yaml
active_model: gemma-4-26b-a4b-it-4bit

providers:
  my-provider-1:
    type: openai-compatible
    api_key: sk-...
    base_url: https://example.com/v1

models:
  gemma-4-26b-a4b-it-4bit:
    provider: my-provider-1
    model_id: gemma-4-26b-a4b-it-4bit
```

The repository should also include a matching `config.example.yaml` with the same shape and commented guidance so advanced users can copy it into `~/.config/transnovel/config.yaml` and edit only the values they need.

Rules:

- `active_model` is required when the file exists.
- `providers` is required when the file exists.
- `models` is required when the file exists.
- `active_model` must match a key inside `models`.
- `models.<name>.provider` must match a key inside `providers`.
- `models.<name>.model_id` is required and must be a non-empty string.
- `providers.<name>.type` is required and must be a supported API-key-based provider type.
- `providers.<name>.api_key` is required and must be a non-empty string.
- `providers.<name>.base_url` is required for `openai-compatible` and rejected for provider types that do not use a custom base URL.
- `openai-oauth` is not supported in YAML-managed config.
- Unknown top-level keys should be treated as invalid config instead of being silently ignored.

## Product Rules

- The YAML file is opt-in. Missing file means no behavior change.
- Existing DB-backed LLM settings remain the fallback only when the YAML file is absent.
- If the YAML file exists, it overrides the LLM configuration instead of merging key-by-key with DB values.
- The app must not allow editing any LLM settings in the UI while the YAML file exists.
- The rest of the settings UI remains editable unless it belongs to the LLM settings area.
- Invalid YAML should fail loudly with a clear user-facing error instead of silently falling back to DB values.
- YAML-managed providers are limited to API-key-based providers. OAuth login remains DB/UI-managed and unavailable while YAML override is active.
- The example file in the repo must stay aligned with the supported schema so users can treat it as the canonical starting point.

## Architecture

### Backend

- Add a small config loader under the Rust backend that resolves `~/.config/transnovel/config.yaml`.
- Parse the YAML into a typed config struct instead of ad hoc maps.
- Keep Tauri commands thin and reuse the config loader from existing settings command paths and translation runtime setup.
- Expose enough information for the frontend to know whether LLM settings are file-managed.

### Runtime Precedence

- If `config.yaml` is absent, use the current SQLite-backed settings flow.
- If `config.yaml` is present, use YAML values for:
  - active model
  - provider definitions
  - provider API keys
  - provider-specific OpenAI-compatible base URL when applicable
- Do not partially mix YAML and DB LLM values once the file exists.
- Resolve the active provider indirectly through `active_model -> models.<name>.provider -> providers.<name>`.

### Frontend

- Detect from backend settings metadata whether the LLM settings are file-managed.
- Disable the entire LLM settings area, not just provider/model controls.
- Show a static explanation such as:
  - ``LLM 설정은 ~/.config/transnovel/config.yaml 에서 관리되고 있어 앱에서 변경할 수 없습니다.``
- Prevent save actions, provider add/remove actions, model changes, and provider-specific endpoint edits while locked.

## Validation

If the file exists, validation must enforce:

- valid YAML syntax
- presence of `active_model`
- presence of `providers`
- presence of `models`
- `active_model` references an existing model entry
- every model entry has a non-empty `model_id`
- every model entry references an existing provider entry
- every provider entry has a supported API-key-based `type`
- every provider entry has a non-empty `api_key`
- `openai-compatible` entries include a valid non-empty `base_url`
- `openai-oauth` is rejected
- no unsupported top-level keys

Validation failures should surface as explicit errors at the IPC boundary with user-facing Korean messages where the existing settings UI already presents errors.

## UI Lock Scope

When YAML override is active, lock all controls inside the LLM settings surface, including:

- active model selection
- provider add/remove actions
- provider credential or endpoint editing UI inside the LLM settings section
- OpenAI-compatible `base_url` editing
- any save/apply action that mutates LLM settings

This lock is intentional to keep the source of truth singular and to avoid misleading users into editing values that runtime will ignore.

## Risks

- The current code reads LLM settings from multiple frontend/backend paths, so override handling must be centralized enough to avoid drift.
- Strict validation is safer, but it means malformed files can block LLM usage until fixed.
- If the UI lock is incomplete, users may still see stale editable state that does not match runtime behavior.

## Verification

Design-level acceptance criteria:

- Without `~/.config/transnovel/config.yaml`, existing LLM settings behavior remains unchanged.
- With a valid `config.yaml`, translation runtime resolves the active model and provider entirely from YAML-managed values.
- With a valid `config.yaml`, the entire LLM settings UI becomes read-only/disabled and explains why.
- With a malformed `config.yaml`, the app reports a clear configuration error instead of silently falling back to DB-backed LLM settings.
- Non-LLM settings continue to use existing persistence and remain editable.
