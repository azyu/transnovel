mod commands;
mod db;
mod models;
mod parsers;
mod services;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::translation::translate_chapter,
            commands::translation::translate_text,
            commands::translation::translate_paragraphs,
            commands::translation::translate_paragraphs_streaming,
            commands::parser::parse_url,
            commands::parser::parse_chapter,
            commands::parser::get_chapter_content,
            commands::parser::get_chapter_list,
            commands::parser::get_series_info,
            commands::series::start_batch_translation,
            commands::series::pause_translation,
            commands::series::resume_translation,
            commands::series::stop_translation,
            commands::series::get_translation_progress,
            commands::export::export_novel,
            commands::export::save_chapter,
            commands::export::save_chapter_with_dialog,
            commands::settings::get_settings,
            commands::settings::set_setting,
            commands::settings::get_api_keys,
            commands::settings::add_api_key,
            commands::settings::remove_api_key,
            commands::settings::check_antigravity_status,
            commands::settings::open_antigravity_auth,
            commands::settings::open_url,
            commands::settings::fetch_gemini_models,
            commands::settings::fetch_antigravity_models,
            commands::settings::fetch_openrouter_models,
            commands::settings::get_cache_stats,
            commands::settings::get_cache_stats_detailed,
            commands::settings::clear_cache,
            commands::settings::clear_cache_by_novel,
            commands::settings::reset_all,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = db::init_db(&handle).await {
                    log::error!("Failed to initialize database: {}", e);
                }
            });
            
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
