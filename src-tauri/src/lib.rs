mod commands;
mod db;
mod models;
mod parsers;
mod services;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

fn get_migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_initial_tables",
        sql: include_str!("db/migrations/001_initial.sql"),
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:novels.db", get_migrations())
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::translation::translate_chapter,
            commands::translation::translate_text,
            commands::parser::parse_url,
            commands::parser::parse_chapter,
            commands::parser::get_chapter_content,
            commands::parser::get_chapter_list,
            commands::parser::get_series_info,
            commands::series::start_batch_translation,
            commands::series::pause_translation,
            commands::series::resume_translation,
            commands::series::get_translation_progress,
            commands::export::export_novel,
            commands::settings::get_settings,
            commands::settings::set_setting,
            commands::settings::get_api_keys,
            commands::settings::add_api_key,
            commands::settings::remove_api_key,
        ])
        .setup(|app| {
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
