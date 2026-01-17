import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import type { ApiKey } from '../../types';

interface AntigravityStatus {
  running: boolean;
  authenticated: boolean;
  url: string;
}

export const ApiKeyManager: React.FC = () => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [antigravityStatus, setAntigravityStatus] = useState<AntigravityStatus | null>(null);
  const [checkingAntigravity, setCheckingAntigravity] = useState(false);

  const fetchKeys = async () => {
    try {
      const result = await invoke<ApiKey[]>('get_api_keys');
      setKeys(result);
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
    }
  };

  const checkAntigravity = async () => {
    setCheckingAntigravity(true);
    try {
      const status = await invoke<AntigravityStatus>('check_antigravity_status');
      setAntigravityStatus(status);
    } catch (error) {
      console.error('Failed to check Antigravity status:', error);
      setAntigravityStatus({ running: false, authenticated: false, url: 'http://localhost:8080' });
    } finally {
      setCheckingAntigravity(false);
    }
  };

  const openAntigravityAuth = async () => {
    try {
      await invoke('open_antigravity_auth');
      setTimeout(checkAntigravity, 3000);
    } catch (error) {
      console.error('Failed to open auth:', error);
    }
  };

  useEffect(() => {
    fetchKeys();
    checkAntigravity();
  }, []);

  const handleAddKey = async () => {
    if (!newKey.trim()) return;
    setIsLoading(true);
    try {
      await invoke('add_api_key', { keyType: 'gemini', apiKey: newKey });
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

  const geminiKeys = keys.filter(k => k.key_type === 'gemini');

  return (
    <div className="space-y-6">
      {/* Gemini API Key Section */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h3 className="text-lg font-medium text-white mb-4">Gemini API 키</h3>
        <p className="text-sm text-slate-400 mb-4">
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
            Google AI Studio
          </a>
          에서 무료로 API 키를 발급받을 수 있습니다.
        </p>
        
        <div className="flex gap-4 items-end mb-6">
          <div className="flex-1">
            <Input
              label="API Key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="AIzaSy..."
            />
          </div>
          <Button onClick={handleAddKey} isLoading={isLoading} disabled={!newKey.trim()}>
            추가
          </Button>
        </div>

        <div className="space-y-3">
          {geminiKeys.map((key) => (
            <div key={key.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/10 text-blue-400">
                  GEMINI
                </span>
                <span className="text-sm text-slate-300 font-mono">
                  {key.api_key.substring(0, 12)}...{key.api_key.substring(key.api_key.length - 4)}
                </span>
              </div>
              <Button variant="danger" size="sm" onClick={() => handleRemoveKey(key.id)}>
                삭제
              </Button>
            </div>
          ))}
          {geminiKeys.length === 0 && (
            <div className="text-center py-4 text-slate-500 text-sm">
              등록된 API 키가 없습니다.
            </div>
          )}
        </div>
      </div>

      {/* Antigravity Proxy Section */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h3 className="text-lg font-medium text-white mb-4">Antigravity 프록시 (대안)</h3>
        <p className="text-sm text-slate-400 mb-4">
          Gemini API 키 없이 Google OAuth로 번역할 수 있습니다. 아래 도구 중 하나를 설치하세요:
        </p>
        <ul className="text-sm text-slate-400 mb-4 list-disc list-inside space-y-1">
          <li>
            <a href="https://github.com/lbjlaq/Antigravity-Manager" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              Antigravity Manager
            </a>
            <span className="text-slate-500"> - GUI 앱 (추천, 포트 8045)</span>
          </li>
          <li>
            <a href="https://github.com/badrisnarayanan/antigravity-claude-proxy" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              antigravity-claude-proxy
            </a>
            <span className="text-slate-500"> - CLI (포트 8080 → 8045로 변경 필요)</span>
          </li>
        </ul>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              antigravityStatus?.running 
                ? antigravityStatus.authenticated 
                  ? 'bg-green-500' 
                  : 'bg-yellow-500'
                : 'bg-red-500'
            }`} />
            <span className="text-sm text-slate-300">
              {antigravityStatus?.running 
                ? antigravityStatus.authenticated 
                  ? '인증됨' 
                  : '인증 필요'
                : '미실행'}
            </span>
          </div>
          
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={checkAntigravity}
            isLoading={checkingAntigravity}
          >
            상태 확인
          </Button>
          
          {antigravityStatus?.running && !antigravityStatus.authenticated && (
            <Button size="sm" onClick={openAntigravityAuth}>
              Google 로그인
            </Button>
          )}
        </div>

        {antigravityStatus?.running && (
          <div className="mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
            <span className="text-sm text-slate-400">프록시 URL: </span>
            <span className="text-sm text-slate-300 font-mono">{antigravityStatus.url}</span>
          </div>
        )}
      </div>
    </div>
  );
};
