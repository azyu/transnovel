import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import type { ApiKey } from '../../types';

export const ApiKeyManager: React.FC = () => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState('');
  const [keyType, setKeyType] = useState<'gemini' | 'antigravity'>('gemini');
  const [isLoading, setIsLoading] = useState(false);

  const fetchKeys = async () => {
    try {
      const result = await invoke<ApiKey[]>('get_api_keys');
      setKeys(result);
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleAddKey = async () => {
    if (!newKey.trim()) return;
    setIsLoading(true);
    try {
      await invoke('add_api_key', { keyType, apiKey: newKey });
      setNewKey('');
      await fetchKeys();
    } catch (error) {
      console.error('Failed to add API key:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveKey = async (id: number) => {
    if (!confirm('정말로 이 키를 삭제하시겠습니까?')) return;
    try {
      await invoke('remove_api_key', { id });
      await fetchKeys();
    } catch (error) {
      console.error('Failed to remove API key:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h3 className="text-lg font-medium text-white mb-4">API 키 관리</h3>
        
        <div className="flex gap-4 items-end mb-6">
          <div className="w-40">
            <label className="block text-sm font-medium text-slate-300 mb-1.5">유형</label>
            <select
              value={keyType}
              onChange={(e) => setKeyType(e.target.value as 'gemini' | 'antigravity')}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="gemini">Gemini</option>
              <option value="antigravity">Antigravity</option>
            </select>
          </div>
          <div className="flex-1">
            <Input
              label="API Key / Proxy URL"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder={keyType === 'gemini' ? 'Gemini API Key 입력' : 'http://localhost:8080'}
            />
          </div>
          <Button onClick={handleAddKey} isLoading={isLoading} disabled={!newKey.trim()}>
            추가
          </Button>
        </div>

        <div className="space-y-3">
          {keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-3">
                <span className={`px-2 py-1 rounded text-xs font-medium ${key.key_type === 'gemini' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                  {key.key_type.toUpperCase()}
                </span>
                <span className="text-sm text-slate-300 font-mono">
                  {key.key_type === 'gemini' ? `${key.api_key.substring(0, 8)}...` : key.api_key}
                </span>
              </div>
              <Button variant="danger" size="sm" onClick={() => handleRemoveKey(key.id)}>
                삭제
              </Button>
            </div>
          ))}
          {keys.length === 0 && (
            <div className="text-center py-4 text-slate-500 text-sm">
              등록된 API 키가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
