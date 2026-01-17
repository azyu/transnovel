import { useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../common/Button';
import { useAppStore } from '../../stores/appStore';

const DEFAULT_SYSTEM_PROMPT = `<|im_start|>system
[공리]
입력: 원문 섹션이 주어짐. 번역 섹션이 함께 주어질 수도 있으며, 기존 번역문이므로 그 다음 줄부터 마저 번역.
출력: 다른 어떠한 응답도 없이 한국어 번역 결과만을 즉시 제공. HTML 구조를 훼손하거나 삭제하지 않고 그대로 유지.
반드시 </main>으로 종료.
섹션: <main id="섹션유형">...</main> 형식.
원문 섹션: 각 줄은 <p id="ID">원문</p> 형식. 번역 시 <p id="ID"> 부분은 반드시 그대로 유지.
번역 섹션: 각 줄은 <p id="ID">번역</p> 형식. 동일한 ID의 원문에 정확히 일대일대응하도록 번역 작성.
문장이 여러 줄에 걸쳐 있는 경우 절대로 문장을 임의로 합치지 않고 엄격하게 각 줄을 독립적으로 번역.

[지침]
직역투를 피하며 최대한 자연스럽게 의역하되, 원문의 말투와 내용은 철저히 유지.
원문의 사실 관계를 왜곡하거나 고유명사의 과한 현지화 금지.
일본어 고유명사는 국립국어원 표기법을 무시하고 해당 장르 및 작품에서 대중에게 친숙한 서브컬처 통용 표기를 최우선하되, 통용 표기가 불확실하다면 실제 일본어 발음에 가깝게 표기.

{{note}}<|im_end|>
<|im_start|>user
<main id="원문">
{{slot}}
</main>
<main id="번역">
<|im_end|>`;

export const TranslationSettings = forwardRef((_, ref) => {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [translationNote, setTranslationNote] = useState('');
  const [substitutions, setSubstitutions] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const isDark = useAppStore((state) => state.theme) === 'dark';

  useImperativeHandle(ref, () => ({
    save: handleSave
  }));

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await invoke<{ key: string; value: string }[]>('get_settings');
        const promptSetting = settings.find(s => s.key === 'system_prompt');
        const noteSetting = settings.find(s => s.key === 'translation_note');
        const subSetting = settings.find(s => s.key === 'substitutions');
        
        if (promptSetting) setSystemPrompt(promptSetting.value);
        if (noteSetting) setTranslationNote(noteSetting.value);
        if (subSetting) setSubstitutions(subSetting.value);
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      await Promise.all([
        invoke('set_setting', { key: 'system_prompt', value: systemPrompt }),
        invoke('set_setting', { key: 'translation_note', value: translationNote }),
        invoke('set_setting', { key: 'substitutions', value: substitutions }),
      ]);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const handleResetPrompt = () => {
    if (confirm('기본 시스템 프롬프트로 초기화하시겠습니까?')) {
      setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    }
  };

  const toggleSection = (section: string) => {
    setActiveSection(activeSection === section ? null : section);
  };

  const textareaClass = `w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-y font-mono border ${
    isDark 
      ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' 
      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
  }`;

  return (
    <div className="space-y-6">
      <div className={`border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>번역 설정</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>프롬프트와 치환 규칙을 설정합니다.</p>
      </div>

      <div className={`p-6 rounded-xl border space-y-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <details open={activeSection === 'system'} onToggle={() => toggleSection('system')}>
          <summary className={`text-lg font-medium cursor-pointer hover:text-blue-400 transition-colors ${isDark ? 'text-white' : 'text-slate-900'}`}>
            시스템 프롬프트
          </summary>
          <div className="mt-4 space-y-3">
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={10}
              className={textareaClass}
              placeholder={DEFAULT_SYSTEM_PROMPT}
            />
            <div className="flex justify-between items-center">
              <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <code className="text-blue-400">{`{{note}}`}</code> 번역 노트 삽입 위치, 
                <code className="text-blue-400 ml-2">{`{{slot}}`}</code> 원문 삽입 위치
              </p>
              <Button variant="secondary" size="sm" onClick={handleResetPrompt}>
                기본값 복원
              </Button>
            </div>
          </div>
        </details>

        <div className={`border-t pt-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>번역 노트</label>
          <textarea
            value={translationNote}
            onChange={(e) => setTranslationNote(e.target.value)}
            rows={4}
            className={textareaClass}
            placeholder={`프롬프트에서 {{note}}에 삽입할 내용. 추가 지시 및 용어집을 작성
예시:
독백은 반말로 번역.
古明地こいし=코메이지 코이시
ナルト=나루토`}
          />
          <p className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            추가 지시사항 및 고유명사 번역 규칙을 작성합니다.
          </p>
        </div>

        <div className={`border-t pt-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>치환 규칙</label>
          <textarea
            value={substitutions}
            onChange={(e) => setSubstitutions(e.target.value)}
            rows={6}
            className={textareaClass}
            placeholder={`단어 치환 규칙 목록. A/B 형식으로 작성 시 번역 전/후에 A를 B로 자동 치환
정규식 지원 ($1, $2 등 그룹 참조 가능)

예시:
상하이/상해
巖/岩
克莱恩/克莱恩(클레인)
(철수)([은는이가을를])/영희$2`}
          />
          <p className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            줄 단위로 <code className="text-blue-400">원본/치환</code> 형식. 정규식 사용 가능.
          </p>
        </div>
      </div>
    </div>
  );
});

TranslationSettings.displayName = 'TranslationSettings';
