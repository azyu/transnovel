import React, { memo } from 'react';
import { messages } from '../../i18n';
import { useTranslationStore } from '../../stores/translationStore';
import { useViewSettings, type ViewConfig } from '../../hooks/useViewSettings';

interface ParagraphRowProps {
  paragraphId: string;
  config: ViewConfig;
  styles: ReturnType<ReturnType<typeof useViewSettings>['getStyles']>;
  isStacked: boolean;
}

const ParagraphRow = memo<ParagraphRowProps>(({ paragraphId, config, styles, isStacked }) => {
  const paragraph = useTranslationStore((s) => s.paragraphById[paragraphId]);
  
  if (!paragraph) return null;

  return (
    <div 
      className="group p-4 rounded-lg transition-colors"
      style={{ marginBottom: styles.paragraph.marginBottom }}
    >
      {isStacked ? (
        <div className="space-y-2">
          {config.showOriginal && (
            <div className="relative">
              <div 
                className="absolute -left-3 top-0 text-[10px] font-mono opacity-0 group-hover:opacity-50 transition-opacity"
                style={{ color: config.textColor }}
              >
                {paragraph.id}
              </div>
              <div 
                className="leading-relaxed break-words whitespace-pre-wrap font-jp"
                style={{
                  opacity: styles.original.opacity,
                  textIndent: styles.original.textIndent,
                  color: config.textColor,
                }}
                dangerouslySetInnerHTML={{ __html: paragraph.original }} 
              />
            </div>
          )}
          <div className="relative min-h-[1.5em]">
            {paragraph.translated ? (
              <div 
                className="leading-relaxed break-words whitespace-pre-wrap font-kr animate-fade-in"
                style={{
                  textIndent: styles.translated.textIndent,
                  color: config.textColor,
                }}
              >
                {config.forceDialogueBreak 
                  ? formatDialogue(paragraph.translated)
                  : paragraph.translated
                }
              </div>
            ) : (
              <div 
                className="text-sm italic opacity-30"
                style={{ color: config.textColor }}
              >
                {messages.translation.paragraphList.pending}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
          {config.showOriginal && (
            <div className="relative">
              <div 
                className="absolute -left-3 top-0 text-[10px] font-mono opacity-0 group-hover:opacity-50 transition-opacity"
                style={{ color: config.textColor }}
              >
                {paragraph.id}
              </div>
              <div 
                className="leading-relaxed break-words whitespace-pre-wrap font-jp"
                style={{
                  opacity: styles.original.opacity,
                  textIndent: styles.original.textIndent,
                  color: config.textColor,
                }}
                dangerouslySetInnerHTML={{ __html: paragraph.original }} 
              />
            </div>
          )}

          <div className={`relative min-h-[1.5em] ${!config.showOriginal ? 'md:col-span-2' : ''}`}>
            {paragraph.translated ? (
              <div 
                className="leading-relaxed break-words whitespace-pre-wrap font-kr animate-fade-in"
                style={{
                  textIndent: styles.translated.textIndent,
                  color: config.textColor,
                }}
              >
                {config.forceDialogueBreak 
                  ? formatDialogue(paragraph.translated)
                  : paragraph.translated
                }
              </div>
            ) : (
              <div 
                className="text-sm italic opacity-30"
                style={{ color: config.textColor }}
              >
                {messages.translation.paragraphList.pending}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

ParagraphRow.displayName = 'ParagraphRow';

export const ParagraphList: React.FC = () => {
  const paragraphIds = useTranslationStore((s) => s.paragraphIds);
  const { config, getStyles } = useViewSettings();
  const styles = getStyles();

  const isStacked = config.displayLayout === 'stacked';

  return (
    <div 
      className="rounded-lg"
      style={{
        fontFamily: styles.container.fontFamily,
        fontSize: styles.container.fontSize,
        fontWeight: styles.container.fontWeight,
        lineHeight: styles.container.lineHeight,
        backgroundColor: config.backgroundColor,
        color: config.textColor,
        padding: styles.container.padding,
      }}
    >
      {paragraphIds.map((id) => (
        <ParagraphRow
          key={id}
          paragraphId={id}
          config={config}
          styles={styles}
          isStacked={isStacked}
        />
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
