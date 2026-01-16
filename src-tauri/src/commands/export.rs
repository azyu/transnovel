use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub enum ExportFormat {
    TxtSingle,
    TxtChapters,
    Html,
    Epub,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportOptions {
    pub format: ExportFormat,
    pub include_original: bool,
    pub include_notes: bool,
    pub output_dir: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportRequest {
    pub novel_id: String,
    pub options: ExportOptions,
}

#[tauri::command]
pub async fn export_novel(app: AppHandle, request: ExportRequest) -> Result<String, String> {
    let output_path = match request.options.format {
        ExportFormat::TxtSingle => export_txt_single(&app, &request).await?,
        ExportFormat::TxtChapters => export_txt_chapters(&app, &request).await?,
        ExportFormat::Html => export_html(&app, &request).await?,
        ExportFormat::Epub => export_epub(&app, &request).await?,
    };

    Ok(output_path)
}

async fn export_txt_single(app: &AppHandle, request: &ExportRequest) -> Result<String, String> {
    let output_dir = request
        .options
        .output_dir
        .clone()
        .unwrap_or_else(|| dirs::download_dir().unwrap().to_string_lossy().to_string());

    let filename = format!("{}.txt", sanitize_filename(&request.novel_id));
    let path = PathBuf::from(&output_dir).join(&filename);

    let mut content = String::new();
    content.push_str(&format!("# {}\n\n", request.novel_id));
    content.push_str("번역된 내용이 여기에 표시됩니다.\n");

    let mut file = File::create(&path).map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

async fn export_txt_chapters(app: &AppHandle, request: &ExportRequest) -> Result<String, String> {
    let output_dir = request
        .options
        .output_dir
        .clone()
        .unwrap_or_else(|| dirs::download_dir().unwrap().to_string_lossy().to_string());

    Ok(output_dir)
}

async fn export_html(app: &AppHandle, request: &ExportRequest) -> Result<String, String> {
    Err("HTML 내보내기는 아직 구현되지 않았습니다.".to_string())
}

async fn export_epub(app: &AppHandle, request: &ExportRequest) -> Result<String, String> {
    Err("EPUB 내보내기는 아직 구현되지 않았습니다.".to_string())
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}
