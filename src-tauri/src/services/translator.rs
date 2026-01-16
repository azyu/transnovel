use tauri::AppHandle;

use crate::models::translation::TranslationResult;
use crate::services::antigravity::AntigravityClient;
use crate::services::gemini::GeminiClient;

const DEFAULT_SYSTEM_PROMPT: &str = r#"당신은 일본어 웹소설을 한국어로 번역하는 전문 번역가입니다.

규칙:
1. 각 <p> 태그의 id를 유지하며 번역합니다.
2. 원문의 문체와 분위기를 최대한 살립니다.
3. 대화문은 자연스러운 한국어 구어체로 번역합니다.
4. 고유명사(인명, 지명 등)는 원문 발음을 한글로 표기합니다.
5. 루비 텍스트가 있으면 괄호로 표기합니다: 한자(읽는법)
6. 문장을 생략하거나 추가하지 않습니다."#;

pub enum ApiClient {
    Gemini(GeminiClient),
    Antigravity(AntigravityClient),
}

pub struct TranslatorService {
    client: ApiClient,
    system_prompt: String,
}

impl TranslatorService {
    pub async fn new(app: &AppHandle) -> Result<Self, String> {
        let api_keys = get_api_keys_from_db(app).await?;

        let client = if !api_keys.is_empty() {
            ApiClient::Gemini(GeminiClient::new(api_keys))
        } else {
            let antigravity = AntigravityClient::new();
            if antigravity.check_health().await {
                ApiClient::Antigravity(antigravity)
            } else {
                return Err(
                    "API 키가 설정되지 않았고, Antigravity 프록시도 실행 중이 아닙니다."
                        .to_string(),
                );
            }
        };

        Ok(Self {
            client,
            system_prompt: DEFAULT_SYSTEM_PROMPT.to_string(),
        })
    }

    pub fn with_prompt(mut self, prompt: &str) -> Self {
        self.system_prompt = prompt.to_string();
        self
    }

    pub async fn translate_text(&self, text: &str, note: Option<&str>) -> Result<String, String> {
        let paragraphs: Vec<String> = text
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|s| s.to_string())
            .collect();

        if paragraphs.is_empty() {
            return Ok(String::new());
        }

        let prompt = if let Some(n) = note {
            format!("{}\n\n{}", self.system_prompt, n)
        } else {
            self.system_prompt.clone()
        };

        let translated = match &self.client {
            ApiClient::Gemini(client) => {
                let mut client = GeminiClient::new(vec![]);
                client.translate(&paragraphs, &prompt).await?
            }
            ApiClient::Antigravity(client) => client.translate(&paragraphs, &prompt).await?,
        };

        Ok(translated.join("\n"))
    }

    pub async fn translate_chapter(
        &self,
        novel_id: &str,
        chapter_number: u32,
    ) -> Result<TranslationResult, String> {
        Ok(TranslationResult {
            original: vec![],
            translated: vec![],
            model_used: "gemini-2.5-flash".to_string(),
        })
    }
}

async fn get_api_keys_from_db(app: &AppHandle) -> Result<Vec<String>, String> {
    Ok(vec![])
}
