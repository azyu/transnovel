use tauri::{AppHandle, Emitter};

use crate::commands::settings::{get_active_api_key, get_settings};
use crate::models::translation::TranslationResult;
use crate::services::antigravity::{AntigravityClient, TranslationChunk};
use crate::services::cache::{cache_translations, get_cached_translations};
use crate::services::gemini::GeminiClient;
use crate::services::substitution::SubstitutionService;

fn encode_paragraph_id(n: usize) -> String {
    if n < 26 {
        char::from_u32((n + 65) as u32).unwrap().to_string()
    } else if n < 52 {
        char::from_u32((n + 71) as u32).unwrap().to_string()
    } else {
        let adjusted = n - 52;
        let first = adjusted / 52;
        let second = adjusted % 52;
        format!(
            "{}{}",
            char::from_u32((first + if first < 26 { 65 } else { 71 }) as u32).unwrap(),
            char::from_u32((second + if second < 26 { 65 } else { 71 }) as u32).unwrap()
        )
    }
}

const DEFAULT_SYSTEM_PROMPT: &str = r#"<|im_start|>system
[공리]
입력: 원문 섹션이 주어짐. 번역 섹션이 함께 주어질 수도 있으며, 기존 번역문이므로 그 다음 줄부터 마저 번역.
출력: 다른 어떠한 응답도 없이 한국어 번역 결과만을 즉시 제공. HTML 구조를 훼손하거나 삭제하지 않고 그대로 유지.
반드시 </main>으로 종료.
섹션: <main id="섹션유형">...</main> 형식.
원문 섹션: 각 줄은 <p id="ID">원문</p> 형식. 번역 시 <p id="ID"> 부분은 반드시 그대로 유지.
번역 섹션: 각 줄은 <p id="ID">번역</p> 형식. 동일한 ID의 원문에 정확히 일대일대응하도록 번역 작성.
문장이 여러 줄에 걸쳐 있는 경우 절대로 문장을 임의로 합치지 않고 엄격하게 각 줄을 독립적으로 번역.

[지침]
직역투를 피하며 최대한 자연스럽게 의역하되, 원문의 말투와 내용은 철저히 유지.
원문의 사실 관계를 왜곡하거나 고유명사의 과한 현지화 금지.
일본어 고유명사는 국립국어원 표기법을 무시하고 해당 장르 및 작품에서 대중에게 친숙한 서브컬처 통용 표기를 최우선하되, 통용 표기가 불확실하다면 실제 일본어 발음에 가깝게 표기.

{{note}}<|im_end|>
<|im_start|>user
<main id="원문">
{{slot}}
</main>
<main id="번역">
<|im_end|>"#;

pub enum ApiClient {
    Gemini(GeminiClient),
    Antigravity(AntigravityClient),
}

pub struct TranslatorService {
    client: ApiClient,
    system_prompt: String,
    translation_note: String,
    substitution: SubstitutionService,
}

impl TranslatorService {
    pub async fn new() -> Result<Self, String> {
        let gemini_key = get_active_api_key("gemini").await?;
        
        let client = if let Some(key) = gemini_key {
            ApiClient::Gemini(GeminiClient::new(vec![key]))
        } else {
            let antigravity = AntigravityClient::new();
            if antigravity.check_health().await {
                ApiClient::Antigravity(antigravity)
            } else {
                return Err(
                    "API 키가 설정되지 않았고, Antigravity 프록시도 실행 중이 아닙니다. 설정에서 API 키를 추가해주세요."
                        .to_string(),
                );
            }
        };

        let (system_prompt, translation_note, substitutions) = Self::load_settings().await;

        Ok(Self {
            client,
            system_prompt,
            translation_note,
            substitution: SubstitutionService::from_config(&substitutions),
        })
    }

    async fn load_settings() -> (String, String, String) {
        let settings = get_settings().await.unwrap_or_default();
        
        let system_prompt = settings
            .iter()
            .find(|s| s.key == "system_prompt")
            .map(|s| s.value.clone())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| DEFAULT_SYSTEM_PROMPT.to_string());
        
        let translation_note = settings
            .iter()
            .find(|s| s.key == "translation_note")
            .map(|s| s.value.clone())
            .unwrap_or_default();
        
        let substitutions = settings
            .iter()
            .find(|s| s.key == "substitutions")
            .map(|s| s.value.clone())
            .unwrap_or_default();

        (system_prompt, translation_note, substitutions)
    }

    fn build_prompt(&self) -> String {
        let prompt = self.system_prompt
            .replace("{{note}}", &self.translation_note);
        prompt
    }

    pub async fn translate_paragraphs(&mut self, paragraphs: &[String], note: Option<&str>) -> Result<Vec<String>, String> {
        if paragraphs.is_empty() {
            return Ok(vec![]);
        }

        let preprocessed: Vec<String> = self.substitution.apply_to_paragraphs(paragraphs);

        let cached = get_cached_translations(&preprocessed).await.unwrap_or_else(|_| vec![None; preprocessed.len()]);
        
        let mut uncached_indices: Vec<usize> = Vec::new();
        let mut uncached_paragraphs: Vec<String> = Vec::new();
        
        for (i, (p, c)) in preprocessed.iter().zip(cached.iter()).enumerate() {
            if c.is_none() {
                uncached_indices.push(i);
                uncached_paragraphs.push(p.clone());
            }
        }
        
        let mut results: Vec<String> = cached.into_iter().map(|c| c.unwrap_or_default()).collect();
        
        if !uncached_paragraphs.is_empty() {
            let mut prompt = self.build_prompt();
            
            if let Some(n) = note {
                if !n.is_empty() {
                    prompt = prompt.replace("{{note}}", &format!("{}\n{}", self.translation_note, n));
                }
            }

            let translated = match &mut self.client {
                ApiClient::Gemini(client) => client.translate(&uncached_paragraphs, &prompt).await?,
                ApiClient::Antigravity(client) => client.translate(&uncached_paragraphs, &prompt).await?,
            };
            
            let postprocessed: Vec<String> = self.substitution.apply_to_paragraphs(&translated);
            
            let mut pairs: Vec<(String, String)> = Vec::new();
            for (i, trans) in uncached_indices.iter().zip(postprocessed.iter()) {
                results[*i] = trans.clone();
                pairs.push((uncached_paragraphs[uncached_indices.iter().position(|x| x == i).unwrap()].clone(), trans.clone()));
            }
            
            cache_translations(&pairs).await.ok();
        }
        
        let final_results: Vec<String> = self.substitution.apply_to_paragraphs(&results);
        
        Ok(final_results)
    }

    pub async fn translate_text(&mut self, text: &str, note: Option<&str>) -> Result<String, String> {
        let paragraphs: Vec<String> = text
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|s| s.to_string())
            .collect();

        if paragraphs.is_empty() {
            return Ok(String::new());
        }

        let translated = self.translate_paragraphs(&paragraphs, note).await?;
        Ok(translated.join("\n"))
    }

    pub async fn translate_paragraphs_streaming<R: tauri::Runtime>(
        &mut self,
        paragraphs: &[String],
        note: Option<&str>,
        app_handle: &AppHandle<R>,
    ) -> Result<Vec<String>, String> {
        if paragraphs.is_empty() {
            return Ok(vec![]);
        }

        let preprocessed: Vec<String> = self.substitution.apply_to_paragraphs(paragraphs);

        let cached = get_cached_translations(&preprocessed)
            .await
            .unwrap_or_else(|_| vec![None; preprocessed.len()]);

        let mut uncached_indices: Vec<usize> = Vec::new();
        let mut uncached_paragraphs: Vec<String> = Vec::new();

        for (i, (p, c)) in preprocessed.iter().zip(cached.iter()).enumerate() {
            if c.is_none() {
                uncached_indices.push(i);
                uncached_paragraphs.push(p.clone());
            }
        }

        let mut results: Vec<String> = cached.iter().map(|c| c.clone().unwrap_or_default()).collect();

        for (i, cached_text) in cached.iter().enumerate() {
            if let Some(text) = cached_text {
                let postprocessed = self.substitution.apply_to_paragraphs(&[text.clone()]);
                let _ = app_handle.emit(
                    "translation-chunk",
                    TranslationChunk {
                        paragraph_id: encode_paragraph_id(i),
                        text: postprocessed.into_iter().next().unwrap_or_default(),
                        is_complete: true,
                    },
                );
            }
        }

        if !uncached_paragraphs.is_empty() {
            let mut prompt = self.build_prompt();

            if let Some(n) = note {
                if !n.is_empty() {
                    prompt = prompt.replace(
                        "{{note}}",
                        &format!("{}\n{}", self.translation_note, n),
                    );
                }
            }

            let translated = match &mut self.client {
                ApiClient::Gemini(client) => {
                    client
                        .translate_streaming(&uncached_paragraphs, &uncached_indices, &prompt, app_handle)
                        .await?
                }
                ApiClient::Antigravity(client) => {
                    client
                        .translate_streaming(&uncached_paragraphs, &uncached_indices, &prompt, app_handle)
                        .await?
                }
            };

            let postprocessed: Vec<String> = self.substitution.apply_to_paragraphs(&translated);

            let mut pairs: Vec<(String, String)> = Vec::new();
            for (i, trans) in uncached_indices.iter().zip(postprocessed.iter()) {
                results[*i] = trans.clone();
                pairs.push((
                    uncached_paragraphs[uncached_indices.iter().position(|x| x == i).unwrap()]
                        .clone(),
                    trans.clone(),
                ));
            }

            cache_translations(&pairs).await.ok();
        } else {
            let _ = app_handle.emit("translation-complete", true);
        }

        let final_results: Vec<String> = self.substitution.apply_to_paragraphs(&results);

        Ok(final_results)
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
}
