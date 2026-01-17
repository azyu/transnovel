import React from 'react';
import type { Paragraph } from '../../types';
import { useViewSettings } from '../../hooks/useViewSettings';
import { useAppStore } from '../../stores/appStore';

interface ParagraphListProps {
  paragraphs: Paragraph[];
}

export const ParagraphList: React.FC<ParagraphListProps> = ({ paragraphs }) => {
  const { config, getStyles } = useViewSettings();
  const styles = getStyles();
  const isDark = useAppStore((state) => state.theme) === 'dark';

  const isStacked = config.displayLayout === 'stacked';

  return (
    <div 
      className="rounded-lg"
      style={{
        fontFamily: styles.container.fontFamily,
        fontSize: styles.container.fontSize,
        fontWeight: styles.container.fontWeight,
        lineHeight: styles.container.lineHeight,
      }}
    >
      {paragraphs.map((p) => (
        <div 
          key={p.id} 
          className={`group p-4 rounded-lg transition-colors border border-transparent ${isDark ? 'hover:bg-slate-800/50 hover:border-slate-700/50' : 'hover:bg-slate-100/50 hover:border-slate-200'}`}
          style={{ marginBottom: styles.paragraph.marginBottom }}
        >
          {isStacked ? (
            <div className="space-y-2">
              {config.showOriginal && (
                <div className="relative">
                  <div className="absolute -left-3 top-0 text-[10px] font-mono text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    {p.id}
                  </div>
                  <div 
                    className="leading-relaxed break-words whitespace-pre-wrap font-jp"
                    style={{
                      opacity: styles.original.opacity,
                      textIndent: styles.original.textIndent,
                      color: config.textColor,
                    }}
                    dangerouslySetInnerHTML={{ __html: p.original }} 
                  />
                </div>
              )}
              <div className="relative min-h-[1.5em]">
                {p.translated ? (
                  <div 
                    className="leading-relaxed break-words whitespace-pre-wrap font-kr animate-fade-in"
                    style={{
                      textIndent: styles.translated.textIndent,
                      color: config.textColor,
                    }}
                  >
                    {config.forceDialogueBreak 
                      ? formatDialogue(p.translated)
                      : p.translated
                    }
                  </div>
                ) : (
                  <div className={`text-sm italic opacity-20 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                    번역 대기 중...
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
              {config.showOriginal && (
                <div className="relative">
                  <div className="absolute -left-3 top-0 text-[10px] font-mono text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    {p.id}
                  </div>
                  <div 
                    className="leading-relaxed break-words whitespace-pre-wrap font-jp"
                    style={{
                      opacity: styles.original.opacity,
                      textIndent: styles.original.textIndent,
                      color: config.textColor,
                    }}
                    dangerouslySetInnerHTML={{ __html: p.original }} 
                  />
                </div>
              )}

              <div className={`relative min-h-[1.5em] ${!config.showOriginal ? 'md:col-span-2' : ''}`}>
                {p.translated ? (
                  <div 
                    className="leading-relaxed break-words whitespace-pre-wrap font-kr animate-fade-in"
                    style={{
                      textIndent: styles.translated.textIndent,
                      color: config.textColor,
                    }}
                  >
                    {config.forceDialogueBreak 
                      ? formatDialogue(p.translated)
                      : p.translated
                    }
                  </div>
                ) : (
                  <div className={`text-sm italic opacity-20 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                    번역 대기 중...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

function formatDialogue(text: string): React.ReactNode {
  const parts = text.split(/([「」『』""])/);
  const result: React.ReactNode[] = [];
  let inQuote = false;
  
  parts.forEach((part, i) => {
    if (part === '「' || part === '『' || part === '"') {
      if (result.length > 0 && !inQuote) {
        result.push(<br key={`br-${i}`} />);
      }
      inQuote = true;
      result.push(part);
    } else if (part === '」' || part === '』' || part === '"') {
      inQuote = false;
      result.push(part);
    } else {
      result.push(part);
    }
  });
  
  return <>{result}</>;
}
