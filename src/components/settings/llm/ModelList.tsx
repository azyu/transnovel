import { useUIStore } from '../../../stores/uiStore';
import type { ModelConfig, ProviderConfig } from './types';

interface ModelListProps {
  models: ModelConfig[];
  providers: ProviderConfig[];
  activeModelId: string | null;
  onSelect: (id: string) => void;
  onEdit: (model: ModelConfig) => void;
  onDelete: (id: string) => void;
}

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const DeleteIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

export const ModelList: React.FC<ModelListProps> = ({
  models,
  providers,
  activeModelId,
  onSelect,
  onEdit,
  onDelete,
}) => {
  const isDark = useUIStore((state) => state.theme) === 'dark';

  const getProviderColor = (type: string): string => {
    const colors: Record<string, string> = {
      gemini: 'bg-blue-500/10 text-blue-400',
      openrouter: 'bg-purple-500/10 text-purple-400',
      anthropic: 'bg-orange-500/10 text-orange-400',
      openai: 'bg-green-500/10 text-green-400',
      custom: 'bg-slate-500/10 text-slate-400',
    };
    return colors[type] || colors.custom;
  };

  const getProviderForModel = (model: ModelConfig): ProviderConfig | undefined => {
    return providers.find(p => p.id === model.providerId);
  };

  if (models.length === 0) {
    return (
      <div className={`text-center py-8 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
        등록된 모델이 없습니다. 모델을 추가해주세요.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {models.map((model) => {
        const isActive = model.id === activeModelId;
        const provider = getProviderForModel(model);
        const providerType = provider?.type;
        
        return (
          <div
            key={model.id}
            className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
              isActive
                ? isDark 
                  ? 'bg-blue-900/20 border-blue-500/50' 
                  : 'bg-blue-50 border-blue-300'
                : isDark 
                  ? 'bg-slate-900/50 border-slate-700/50 hover:border-slate-600' 
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(model.id)}
              className="flex items-center gap-3 flex-1 text-left min-w-0"
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
                isActive
                  ? 'border-blue-500 bg-blue-500'
                  : isDark ? 'border-slate-600' : 'border-slate-300'
              }`}>
                {isActive && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              
              <span className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {model.name}
              </span>
              
              {provider && providerType && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${getProviderColor(providerType)}`}>
                  {provider.name}
                </span>
              )}
              
              {!provider && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-400 shrink-0">
                  제공자 없음
                </span>
              )}
            </button>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onEdit(model)}
                aria-label={`${model.name} 수정`}
                className={`p-1.5 rounded-md transition-colors ${
                  isDark 
                    ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' 
                    : 'hover:bg-slate-200 text-slate-500 hover:text-slate-700'
                }`}
                title="수정"
              >
                <EditIcon />
              </button>
              <button
                type="button"
                onClick={() => onDelete(model.id)}
                aria-label={`${model.name} 삭제`}
                className={`p-1.5 rounded-md transition-colors ${
                  isDark 
                    ? 'hover:bg-red-900/30 text-slate-400 hover:text-red-400' 
                    : 'hover:bg-red-100 text-slate-500 hover:text-red-600'
                }`}
                title="삭제"
              >
                <DeleteIcon />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
