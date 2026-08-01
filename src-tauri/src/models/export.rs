use serde::{Deserialize, Serialize};

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
