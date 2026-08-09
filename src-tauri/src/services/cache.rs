use sha2::{Digest, Sha256};
use sqlx::{Pool, Row, Sqlite};

use crate::db::get_pool;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TranslationCacheContext {
    pub site: String,
    pub novel_id: String,
    pub context_fingerprint: String,
}

impl TranslationCacheContext {
    pub fn new(site: &str, novel_id: &str, context_fingerprint: &str) -> Self {
        Self {
            site: site.to_string(),
            novel_id: novel_id.to_string(),
            context_fingerprint: context_fingerprint.to_string(),
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct TranslationContextFingerprintInput<'a> {
    pub provider: &'a str,
    pub model: &'a str,
    pub system_prompt: &'a str,
    pub translation_note: &'a str,
    pub dictionary_note: &'a str,
    pub additional_note: &'a str,
    pub substitutions: &'a str,
    pub has_subtitle: bool,
}

pub fn translation_context_fingerprint(
    input: TranslationContextFingerprintInput<'_>,
) -> String {
    let TranslationContextFingerprintInput {
        provider,
        model,
        system_prompt,
        translation_note,
        dictionary_note,
        additional_note,
        substitutions,
        has_subtitle,
    } = input;
    let fields = [
        ("provider", provider),
        ("model", model),
        ("system_prompt", system_prompt),
        ("translation_note", translation_note),
        ("dictionary_note", dictionary_note),
        ("additional_note", additional_note),
        ("substitutions", substitutions),
        ("has_subtitle", if has_subtitle { "true" } else { "false" }),
    ];
    let mut hasher = Sha256::new();
    for (name, value) in fields {
        let name_len = name.len().to_string();
        let value_len = value.len().to_string();
        hasher.update(name_len.as_bytes());
        hasher.update(b":");
        hasher.update(name.as_bytes());
        hasher.update(value_len.as_bytes());
        hasher.update(b":");
        hasher.update(value.as_bytes());
    }
    hex::encode(hasher.finalize())
}

#[cfg(test)]
pub async fn cache_translation_with_pool(
    pool: &Pool<Sqlite>,
    context: &TranslationCacheContext,
    original: &str,
    translated: &str,
) -> Result<(), String> {
    if original.trim().is_empty() || translated.trim().is_empty() {
        return Ok(());
    }

    let normalized_source = normalize_source(original);
    let hash = compute_hash(context, original);
    sqlx::query(
        "INSERT INTO translation_cache
            (text_hash, site, novel_id, context_fingerprint, normalized_source,
             original_text, translated_text, hit_count, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
         ON CONFLICT(text_hash) DO UPDATE SET
           translated_text = excluded.translated_text,
           last_used_at = CURRENT_TIMESTAMP",
    )
    .bind(&hash)
    .bind(&context.site)
    .bind(&context.novel_id)
    .bind(&context.context_fingerprint)
    .bind(&normalized_source)
    .bind(original)
    .bind(translated)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn get_cached_translations(
    context: &TranslationCacheContext,
    originals: &[String],
) -> Result<Vec<Option<String>>, String> {
    let pool = get_pool()?;
    get_cached_translations_with_pool(pool, context, originals).await
}

pub async fn get_cached_translations_with_pool(
    pool: &Pool<Sqlite>,
    context: &TranslationCacheContext,
    originals: &[String],
) -> Result<Vec<Option<String>>, String> {
    if originals.is_empty() {
        return Ok(vec![]);
    }

    let hashes: Vec<String> = originals.iter().map(|o| compute_hash(context, o)).collect();
    let placeholders = hashes.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query = format!(
        "SELECT text_hash, translated_text
         FROM translation_cache
         WHERE site = ? AND novel_id = ? AND context_fingerprint = ?
           AND text_hash IN ({})",
        placeholders
    );

    let mut query_builder = sqlx::query(&query)
        .bind(&context.site)
        .bind(&context.novel_id)
        .bind(&context.context_fingerprint);
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

    let hit_hashes: Vec<&String> = hashes
        .iter()
        .filter(|hash| cache_map.contains_key(*hash))
        .collect();
    if !hit_hashes.is_empty() {
        let update_placeholders = hit_hashes.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let update_query = format!(
            "UPDATE translation_cache
             SET hit_count = hit_count + 1, last_used_at = CURRENT_TIMESTAMP
             WHERE site = ? AND novel_id = ? AND context_fingerprint = ?
               AND text_hash IN ({})",
            update_placeholders
        );
        let mut update_builder = sqlx::query(&update_query)
            .bind(&context.site)
            .bind(&context.novel_id)
            .bind(&context.context_fingerprint);
        for hash in hit_hashes {
            update_builder = update_builder.bind(hash);
        }
        update_builder.execute(pool).await.ok();
    }

    Ok(hashes
        .iter()
        .map(|hash| cache_map.get(hash).cloned())
        .collect())
}

pub async fn cache_translations(
    context: &TranslationCacheContext,
    pairs: &[(String, String)],
) -> Result<(), String> {
    let pool = get_pool()?;
    cache_translations_with_pool(pool, context, pairs).await
}

pub async fn cache_translations_with_pool(
    pool: &Pool<Sqlite>,
    context: &TranslationCacheContext,
    pairs: &[(String, String)],
) -> Result<(), String> {
    if pairs.is_empty() {
        return Ok(());
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for (original, translated) in pairs {
        if original.trim().is_empty() || translated.trim().is_empty() {
            continue;
        }
        let normalized_source = normalize_source(original);
        let hash = compute_hash(context, original);
        sqlx::query(
            "INSERT INTO translation_cache
                (text_hash, site, novel_id, context_fingerprint, normalized_source,
                 original_text, translated_text, hit_count, last_used_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
             ON CONFLICT(text_hash) DO UPDATE SET
               translated_text = excluded.translated_text,
               last_used_at = CURRENT_TIMESTAMP",
        )
        .bind(&hash)
        .bind(&context.site)
        .bind(&context.novel_id)
        .bind(&context.context_fingerprint)
        .bind(&normalized_source)
        .bind(original)
        .bind(translated)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

fn normalize_source(text: &str) -> String {
    text.replace("\r\n", "\n")
        .replace('\r', "\n")
        .trim()
        .to_string()
}

fn compute_hash(context: &TranslationCacheContext, text: &str) -> String {
    let normalized_source = normalize_source(text);
    let mut hasher = Sha256::new();
    for value in [
        context.site.as_str(),
        context.novel_id.as_str(),
        context.context_fingerprint.as_str(),
        normalized_source.as_str(),
    ] {
        let len = value.len().to_string();
        hasher.update(len.as_bytes());
        hasher.update(b":");
        hasher.update(value.as_bytes());
    }
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};

    async fn setup_test_pool() -> Pool<Sqlite> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("create sqlite memory pool");
        sqlx::query(include_str!("../db/migrations/001_initial.sql"))
            .execute(&pool)
            .await
            .expect("apply initial migration");
        pool
    }

    fn context(site: &str, novel_id: &str, fingerprint: &str) -> TranslationCacheContext {
        TranslationCacheContext::new(site, novel_id, fingerprint)
    }

    #[test]
    fn test_compute_hash_is_deterministic_and_context_sensitive() {
        let ctx_a = context("syosetu", "shared-id", "model-a");
        let ctx_b = context("nocturne", "shared-id", "model-a");
        assert_eq!(
            compute_hash(&ctx_a, "source"),
            compute_hash(&ctx_a, "source")
        );
        assert_ne!(
            compute_hash(&ctx_a, "source"),
            compute_hash(&ctx_b, "source")
        );
    }

    #[test]
    fn test_compute_hash_normalizes_source_line_endings_and_outer_whitespace() {
        let ctx = context("syosetu", "shared-id", "model-a");
        assert_eq!(
            compute_hash(&ctx, "  source\r\ntext  "),
            compute_hash(&ctx, "source\ntext")
        );
    }

    #[tokio::test]
    async fn cache_reads_are_isolated_by_site_novel_and_context() {
        let pool = setup_test_pool().await;
        let baseline = context("syosetu", "shared-id", "model-a");
        let by_site = context("nocturne", "shared-id", "model-a");
        let by_novel = context("syosetu", "other-id", "model-a");
        let by_context = context("syosetu", "shared-id", "model-b");

        for (cache_context, translated) in [
            (&baseline, "baseline translation"),
            (&by_site, "other site translation"),
            (&by_novel, "other novel translation"),
            (&by_context, "other context translation"),
        ] {
            cache_translation_with_pool(&pool, cache_context, "source", translated)
                .await
                .expect("cache translation");
        }

        for (cache_context, translated) in [
            (&baseline, "baseline translation"),
            (&by_site, "other site translation"),
            (&by_novel, "other novel translation"),
            (&by_context, "other context translation"),
        ] {
            assert_eq!(
                get_cached_translations_with_pool(&pool, cache_context, &["source".to_string()])
                    .await
                    .expect("read cache"),
                vec![Some(translated.to_string())]
            );
        }
    }

    #[tokio::test]
    async fn batch_cache_writes_preserve_read_hit_count() {
        let pool = setup_test_pool().await;
        let cache_context = context("syosetu", "novel-1", "model-a");
        let originals = vec!["source".to_string()];

        cache_translations_with_pool(
            &pool,
            &cache_context,
            &[("source".to_string(), "first translation".to_string())],
        )
        .await
        .expect("insert cache row");

        let inserted = sqlx::query(
            "SELECT COUNT(*) AS row_count, translated_text, hit_count FROM translation_cache",
        )
        .fetch_one(&pool)
        .await
        .expect("read inserted cache row");
        assert_eq!(inserted.get::<i64, _>("row_count"), 1);
        assert_eq!(
            inserted.get::<String, _>("translated_text"),
            "first translation"
        );
        assert_eq!(inserted.get::<i64, _>("hit_count"), 0);

        assert_eq!(
            get_cached_translations_with_pool(&pool, &cache_context, &originals)
                .await
                .expect("first cache read"),
            vec![Some("first translation".to_string())]
        );

        cache_translations_with_pool(
            &pool,
            &cache_context,
            &[("source".to_string(), "latest translation".to_string())],
        )
        .await
        .expect("upsert cache row");

        let upserted = sqlx::query(
            "SELECT COUNT(*) AS row_count, translated_text, hit_count FROM translation_cache",
        )
        .fetch_one(&pool)
        .await
        .expect("read upserted cache row");
        assert_eq!(upserted.get::<i64, _>("row_count"), 1);
        assert_eq!(
            upserted.get::<String, _>("translated_text"),
            "latest translation"
        );
        assert_eq!(upserted.get::<i64, _>("hit_count"), 1);
        assert_eq!(
            get_cached_translations_with_pool(&pool, &cache_context, &originals)
                .await
                .expect("second cache read"),
            vec![Some("latest translation".to_string())]
        );

        let hit_count = sqlx::query_scalar::<_, i64>(
            "SELECT hit_count FROM translation_cache WHERE original_text = 'source'",
        )
        .fetch_one(&pool)
        .await
        .expect("read hit count");
        assert_eq!(hit_count, 2);
    }

    #[test]
    fn context_fingerprint_changes_for_each_translation_input() {
        let baseline_input = TranslationContextFingerprintInput {
            provider: "gemini",
            model: "gemini-2.0-flash",
            system_prompt: "system",
            translation_note: "note",
            dictionary_note: "dictionary",
            additional_note: "additional",
            substitutions: "substitutions",
            has_subtitle: true,
        };
        let baseline = translation_context_fingerprint(baseline_input);
        let variants = [
            translation_context_fingerprint(TranslationContextFingerprintInput {
                provider: "openai",
                ..baseline_input
            }),
            translation_context_fingerprint(TranslationContextFingerprintInput {
                model: "other-model",
                ..baseline_input
            }),
            translation_context_fingerprint(TranslationContextFingerprintInput {
                system_prompt: "other-system",
                ..baseline_input
            }),
            translation_context_fingerprint(TranslationContextFingerprintInput {
                translation_note: "other-note",
                ..baseline_input
            }),
            translation_context_fingerprint(TranslationContextFingerprintInput {
                dictionary_note: "other-dictionary",
                ..baseline_input
            }),
            translation_context_fingerprint(TranslationContextFingerprintInput {
                additional_note: "other-additional",
                ..baseline_input
            }),
            translation_context_fingerprint(TranslationContextFingerprintInput {
                substitutions: "other-substitutions",
                ..baseline_input
            }),
            translation_context_fingerprint(TranslationContextFingerprintInput {
                has_subtitle: false,
                ..baseline_input
            }),
        ];
        assert!(variants.iter().all(|variant| variant != &baseline));
    }
}
