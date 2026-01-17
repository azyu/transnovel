use crate::commands::settings::get_active_api_key;
use crate::models::translation::TranslationResult;
use crate::services::antigravity::AntigravityClient;
use crate::services::cache::{cache_translations, get_cached_translations};
use crate::services::gemini::GeminiClient;

const DEFAULT_SYSTEM_PROMPT: &str = r#"당신은 일본어 웹소설을 한국어로 번역하는 전문 번역가입니다.

규칙:
1. 각 <p> 태그의 id 속성을 반드시 유지하며 번역합니다.
2. 원문의 문체와 분위기를 최대한 살립니다.
3. 대화문은 자연스러운 한국어 구어체로 번역합니다.
4. 고유명사(인명, 지명 등)는 원문 발음을 한글로 표기합니다.
5. 루비 텍스트가 있으면 괄호로 표기합니다: 漢字(읽는법)
6. 문장을 생략하거나 추가하지 않습니다.
7. 번역 결과만 출력하고, 설명이나 주석은 추가하지 않습니다."#;

pub enum ApiClient {
    Gemini(GeminiClient),
    Antigravity(AntigravityClient),
}

pub struct TranslatorService {
    client: ApiClient,
    system_prompt: String,
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

        Ok(Self {
            client,
            system_prompt: DEFAULT_SYSTEM_PROMPT.to_string(),
        })
    }

    pub async fn translate_paragraphs(&mut self, paragraphs: &[String], note: Option<&str>) -> Result<Vec<String>, String> {
        if paragraphs.is_empty() {
            return Ok(vec![]);
        }

        let cached = get_cached_translations(paragraphs).await.unwrap_or_else(|_| vec![None; paragraphs.len()]);
        
        let mut uncached_indices: Vec<usize> = Vec::new();
        let mut uncached_paragraphs: Vec<String> = Vec::new();
        
        for (i, (p, c)) in paragraphs.iter().zip(cached.iter()).enumerate() {
            if c.is_none() {
                uncached_indices.push(i);
                uncached_paragraphs.push(p.clone());
            }
        }
        
        let mut results: Vec<String> = cached.into_iter().map(|c| c.unwrap_or_default()).collect();
        
        if !uncached_paragraphs.is_empty() {
            let prompt = match note {
                Some(n) => format!("{}\n\n추가 지시사항: {}", self.system_prompt, n),
                None => self.system_prompt.clone(),
            };

            let translated = match &mut self.client {
                ApiClient::Gemini(client) => client.translate(&uncached_paragraphs, &prompt).await?,
                ApiClient::Antigravity(client) => client.translate(&uncached_paragraphs, &prompt).await?,
            };
            
            let mut pairs: Vec<(String, String)> = Vec::new();
            for (i, trans) in uncached_indices.iter().zip(translated.iter()) {
                results[*i] = trans.clone();
                pairs.push((uncached_paragraphs[uncached_indices.iter().position(|x| x == i).unwrap()].clone(), trans.clone()));
            }
            
            cache_translations(&pairs).await.ok();
        }
        
        Ok(results)
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
