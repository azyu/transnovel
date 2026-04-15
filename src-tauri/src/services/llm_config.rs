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
}
