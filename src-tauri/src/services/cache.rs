use sha2::{Sha256, Digest};
use sqlx::Row;

use crate::db::get_pool;

pub async fn cache_translation(novel_id: &str, original: &str, translated: &str) -> Result<(), String> {
    if original.trim().is_empty() || translated.trim().is_empty() {
        return Ok(());
    }
    
    let pool = get_pool()?;
    let hash = compute_hash(novel_id, original);
    
    sqlx::query(
        "INSERT INTO translation_cache (text_hash, novel_id, original_text, translated_text, hit_count, last_used_at) 
         VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(text_hash) DO UPDATE SET 
           translated_text = excluded.translated_text,
           novel_id = excluded.novel_id,
           hit_count = translation_cache.hit_count + 1,
           last_used_at = CURRENT_TIMESTAMP"
    )
    .bind(&hash)
    .bind(novel_id)
    .bind(original)
    .bind(translated)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

pub async fn get_cached_translations(novel_id: &str, originals: &[String]) -> Result<Vec<Option<String>>, String> {
    if originals.is_empty() {
        return Ok(vec![]);
    }
    
    let pool = get_pool()?;
    let hashes: Vec<String> = originals.iter().map(|o| compute_hash(novel_id, o)).collect();
    
    let placeholders = hashes.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query = format!(
        "SELECT text_hash, translated_text FROM translation_cache WHERE text_hash IN ({})",
        placeholders
    );
    
    let mut query_builder = sqlx::query(&query);
    for hash in &hashes {
        query_builder = query_builder.bind(hash);
    }
    
    let rows = query_builder
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    
    let cache_map: std::collections::HashMap<String, String> = rows
        .into_iter()
        .map(|row| (row.get("text_hash"), row.get("translated_text")))
        .collect();
    
    let hit_hashes: Vec<&String> = hashes.iter().filter(|h| cache_map.contains_key(*h)).collect();
    if !hit_hashes.is_empty() {
        let update_placeholders = hit_hashes.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let update_query = format!(
            "UPDATE translation_cache SET hit_count = hit_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE text_hash IN ({})",
            update_placeholders
        );
        let mut update_builder = sqlx::query(&update_query);
        for hash in hit_hashes {
            update_builder = update_builder.bind(hash);
        }
        update_builder.execute(pool).await.ok();
    }
    
    Ok(hashes.iter().map(|h| cache_map.get(h).cloned()).collect())
}

pub async fn cache_translations(novel_id: &str, pairs: &[(String, String)]) -> Result<(), String> {
    if pairs.is_empty() {
        return Ok(());
    }
    
    let pool = get_pool()?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    
    for (original, translated) in pairs {
        if original.trim().is_empty() || translated.trim().is_empty() {
            continue;
        }
        let hash = compute_hash(novel_id, original);
        sqlx::query(
            "INSERT INTO translation_cache (text_hash, novel_id, original_text, translated_text, hit_count, last_used_at) 
             VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
             ON CONFLICT(text_hash) DO UPDATE SET 
               translated_text = excluded.translated_text,
               novel_id = excluded.novel_id,
               hit_count = translation_cache.hit_count + 1,
               last_used_at = CURRENT_TIMESTAMP"
        )
        .bind(&hash)
        .bind(novel_id)
        .bind(original)
        .bind(translated)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

fn compute_hash(novel_id: &str, text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(novel_id.as_bytes());
    hasher.update(b":");
    hasher.update(text.as_bytes());
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_hash_deterministic() {
        let hash1 = compute_hash("novel1", "テスト");
        let hash2 = compute_hash("novel1", "テスト");
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_compute_hash_different_novels_produce_different_hashes() {
        let hash1 = compute_hash("novel1", "テスト");
        let hash2 = compute_hash("novel2", "テスト");
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_compute_hash_different_text_produce_different_hashes() {
        let hash1 = compute_hash("novel1", "テスト1");
        let hash2 = compute_hash("novel1", "テスト2");
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_compute_hash_returns_64_char_hex() {
        let hash = compute_hash("novel", "text");
        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_compute_hash_empty_inputs() {
        let hash1 = compute_hash("", "text");
        let hash2 = compute_hash("novel", "");
        let hash3 = compute_hash("", "");
        
        assert_eq!(hash1.len(), 64);
        assert_eq!(hash2.len(), 64);
        assert_eq!(hash3.len(), 64);
        assert_ne!(hash1, hash2);
        assert_ne!(hash2, hash3);
    }

    #[test]
    fn test_compute_hash_unicode_text() {
        let hash1 = compute_hash("novel", "日本語テスト");
        let hash2 = compute_hash("novel", "한국어테스트");
        let hash3 = compute_hash("novel", "日本語テスト");
        
        assert_ne!(hash1, hash2);
        assert_eq!(hash1, hash3);
    }
}
