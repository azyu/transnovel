# YAML LLM Config Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add platform-specific external YAML config for API-key-based LLM provider/model overrides, keep the existing DB-backed settings contract as the fallback, and lock the full LLM settings UI when the file exists.

**Architecture:** Add a Rust `llm_config` service that loads and validates `config.yaml` from the OS config directory, converts YAML data into the existing `llm_providers` / `llm_models` / `active_model_id` JSON settings shape, and injects metadata keys into `get_settings()`. Keep current frontend runtime readers working by preserving those keys, then add a small lock path in `LLMSettings.tsx` that disables every control when `llm_config_managed=true`.

**Tech Stack:** Rust/Tauri, `serde_yaml`, TypeScript/React, Vitest, SQLite settings fallback

---

## File Structure

- Create: `src-tauri/src/services/llm_config.rs`
  - Own platform config path resolution, YAML parsing, validation, internal type mapping, and settings synthesis.
- Modify: `src-tauri/src/services/mod.rs`
  - Export the new `llm_config` service.
- Modify: `src-tauri/Cargo.toml`
  - Add `serde_yaml`.
- Modify: `src-tauri/src/commands/settings.rs`
  - Apply YAML override inside `get_settings()` and expose lock metadata keys.
- Modify: `src-tauri/src/services/translator.rs`
  - Stop swallowing `get_settings()` errors so malformed YAML blocks translation with a clear message.
- Create: `src/components/settings/LLMSettings.test.tsx`
  - Cover file-managed lock state and disabled controls.
- Modify: `src/components/settings/LLMSettings.tsx`
  - Read lock metadata, show explanation banner, and disable the full LLM settings area.
- Modify: `src/components/settings/llm/ProviderList.tsx`
  - Accept a disabled flag and disable edit/delete actions.
- Modify: `src/components/settings/llm/ModelList.tsx`
  - Accept a disabled flag and disable select/edit/delete actions.
- Create: `config.example.yaml`
  - Ship a copy-ready example matching the supported schema.

### Task 1: Add failing backend coverage for YAML parsing and settings synthesis

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/services/llm_config.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Add the YAML dependency and export stub**

```toml
# src-tauri/Cargo.toml
[dependencies]
serde_yaml = "0.9"
```

```rust
// src-tauri/src/services/mod.rs
pub mod llm_config;
```

- [ ] **Step 2: Write a failing parser/synthesis test for a valid OpenAI-compatible config**

```rust
// src-tauri/src/services/llm_config.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_yaml_override_is_mapped_to_existing_settings_shape() {
        let yaml = r#"
active_model: gemma-4-26b-a4b-it-4bit
providers:
  my-provider-1:
    type: openai-compatible
    api_key: sk-test
    base_url: https://example.com/v1
models:
  gemma-4-26b-a4b-it-4bit:
    provider: my-provider-1
    model_id: gemma-4-26b-a4b-it-4bit
"#;

        let file_config = parse_yaml_llm_config(yaml, "/mock/config.yaml").expect("parse yaml");
        let settings = effective_settings_from_file(Vec::new(), &file_config).expect("synthesize settings");

        let providers = settings.iter().find(|s| s.key == "llm_providers").expect("providers");
        let models = settings.iter().find(|s| s.key == "llm_models").expect("models");
        let active_model = settings.iter().find(|s| s.key == "active_model_id").expect("active model");
        let managed = settings.iter().find(|s| s.key == "llm_config_managed").expect("managed key");

        assert!(providers.value.contains(r#""id":"my-provider-1""#));
        assert!(providers.value.contains(r#""type":"custom""#));
        assert!(providers.value.contains(r#""apiKey":"sk-test""#));
        assert!(models.value.contains(r#""id":"gemma-4-26b-a4b-it-4bit""#));
        assert!(models.value.contains(r#""providerId":"my-provider-1""#));
        assert_eq!(active_model.value, "gemma-4-26b-a4b-it-4bit");
        assert_eq!(managed.value, "true");
    }
}
```

- [ ] **Step 3: Add failing validation tests for unsupported OAuth and missing model references**

```rust
#[test]
fn yaml_override_rejects_openai_oauth() {
    let yaml = r#"
active_model: codex
providers:
  codex:
    type: openai-oauth
    api_key: ignored
models:
  codex:
    provider: codex
    model_id: gpt-5.2-codex
"#;

    let error = parse_yaml_llm_config(yaml, "/mock/config.yaml").expect_err("reject oauth");
    assert!(error.contains("openai-oauth"));
}

#[test]
fn yaml_override_rejects_unknown_active_model() {
    let yaml = r#"
active_model: missing-model
providers:
  my-provider-1:
    type: openai-compatible
    api_key: sk-test
    base_url: https://example.com/v1
models:
  gemma:
    provider: my-provider-1
    model_id: gemma
"#;

    let error = parse_yaml_llm_config(yaml, "/mock/config.yaml").expect_err("reject missing model");
    assert!(error.contains("active_model"));
}
```

- [ ] **Step 4: Run backend tests to confirm they fail before implementation**

Run: `cd src-tauri && cargo test llm_config -- --nocapture`

Expected: FAIL with missing `parse_yaml_llm_config` / `effective_settings_from_file` items.

- [ ] **Step 5: Commit the failing test scaffold**

```bash
git add src-tauri/Cargo.toml src-tauri/src/services/mod.rs src-tauri/src/services/llm_config.rs
git commit -m "test: add llm config override backend coverage"
```

### Task 2: Implement the YAML loader and inject it into `get_settings()`

**Files:**
- Modify: `src-tauri/src/services/llm_config.rs`
- Modify: `src-tauri/src/commands/settings.rs`

- [ ] **Step 1: Implement platform config path resolution and typed YAML structs**

```rust
// src-tauri/src/services/llm_config.rs
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FileLlmConfig {
    pub active_model: String,
    pub providers: BTreeMap<String, FileProviderConfig>,
    pub models: BTreeMap<String, FileModelConfig>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FileProviderConfig {
    #[serde(rename = "type")]
    pub provider_type: String,
    pub api_key: String,
    #[serde(default)]
    pub base_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FileModelConfig {
    pub provider: String,
    pub model_id: String,
}

pub fn config_file_path() -> Result<PathBuf, String> {
    let base = dirs::config_dir()
        .ok_or_else(|| "설정 디렉터리를 찾을 수 없습니다.".to_string())?;
    Ok(base.join("transnovel").join("config.yaml"))
}
```

- [ ] **Step 2: Implement validation and internal provider type normalization**

```rust
fn normalize_provider_type(provider_type: &str) -> Result<&'static str, String> {
    match provider_type {
        "gemini" => Ok("gemini"),
        "openrouter" => Ok("openrouter"),
        "anthropic" => Ok("anthropic"),
        "openai" => Ok("openai"),
        "openai-compatible" => Ok("custom"),
        "openai-oauth" => Err("config.yaml 에서는 openai-oauth를 지원하지 않습니다.".to_string()),
        other => Err(format!("지원하지 않는 provider type 입니다: {other}")),
    }
}

pub fn parse_yaml_llm_config(yaml: &str, path: impl AsRef<Path>) -> Result<FileLlmConfig, String> {
    let config: FileLlmConfig = serde_yaml::from_str(yaml)
        .map_err(|e| format!("config.yaml 파싱 실패 ({}): {e}", path.as_ref().display()))?;

    if !config.models.contains_key(&config.active_model) {
        return Err("config.yaml 의 active_model 이 models 항목을 가리키지 않습니다.".to_string());
    }

    for (provider_name, provider) in &config.providers {
        let normalized = normalize_provider_type(&provider.provider_type)?;
        if provider.api_key.trim().is_empty() {
            return Err(format!("provider '{provider_name}' 의 api_key 가 비어 있습니다."));
        }
        if normalized == "custom" && provider.base_url.as_deref().unwrap_or("").trim().is_empty() {
            return Err(format!("provider '{provider_name}' 는 base_url 이 필요합니다."));
        }
    }

    for (model_name, model) in &config.models {
        if model.model_id.trim().is_empty() {
            return Err(format!("model '{model_name}' 의 model_id 가 비어 있습니다."));
        }
        if !config.providers.contains_key(&model.provider) {
            return Err(format!("model '{model_name}' 이 알 수 없는 provider 를 참조합니다."));
        }
    }

    Ok(config)
}
```

- [ ] **Step 3: Synthesize existing setting keys plus metadata keys**

```rust
use crate::commands::settings::Setting;
use serde::Serialize;

#[derive(Debug, Serialize)]
struct UiProviderConfig {
    id: String,
    #[serde(rename = "type")]
    provider_type: String,
    name: String,
    #[serde(rename = "apiKey")]
    api_key: String,
    #[serde(rename = "baseUrl")]
    base_url: String,
}

#[derive(Debug, Serialize)]
struct UiModelConfig {
    id: String,
    name: String,
    #[serde(rename = "providerId")]
    provider_id: String,
    #[serde(rename = "modelId")]
    model_id: String,
}

pub fn effective_settings_from_file(
    mut settings: Vec<Setting>,
    file_config: &FileLlmConfig,
) -> Result<Vec<Setting>, String> {
    let providers = file_config.providers.iter().map(|(name, provider)| {
        Ok(UiProviderConfig {
            id: name.clone(),
            provider_type: normalize_provider_type(&provider.provider_type)?.to_string(),
            name: name.clone(),
            api_key: provider.api_key.clone(),
            base_url: provider.base_url.clone().unwrap_or_default(),
        })
    }).collect::<Result<Vec<_>, String>>()?;

    let models = file_config.models.iter().map(|(name, model)| UiModelConfig {
        id: name.clone(),
        name: name.clone(),
        provider_id: model.provider.clone(),
        model_id: model.model_id.clone(),
    }).collect::<Vec<_>>();

    upsert_setting(&mut settings, "llm_providers", serde_json::to_string(&providers).map_err(|e| e.to_string())?);
    upsert_setting(&mut settings, "llm_models", serde_json::to_string(&models).map_err(|e| e.to_string())?);
    upsert_setting(&mut settings, "active_model_id", file_config.active_model.clone());
    upsert_setting(&mut settings, "llm_config_managed", "true".to_string());
    upsert_setting(&mut settings, "llm_config_path", config_file_path()?.display().to_string());

    Ok(settings)
}

pub fn load_effective_settings(settings: Vec<Setting>) -> Result<Vec<Setting>, String> {
    let path = config_file_path()?;
    if !path.exists() {
        return Ok(settings);
    }

    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("config.yaml 읽기 실패 ({}): {e}", path.display()))?;
    let file_config = parse_yaml_llm_config(&raw, &path)?;
    effective_settings_from_file(settings, &file_config)
}
```

- [ ] **Step 4: Apply the override inside `get_settings()`**

```rust
// src-tauri/src/commands/settings.rs
use crate::services::llm_config;

#[tauri::command]
pub async fn get_settings() -> Result<Vec<Setting>, String> {
    let pool = get_pool()?;
    let rows = sqlx::query("SELECT key, value FROM settings")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut settings: Vec<Setting> = rows
        .iter()
        .map(|row| Setting {
            key: row.get("key"),
            value: row.get("value"),
        })
        .collect();

    if settings.is_empty() {
        settings = get_default_settings();
    }

    llm_config::load_effective_settings(settings)
}
```

- [ ] **Step 5: Re-run backend tests and make them pass**

Run: `cd src-tauri && cargo test llm_config settings::tests -- --nocapture`

Expected: PASS for the new `llm_config` tests and existing `settings::tests`.

- [ ] **Step 6: Commit the loader and settings integration**

```bash
git add src-tauri/Cargo.toml src-tauri/src/services/mod.rs src-tauri/src/services/llm_config.rs src-tauri/src/commands/settings.rs
git commit -m "feat: load llm config overrides from yaml"
```

### Task 3: Propagate config errors into translation runtime

**Files:**
- Modify: `src-tauri/src/services/translator.rs`

- [ ] **Step 1: Add failing unit tests for the translator settings builder**

```rust
// src-tauri/src/services/translator.rs
#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::settings::Setting;

    #[test]
    fn build_translator_settings_reads_existing_settings_shape() {
        let settings = vec![
            Setting { key: "llm_providers".into(), value: r#"[{"id":"provider-1","type":"custom","apiKey":"sk-test","baseUrl":"https://example.com/v1"}]"#.into() },
            Setting { key: "llm_models".into(), value: r#"[{"id":"model-1","providerId":"provider-1","modelId":"gemma"}]"#.into() },
            Setting { key: "active_model_id".into(), value: "model-1".into() },
        ];

        let translator_settings = build_translator_settings_from_records(&settings).expect("build settings");
        assert_eq!(translator_settings.provider_type, "custom");
        assert_eq!(translator_settings.model.as_deref(), Some("gemma"));
        assert_eq!(translator_settings.base_url.as_deref(), Some("https://example.com/v1"));
    }

    #[test]
    fn build_translator_settings_rejects_missing_active_model() {
        let error = build_translator_settings_from_records(&[]).expect_err("missing active model");
        assert!(error.contains("모델"));
    }
}
```

- [ ] **Step 2: Run the translator test target and confirm it fails before implementation**

Run: `cd src-tauri && cargo test translator::tests -- --nocapture`

Expected: FAIL with missing `build_translator_settings_from_records`.

- [ ] **Step 3: Refactor `load_settings()` to return `Result` and stop swallowing `get_settings()` errors**

```rust
impl TranslatorService {
    pub async fn new() -> Result<Self, String> {
        let settings = Self::load_settings().await?;
        // existing client routing unchanged
    }

    async fn load_settings() -> Result<TranslatorSettings, String> {
        let settings = get_settings().await?;
        build_translator_settings_from_records(&settings)
    }
}

fn build_translator_settings_from_records(settings: &[Setting]) -> Result<TranslatorSettings, String> {
    let get_setting = |key: &str| -> Option<String> {
        settings.iter().find(|s| s.key == key).map(|s| s.value.clone()).filter(|v| !v.is_empty())
    };

    let providers_json = get_setting("llm_providers").unwrap_or_else(|| "[]".to_string());
    let providers: Vec<ProviderConfig> = serde_json::from_str(&providers_json).unwrap_or_default();

    let models_json = get_setting("llm_models").unwrap_or_else(|| "[]".to_string());
    let models: Vec<ModelConfig> = serde_json::from_str(&models_json).unwrap_or_default();

    let active_model_id = get_setting("active_model_id")
        .ok_or_else(|| "사용할 모델이 설정되지 않았습니다. 설정에서 모델을 추가해주세요.".to_string())?;

    let active_model = models
        .iter()
        .find(|model| model.id == active_model_id)
        .ok_or_else(|| "활성 모델을 찾을 수 없습니다. 설정을 다시 확인해주세요.".to_string())?;

    let provider = providers
        .iter()
        .find(|provider| provider.id == active_model.provider_id)
        .ok_or_else(|| "활성 모델의 프로바이더를 찾을 수 없습니다. 설정을 다시 확인해주세요.".to_string())?;

    Ok(TranslatorSettings {
        system_prompt: get_setting("system_prompt").unwrap_or_else(|| DEFAULT_SYSTEM_PROMPT.to_string()),
        translation_note: get_setting("translation_note").unwrap_or_default(),
        substitutions: get_setting("substitutions").unwrap_or_default(),
        provider_type: provider.provider_type.clone(),
        provider_id: Some(provider.id.clone()),
        api_key: if provider.api_key.is_empty() { None } else { Some(provider.api_key.clone()) },
        base_url: if provider.base_url.is_empty() { None } else { Some(provider.base_url.clone()) },
        model: Some(active_model.model_id.clone()),
        use_streaming: get_setting("use_streaming").map(|v| v == "true").unwrap_or(true),
    })
}
```

- [ ] **Step 4: Re-run translator tests and make them pass**

Run: `cd src-tauri && cargo test translator::tests -- --nocapture`

Expected: PASS for the new builder tests and existing translator unit tests.

- [ ] **Step 5: Commit the translator error propagation change**

```bash
git add src-tauri/src/services/translator.rs
git commit -m "fix: surface yaml llm config errors during translation"
```

### Task 4: Add failing frontend lock coverage and implement the locked LLM settings UI

**Files:**
- Create: `src/components/settings/LLMSettings.test.tsx`
- Modify: `src/components/settings/LLMSettings.tsx`
- Modify: `src/components/settings/llm/ProviderList.tsx`
- Modify: `src/components/settings/llm/ModelList.tsx`

- [ ] **Step 1: Add a failing UI test for file-managed lock state**

```tsx
// src/components/settings/LLMSettings.test.tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMSettings } from './LLMSettings';
import { useUIStore } from '../../stores/uiStore';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn() }));

describe('LLMSettings', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({ theme: 'dark', viewConfigVersion: 0 });
    vi.mocked(invoke).mockResolvedValue([
      { key: 'llm_config_managed', value: 'true' },
      { key: 'llm_config_path', value: '/Users/test/.config/transnovel/config.yaml' },
      { key: 'llm_providers', value: '[{"id":"my-provider-1","type":"custom","name":"my-provider-1","apiKey":"sk-test","baseUrl":"https://example.com/v1"}]' },
      { key: 'llm_models', value: '[{"id":"gemma","name":"gemma","providerId":"my-provider-1","modelId":"gemma"}]' },
      { key: 'active_model_id', value: 'gemma' },
      { key: 'use_streaming', value: 'true' },
    ]);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('locks the entire LLM settings surface when config.yaml manages settings', async () => {
    await act(async () => {
      root.render(<LLMSettings />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('외부 config.yaml 파일에서 관리');
    expect(Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('+ 추가'))).toHaveProperty('disabled', true);
    expect(container.querySelector('[role="switch"]')).toHaveAttribute('disabled');
    expect(Array.from(container.querySelectorAll('button')).find((button) => button.getAttribute('aria-label')?.includes('수정'))).toHaveProperty('disabled', true);
  });
});
```

- [ ] **Step 2: Run the new frontend test and confirm it fails before implementation**

Run: `pnpm test -- src/components/settings/LLMSettings.test.tsx`

Expected: FAIL because the banner text and disabled state do not exist yet.

- [ ] **Step 3: Implement the lock metadata handling in `LLMSettings.tsx`**

```tsx
// src/components/settings/LLMSettings.tsx
const [isManagedByConfig, setIsManagedByConfig] = useState(false);
const [managedConfigPath, setManagedConfigPath] = useState<string | null>(null);

// inside loadSettings()
setIsManagedByConfig(settings.find((s) => s.key === 'llm_config_managed')?.value === 'true');
setManagedConfigPath(settings.find((s) => s.key === 'llm_config_path')?.value ?? null);

// near the header
{isManagedByConfig && (
  <div className={`p-4 rounded-xl border ${isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
    <p className="font-medium">LLM 설정은 외부 config.yaml 파일에서 관리되고 있어 앱에서 변경할 수 없습니다.</p>
    {managedConfigPath && <p className="text-xs mt-1 break-all">{managedConfigPath}</p>}
  </div>
)}

<Button size="sm" onClick={handleAddProvider} disabled={isManagedByConfig}>+ 추가</Button>
<Button size="sm" onClick={handleAddModel} disabled={isManagedByConfig || providers.length === 0}>+ 추가</Button>
<ProviderList providers={providers} onEdit={handleEditProvider} onDelete={handleDeleteProvider} disabled={isManagedByConfig} />
<ModelList models={models} providers={providers} activeModelId={activeModelId} onSelect={handleSelectModel} onEdit={handleEditModel} onDelete={handleDeleteModel} disabled={isManagedByConfig} />
<button
  type="button"
  role="switch"
  aria-checked={useStreaming}
  disabled={isManagedByConfig}
  onClick={() => !isManagedByConfig && setUseStreaming(!useStreaming)}
  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
    useStreaming ? 'bg-blue-500' : isDark ? 'bg-slate-600' : 'bg-slate-300'
  } ${isManagedByConfig ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
>
```
```

- [ ] **Step 4: Disable list item actions instead of only hiding them**

```tsx
// src/components/settings/llm/ProviderList.tsx
interface ProviderListProps {
  providers: ProviderConfig[];
  onEdit: (provider: ProviderConfig) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

<button
  type="button"
  onClick={() => onEdit(provider)}
  disabled={disabled}
  className={`p-1.5 rounded-md transition-colors ${
    disabled
      ? 'opacity-50 cursor-not-allowed'
      : isDark
        ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'
        : 'hover:bg-slate-200 text-slate-500 hover:text-slate-700'
  }`}
>
```

```tsx
// src/components/settings/llm/ModelList.tsx
interface ModelListProps {
  models: ModelConfig[];
  providers: ProviderConfig[];
  activeModelId: string | null;
  onSelect: (id: string) => void;
  onEdit: (model: ModelConfig) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

<button
  type="button"
  onClick={() => onSelect(model.id)}
  disabled={disabled}
  className={`flex items-center gap-3 flex-1 text-left min-w-0 ${
    disabled ? 'opacity-50 cursor-not-allowed' : ''
  }`}
>

<button
  type="button"
  onClick={() => onEdit(model)}
  disabled={disabled}
  className={`p-1.5 rounded-md transition-colors ${
    disabled
      ? 'opacity-50 cursor-not-allowed'
      : isDark
        ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'
        : 'hover:bg-slate-200 text-slate-500 hover:text-slate-700'
  }`}
>

<button
  type="button"
  onClick={() => onDelete(model.id)}
  disabled={disabled}
  className={`p-1.5 rounded-md transition-colors ${
    disabled
      ? 'opacity-50 cursor-not-allowed'
      : isDark
        ? 'hover:bg-red-900/30 text-slate-400 hover:text-red-400'
        : 'hover:bg-red-100 text-slate-500 hover:text-red-600'
  }`}
>
```

- [ ] **Step 5: Re-run the focused frontend tests and make them pass**

Run: `pnpm test -- src/components/settings/LLMSettings.test.tsx src/components/settings/llm/ProviderModal.test.tsx src/components/settings/llm/ModelModal.test.tsx`

Expected: PASS for the new lock test and the existing modal tests.

- [ ] **Step 6: Commit the locked UI behavior**

```bash
git add src/components/settings/LLMSettings.tsx src/components/settings/LLMSettings.test.tsx src/components/settings/llm/ProviderList.tsx src/components/settings/llm/ModelList.tsx
git commit -m "feat: lock llm settings when yaml override is active"
```

### Task 5: Ship the example config and run full verification

**Files:**
- Create: `config.example.yaml`

- [ ] **Step 1: Add the repo-level example file**

```yaml
# config.example.yaml
active_model: gemma-4-26b-a4b-it-4bit

providers:
  my-provider-1:
    type: openai-compatible
    api_key: sk-your-api-key
    base_url: https://example.com/v1

models:
  gemma-4-26b-a4b-it-4bit:
    provider: my-provider-1
    model_id: gemma-4-26b-a4b-it-4bit
```

- [ ] **Step 2: Run the most relevant automated checks first**

Run: `pnpm test -- src/components/settings/LLMSettings.test.tsx src/components/settings/llm/ProviderModal.test.tsx src/components/settings/llm/ModelModal.test.tsx`

Expected: PASS

Run: `cd src-tauri && cargo test llm_config translator::tests -- --nocapture`

Expected: PASS

- [ ] **Step 3: Run repository verification**

Run: `pnpm run lint`

Expected: PASS

Run: `pnpm run build`

Expected: PASS

Run: `cd src-tauri && cargo test`

Expected: PASS

Run: `cd src-tauri && cargo clippy -- -D warnings`

Expected: PASS

- [ ] **Step 4: Commit the example file**

```bash
git add config.example.yaml
git commit -m "docs: add example yaml llm config"
```

- [ ] **Step 5: Request code review before merge**

Run a separate review pass after all verification commands pass. Focus the review on:

```text
- malformed YAML error behavior
- `openai-compatible` -> `custom` type mapping
- lock coverage for every control inside `LLMSettings`
- keeping `TranslationView` and `StatusBar` working through synthesized `get_settings()` keys
```
