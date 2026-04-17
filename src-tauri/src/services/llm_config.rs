use crate::commands::settings::Setting;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FileLlmConfig {
    pub active_model: String,
    #[serde(default = "default_use_streaming")]
    pub use_streaming: bool,
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

pub fn config_file_path() -> Result<PathBuf, String> {
    let base = if cfg!(target_os = "macos") {
        dirs::home_dir()
            .map(|home| home.join(".config"))
            .ok_or_else(|| "설정 디렉터리를 찾을 수 없습니다.".to_string())?
    } else {
        dirs::config_dir().ok_or_else(|| "설정 디렉터리를 찾을 수 없습니다.".to_string())?
    };
    Ok(base.join("transnovel").join("config.yaml"))
}

pub fn parse_yaml_llm_config(yaml: &str, path: impl AsRef<Path>) -> Result<FileLlmConfig, String> {
    let config: FileLlmConfig = serde_yaml::from_str(yaml)
        .map_err(|e| format!("config.yaml 파싱 실패 ({}): {e}", path.as_ref().display()))?;

    validate_yaml_llm_config(&config)?;
    Ok(config)
}

pub fn effective_settings_from_file(
    mut settings: Vec<Setting>,
    file_config: &FileLlmConfig,
    config_path: &Path,
) -> Result<Vec<Setting>, String> {
    let providers = file_config
        .providers
        .iter()
        .map(|(name, provider)| {
            let provider_type = normalize_provider_type(&provider.provider_type)?;
            Ok(UiProviderConfig {
                id: name.clone(),
                provider_type: provider_type.to_string(),
                name: name.clone(),
                api_key: provider.api_key.clone(),
                base_url: synthesize_base_url(provider_type, provider.base_url.as_deref()),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    let models = file_config
        .models
        .iter()
        .map(|(name, model)| UiModelConfig {
            id: name.clone(),
            name: name.clone(),
            provider_id: model.provider.clone(),
            model_id: model.model_id.clone(),
        })
        .collect::<Vec<_>>();

    upsert_setting(
        &mut settings,
        "llm_providers",
        serde_json::to_string(&providers).map_err(|e| e.to_string())?,
    );
    upsert_setting(
        &mut settings,
        "llm_models",
        serde_json::to_string(&models).map_err(|e| e.to_string())?,
    );
    upsert_setting(
        &mut settings,
        "active_model_id",
        file_config.active_model.clone(),
    );
    upsert_setting(
        &mut settings,
        "use_streaming",
        file_config.use_streaming.to_string(),
    );
    upsert_setting(&mut settings, "llm_config_managed", "true".to_string());
    upsert_setting(
        &mut settings,
        "llm_config_path",
        config_path.display().to_string(),
    );

    Ok(settings)
}

pub fn load_effective_settings(settings: Vec<Setting>) -> Result<Vec<Setting>, String> {
    match config_file_path() {
        Ok(path) => load_effective_settings_at_path(settings, Some(&path)),
        Err(_) => Ok(settings),
    }
}

pub(crate) fn load_effective_settings_at_path(
    settings: Vec<Setting>,
    path: Option<&Path>,
) -> Result<Vec<Setting>, String> {
    let Some(path) = path else {
        return Ok(settings);
    };

    if !path.exists() {
        return Ok(settings);
    }

    let raw = fs::read_to_string(path)
        .map_err(|e| format!("config.yaml 읽기 실패 ({}): {e}", path.display()))?;
    let file_config = parse_yaml_llm_config(&raw, path)?;
    effective_settings_from_file(settings, &file_config, path)
}

fn validate_yaml_llm_config(config: &FileLlmConfig) -> Result<(), String> {
    if config.active_model.trim().is_empty() {
        return Err("config.yaml 의 active_model 이 비어 있습니다.".to_string());
    }

    if !config.models.contains_key(&config.active_model) {
        return Err("config.yaml 의 active_model 이 models 항목을 가리키지 않습니다.".to_string());
    }

    for (provider_name, provider) in &config.providers {
        let normalized = normalize_provider_type(&provider.provider_type)?;
        let base_url = provider.base_url.as_deref().unwrap_or("").trim();
        if provider.api_key.trim().is_empty() {
            return Err(format!(
                "provider '{provider_name}' 의 api_key 가 비어 있습니다."
            ));
        }
        if normalized == "custom" && base_url.is_empty() {
            return Err(format!(
                "provider '{provider_name}' 는 base_url 이 필요합니다."
            ));
        }
        if normalized != "custom" && !base_url.is_empty() {
            return Err(format!(
                "provider '{provider_name}' 는 base_url 을 지원하지 않습니다."
            ));
        }
    }

    for (model_name, model) in &config.models {
        if model.model_id.trim().is_empty() {
            return Err(format!(
                "model '{model_name}' 의 model_id 가 비어 있습니다."
            ));
        }
        if !config.providers.contains_key(&model.provider) {
            return Err(format!(
                "model '{model_name}' 이 알 수 없는 provider 를 참조합니다."
            ));
        }
    }

    Ok(())
}

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

fn synthesize_base_url(provider_type: &str, base_url: Option<&str>) -> String {
    let base_url = base_url
        .map(str::trim)
        .filter(|value| !value.is_empty());

    match provider_type {
        "gemini" => base_url.unwrap_or(GEMINI_DEFAULT_BASE_URL).to_string(),
        "openrouter" => base_url.unwrap_or(OPENROUTER_DEFAULT_BASE_URL).to_string(),
        "anthropic" => base_url.unwrap_or(ANTHROPIC_DEFAULT_BASE_URL).to_string(),
        "openai" => base_url.unwrap_or(OPENAI_DEFAULT_BASE_URL).to_string(),
        "custom" => base_url.unwrap_or_default().to_string(),
        other => other.to_string(),
    }
}

fn default_use_streaming() -> bool {
    true
}

const GEMINI_DEFAULT_BASE_URL: &str = "https://generativelanguage.googleapis.com";
const OPENROUTER_DEFAULT_BASE_URL: &str = "https://openrouter.ai/api";
const ANTHROPIC_DEFAULT_BASE_URL: &str = "https://api.anthropic.com";
const OPENAI_DEFAULT_BASE_URL: &str = "https://api.openai.com";

fn upsert_setting(settings: &mut Vec<Setting>, key: &str, value: String) {
    if let Some(existing) = settings.iter_mut().find(|setting| setting.key == key) {
        existing.value = value;
    } else {
        settings.push(Setting {
            key: key.to_string(),
            value,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

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
        let settings =
            effective_settings_from_file(Vec::new(), &file_config, Path::new("/mock/config.yaml"))
                .expect("synthesize settings");

        let providers = settings
            .iter()
            .find(|s| s.key == "llm_providers")
            .expect("providers");
        let models = settings
            .iter()
            .find(|s| s.key == "llm_models")
            .expect("models");
        let active_model = settings
            .iter()
            .find(|s| s.key == "active_model_id")
            .expect("active model");
        let managed = settings
            .iter()
            .find(|s| s.key == "llm_config_managed")
            .expect("managed key");

        assert!(providers.value.contains(r#""id":"my-provider-1""#));
        assert!(providers.value.contains(r#""type":"custom""#));
        assert!(providers.value.contains(r#""apiKey":"sk-test""#));
        assert!(models.value.contains(r#""id":"gemma-4-26b-a4b-it-4bit""#));
        assert!(models.value.contains(r#""providerId":"my-provider-1""#));
        assert_eq!(active_model.value, "gemma-4-26b-a4b-it-4bit");
        assert_eq!(managed.value, "true");
    }

    #[test]
    fn yaml_override_uses_provider_specific_default_base_urls() {
        let yaml = r#"
active_model: gemma
providers:
  gemini-provider:
    type: gemini
    api_key: gemini-key
  openrouter-provider:
    type: openrouter
    api_key: openrouter-key
  anthropic-provider:
    type: anthropic
    api_key: anthropic-key
  openai-provider:
    type: openai
    api_key: openai-key
  custom-provider:
    type: openai-compatible
    api_key: custom-key
    base_url: https://example.com/v1
models:
  gemma:
    provider: gemini-provider
    model_id: gemini-2.0-flash
"#;

        let file_config = parse_yaml_llm_config(yaml, "/mock/config.yaml").expect("parse yaml");
        let settings =
            effective_settings_from_file(Vec::new(), &file_config, Path::new("/mock/config.yaml"))
                .expect("synthesize settings");

        let providers = settings
            .iter()
            .find(|s| s.key == "llm_providers")
            .expect("providers");
        let providers: Vec<serde_json::Value> =
            serde_json::from_str(&providers.value).expect("parse providers json");

        let provider_by_id = |id: &str| {
            providers
                .iter()
                .find(|provider| provider.get("id").and_then(|v| v.as_str()) == Some(id))
                .expect("provider")
        };

        assert_eq!(
            provider_by_id("gemini-provider")
                .get("baseUrl")
                .and_then(|v| v.as_str()),
            Some("https://generativelanguage.googleapis.com")
        );
        assert_eq!(
            provider_by_id("openrouter-provider")
                .get("baseUrl")
                .and_then(|v| v.as_str()),
            Some("https://openrouter.ai/api")
        );
        assert_eq!(
            provider_by_id("anthropic-provider")
                .get("baseUrl")
                .and_then(|v| v.as_str()),
            Some("https://api.anthropic.com")
        );
        assert_eq!(
            provider_by_id("openai-provider")
                .get("baseUrl")
                .and_then(|v| v.as_str()),
            Some("https://api.openai.com")
        );
        assert_eq!(
            provider_by_id("custom-provider")
                .get("baseUrl")
                .and_then(|v| v.as_str()),
            Some("https://example.com/v1")
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn config_file_path_uses_dot_config_on_macos() {
        let path = config_file_path().expect("config path");
        let home = dirs::home_dir().expect("home dir");
        assert_eq!(
            path,
            home.join(".config").join("transnovel").join("config.yaml")
        );
    }

    #[test]
    fn yaml_override_controls_use_streaming_setting() {
        let yaml = r#"
active_model: gemma-4-26b-a4b-it-4bit
use_streaming: false
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
        let settings = effective_settings_from_file(
            vec![Setting {
                key: "use_streaming".into(),
                value: "true".into(),
            }],
            &file_config,
            Path::new("/mock/config.yaml"),
        )
        .expect("synthesize settings");

        let use_streaming = settings
            .iter()
            .find(|s| s.key == "use_streaming")
            .expect("use streaming");
        assert_eq!(use_streaming.value, "false");
    }

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
    fn yaml_override_rejects_base_url_for_non_custom_provider() {
        let yaml = r#"
active_model: flash
providers:
  gemini-provider:
    type: gemini
    api_key: gemini-key
    base_url: https://example.com/ignored
models:
  flash:
    provider: gemini-provider
    model_id: gemini-2.0-flash
"#;

        let error =
            parse_yaml_llm_config(yaml, "/mock/config.yaml").expect_err("reject base_url");
        assert!(error.contains("base_url"));
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

        let error =
            parse_yaml_llm_config(yaml, "/mock/config.yaml").expect_err("reject missing model");
        assert!(error.contains("active_model"));
    }

    #[test]
    fn load_effective_settings_at_path_returns_input_when_config_missing() {
        let marker = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("transnovel-llm-config-{marker}.yaml"));

        let settings = vec![Setting {
            key: "system_prompt".into(),
            value: "keep".into(),
        }];

        let result =
            load_effective_settings_at_path(settings, Some(&path)).expect("missing config");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].key, "system_prompt");
        assert_eq!(result[0].value, "keep");
    }

    #[test]
    fn load_effective_settings_returns_input_when_config_path_is_unavailable() {
        let settings = vec![Setting {
            key: "system_prompt".into(),
            value: "keep".into(),
        }];

        let result = load_effective_settings_at_path(settings, None).expect("fallback");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].key, "system_prompt");
        assert_eq!(result[0].value, "keep");
    }
}
