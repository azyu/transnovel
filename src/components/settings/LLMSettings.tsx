import { useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../common/Button';
import { useUIStore } from '../../stores/uiStore';
import { ModelModal } from './llm/ModelModal';
import { ModelList } from './llm/ModelList';
import type { ModelConfig } from './llm/types';

export const LLMSettings = forwardRef((_, ref) => {
  const isDark = useUIStore((state) => state.theme) === 'dark';
  
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [useStreaming, setUseStreaming] = useState(true);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);

  const handleSaveAll = useCallback(async () => {
    try {
      await Promise.all([
        invoke('set_setting', { key: 'llm_models', value: JSON.stringify(models) }),
        invoke('set_setting', { key: 'active_model_id', value: activeModelId || '' }),
        invoke('set_setting', { key: 'use_streaming', value: useStreaming ? 'true' : 'false' }),
      ]);
      window.dispatchEvent(new Event('settings-changed'));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }, [models, activeModelId, useStreaming]);

  useImperativeHandle(ref, () => ({
    save: handleSaveAll
  }));

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await invoke<{ key: string; value: string }[]>('get_settings');
        
        const modelsJson = settings.find(s => s.key === 'llm_models')?.value;
        if (modelsJson) {
          try {
            setModels(JSON.parse(modelsJson));
          } catch {
            setModels([]);
          }
        }
        
        const activeId = settings.find(s => s.key === 'active_model_id')?.value;
        if (activeId) setActiveModelId(activeId);
        
        const streaming = settings.find(s => s.key === 'use_streaming')?.value;
        if (streaming) setUseStreaming(streaming === 'true');
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleAddModel = () => {
    setEditingModel(null);
    setModalOpen(true);
  };

  const handleEditModel = (model: ModelConfig) => {
    setEditingModel(model);
    setModalOpen(true);
  };

  const handleSaveModel = (model: ModelConfig) => {
    setModels(prev => {
      const existing = prev.findIndex(m => m.id === model.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = model;
        return updated;
      }
      return [...prev, model];
    });
    
    if (!activeModelId) {
      setActiveModelId(model.id);
    }
  };

  const handleDeleteModel = (id: string) => {
    if (!confirm('이 모델을 삭제하시겠습니까?')) return;
    
    setModels(prev => prev.filter(m => m.id !== id));
    
    if (activeModelId === id) {
      setActiveModelId(models.length > 1 ? models.find(m => m.id !== id)?.id || null : null);
    }
  };

  const handleSelectModel = (id: string) => {
    setActiveModelId(id);
  };

  return (
    <div className="space-y-6">
      <div className={`border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>LLM 설정</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          번역에 사용할 AI 모델을 등록하고 선택합니다.
        </p>
      </div>

      <div className={`p-6 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>모델</h3>
          <Button size="sm" onClick={handleAddModel}>
            + 추가
          </Button>
        </div>

        <ModelList
          models={models}
          activeModelId={activeModelId}
          onSelect={handleSelectModel}
          onEdit={handleEditModel}
          onDelete={handleDeleteModel}
        />
      </div>

      <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>스트리밍 모드</h3>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              번역 결과를 실시간으로 표시합니다.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={useStreaming}
            onClick={() => setUseStreaming(!useStreaming)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
              useStreaming ? 'bg-blue-500' : isDark ? 'bg-slate-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                useStreaming ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      <ModelModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveModel}
        editingModel={editingModel}
      />
    </div>
  );
});

LLMSettings.displayName = 'LLMSettings';
