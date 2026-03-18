use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::get_pool;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct CharacterDictionaryEntry {
    pub source_text: String,
    #[serde(default)]
    pub reading: Option<String>,
    pub target_name: String,
    #[serde(default)]
    pub note: Option<String>,
}

pub async fn get_novel_character_dictionary(
    site: &str,
    novel_id: &str,
) -> Result<Vec<CharacterDictionaryEntry>, String> {
    let pool = get_pool()?;

    let row = sqlx::query(
        "SELECT entries_json FROM novel_character_dictionary WHERE site = ? AND novel_id = ?",
    )
    .bind(site)
    .bind(novel_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let Some(row) = row else {
        return Ok(vec![]);
    };

    let entries_json: String = row.get("entries_json");
    let entries: Vec<CharacterDictionaryEntry> =
        serde_json::from_str(&entries_json).map_err(|e| e.to_string())?;
    Ok(normalize_entries(entries))
}

pub async fn save_novel_character_dictionary(
    site: &str,
    novel_id: &str,
    entries: &[CharacterDictionaryEntry],
) -> Result<(), String> {
    let pool = get_pool()?;
    let normalized = normalize_entries(entries.to_vec());

    if normalized.is_empty() {
        sqlx::query("DELETE FROM novel_character_dictionary WHERE site = ? AND novel_id = ?")
            .bind(site)
            .bind(novel_id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let entries_json = serde_json::to_string(&normalized).map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO novel_character_dictionary (site, novel_id, entries_json, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(site, novel_id) DO UPDATE SET
           entries_json = excluded.entries_json,
           updated_at = CURRENT_TIMESTAMP",
    )
    .bind(site)
    .bind(novel_id)
    .bind(entries_json)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn format_character_dictionary_note(entries: &[CharacterDictionaryEntry]) -> String {
    let normalized = normalize_entries(entries.to_vec());
    if normalized.is_empty() {
        return String::new();
    }

    let lines = normalized
        .iter()
        .map(|entry| {
            let mut line = format!("- {} => {}", entry.source_text, entry.target_name);
            if let Some(reading) = entry.reading.as_deref().filter(|v| !v.is_empty()) {
                line.push_str(&format!(" | 읽기: {}", reading));
            }
            if let Some(note) = entry.note.as_deref().filter(|v| !v.is_empty()) {
                line.push_str(&format!(" | 메모: {}", note));
            }
            line
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "## 작품별 사용자 정의 고유명사 사전\n아래 표기를 번역 전반에서 우선 적용하세요.\n{}",
        lines
    )
}

fn normalize_entries(entries: Vec<CharacterDictionaryEntry>) -> Vec<CharacterDictionaryEntry> {
    entries
        .into_iter()
        .filter_map(|entry| {
            let source_text = entry.source_text.trim().to_string();
            let target_name = entry.target_name.trim().to_string();
            if source_text.is_empty() || target_name.is_empty() {
                return None;
            }

            let reading = entry
                .reading
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());
            let note = entry
                .note
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());

            Some(CharacterDictionaryEntry {
                source_text,
                reading,
                target_name,
                note,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_character_dictionary_note() {
        let note = format_character_dictionary_note(&[CharacterDictionaryEntry {
            source_text: "周".to_string(),
            reading: Some("あまね".to_string()),
            target_name: "아마네".to_string(),
            note: Some("주인공".to_string()),
        }]);

        assert!(note.contains("작품별 사용자 정의 고유명사 사전"));
        assert!(note.contains("周 => 아마네"));
        assert!(note.contains("읽기: あまね"));
        assert!(note.contains("메모: 주인공"));
    }

    #[test]
    fn test_normalize_entries_filters_invalid_rows() {
        let normalized = normalize_entries(vec![
            CharacterDictionaryEntry {
                source_text: " 周 ".to_string(),
                reading: Some(" あまね ".to_string()),
                target_name: " 아마네 ".to_string(),
                note: Some(" ".to_string()),
            },
            CharacterDictionaryEntry {
                source_text: "".to_string(),
                reading: None,
                target_name: "누락".to_string(),
                note: None,
            },
        ]);

        assert_eq!(normalized.len(), 1);
        assert_eq!(normalized[0].source_text, "周");
        assert_eq!(normalized[0].reading.as_deref(), Some("あまね"));
        assert_eq!(normalized[0].target_name, "아마네");
        assert_eq!(normalized[0].note, None);
    }
}
