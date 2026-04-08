use crate::models::novel::{WatchlistEpisode, WatchlistItem, WatchlistViewedUpdate};

#[tauri::command]
pub async fn add_watchlist_item(url: String) -> Result<WatchlistItem, String> {
    crate::services::watchlist::add_watchlist_item(&url).await
}

#[tauri::command]
pub async fn list_watchlist_items() -> Result<Vec<WatchlistItem>, String> {
    crate::services::watchlist::list_watchlist_items().await
}

#[tauri::command]
pub async fn refresh_watchlist() -> Result<Vec<WatchlistItem>, String> {
    crate::services::watchlist::refresh_watchlist_items().await
}

#[tauri::command]
pub async fn get_watchlist_episodes(
    site: String,
    novel_id: String,
) -> Result<Vec<WatchlistEpisode>, String> {
    crate::services::watchlist::get_watchlist_episodes(&site, &novel_id).await
}

#[tauri::command]
pub async fn mark_episode_viewed(
    site: String,
    novel_id: String,
    chapter_number: u32,
) -> Result<WatchlistViewedUpdate, String> {
    crate::services::watchlist::mark_episode_viewed(&site, &novel_id, chapter_number).await
}
