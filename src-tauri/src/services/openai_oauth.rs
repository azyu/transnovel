use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use crate::commands::settings::{get_settings, set_setting};

const OPENAI_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_AUTH_URL: &str = "https://auth.openai.com/oauth/authorize";
const OPENAI_TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const OPENAI_REDIRECT_URI: &str = "http://localhost:1455/auth/callback";
const OPENAI_SCOPES: &str = "openid profile email offline_access";
const CALLBACK_PORT: u16 = 1455;
const OAUTH_TIMEOUT_SECS: u64 = 300;

struct PkceCodes {
    code_verifier: String,
    code_challenge: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    #[allow(dead_code)]
    id_token: Option<String>,
    expires_in: Option<u64>,
    #[allow(dead_code)]
    token_type: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

fn generate_pkce() -> PkceCodes {
    let mut bytes = [0u8; 64];
    rand::rng().fill_bytes(&mut bytes);

    let code_verifier = URL_SAFE_NO_PAD.encode(bytes);
    let digest = Sha256::digest(code_verifier.as_bytes());
    let code_challenge = URL_SAFE_NO_PAD.encode(digest);

    PkceCodes {
        code_verifier,
        code_challenge,
    }
}

fn generate_state() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn build_authorize_url(pkce: &PkceCodes, state: &str) -> String {
    format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256&state={}&codex_cli_simplified_flow=true",
        OPENAI_AUTH_URL,
        urlencoding(OPENAI_CLIENT_ID),
        urlencoding(OPENAI_REDIRECT_URI),
        urlencoding(OPENAI_SCOPES),
        urlencoding(&pkce.code_challenge),
        urlencoding(state),
    )
}

fn urlencoding(s: &str) -> String {
    s.replace(' ', "%20")
        .replace(':', "%3A")
        .replace('/', "%2F")
        .replace('+', "%2B")
}

/// Start the full OAuth PKCE flow: open browser, wait for callback, exchange code.
pub async fn start_oauth_flow() -> Result<OAuthTokens, String> {
    let pkce = generate_pkce();
    let state = generate_state();
    let authorize_url = build_authorize_url(&pkce, &state);

    // Bind callback server before opening browser
    let listener = TcpListener::bind(format!("127.0.0.1:{}", CALLBACK_PORT))
        .await
        .map_err(|e| {
            format!(
                "포트 {}를 열 수 없습니다. Codex CLI 등 다른 프로그램이 사용 중일 수 있습니다: {}",
                CALLBACK_PORT, e
            )
        })?;

    // Open browser to authorization URL
    open::that(&authorize_url).map_err(|e| format!("브라우저 열기 실패: {}", e))?;

    // Wait for callback with timeout
    let code = tokio::time::timeout(
        std::time::Duration::from_secs(OAUTH_TIMEOUT_SECS),
        wait_for_callback(&listener, &state),
    )
    .await
    .map_err(|_| "인증 시간이 초과되었습니다. 다시 시도해주세요.".to_string())?
    .map_err(|e| format!("콜백 처리 실패: {}", e))?;

    // Exchange authorization code for tokens
    exchange_code_for_tokens(&code, &pkce).await
}

async fn wait_for_callback(listener: &TcpListener, expected_state: &str) -> Result<String, String> {
    let (mut stream, _) = listener
        .accept()
        .await
        .map_err(|e| format!("연결 수신 실패: {}", e))?;

    let mut buf = vec![0u8; 4096];
    let n = stream
        .read(&mut buf)
        .await
        .map_err(|e| format!("요청 읽기 실패: {}", e))?;

    let request = String::from_utf8_lossy(&buf[..n]);

    // Parse GET /auth/callback?code=XXX&state=YYY HTTP/1.1
    let first_line = request.lines().next().unwrap_or_default();
    let path = first_line.split_whitespace().nth(1).unwrap_or_default();

    let query = path.split('?').nth(1).unwrap_or_default();
    let params: std::collections::HashMap<&str, &str> = query
        .split('&')
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            Some((parts.next()?, parts.next()?))
        })
        .collect();

    // Check for error
    if let Some(error) = params.get("error") {
        let desc = params.get("error_description").unwrap_or(&"");
        let error_html = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<html><body><h2>인증 실패</h2><p>{}: {}</p></body></html>",
            error, desc
        );
        let _ = stream.write_all(error_html.as_bytes()).await;
        let _ = stream.shutdown().await;
        return Err(format!("OAuth 오류: {}: {}", error, desc));
    }

    let code = params
        .get("code")
        .ok_or("콜백에서 인증 코드를 찾을 수 없습니다.")?
        .to_string();

    let received_state = params
        .get("state")
        .ok_or("콜백에서 state 파라미터를 찾을 수 없습니다.")?;

    if *received_state != expected_state {
        let error_html = "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<html><body><h2>인증 실패</h2><p>state 불일치</p></body></html>";
        let _ = stream.write_all(error_html.as_bytes()).await;
        let _ = stream.shutdown().await;
        return Err("OAuth state 불일치. CSRF 공격 가능성이 있습니다.".to_string());
    }

    // Send success response
    let success_html = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n<html><head><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0}div{text-align:center}h2{color:#34d399;margin-bottom:8px}</style></head><body><div><h2>인증 완료!</h2><p>이 창을 닫아도 됩니다.</p></div></body></html>";
    let _ = stream.write_all(success_html.as_bytes()).await;
    let _ = stream.shutdown().await;

    Ok(code)
}

async fn exchange_code_for_tokens(
    code: &str,
    pkce: &PkceCodes,
) -> Result<OAuthTokens, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let form = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("client_id", OPENAI_CLIENT_ID),
        ("redirect_uri", OPENAI_REDIRECT_URI),
        ("code_verifier", &pkce.code_verifier),
    ];

    let response = client
        .post(OPENAI_TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("토큰 교환 요청 실패: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("토큰 교환 실패 ({}): {}", status, body));
    }

    let token_resp: TokenResponse = response
        .json()
        .await
        .map_err(|e| format!("토큰 응답 파싱 실패: {}", e))?;

    if let Some(error) = token_resp.error {
        let desc = token_resp.error_description.unwrap_or_default();
        return Err(format!("토큰 교환 오류: {}: {}", error, desc));
    }

    let access_token = token_resp
        .access_token
        .ok_or("응답에 access_token이 없습니다.")?;
    let refresh_token = token_resp
        .refresh_token
        .ok_or("응답에 refresh_token이 없습니다.")?;
    let expires_in = token_resp.expires_in.unwrap_or(3600);
    let email = token_resp.id_token.as_deref().and_then(extract_email_from_jwt);

    Ok(OAuthTokens {
        access_token,
        refresh_token,
        expires_in,
        email,
    })
}

/// Refresh an expired access token using a refresh token.
pub async fn refresh_access_token(refresh_token: &str) -> Result<OAuthTokens, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let form = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", OPENAI_CLIENT_ID),
    ];

    let response = client
        .post(OPENAI_TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("토큰 갱신 요청 실패: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "토큰 갱신 실패 ({}): {}. 다시 로그인해주세요.",
            status, body
        ));
    }

    let token_resp: TokenResponse = response
        .json()
        .await
        .map_err(|e| format!("토큰 갱신 응답 파싱 실패: {}", e))?;

    if let Some(error) = token_resp.error {
        let desc = token_resp.error_description.unwrap_or_default();
        return Err(format!(
            "토큰 갱신 오류: {}: {}. 다시 로그인해주세요.",
            error, desc
        ));
    }

    let access_token = token_resp
        .access_token
        .ok_or("갱신 응답에 access_token이 없습니다.")?;
    // OpenAI rotates refresh tokens — always store the new one
    let new_refresh_token = token_resp.refresh_token.unwrap_or(refresh_token.to_string());
    let expires_in = token_resp.expires_in.unwrap_or(3600);

    Ok(OAuthTokens {
        access_token,
        refresh_token: new_refresh_token,
        expires_in,
        email: None, // refresh flow doesn't return id_token
    })
}

fn now_epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn settings_key_refresh(provider_id: &str) -> String {
    format!("openai_oauth_{}_refresh_token", provider_id)
}

fn settings_key_expires(provider_id: &str) -> String {
    format!("openai_oauth_{}_expires_at", provider_id)
}

fn settings_key_email(provider_id: &str) -> String {
    format!("openai_oauth_{}_email", provider_id)
}

/// Extract email from a JWT id_token by decoding its payload (no signature verification needed).
fn extract_email_from_jwt(id_token: &str) -> Option<String> {
    let parts: Vec<&str> = id_token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    // JWT payload is base64url-encoded; pad if necessary
    let payload = parts[1];
    let decoded = URL_SAFE_NO_PAD.decode(payload).ok()?;
    let json: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    json.get("email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Extract email or name from a JWT token by decoding its payload (no signature verification needed).
fn extract_identity_from_jwt(token: &str) -> Option<String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let payload = parts[1];
    // Try decoding with and without padding since JWT base64url can vary
    let decoded = URL_SAFE_NO_PAD
        .decode(payload)
        .or_else(|_| {
            // Try with padding
            let padded = match payload.len() % 4 {
                2 => format!("{}==", payload),
                3 => format!("{}=", payload),
                _ => payload.to_string(),
            };
            URL_SAFE_NO_PAD.decode(&padded)
        })
        .ok()?;
    let json: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    // Only use human-readable fields, not sub (which is an opaque ID like "windowslive|abc123")
    json.get("email")
        .or_else(|| json.get("name"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.contains('|'))
        .map(|s| s.to_string())
}

/// Fetch user identity from OpenAI OIDC userinfo endpoint.
pub async fn fetch_userinfo_email(access_token: &str) -> Option<String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .ok()?;

    let resp = client
        .get("https://auth.openai.com/userinfo")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        eprintln!(
            "[openai_oauth] userinfo failed with status: {}",
            resp.status()
        );
        return None;
    }

    let json: serde_json::Value = resp.json().await.ok()?;
    eprintln!("[openai_oauth] userinfo response keys: {:?}", json.as_object().map(|o| o.keys().collect::<Vec<_>>()));
    json.get("email")
        .or_else(|| json.get("name"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.contains('|'))
        .map(|s| s.to_string())
}

/// Get the stored email for a provider, fetching from userinfo if not cached.
pub async fn get_or_fetch_email(provider_id: &str, access_token: &str) -> Option<String> {
    // Try stored first (skip if it looks like an opaque ID)
    if let Some(email) = get_stored_email(provider_id).await {
        if !email.contains('|') {
            return Some(email);
        }
        // Clear bad cached value
        let _ = set_setting(settings_key_email(provider_id), String::new()).await;
    }
    // Try decoding the access_token itself as JWT
    if let Some(identity) = extract_identity_from_jwt(access_token) {
        let _ = set_setting(settings_key_email(provider_id), identity.clone()).await;
        return Some(identity);
    }
    // Fetch from userinfo endpoint and cache
    if let Some(identity) = fetch_userinfo_email(access_token).await {
        let _ = set_setting(settings_key_email(provider_id), identity.clone()).await;
        return Some(identity);
    }
    eprintln!("[openai_oauth] all identity fetch methods failed for provider {}", provider_id);
    None
}

/// Get the stored email for a provider from settings.
pub async fn get_stored_email(provider_id: &str) -> Option<String> {
    let settings = get_settings().await.unwrap_or_default();
    settings
        .iter()
        .find(|s| s.key == settings_key_email(provider_id))
        .map(|s| s.value.clone())
        .filter(|v| !v.is_empty())
}

/// Store OAuth tokens in the settings table and update the provider's apiKey.
pub async fn store_tokens(provider_id: &str, tokens: &OAuthTokens) -> Result<(), String> {
    let expires_at = now_epoch_secs() + tokens.expires_in;

    set_setting(
        settings_key_refresh(provider_id),
        tokens.refresh_token.clone(),
    )
    .await?;
    set_setting(settings_key_expires(provider_id), expires_at.to_string()).await?;

    // Store email if present (from initial auth, not refresh)
    if let Some(email) = &tokens.email {
        set_setting(settings_key_email(provider_id), email.clone()).await?;
    }

    // Update the provider's apiKey field with the access_token
    update_provider_api_key(provider_id, &tokens.access_token).await?;

    Ok(())
}

/// Ensure the token for a provider is valid. Refreshes if expired.
/// Returns a valid access_token.
pub async fn ensure_valid_token(provider_id: &str) -> Result<String, String> {
    let settings = get_settings().await.unwrap_or_default();
    let get_val = |key: &str| -> Option<String> {
        settings
            .iter()
            .find(|s| s.key == key)
            .map(|s| s.value.clone())
            .filter(|v| !v.is_empty())
    };

    let expires_at_str = get_val(&settings_key_expires(provider_id));
    let current_api_key = get_provider_api_key(provider_id, &settings);

    // Check if token is still valid (with 60s buffer)
    if let Some(expires_str) = expires_at_str {
        if let Ok(expires_at) = expires_str.parse::<u64>() {
            if now_epoch_secs() + 60 < expires_at {
                // Token still valid
                if let Some(key) = current_api_key {
                    if !key.is_empty() {
                        return Ok(key);
                    }
                }
            }
        }
    }

    // Token expired or missing — try refresh
    let refresh_token = get_val(&settings_key_refresh(provider_id))
        .ok_or("리프레시 토큰이 없습니다. 다시 로그인해주세요.")?;

    let tokens = refresh_access_token(&refresh_token).await?;
    store_tokens(provider_id, &tokens).await?;

    Ok(tokens.access_token)
}

/// Read the provider's apiKey from settings JSON.
fn get_provider_api_key(
    provider_id: &str,
    settings: &[crate::commands::settings::Setting],
) -> Option<String> {
    let providers_json = settings
        .iter()
        .find(|s| s.key == "llm_providers")
        .map(|s| s.value.clone())?;

    let providers: Vec<serde_json::Value> =
        serde_json::from_str(&providers_json).unwrap_or_default();

    providers
        .iter()
        .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(provider_id))
        .and_then(|p| p.get("apiKey"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Update a specific provider's apiKey in the llm_providers JSON setting.
async fn update_provider_api_key(provider_id: &str, new_api_key: &str) -> Result<(), String> {
    let settings = get_settings().await.unwrap_or_default();
    let providers_json = settings
        .iter()
        .find(|s| s.key == "llm_providers")
        .map(|s| s.value.clone())
        .unwrap_or_else(|| "[]".to_string());

    let mut providers: Vec<serde_json::Value> =
        serde_json::from_str(&providers_json).map_err(|e| e.to_string())?;

    let mut found = false;
    for provider in &mut providers {
        if provider.get("id").and_then(|v| v.as_str()) == Some(provider_id) {
            provider["apiKey"] = serde_json::Value::String(new_api_key.to_string());
            found = true;
            break;
        }
    }

    if !found {
        return Err(format!("프로바이더 '{}'를 찾을 수 없습니다.", provider_id));
    }

    let updated_json = serde_json::to_string(&providers).map_err(|e| e.to_string())?;
    set_setting("llm_providers".to_string(), updated_json).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_pkce() {
        let pkce = generate_pkce();
        // Verifier should be 86 chars (64 bytes base64url encoded)
        assert_eq!(pkce.code_verifier.len(), 86);
        // Challenge should be 43 chars (32 bytes SHA256 base64url encoded)
        assert_eq!(pkce.code_challenge.len(), 43);
        // Verify the challenge matches the verifier
        let digest = Sha256::digest(pkce.code_verifier.as_bytes());
        let expected_challenge = URL_SAFE_NO_PAD.encode(digest);
        assert_eq!(pkce.code_challenge, expected_challenge);
    }

    #[test]
    fn test_generate_state() {
        let state = generate_state();
        assert_eq!(state.len(), 43); // 32 bytes base64url encoded
        // Each call should produce a different value
        let state2 = generate_state();
        assert_ne!(state, state2);
    }

    #[test]
    fn test_build_authorize_url() {
        let pkce = PkceCodes {
            code_verifier: "test_verifier".to_string(),
            code_challenge: "test_challenge".to_string(),
        };
        let state = "test_state";
        let url = build_authorize_url(&pkce, state);

        assert!(url.starts_with("https://auth.openai.com/oauth/authorize?"));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("client_id=app_EMoamEEZ73f0CkXaXp7hrann"));
        assert!(url.contains("code_challenge=test_challenge"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("state=test_state"));
    }

    #[test]
    fn test_settings_keys() {
        assert_eq!(
            settings_key_refresh("abc-123"),
            "openai_oauth_abc-123_refresh_token"
        );
        assert_eq!(
            settings_key_expires("abc-123"),
            "openai_oauth_abc-123_expires_at"
        );
    }
}
