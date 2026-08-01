use std::fs::{self, File, OpenOptions};
use std::io::{Seek, Write};
use std::path::{Path, PathBuf};

use chrono::Utc;
use regex::Regex;
use uuid::Uuid;
use zip::write::{SimpleFileOptions, ZipWriter};
use zip::CompressionMethod;

use crate::models::export::ExportRequest;

pub(crate) fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// Converts 漢字(읽는법) format to HTML ruby tags: <ruby>漢字<rt>읽는법</rt></ruby>
pub(crate) fn convert_ruby_to_html(text: &str) -> String {
    let ruby_pattern = Regex::new(r"([一-龯々]+)\(([^)]+)\)").unwrap();
    let result = ruby_pattern.replace_all(text, "<ruby>$1<rt>$2</rt></ruby>");
    html_escape(&result)
        .replace("&lt;ruby&gt;", "<ruby>")
        .replace("&lt;/ruby&gt;", "</ruby>")
        .replace("&lt;rt&gt;", "<rt>")
        .replace("&lt;/rt&gt;", "</rt>")
}

fn convert_ruby_to_xhtml(text: &str) -> String {
    let ruby_pattern = Regex::new(r"([一-龯々]+)\(([^)]+)\)").unwrap();
    let mut result = String::new();
    let mut previous_end = 0;

    for captures in ruby_pattern.captures_iter(text) {
        let matched = captures
            .get(0)
            .expect("ruby match should include its full text");
        result.push_str(&html_escape(&text[previous_end..matched.start()]));
        result.push_str("<ruby>");
        result.push_str(&html_escape(
            captures.get(1).expect("ruby base is captured").as_str(),
        ));
        result.push_str("<rt>");
        result.push_str(&html_escape(
            captures.get(2).expect("ruby reading is captured").as_str(),
        ));
        result.push_str("</rt></ruby>");
        previous_end = matched.end();
    }

    result.push_str(&html_escape(&text[previous_end..]));
    result
}

pub fn export_epub(path: &Path, request: &ExportRequest) -> Result<(), String> {
    validate_epub_request(request)?;
    let (temp_path, temp_file) = create_temp_file(path)?;

    let result = (|| {
        let mut temp_file = temp_file;
        write_epub(&mut temp_file, request)?;
        temp_file
            .sync_all()
            .map_err(|error| format!("EPUB 임시 파일 동기화 실패: {}", error))?;
        drop(temp_file);
        fs::rename(&temp_path, path).map_err(|error| format!("EPUB 파일 게시 실패: {}", error))?;
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

pub fn write_epub<W: Write + Seek>(writer: &mut W, request: &ExportRequest) -> Result<(), String> {
    validate_epub_request(request)?;
    let mut archive = ZipWriter::new(writer);

    write_entry(
        &mut archive,
        "mimetype",
        "application/epub+zip",
        CompressionMethod::Stored,
    )?;
    write_entry(
        &mut archive,
        "META-INF/container.xml",
        &container_xml(),
        CompressionMethod::Deflated,
    )?;
    write_entry(
        &mut archive,
        "EPUB/package.opf",
        &package_opf(request),
        CompressionMethod::Deflated,
    )?;
    write_entry(
        &mut archive,
        "EPUB/nav.xhtml",
        &navigation_xhtml(request),
        CompressionMethod::Deflated,
    )?;
    write_entry(
        &mut archive,
        "EPUB/styles.css",
        STYLES_CSS,
        CompressionMethod::Deflated,
    )?;

    for (index, chapter) in request.chapters.iter().enumerate() {
        let chapter_path = format!("EPUB/chapter-{}.xhtml", index);
        write_entry(
            &mut archive,
            &chapter_path,
            &chapter_xhtml(request, chapter),
            CompressionMethod::Deflated,
        )?;
    }

    archive
        .finish()
        .map_err(|error| format!("EPUB 압축 파일 마무리 실패: {}", error))?;
    Ok(())
}

fn create_temp_file(path: &Path) -> Result<(PathBuf, File), String> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    loop {
        let temp_path = parent.join(format!(".transnovel-{}.epub.tmp", Uuid::new_v4()));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
        {
            Ok(file) => return Ok((temp_path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("EPUB 임시 파일 생성 실패: {}", error)),
        }
    }
}

fn validate_epub_request(request: &ExportRequest) -> Result<(), String> {
    if request.chapters.is_empty() {
        return Err("EPUB에는 최소 한 개의 챕터가 필요합니다.".to_string());
    }

    validate_xml_text(&request.novel_id)?;
    validate_xml_text(&request.novel_title)?;
    for chapter in &request.chapters {
        validate_xml_text(&chapter.title)?;
        for paragraph in &chapter.paragraphs {
            validate_xml_text(&paragraph.original)?;
            if let Some(translated) = &paragraph.translated {
                validate_xml_text(translated)?;
            }
        }
    }
    Ok(())
}

fn validate_xml_text(text: &str) -> Result<(), String> {
    if text.chars().all(|character| {
        matches!(
            character,
            '\u{9}'
                | '\u{A}'
                | '\u{D}'
                | '\u{20}'..='\u{D7FF}'
                | '\u{E000}'..='\u{FFFD}'
                | '\u{10000}'..='\u{10FFFF}'
        )
    }) {
        Ok(())
    } else {
        Err("EPUB 입력값에 XML 1.0에서 허용되지 않는 문자가 포함되어 있습니다.".to_string())
    }
}

fn write_entry<W: Write + Seek>(
    archive: &mut ZipWriter<W>,
    name: &str,
    content: &str,
    compression: CompressionMethod,
) -> Result<(), String> {
    let options = SimpleFileOptions::default().compression_method(compression);
    archive
        .start_file(name, options)
        .map_err(|error| format!("EPUB 항목 생성 실패: {}", error))?;
    archive
        .write_all(content.as_bytes())
        .map_err(|error| format!("EPUB 항목 쓰기 실패: {}", error))
}

fn container_xml() -> String {
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
<container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\">\n\
  <rootfiles>\n\
    <rootfile full-path=\"EPUB/package.opf\" media-type=\"application/oebps-package+xml\"/>\n\
  </rootfiles>\n\
</container>\n"
        .to_string()
}

fn package_opf(request: &ExportRequest) -> String {
    let mut opf = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
<package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"pub-id\" xml:lang=\"ko\">\n\
  <metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dcterms=\"http://purl.org/dc/terms/\">\n",
    );
    opf.push_str(&format!(
        "    <dc:identifier id=\"pub-id\">{}</dc:identifier>\n",
        html_escape(&request.novel_id)
    ));
    opf.push_str(&format!(
        "    <dc:title>{}</dc:title>\n",
        html_escape(&request.novel_title)
    ));
    opf.push_str("    <dc:language>ko</dc:language>\n");
    opf.push_str(&format!(
        "    <meta property=\"dcterms:modified\">{}</meta>\n",
        Utc::now().format("%Y-%m-%dT%H:%M:%SZ")
    ));
    opf.push_str("  </metadata>\n  <manifest>\n");
    opf.push_str(
        "    <item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>\n\
    <item id=\"style\" href=\"styles.css\" media-type=\"text/css\"/>\n",
    );
    for index in 0..request.chapters.len() {
        opf.push_str(&format!(
            "    <item id=\"chapter-{0}\" href=\"chapter-{0}.xhtml\" media-type=\"application/xhtml+xml\"/>\n",
            index
        ));
    }
    opf.push_str("  </manifest>\n  <spine>\n");
    for index in 0..request.chapters.len() {
        opf.push_str(&format!("    <itemref idref=\"chapter-{}\"/>\n", index));
    }
    opf.push_str("  </spine>\n</package>\n");
    opf
}

fn navigation_xhtml(request: &ExportRequest) -> String {
    let mut nav = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
<!DOCTYPE html>\n\
<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\" lang=\"ko\" xml:lang=\"ko\">\n\
  <head><meta charset=\"UTF-8\"/><title>{}</title></head>\n\
  <body>\n\
    <nav epub:type=\"toc\" id=\"toc\">\n\
      <h1>{}</h1>\n\
      <ol>\n",
        html_escape(&request.novel_title),
        html_escape(&request.novel_title)
    );
    for (index, chapter) in request.chapters.iter().enumerate() {
        nav.push_str(&format!(
            "        <li><a href=\"chapter-{}.xhtml\">{}</a></li>\n",
            index,
            html_escape(&chapter.title)
        ));
    }
    nav.push_str("      </ol>\n    </nav>\n  </body>\n</html>\n");
    nav
}

fn chapter_xhtml(
    request: &ExportRequest,
    chapter: &crate::models::export::ExportChapter,
) -> String {
    let mut chapter_xhtml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
<!DOCTYPE html>\n\
<html xmlns=\"http://www.w3.org/1999/xhtml\" lang=\"ko\" xml:lang=\"ko\">\n\
  <head>\n\
    <meta charset=\"UTF-8\"/>\n\
    <title>{}</title>\n\
    <link rel=\"stylesheet\" type=\"text/css\" href=\"styles.css\"/>\n\
  </head>\n\
  <body>\n\
    <h1>{}</h1>\n\
    <article>\n",
        html_escape(&chapter.title),
        html_escape(&chapter.title)
    );

    for paragraph in &chapter.paragraphs {
        chapter_xhtml.push_str("      <div class=\"paragraph\">\n");
        if request.options.include_original {
            chapter_xhtml.push_str(&format!(
                "        <p class=\"original\">{}</p>\n",
                html_escape(&paragraph.original)
            ));
        }
        if let Some(translated) = &paragraph.translated {
            chapter_xhtml.push_str(&format!(
                "        <p class=\"translated\">{}</p>\n",
                convert_ruby_to_xhtml(translated)
            ));
        } else if !request.options.include_original {
            chapter_xhtml.push_str(&format!(
                "        <p class=\"translated\">{}</p>\n",
                html_escape(&paragraph.original)
            ));
        }
        chapter_xhtml.push_str("      </div>\n");
    }
    chapter_xhtml.push_str("    </article>\n  </body>\n</html>\n");
    chapter_xhtml
}

const STYLES_CSS: &str = "\
body { font-family: sans-serif; max-width: 48rem; margin: 0 auto; padding: 1rem; line-height: 1.8; }\n\
h1 { border-bottom: 2px solid #333; padding-bottom: 0.5rem; }\n\
.paragraph { margin-bottom: 1.5em; }\n\
.original { color: #888; font-size: 0.9em; margin-bottom: 0.5em; }\n\
.translated { color: #333; }\n\
ruby { ruby-position: over; }\n\
rt { font-size: 0.6em; color: #666; }\n";

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::{Cursor, Read, Seek};

    use regex::Regex;
    use uuid::Uuid;
    use zip::{CompressionMethod, ZipArchive};

    use crate::models::export::{
        ExportChapter, ExportFormat, ExportOptions, ExportParagraph, ExportRequest,
    };

    use super::{export_epub, write_epub};

    fn request(include_original: bool) -> ExportRequest {
        ExportRequest {
            novel_id: "novel<&\"-42".to_string(),
            novel_title: "A & <Novel>\"".to_string(),
            chapters: vec![
                ExportChapter {
                    number: 20,
                    title: "Second & <Chapter>".to_string(),
                    paragraphs: vec![
                        ExportParagraph {
                            original: "原文 <one> & \"quoted\"".to_string(),
                            translated: Some("漢字(かんじ) & <translated>".to_string()),
                        },
                        ExportParagraph {
                            original: "fallback original".to_string(),
                            translated: None,
                        },
                    ],
                },
                ExportChapter {
                    number: 20,
                    title: "First <Chapter>".to_string(),
                    paragraphs: vec![ExportParagraph {
                        original: "only original".to_string(),
                        translated: None,
                    }],
                },
            ],
            options: ExportOptions {
                format: ExportFormat::Epub,
                include_original,
                include_notes: false,
                output_dir: None,
            },
        }
    }

    fn archive(request: &ExportRequest) -> ZipArchive<Cursor<Vec<u8>>> {
        let mut bytes = Cursor::new(Vec::new());
        write_epub(&mut bytes, request).expect("EPUB writer should succeed");
        ZipArchive::new(bytes).expect("generated EPUB should be a ZIP archive")
    }

    fn entry_text<R: Read + Seek>(archive: &mut ZipArchive<R>, name: &str) -> String {
        let mut file = archive
            .by_name(name)
            .expect("required EPUB entry is missing");
        let mut text = String::new();
        file.read_to_string(&mut text)
            .expect("EPUB entry should be valid UTF-8");
        text
    }

    #[test]
    fn writes_mimetype_first_and_stored_exactly() {
        let mut archive = archive(&request(false));
        let mut first = archive.by_index(0).expect("mimetype entry is missing");

        assert_eq!(first.name(), "mimetype");
        assert_eq!(first.compression(), CompressionMethod::Stored);
        assert_eq!(first.size(), 20);
        let mut content = Vec::new();
        first
            .read_to_end(&mut content)
            .expect("mimetype should be readable");
        assert_eq!(content, b"application/epub+zip");
    }

    #[test]
    fn writes_required_entries_metadata_and_stylesheet() {
        let mut archive = archive(&request(false));
        let names: Vec<String> = archive.file_names().map(str::to_owned).collect();

        assert_eq!(
            names,
            vec![
                "mimetype",
                "META-INF/container.xml",
                "EPUB/package.opf",
                "EPUB/nav.xhtml",
                "EPUB/styles.css",
                "EPUB/chapter-0.xhtml",
                "EPUB/chapter-1.xhtml",
            ]
        );

        let container = entry_text(&mut archive, "META-INF/container.xml");
        assert!(container.contains("full-path=\"EPUB/package.opf\""));

        let opf = entry_text(&mut archive, "EPUB/package.opf");
        assert!(opf.contains("<dc:title>A &amp; &lt;Novel&gt;&quot;</dc:title>"));
        assert!(
            opf.contains("<dc:identifier id=\"pub-id\">novel&lt;&amp;&quot;-42</dc:identifier>")
        );
        assert!(opf.contains("unique-identifier=\"pub-id\""));
        assert!(opf.contains("<dc:language>ko</dc:language>"));
        assert!(opf.contains("property=\"dcterms:modified\">20"));
        let modified = Regex::new(
            r#"<meta property="dcterms:modified">\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z</meta>"#,
        )
        .unwrap();
        assert!(modified.is_match(&opf));
        for index in 0..2 {
            assert!(opf.contains(&format!(
                "<item id=\"chapter-{index}\" href=\"chapter-{index}.xhtml\" media-type=\"application/xhtml+xml\"/>"
            )));
            assert!(opf.contains(&format!("<itemref idref=\"chapter-{index}\"/>")));
        }
        assert!(opf.contains("<item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>"));
        assert!(opf.contains("<item id=\"style\" href=\"styles.css\" media-type=\"text/css\"/>"));
        assert!(opf.contains("<itemref idref=\"chapter-0\"/>"));
        assert!(opf.contains("<itemref idref=\"chapter-1\"/>"));

        assert!(!entry_text(&mut archive, "EPUB/styles.css").is_empty());
    }

    #[test]
    fn preserves_request_order_and_index_based_chapter_links() {
        let mut archive = archive(&request(false));
        let nav = entry_text(&mut archive, "EPUB/nav.xhtml");
        let first_link = nav.find("href=\"chapter-0.xhtml\"").unwrap();
        let second_link = nav.find("href=\"chapter-1.xhtml\"").unwrap();
        assert!(first_link < second_link);
        assert!(nav.contains(">Second &amp; &lt;Chapter&gt;</a>"));
        assert!(nav.contains(">First &lt;Chapter&gt;</a>"));

        let opf = entry_text(&mut archive, "EPUB/package.opf");
        assert!(
            opf.find("idref=\"chapter-0\"").unwrap() < opf.find("idref=\"chapter-1\"").unwrap()
        );

        let chapter0 = entry_text(&mut archive, "EPUB/chapter-0.xhtml");
        let chapter1 = entry_text(&mut archive, "EPUB/chapter-1.xhtml");
        assert!(chapter0.contains("<h1>Second &amp; &lt;Chapter&gt;</h1>"));
        assert!(chapter0.contains("fallback original"));
        assert!(!chapter0.contains("only original"));
        assert!(chapter1.contains("only original"));
        assert!(!chapter1.contains("fallback original"));
        assert!(chapter1.contains("<h1>First &lt;Chapter&gt;</h1>"));
    }

    #[test]
    fn applies_translated_original_fallback_and_ruby_xhtml() {
        let mut translated_archive = archive(&request(false));
        let translated = entry_text(&mut translated_archive, "EPUB/chapter-0.xhtml");
        assert!(!translated.contains("class=\"original\""));
        assert!(translated.contains(
            "<p class=\"translated\"><ruby>漢字<rt>かんじ</rt></ruby> &amp; &lt;translated&gt;</p>"
        ));
        assert!(translated.contains("<p class=\"translated\">fallback original</p>"));

        let mut original_archive = archive(&request(true));
        let original = entry_text(&mut original_archive, "EPUB/chapter-0.xhtml");
        assert!(original
            .contains("<p class=\"original\">原文 &lt;one&gt; &amp; &quot;quoted&quot;</p>"));
        assert!(original.contains(
            "<p class=\"translated\"><ruby>漢字<rt>かんじ</rt></ruby> &amp; &lt;translated&gt;</p>"
        ));
        assert!(!original.contains("<p class=\"translated\">fallback original</p>"));
    }

    #[test]
    fn escapes_all_user_text_in_navigation_and_xhtml() {
        let mut archive = archive(&request(true));
        let nav = entry_text(&mut archive, "EPUB/nav.xhtml");
        let chapter = entry_text(&mut archive, "EPUB/chapter-0.xhtml");

        assert!(!nav.contains("<Chapter>"));
        assert!(!chapter.contains("<one>"));
        assert!(!chapter.contains("<translated>"));
        assert!(!chapter.contains("<Novel>"));
    }
    fn assert_rejected(request: ExportRequest) {
        let mut bytes = Cursor::new(Vec::new());
        let error = write_epub(&mut bytes, &request).expect_err("invalid EPUB input should fail");
        assert!(error
            .chars()
            .any(|character| ('가'..='힣').contains(&character)));
    }

    #[test]
    fn rejects_xml_1_forbidden_control_characters_in_all_user_fields() {
        let mut novel_id = request(false);
        novel_id.novel_id.push('\u{1}');
        assert_rejected(novel_id);

        let mut novel_title = request(false);
        novel_title.novel_title.push('\u{1}');
        assert_rejected(novel_title);

        let mut chapter_title = request(false);
        chapter_title.chapters[0].title.push('\u{1}');
        assert_rejected(chapter_title);

        let mut original = request(false);
        original.chapters[0].paragraphs[0].original.push('\u{1}');
        assert_rejected(original);

        let mut translation = request(false);
        translation.chapters[0].paragraphs[0].translated = Some("bad\u{1}".to_string());
        assert_rejected(translation);
    }

    #[test]
    fn rejects_empty_chapter_lists() {
        let mut request = request(false);
        request.chapters.clear();
        assert_rejected(request);
    }

    #[test]
    fn failed_epub_export_preserves_existing_destination() {
        let output_dir =
            std::env::temp_dir().join(format!("transnovel-epub-atomic-{}", Uuid::new_v4()));
        fs::create_dir_all(&output_dir).expect("test output directory should be created");
        let destination = output_dir.join("book.epub");
        fs::write(&destination, b"existing destination")
            .expect("test destination should be created");

        let mut request = request(false);
        request.novel_id.push('\u{1}');
        let error =
            export_epub(&destination, &request).expect_err("invalid EPUB input should not publish");
        assert!(error
            .chars()
            .any(|character| ('가'..='힣').contains(&character)));
        assert_eq!(
            fs::read(&destination).expect("existing destination should remain readable"),
            b"existing destination"
        );

        let entries: Vec<_> = fs::read_dir(&output_dir)
            .expect("test output directory should be readable")
            .map(|entry| {
                entry
                    .expect("test directory entry should be readable")
                    .file_name()
            })
            .collect();
        assert_eq!(entries, vec![std::ffi::OsString::from("book.epub")]);
        fs::remove_dir_all(output_dir).expect("test output directory should be removed");
    }
    #[test]
    fn exports_long_destination_basename_and_cleans_temp_files() {
        let output_dir =
            std::env::temp_dir().join(format!("transnovel-epub-long-name-{}", Uuid::new_v4()));
        fs::create_dir_all(&output_dir).expect("test output directory should be created");
        let basename = format!("{}.epub", "a".repeat(220));
        let destination = output_dir.join(&basename);

        export_epub(&destination, &request(false)).expect("long EPUB destination should succeed");
        assert!(destination.is_file());

        let entries: Vec<_> = fs::read_dir(&output_dir)
            .expect("test output directory should be readable")
            .map(|entry| {
                entry
                    .expect("test directory entry should be readable")
                    .file_name()
            })
            .collect();
        assert_eq!(entries, vec![std::ffi::OsString::from(basename)]);
        fs::remove_dir_all(output_dir).expect("test output directory should be removed");
    }
}
