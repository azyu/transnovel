/// Buffers raw SSE response bytes until complete line boundaries (`\r\n`, `\n`, or `\r`)
/// before decoding UTF-8 so multi-byte characters and `\r\n` sequences split across
/// HTTP chunk boundaries are never corrupted.
#[derive(Debug, Default)]
pub struct SseLineBuffer {
    buffer: Vec<u8>,
    started: bool,
}

impl SseLineBuffer {
    pub fn push_chunk(&mut self, chunk: &[u8]) -> Vec<String> {
        let prev_len = self.buffer.len();
        self.buffer.extend_from_slice(chunk);

        let mut lines = Vec::new();
        let mut start = 0;
        let mut scan = prev_len.saturating_sub(1);

        while scan < self.buffer.len() {
            let Some(rel_pos) = self.buffer[scan..]
                .iter()
                .position(|&b| b == b'\n' || b == b'\r')
            else {
                break;
            };

            let idx = scan + rel_pos;
            if self.buffer[idx] == b'\n' {
                lines.push(decode_line(&self.buffer[start..idx], &mut self.started));
                start = idx + 1;
                scan = start;
            } else if idx + 1 < self.buffer.len() {
                lines.push(decode_line(&self.buffer[start..idx], &mut self.started));
                start = if self.buffer[idx + 1] == b'\n' {
                    idx + 2
                } else {
                    idx + 1
                };
                scan = start;
            } else {
                // Trailing `\r` at the end of the chunk; wait for the next byte
                // to distinguish `\r\n` from a bare `\r` line ending.
                break;
            }
        }

        if start > 0 {
            self.buffer.drain(..start);
        }

        lines
    }

    pub fn finish(&mut self) -> Option<String> {
        if self.buffer.is_empty() {
            return None;
        }

        let mut bytes = std::mem::take(&mut self.buffer);
        if bytes.last() == Some(&b'\r') {
            bytes.pop();
        }
        Some(decode_line(&bytes, &mut self.started))
    }
}

fn decode_line(bytes: &[u8], started: &mut bool) -> String {
    let bytes = if !*started {
        *started = true;
        bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes)
    } else {
        bytes
    };
    String::from_utf8_lossy(bytes).into_owned()
}

/// Extracts the payload from an SSE `data:` field line, stripping at most one
/// optional leading space after the colon per the SSE specification.
pub fn parse_sse_data_line(line: &str) -> Option<&str> {
    let data = line.strip_prefix("data:")?;
    Some(data.strip_prefix(' ').unwrap_or(data))
}

#[cfg(test)]
mod tests {
    use super::{parse_sse_data_line, SseLineBuffer};

    #[test]
    fn decodes_multibyte_utf8_split_across_chunks() {
        let mut buffer = SseLineBuffer::default();
        // '한' = [0xED, 0x95, 0x9C], '😀' = [0xF0, 0x9F, 0x98, 0x80]
        assert!(buffer.push_chunk(b"data: \xed").is_empty());
        assert!(buffer.push_chunk(b"\x95").is_empty());
        assert!(buffer.push_chunk(b"\x9c \xf0\x9f").is_empty());
        let lines = buffer.push_chunk(b"\x98\x80\r\n");

        assert_eq!(lines, vec!["data: 한 😀"]);
        assert_eq!(buffer.finish(), None);
    }

    #[test]
    fn preserves_crlf_and_double_crlf_split_across_chunks() {
        let payload = b"data: one\r\n\r\ndata: two\r\n\r\n";

        for split_at in 1..payload.len() {
            let mut buffer = SseLineBuffer::default();
            let mut lines = buffer.push_chunk(&payload[..split_at]);
            lines.extend(buffer.push_chunk(&payload[split_at..]));
            if let Some(tail) = buffer.finish() {
                lines.push(tail);
            }
            assert_eq!(
                lines,
                vec!["data: one", "", "data: two", ""],
                "failed for split at byte {split_at}"
            );
        }
    }

    #[test]
    fn handles_one_byte_chunks_with_mixed_line_endings_and_bom() {
        let payload = "\u{FEFF}data: 한국어\r\n\r\ndata: 日本語\ndata: 끝\r".as_bytes();
        let mut buffer = SseLineBuffer::default();
        let mut lines = Vec::new();
        for byte in payload {
            lines.extend(buffer.push_chunk(&[*byte]));
        }
        if let Some(tail) = buffer.finish() {
            lines.push(tail);
        }

        assert_eq!(lines, vec!["data: 한국어", "", "data: 日本語", "data: 끝"]);
    }

    #[test]
    fn flushes_unterminated_final_line_on_finish() {
        let mut buffer = SseLineBuffer::default();
        assert!(buffer.push_chunk(b"data: \xed\x95").is_empty());
        assert!(buffer.push_chunk(b"\x9c").is_empty());
        assert_eq!(buffer.finish(), Some("data: 한".to_string()));
        assert_eq!(buffer.finish(), None);
    }

    #[test]
    fn parses_sse_data_line_with_optional_single_space() {
        assert_eq!(parse_sse_data_line("data: {\"a\":1}"), Some("{\"a\":1}"));
        assert_eq!(parse_sse_data_line("data:{\"a\":1}"), Some("{\"a\":1}"));
        assert_eq!(parse_sse_data_line("data:  padded"), Some(" padded"));
        assert_eq!(parse_sse_data_line("event: message"), None);
        assert_eq!(parse_sse_data_line(": keepalive"), None);
    }
}
