use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize, Deserialize)]
pub enum ExportFormat {
    TxtSingle,
    TxtChapters,
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
pub struct ExportChapter {
    pub number: u32,
    pub title: String,
    pub paragraphs: Vec<ExportParagraph>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportParagraph {
    pub original: String,
    pub translated: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportRequest {
    pub novel_id: String,
    pub novel_title: String,
    pub chapters: Vec<ExportChapter>,
    pub options: ExportOptions,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportResult {
    pub path: String,
    pub file_count: u32,
}

#[tauri::command]
pub async fn export_novel(_app: AppHandle, request: ExportRequest) -> Result<ExportResult, String> {
    let output_path = match request.options.format {
        ExportFormat::TxtSingle => export_txt_single(&request).await?,
        ExportFormat::TxtChapters => export_txt_chapters(&request).await?,
        ExportFormat::Epub => return Err("EPUB 내보내기는 아직 구현되지 않았습니다.".to_string()),
    };

    Ok(output_path)
}

async fn export_txt_single(request: &ExportRequest) -> Result<ExportResult, String> {
    let output_dir = get_output_dir(&request.options.output_dir)?;
    let filename = format!("{}.txt", sanitize_filename(&request.novel_title));
    let path = output_dir.join(&filename);

    let mut content = String::new();
    content.push_str(&format!("# {}\n", request.novel_title));
    content.push_str(&format!("# Novel ID: {}\n\n", request.novel_id));

    for chapter in &request.chapters {
        content.push_str(&format!("─────────────────────────────────────────\n"));
        content.push_str(&format!("제{}화: {}\n", chapter.number, chapter.title));
        content.push_str(&format!("─────────────────────────────────────────\n\n"));

        for para in &chapter.paragraphs {
            if request.options.include_original {
                content.push_str(&format!("[원문] {}\n", para.original));
            }
            if let Some(translated) = &para.translated {
                content.push_str(&format!("{}\n\n", translated));
            } else if !request.options.include_original {
                content.push_str(&format!("{}\n\n", para.original));
            }
        }
        content.push('\n');
    }

    let mut file = File::create(&path).map_err(|e| format!("파일 생성 실패: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("파일 쓰기 실패: {}", e))?;

    Ok(ExportResult {
        path: path.to_string_lossy().to_string(),
        file_count: 1,
    })
}

async fn export_txt_chapters(request: &ExportRequest) -> Result<ExportResult, String> {
    let output_dir = get_output_dir(&request.options.output_dir)?;
    let novel_dir = output_dir.join(sanitize_filename(&request.novel_title));
    
    fs::create_dir_all(&novel_dir).map_err(|e| format!("폴더 생성 실패: {}", e))?;

    let mut file_count = 0;

    for chapter in &request.chapters {
        let filename = format!("{:04}_{}.txt", chapter.number, sanitize_filename(&chapter.title));
        let path = novel_dir.join(&filename);

        let mut content = String::new();
        content.push_str(&format!("제{}화: {}\n\n", chapter.number, chapter.title));

        for para in &chapter.paragraphs {
            if request.options.include_original {
                content.push_str(&format!("[원문] {}\n", para.original));
            }
            if let Some(translated) = &para.translated {
                content.push_str(&format!("{}\n\n", translated));
            } else if !request.options.include_original {
                content.push_str(&format!("{}\n\n", para.original));
            }
        }

        let mut file = File::create(&path).map_err(|e| format!("파일 생성 실패: {}", e))?;
        file.write_all(content.as_bytes())
            .map_err(|e| format!("파일 쓰기 실패: {}", e))?;
        
        file_count += 1;
    }

    Ok(ExportResult {
        path: novel_dir.to_string_lossy().to_string(),
        file_count,
    })
}

fn get_output_dir(custom_dir: &Option<String>) -> Result<PathBuf, String> {
    let base_dir = custom_dir
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| dirs::download_dir().unwrap_or_else(|| PathBuf::from(".")));
    
    fs::create_dir_all(&base_dir).map_err(|e| format!("폴더 생성 실패: {}", e))?;
    
    Ok(base_dir)
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0' => '_',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveChapterRequest {
    pub title: String,
    pub subtitle: Option<String>,
    pub paragraphs: Vec<SaveParagraph>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveParagraph {
    pub original: String,
    pub translated: Option<String>,
}

#[tauri::command]
pub async fn save_chapter(request: SaveChapterRequest) -> Result<String, String> {
    let output_dir = dirs::download_dir().unwrap_or_else(|| PathBuf::from("."));
    fs::create_dir_all(&output_dir).map_err(|e| format!("폴더 생성 실패: {}", e))?;

    let title = if let Some(subtitle) = &request.subtitle {
        format!("{} - {}", request.title, subtitle)
    } else {
        request.title.clone()
    };
    
    let filename = format!("{}.txt", sanitize_filename(&title));
    let path = output_dir.join(&filename);

    let mut content = String::new();
    content.push_str(&format!("{}\n", request.title));
    if let Some(subtitle) = &request.subtitle {
        content.push_str(&format!("{}\n", subtitle));
    }
    content.push_str("\n");

    for para in &request.paragraphs {
        if let Some(translated) = &para.translated {
            content.push_str(&format!("{}\n\n", translated));
        }
    }

    let mut file = File::create(&path).map_err(|e| format!("파일 생성 실패: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("파일 쓰기 실패: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SaveFormat {
    #[serde(rename = "txt")]
    Txt,
    #[serde(rename = "html")]
    Html,
    #[serde(rename = "md")]
    Markdown,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveChapterWithDialogRequest {
    pub title: String,
    pub subtitle: Option<String>,
    pub paragraphs: Vec<SaveParagraph>,
    pub format: SaveFormat,
    pub include_original: bool,
}

#[tauri::command]
pub async fn save_chapter_with_dialog(
    app: AppHandle,
    request: SaveChapterWithDialogRequest,
) -> Result<String, String> {
    let title = if let Some(subtitle) = &request.subtitle {
        format!("{} - {}", request.title, subtitle)
    } else {
        request.title.clone()
    };

    let (extension, filter_name) = match request.format {
        SaveFormat::Txt => ("txt", "Text File"),
        SaveFormat::Html => ("html", "HTML File"),
        SaveFormat::Markdown => ("md", "Markdown File"),
    };

    let default_filename = format!("{}.{}", sanitize_filename(&title), extension);

    let file_path = app
        .dialog()
        .file()
        .set_file_name(&default_filename)
        .add_filter(filter_name, &[extension])
        .blocking_save_file();

    let path = match file_path {
        Some(p) => p.as_path()
            .ok_or_else(|| "경로 변환 실패".to_string())?
            .to_path_buf(),
        None => return Err("저장이 취소되었습니다.".to_string()),
    };

    let content = match request.format {
        SaveFormat::Txt => generate_txt_content(&request),
        SaveFormat::Html => generate_html_content(&request),
        SaveFormat::Markdown => generate_markdown_content(&request),
    };

    let mut file = File::create(&path).map_err(|e| format!("파일 생성 실패: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("파일 쓰기 실패: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

fn generate_txt_content(request: &SaveChapterWithDialogRequest) -> String {
    let mut content = String::new();
    content.push_str(&format!("{}\n", request.title));
    if let Some(subtitle) = &request.subtitle {
        content.push_str(&format!("{}\n", subtitle));
    }
    content.push_str("\n");

    for para in &request.paragraphs {
        if request.include_original {
            content.push_str(&format!("[원문] {}\n", para.original));
        }
        if let Some(translated) = &para.translated {
            content.push_str(&format!("{}\n\n", translated));
        } else if !request.include_original {
            content.push_str(&format!("{}\n\n", para.original));
        }
    }

    content
}

fn generate_html_content(request: &SaveChapterWithDialogRequest) -> String {
    let mut content = String::new();
    content.push_str("<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n");
    content.push_str("  <meta charset=\"UTF-8\">\n");
    content.push_str(&format!("  <title>{}</title>\n", html_escape(&request.title)));
    content.push_str("  <style>\n");
    content.push_str("    body { font-family: 'Noto Sans KR', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.8; }\n");
    content.push_str("    h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }\n");
    content.push_str("    h2 { color: #666; font-weight: normal; }\n");
    content.push_str("    .paragraph { margin-bottom: 1.5em; }\n");
    content.push_str("    .original { color: #888; font-size: 0.9em; margin-bottom: 0.5em; }\n");
    content.push_str("    .translated { color: #333; }\n");
    content.push_str("    ruby { ruby-position: over; }\n");
    content.push_str("    rt { font-size: 0.6em; color: #666; }\n");
    content.push_str("  </style>\n");
    content.push_str("</head>\n<body>\n");
    
    content.push_str(&format!("  <h1>{}</h1>\n", html_escape(&request.title)));
    if let Some(subtitle) = &request.subtitle {
        content.push_str(&format!("  <h2>{}</h2>\n", html_escape(subtitle)));
    }
    content.push_str("  <article>\n");

    for para in &request.paragraphs {
        content.push_str("    <div class=\"paragraph\">\n");
        if request.include_original {
            content.push_str(&format!("      <p class=\"original\">{}</p>\n", html_escape(&para.original)));
        }
        if let Some(translated) = &para.translated {
            let ruby_converted = convert_ruby_to_html(translated);
            content.push_str(&format!("      <p class=\"translated\">{}</p>\n", ruby_converted));
        } else if !request.include_original {
            content.push_str(&format!("      <p class=\"translated\">{}</p>\n", html_escape(&para.original)));
        }
        content.push_str("    </div>\n");
    }

    content.push_str("  </article>\n</body>\n</html>");
    content
}

fn generate_markdown_content(request: &SaveChapterWithDialogRequest) -> String {
    let mut content = String::new();
    content.push_str(&format!("# {}\n\n", request.title));
    if let Some(subtitle) = &request.subtitle {
        content.push_str(&format!("## {}\n\n", subtitle));
    }
    content.push_str("---\n\n");

    for para in &request.paragraphs {
        if request.include_original {
            content.push_str(&format!("> {}\n\n", para.original));
        }
        if let Some(translated) = &para.translated {
            content.push_str(&format!("{}\n\n", translated));
        } else if !request.include_original {
            content.push_str(&format!("{}\n\n", para.original));
        }
    }

    content
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// Converts 漢字(읽는법) format to HTML ruby tags: <ruby>漢字<rt>읽는법</rt></ruby>
fn convert_ruby_to_html(text: &str) -> String {
    let ruby_pattern = regex::Regex::new(r"([一-龯々]+)\(([^)]+)\)").unwrap();
    let result = ruby_pattern.replace_all(text, "<ruby>$1<rt>$2</rt></ruby>");
    html_escape(&result)
        .replace("&lt;ruby&gt;", "<ruby>")
        .replace("&lt;/ruby&gt;", "</ruby>")
        .replace("&lt;rt&gt;", "<rt>")
        .replace("&lt;/rt&gt;", "</rt>")
}
