use regex::Regex;

pub struct SubstitutionRule {
    pub pattern: Regex,
    pub replacement: String,
}

impl SubstitutionRule {
    pub fn new(pattern: &str, replacement: &str) -> Result<Self, String> {
        let regex = Regex::new(pattern).map_err(|e| format!("Invalid regex '{}': {}", pattern, e))?;
        Ok(Self {
            pattern: regex,
            replacement: replacement.to_string(),
        })
    }

    pub fn apply(&self, text: &str) -> String {
        self.pattern.replace_all(text, &self.replacement).to_string()
    }
}

pub struct SubstitutionService {
    rules: Vec<SubstitutionRule>,
}

impl SubstitutionService {
    pub fn new() -> Self {
        Self { rules: Vec::new() }
    }

    pub fn from_config(config: &str) -> Self {
        let rules = config
            .lines()
            .filter(|line| !line.trim().is_empty() && !line.trim().starts_with('#'))
            .filter_map(|line| {
                let parts: Vec<&str> = line.splitn(2, '/').collect();
                if parts.len() == 2 {
                    SubstitutionRule::new(parts[0], parts[1]).ok()
                } else {
                    None
                }
            })
            .collect();

        Self { rules }
    }

    pub fn apply(&self, text: &str) -> String {
        let mut result = text.to_string();
        for rule in &self.rules {
            result = rule.apply(&result);
        }
        result
    }

    pub fn apply_to_paragraphs(&self, paragraphs: &[String]) -> Vec<String> {
        paragraphs.iter().map(|p| self.apply(p)).collect()
    }
}

impl Default for SubstitutionService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_substitution() {
        let service = SubstitutionService::from_config("상하이/상해\n巖/岩");
        assert_eq!(service.apply("상하이에 갔다"), "상해에 갔다");
        assert_eq!(service.apply("巖石"), "岩石");
    }

    #[test]
    fn test_regex_substitution() {
        let service = SubstitutionService::from_config("(철수)([은는이가을를])/영희$2");
        assert_eq!(service.apply("철수는 간다"), "영희는 간다");
        assert_eq!(service.apply("철수가 온다"), "영희가 온다");
    }

    #[test]
    fn test_empty_config() {
        let service = SubstitutionService::from_config("");
        assert_eq!(service.apply("테스트"), "테스트");
    }

    #[test]
    fn test_comment_lines() {
        let service = SubstitutionService::from_config("# 이것은 주석\n테스트/치환");
        assert_eq!(service.apply("테스트입니다"), "치환입니다");
    }
}
