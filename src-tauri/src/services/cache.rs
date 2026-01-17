use sha2::{Sha256, Digest};
use sqlx::Row;

use crate::db::get_pool;

pub async fn get_cached_translation(original: &str) -> Result<Option<String>, String> {
    let pool = get_pool()?;
    let hash = compute_hash(original);
    
    let row = sqlx::query(
        "SELECT translated_text FROM translation_cache WHERE text_hash = ?"
    )
    .bind(&hash)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    if let Some(row) = row {
        sqlx::query(
            "UPDATE translation_cache SET hit_count = hit_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE text_hash = ?"
        )
        .bind(&hash)
        .execute(pool)
        .await
        .ok();
        
        Ok(Some(row.get("translated_text")))
    } else {
        Ok(None)
    }
}

pub async fn cache_translation(original: &str, translated: &str) -> Result<(), String> {
    let pool = get_pool()?;
    let hash = compute_hash(original);
    
    sqlx::query(
        "INSERT INTO translation_cache (text_hash, original_text, translated_text, hit_count, last_used_at) 
         VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(text_hash) DO UPDATE SET 
           translated_text = excluded.translated_text,
           hit_count = translation_cache.hit_count + 1,
           last_used_at = CURRENT_TIMESTAMP"
    )
    .bind(&hash)
    .bind(original)
    .bind(translated)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

pub async fn get_cached_translations(originals: &[String]) -> Result<Vec<Option<String>>, String> {
    let mut results = Vec::with_capacity(originals.len());
    
    for original in originals {
        results.push(get_cached_translation(original).await?);
    }
    
    Ok(results)
}

pub async fn cache_translations(pairs: &[(String, String)]) -> Result<(), String> {
    for (original, translated) in pairs {
        cache_translation(original, translated).await?;
    }
    Ok(())
}

fn compute_hash(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hex::encode(hasher.finalize())
}
