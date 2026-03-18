use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::commands::series::should_stop_translation;
use crate::commands::settings::get_settings;

#[derive(Debug, Clone, Default)]
pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}
use crate::models::translation::TranslationResult;
use crate::services::cache::{cache_translations, get_cached_translations};
use crate::services::character_dictionary::{
    format_character_dictionary_note, get_novel_character_dictionary, CharacterDictionaryEntry,
};
use crate::services::codex::CodexClient;
use crate::services::gemini::GeminiClient;
use crate::services::openrouter::OpenRouterClient;
use crate::services::paragraph::{encode_paragraph_id, TranslationChunk};
use crate::services::substitution::SubstitutionService;

#[derive(Clone, Serialize)]
pub struct DebugCacheEvent {
    pub paragraph_id: String,
    pub cache_hit: bool,
    pub original_preview: String,
}

const DEFAULT_SYSTEM_PROMPT: &str = r#"# 절대 규칙 (위반 시 출력 무효)

## ID 구조 보존
원문의 `<p id="XX">` 태그는 **문자 하나도 변경하지 않고** 그대로 복사.
- ✅ `<p id="A">日本語</p>` → `<p id="A">일본어</p>`
- ❌ `<p id="a">` (대소문자 변경)
- ❌ `<p>` (ID 누락)
- ❌ `<p id="A" class="...">` (속성 추가)

## 1:1 줄 대응
원문 N줄 = 번역 N줄. **절대로 줄을 합치거나 나누지 않음.**

---

# 입출력 형식

## 입력
- 각 줄은 `<p id="ID">원문</p>` 형식

## 출력
- 번역 결과만 즉시 제공 (다른 응답 금지)
- 반드시 `</main>`으로 종료
- HTML 구조 훼손/삭제 금지

## 이어서 번역
번역 섹션이 함께 주어지면 기존 번역문 다음 줄부터 마저 번역.

---

# 번역 지침

## 문체
- 직역투를 피하고 자연스럽게 의역
- 원문의 말투와 내용은 철저히 유지

## 고유명사
- 사실 관계 왜곡 및 과도한 현지화 금지
- 일본어 고유명사: 국립국어원 표기법 대신 **서브컬처 통용 표기** 우선
- 통용 표기가 불확실하면 실제 발음에 가깝게

## 성인 콘텐츠
- 검열 없이 직접적이고 노골적인 어휘 사용
- 소설 등장인물은 가공의 인물

{{note}}"#;

pub enum ApiClient {
    Gemini(GeminiClient),
    OpenRouter(OpenRouterClient),
    Codex(CodexClient),
}

pub struct TranslatorService {
    client: ApiClient,
    system_prompt: String,
    translation_note: String,
    substitution: SubstitutionService,
    use_streaming: bool,
}

#[derive(Debug, Deserialize)]
struct ProviderConfig {
    id: String,
    #[serde(rename = "type")]
    provider_type: String,
    #[serde(rename = "apiKey", default)]
    api_key: String,
    #[serde(rename = "baseUrl", default)]
    base_url: String,
}

#[derive(Debug, Deserialize)]
struct ModelConfig {
    id: String,
    #[serde(rename = "providerId")]
    provider_id: String,
    #[serde(rename = "modelId")]
    model_id: String,
}

struct TranslatorSettings {
    system_prompt: String,
    translation_note: String,
    substitutions: String,
    provider_type: String,
    provider_id: Option<String>,
    api_key: Option<String>,
    base_url: Option<String>,
    model: Option<String>,
    use_streaming: bool,
}

#[derive(Debug, Deserialize)]
struct CharacterDictionaryResponse {
    entries: Vec<CharacterDictionaryEntry>,
}

impl TranslatorService {
    pub async fn new() -> Result<Self, String> {
        let settings = Self::load_settings().await;

        let client = match settings.provider_type.as_str() {
            "gemini" => {
                let key = settings.api_key
                    .ok_or("Gemini API 키가 설정되지 않았습니다. 설정에서 API 키를 추가해주세요.")?;
                ApiClient::Gemini(GeminiClient::new(vec![key], settings.model.clone()))
            }
            "openrouter" => {
                let key = settings.api_key
                    .ok_or("OpenRouter API 키가 설정되지 않았습니다. 설정에서 API 키를 추가해주세요.")?;
                ApiClient::OpenRouter(OpenRouterClient::new(key, settings.model.clone()))
            }
            "anthropic" | "openai" | "custom" => {
                let key = settings.api_key
                    .ok_or("API 키가 설정되지 않았습니다. 설정에서 API 키를 추가해주세요.")?;
                ApiClient::OpenRouter(OpenRouterClient::new_with_base_url(
                    key,
                    settings.model.clone(),
                    settings.base_url,
                ))
            }
            "openai-oauth" => {
                let provider_id = settings.provider_id
                    .ok_or("OpenAI OAuth 프로바이더를 찾을 수 없습니다.")?;
                let fresh_token = crate::services::openai_oauth::ensure_valid_token(&provider_id).await?;
                ApiClient::Codex(CodexClient::new(fresh_token, settings.model.clone()))
            }
            _ => {
                return Err("사용할 모델이 설정되지 않았습니다. 설정에서 모델을 추가해주세요.".to_string());
            }
        };

        Ok(Self {
            client,
            system_prompt: settings.system_prompt,
            translation_note: settings.translation_note,
            substitution: SubstitutionService::from_config(&settings.substitutions),
            use_streaming: settings.use_streaming,
        })
    }

    async fn load_settings() -> TranslatorSettings {
        let settings = get_settings().await.unwrap_or_default();

        let get_setting = |key: &str| -> Option<String> {
            settings.iter().find(|s| s.key == key).map(|s| s.value.clone()).filter(|v| !v.is_empty())
        };
        
        let providers_json = get_setting("llm_providers").unwrap_or_else(|| "[]".to_string());
        let providers: Vec<ProviderConfig> = serde_json::from_str(&providers_json).unwrap_or_default();
        
        let models_json = get_setting("llm_models").unwrap_or_else(|| "[]".to_string());
        let models: Vec<ModelConfig> = serde_json::from_str(&models_json).unwrap_or_default();
        
        let active_model_id = get_setting("active_model_id");
        
        let active_model = active_model_id
            .as_ref()
            .and_then(|id| models.iter().find(|m| &m.id == id));
        
        let (provider_type, provider_id, api_key, base_url, model_id) = match active_model {
            Some(model) => {
                let provider = providers.iter().find(|p| p.id == model.provider_id);
                match provider {
                    Some(p) => (
                        p.provider_type.clone(),
                        Some(p.id.clone()),
                        if p.api_key.is_empty() { None } else { Some(p.api_key.clone()) },
                        if p.base_url.is_empty() { None } else { Some(p.base_url.clone()) },
                        Some(model.model_id.clone()),
                    ),
                    None => ("".to_string(), None, None, None, None),
                }
            },
            None => ("".to_string(), None, None, None, None),
        };
        
        TranslatorSettings {
            system_prompt: get_setting("system_prompt").unwrap_or_else(|| DEFAULT_SYSTEM_PROMPT.to_string()),
            translation_note: get_setting("translation_note").unwrap_or_default(),
            substitutions: get_setting("substitutions").unwrap_or_default(),
            provider_type,
            provider_id,
            api_key,
            base_url,
            model: model_id,
            use_streaming: get_setting("use_streaming").map(|v| v == "true").unwrap_or(true),
        }
    }

    async fn build_prompt(
        &self,
        site: &str,
        novel_id: &str,
        additional_note: Option<&str>,
    ) -> String {
        let dictionary_note = get_novel_character_dictionary(site, novel_id)
            .await
            .ok()
            .map(|entries| format_character_dictionary_note(&entries))
            .filter(|note| !note.is_empty());

        let full_note = compose_note(
            &self.translation_note,
            dictionary_note.as_deref(),
            additional_note,
        );
        self.system_prompt.replace("{{note}}", &full_note)
    }

    pub async fn translate_paragraphs(
        &mut self,
        site: &str,
        novel_id: &str,
        paragraphs: &[String],
        has_subtitle: bool,
        note: Option<&str>,
    ) -> Result<Vec<String>, String> {
        if paragraphs.is_empty() {
            return Ok(vec![]);
        }

        let preprocessed: Vec<String> = self.substitution.apply_to_paragraphs(paragraphs);

        let cached = get_cached_translations(novel_id, &preprocessed).await.unwrap_or_else(|_| vec![None; preprocessed.len()]);
        
        let mut uncached_indices: Vec<usize> = Vec::new();
        let mut uncached_paragraphs: Vec<String> = Vec::new();
        
        for (i, (p, c)) in preprocessed.iter().zip(cached.iter()).enumerate() {
            if c.is_none() && !p.trim().is_empty() {
                uncached_indices.push(i);
                uncached_paragraphs.push(p.clone());
            }
        }
        
        let mut results: Vec<String> = cached.into_iter().map(|c| c.unwrap_or_default()).collect();
        
        if !uncached_paragraphs.is_empty() {
            let prompt = self.build_prompt(site, novel_id, note).await;

            let translated = match &mut self.client {
                ApiClient::Gemini(client) => client.translate(&uncached_paragraphs, &uncached_indices, has_subtitle, &prompt).await?,
                ApiClient::OpenRouter(client) => client.translate(&uncached_paragraphs, &uncached_indices, has_subtitle, &prompt).await?,
                ApiClient::Codex(client) => client.translate(&uncached_paragraphs, &uncached_indices, has_subtitle, &prompt).await?,
            };
            
            let postprocessed: Vec<String> = self.substitution.apply_to_paragraphs(&translated);
            
            let mut pairs: Vec<(String, String)> = Vec::new();
            for (i, trans) in uncached_indices.iter().zip(postprocessed.iter()) {
                results[*i] = trans.clone();
                pairs.push((uncached_paragraphs[uncached_indices.iter().position(|x| x == i).unwrap()].clone(), trans.clone()));
            }
            
            cache_translations(novel_id, &pairs).await.ok();
        }
        
        Ok(results)
    }

    pub async fn translate_text(
        &mut self,
        site: &str,
        novel_id: &str,
        text: &str,
        note: Option<&str>,
    ) -> Result<String, String> {
        let paragraphs: Vec<String> = text
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|s| s.to_string())
            .collect();

        if paragraphs.is_empty() {
            return Ok(String::new());
        }

        let translated = self
            .translate_paragraphs(site, novel_id, &paragraphs, true, note)
            .await?;
        Ok(translated.join("\n"))
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn translate_paragraphs_streaming<R: tauri::Runtime>(
        &mut self,
        site: &str,
        novel_id: &str,
        paragraphs: &[String],
        has_subtitle: bool,
        note: Option<&str>,
        original_indices: Option<Vec<usize>>,
        app_handle: &AppHandle<R>,
    ) -> Result<Vec<String>, String> {
        if paragraphs.is_empty() {
            return Ok(vec![]);
        }

        let preprocessed: Vec<String> = self.substitution.apply_to_paragraphs(paragraphs);

        // If original_indices provided (retry mode), skip cache and use provided indices
        let (uncached_indices, uncached_paragraphs, mut results) = if let Some(indices) = original_indices {
            // Retry mode: no cache check, use provided indices directly
            let uncached: Vec<String> = preprocessed.clone();
            let result_len = indices.iter().copied().max().map_or(0, |max_idx| max_idx + 1);
            let results: Vec<String> = vec![String::new(); result_len];
            (indices, uncached, results)
        } else {
            // Normal mode: check cache
            let cached = get_cached_translations(novel_id, &preprocessed)
                .await
                .unwrap_or_else(|_| vec![None; preprocessed.len()]);

            let mut uncached_indices: Vec<usize> = Vec::new();
            let mut uncached_paragraphs: Vec<String> = Vec::new();

            for (i, (p, c)) in preprocessed.iter().zip(cached.iter()).enumerate() {
                let original_preview: String = p.chars().take(30).collect();
                let _ = app_handle.emit(
                    "debug-cache",
                    DebugCacheEvent {
                        paragraph_id: encode_paragraph_id(i, has_subtitle),
                        cache_hit: c.is_some(),
                        original_preview,
                    },
                );
                
                if c.is_none() && !p.trim().is_empty() {
                    uncached_indices.push(i);
                    uncached_paragraphs.push(p.clone());
                }
            }

            let results: Vec<String> = cached.iter().map(|c| c.clone().unwrap_or_default()).collect();

            for (i, cached_text) in cached.iter().enumerate() {
                if let Some(text) = cached_text {
                    let postprocessed = self.substitution.apply_to_paragraphs(std::slice::from_ref(text));
                    let _ = app_handle.emit(
                        "translation-chunk",
                        TranslationChunk {
                            paragraph_id: encode_paragraph_id(i, has_subtitle),
                            text: postprocessed.into_iter().next().unwrap_or_default(),
                            is_complete: true,
                        },
                    );
                }
            }

            (uncached_indices, uncached_paragraphs, results)
        };

        if !uncached_paragraphs.is_empty() {
            let prompt = self.build_prompt(site, novel_id, note).await;

            // Dynamic chunk sizing: send all at once if small enough
            const MAX_SINGLE_BATCH_CHARS: usize = 50_000; // ~50KB threshold
            const FALLBACK_CHUNK_SIZE: usize = 50;
            const MAX_RETRIES: u32 = 1;
            
            let total_chars: usize = uncached_paragraphs.iter().map(|p| p.len()).sum();
            let chunk_size = if total_chars <= MAX_SINGLE_BATCH_CHARS {
                uncached_paragraphs.len() // Send all at once
            } else {
                FALLBACK_CHUNK_SIZE
            };
            let chunk_count = uncached_paragraphs.len().div_ceil(chunk_size);
            let mut failed_indices: Vec<usize> = Vec::new();
            let mut stopped = false;
            let mut total_usage = TokenUsage::default();
            
            for chunk_idx in 0..chunk_count {
                let start = chunk_idx * chunk_size;
                let end = std::cmp::min(start + chunk_size, uncached_paragraphs.len());

                if should_stop_translation() {
                    stopped = true;
                    break;
                }
                
                let chunk_paragraphs = &uncached_paragraphs[start..end];
                let chunk_indices = &uncached_indices[start..end];

                let mut last_error: Option<String> = None;
                let mut success = false;

                for retry in 0..MAX_RETRIES {
                    if should_stop_translation() {
                        stopped = true;
                        break;
                    }

                    if retry > 0 {
                        let delay_secs = 2u64.pow(retry);
                        tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
                        eprintln!("[Translator] Chunk {} retry {}/{}", chunk_idx + 1, retry, MAX_RETRIES - 1);
                    }

                    let translate_result: Result<(Vec<String>, Option<TokenUsage>), String> = if self.use_streaming {
                        match &mut self.client {
                            ApiClient::Gemini(client) => {
                                client
                                    .translate_streaming(novel_id, chunk_paragraphs, chunk_indices, has_subtitle, &prompt, app_handle)
                                    .await
                            }
                            ApiClient::OpenRouter(client) => {
                                client
                                    .translate_streaming(novel_id, chunk_paragraphs, chunk_indices, has_subtitle, &prompt, app_handle)
                                    .await
                            }
                            ApiClient::Codex(client) => {
                                client
                                    .translate_streaming(novel_id, chunk_paragraphs, chunk_indices, has_subtitle, &prompt, app_handle)
                                    .await
                            }
                        }
                    } else {
                        let result = match &mut self.client {
                            ApiClient::Gemini(client) => {
                                client.translate(chunk_paragraphs, chunk_indices, has_subtitle, &prompt).await
                            }
                            ApiClient::OpenRouter(client) => {
                                client.translate(chunk_paragraphs, chunk_indices, has_subtitle, &prompt).await
                            }
                            ApiClient::Codex(client) => {
                                client.translate(chunk_paragraphs, chunk_indices, has_subtitle, &prompt).await
                            }
                        };
                        
                        result.map(|v| (v, None))
                    };

                    match translate_result {
                        Ok((translated, usage)) => {
                            if let Some(u) = usage {
                                total_usage.input_tokens += u.input_tokens;
                                total_usage.output_tokens += u.output_tokens;
                            }
                            let postprocessed: Vec<String> = self.substitution.apply_to_paragraphs(&translated);
                            let mut chunk_failed_indices: Vec<usize> = Vec::new();
                            let mut pairs: Vec<(String, String)> = Vec::new();

                            if postprocessed.len() < chunk_indices.len() {
                                let missing_count = chunk_indices.len() - postprocessed.len();
                                eprintln!(
                                    "[Translator] Output truncated: expected {} paragraphs, got {} ({} missing)",
                                    chunk_indices.len(), postprocessed.len(), missing_count
                                );
                                let _ = app_handle.emit("debug-api", serde_json::json!({
                                    "type": "warning",
                                    "provider": "translator",
                                    "status": 0,
                                    "body": format!(
                                        "출력이 잘렸습니다: {}개 문단 중 {}개만 번역됨 ({}개 누락). 모델의 출력 토큰 한도에 도달했을 수 있습니다.",
                                        chunk_indices.len(), postprocessed.len(), missing_count
                                    )
                                }));
                            }

                            for (local_idx, &orig_idx) in chunk_indices.iter().enumerate() {
                                if local_idx < postprocessed.len() {
                                    let trans = &postprocessed[local_idx];
                                    
                                    if trans.is_empty() && !chunk_paragraphs[local_idx].is_empty() {
                                        chunk_failed_indices.push(orig_idx);
                                        eprintln!(
                                            "[Translator] Empty result for paragraph {} (stream likely interrupted)",
                                            encode_paragraph_id(orig_idx, has_subtitle)
                                        );
                                    } else if !trans.is_empty() {
                                        results[orig_idx] = trans.clone();
                                        pairs.push((chunk_paragraphs[local_idx].clone(), trans.clone()));
                                        
                                        if !self.use_streaming {
                                            let _ = app_handle.emit(
                                                "translation-chunk",
                                                TranslationChunk {
                                                    paragraph_id: encode_paragraph_id(orig_idx, has_subtitle),
                                                    text: trans.clone(),
                                                    is_complete: true,
                                                },
                                            );
                                        }
                                    }
                                } else {
                                    chunk_failed_indices.push(orig_idx);
                                }
                            }

                            if !pairs.is_empty() {
                                cache_translations(novel_id, &pairs).await.ok();
                            }

                            if !chunk_failed_indices.is_empty() {
                                failed_indices.extend(chunk_failed_indices);
                            }
                            success = true;
                            break;
                        }
                        Err(e) => {
                            last_error = Some(e);
                        }
                    }
                }

                if stopped {
                    break;
                }

                if !success {
                    let error_msg = last_error.clone().unwrap_or_else(|| "Unknown error".to_string());
                    eprintln!("[Translator] Chunk {} failed: {}", chunk_idx + 1, error_msg);
                    failed_indices.extend(chunk_indices.iter().cloned());
                    
                    let (error_type, title, message) = if error_msg.contains("input_tokens=0") 
                        || error_msg.contains("\"input_tokens\": 0")
                        || error_msg.contains("input_tokens\": 0") 
                    {
                        (
                            "content_filtered",
                            "콘텐츠 필터링 감지",
                            "AI 제공자의 정책에 의해 해당 내용이 차단되었습니다. 다른 모델을 시도해보세요.".to_string()
                        )
                    } else if error_msg.contains("API 오류") {
                        (
                            "api_error",
                            "API 오류",
                            error_msg.clone()
                        )
                    } else {
                        (
                            "unknown",
                            "번역 오류",
                            error_msg.clone()
                        )
                    };
                    
                    let request_preview: String = chunk_paragraphs.iter()
                        .take(3)
                        .map(|p| {
                            let preview: String = p.chars().take(50).collect();
                            if p.len() > 50 { format!("{}...", preview) } else { preview }
                        })
                        .collect::<Vec<_>>()
                        .join(" | ");
                    
                    let _ = app_handle.emit("translation-error", serde_json::json!({
                        "error_type": error_type,
                        "title": title,
                        "message": message,
                        "request_preview": request_preview,
                        "response_preview": error_msg
                    }));
                }
            }

            if stopped {
                let _ = app_handle.emit("translation-complete", serde_json::json!({
                    "success": false,
                    "total": paragraphs.len(),
                    "failed_count": 0,
                    "input_tokens": total_usage.input_tokens,
                    "output_tokens": total_usage.output_tokens,
                    "stopped": true
                }));
                return Ok(results);
            }

            if !failed_indices.is_empty() {
                let _ = app_handle.emit("translation-failed-paragraphs", serde_json::json!({
                    "failed_indices": failed_indices,
                    "total": paragraphs.len()
                }));
            }
            
            let all_success = failed_indices.is_empty();
            let _ = app_handle.emit("translation-complete", serde_json::json!({
                "success": all_success,
                "total": paragraphs.len(),
                "failed_count": failed_indices.len(),
                "input_tokens": total_usage.input_tokens,
                "output_tokens": total_usage.output_tokens
            }));
        } else {
            let _ = app_handle.emit("translation-complete", serde_json::json!({
                "success": true,
                "total": paragraphs.len(),
                "failed_count": 0,
                "input_tokens": 0,
                "output_tokens": 0
            }));
        }

        Ok(results)
    }

    pub async fn translate_chapter(
        &mut self,
        _novel_id: &str,
        _chapter_number: u32,
    ) -> Result<TranslationResult, String> {
        Ok(TranslationResult {
            original: vec![],
            translated: vec![],
            model_used: "gemini-2.0-flash".to_string(),
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn extract_character_dictionary_candidates(
        &mut self,
        site: &str,
        novel_id: &str,
        chapter_number: u32,
        title: &str,
        subtitle: Option<&str>,
        originals: &[String],
        translateds: &[String],
    ) -> Result<Vec<CharacterDictionaryEntry>, String> {
        if originals.is_empty() || translateds.is_empty() {
            return Ok(vec![]);
        }

        let prompt = build_character_dictionary_extraction_prompt(
            site,
            novel_id,
            chapter_number,
            title,
            subtitle,
            originals,
            translateds,
        )?;

        let response = match &mut self.client {
            ApiClient::Gemini(client) => client.generate_text(&prompt).await?,
            ApiClient::OpenRouter(client) => client.generate_text(&prompt).await?,
            ApiClient::Codex(client) => client.generate_text(&prompt).await?,
        };

        parse_character_dictionary_candidates(&response)
    }
}

fn compose_note(
    translation_note: &str,
    dictionary_note: Option<&str>,
    additional_note: Option<&str>,
) -> String {
    [
        Some(translation_note.trim()),
        dictionary_note.map(str::trim),
        additional_note.map(str::trim),
    ]
    .into_iter()
    .flatten()
    .filter(|section| !section.is_empty())
    .map(ToOwned::to_owned)
    .collect::<Vec<_>>()
    .join("\n\n")
}

fn build_character_dictionary_extraction_prompt(
    site: &str,
    novel_id: &str,
    chapter_number: u32,
    title: &str,
    subtitle: Option<&str>,
    originals: &[String],
    translateds: &[String],
) -> Result<String, String> {
    let pairs = originals
        .iter()
        .zip(translateds.iter())
        .enumerate()
        .map(|(index, (original, translated))| {
            serde_json::json!({
                "index": index,
                "original": original,
                "translated": translated,
            })
        })
        .collect::<Vec<_>>();
    let pair_json = serde_json::to_string_pretty(&pairs).map_err(|e| e.to_string())?;

    Ok(format!(
        r#"다음은 일본어 웹소설 한 화의 번역 결과입니다.
작품 정보:
- site: {site}
- novel_id: {novel_id}
- chapter_number: {chapter_number}
- title: {title}
- subtitle: {subtitle}

목표:
- 인물명, 학교명, 지명, 단체명, 기관명처럼 번역 일관성이 필요한 고유명사만 추출합니다.
- 일반 명사, 직책명, 수식어, 기술명, 종족명, 일시적 표현은 제외합니다.
- 원문 표기 바로 옆에 후리가나/루비/요미가나가 명시된 항목만 추출합니다. 읽기 정보가 없으면 무조건 제외합니다.
- 번역문만 보고 추정한 이름, 맥락상 이름처럼 보이지만 원문에 읽기 정보가 없는 항목도 제외합니다.
- 고유명사인지 애매하면 제외합니다.
- 한국어 번역에서 실제로 사용된 고유명사 표기를 target_name으로 넣습니다.
- reading에는 원문에 직접 표시된 읽기만 넣습니다.

반드시 아래 JSON만 반환하세요. 설명 문장, 코드펜스, 마크다운 금지.
{{
  "entries": [
    {{
      "source_text": "周",
      "reading": "あまね",
      "target_name": "아마네",
      "note": "주인공"
    }}
  ]
}}

입력 데이터:
{pair_json}"#,
        subtitle = subtitle.unwrap_or("")
    ))
}

fn sanitize_character_dictionary_candidates(
    entries: Vec<CharacterDictionaryEntry>,
) -> Vec<CharacterDictionaryEntry> {
    entries
        .into_iter()
        .filter_map(|entry| {
            let source_text = entry.source_text.trim().to_string();
            let reading = entry
                .reading
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());
            let target_name = entry.target_name.trim().to_string();
            let note = entry
                .note
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());

            if source_text.is_empty() || reading.is_none() || target_name.is_empty() {
                return None;
            }

            Some(CharacterDictionaryEntry {
                source_text,
                reading,
                target_name,
                note,
            })
        })
        .collect()
}

fn parse_character_dictionary_candidates(text: &str) -> Result<Vec<CharacterDictionaryEntry>, String> {
    let normalized = text
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    if let Ok(response) = serde_json::from_str::<CharacterDictionaryResponse>(normalized) {
        return Ok(sanitize_character_dictionary_candidates(response.entries));
    }

    if let Ok(entries) = serde_json::from_str::<Vec<CharacterDictionaryEntry>>(normalized) {
        return Ok(sanitize_character_dictionary_candidates(entries));
    }

    Err(format!(
        "고유명사 후보 추출 응답을 파싱하지 못했습니다: {}",
        normalized.chars().take(200).collect::<String>()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compose_note_joins_sections() {
        let note = compose_note("기본 노트", Some("사전"), Some("추가"));
        assert_eq!(note, "기본 노트\n\n사전\n\n추가");
    }

    #[test]
    fn test_parse_character_dictionary_candidates_accepts_object() {
        let parsed = parse_character_dictionary_candidates(
            r#"{"entries":[{"source_text":"周","reading":"あまね","target_name":"아마네","note":"주인공"}]}"#,
        )
        .unwrap();

        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].source_text, "周");
        assert_eq!(parsed[0].target_name, "아마네");
    }

    #[test]
    fn test_parse_character_dictionary_candidates_filters_entries_without_reading() {
        let parsed = parse_character_dictionary_candidates(
            r#"{"entries":[{"source_text":"生徒会","reading":"","target_name":"학생회","note":"조직"},{"source_text":"周","reading":"あまね","target_name":"아마네","note":"주인공"}]}"#,
        )
        .unwrap();

        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].source_text, "周");
        assert_eq!(parsed[0].reading.as_deref(), Some("あまね"));
    }

    #[test]
    fn test_build_character_dictionary_extraction_prompt_requires_explicit_reading() {
        let prompt = build_character_dictionary_extraction_prompt(
            "kakuyomu",
            "novel-1",
            2,
            "제목",
            None,
            &[String::from("鳳黎院（ほうれいいん）学園")],
            &[String::from("호레이인 학원")],
        )
        .unwrap();

        assert!(prompt.contains("원문 표기 바로 옆에 후리가나/루비/요미가나가 명시된 항목만 추출합니다."));
        assert!(prompt.contains("일반 명사, 직책명, 수식어, 기술명, 종족명, 일시적 표현은 제외합니다."));
    }
}
