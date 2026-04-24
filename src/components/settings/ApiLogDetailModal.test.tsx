import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiLogDetailModal } from './ApiLogDetailModal';
import { messages } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';
import type { ApiLogEntry } from '../../types';

describe('ApiLogDetailModal', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalSettingsMessages: unknown;

  const log: ApiLogEntry = {
    id: 'log-1',
    timestamp: Date.now(),
    provider: 'OpenAI',
    model: 'gpt-4o',
    method: 'POST',
    path: '/v1/chat/completions',
    status: 200,
    durationMs: 321,
    protocol: 'openai',
    inputTokens: 100,
    outputTokens: 200,
    requestBody: '{"hello":"world"}',
    responseBody: '{"ok":true}',
    error: undefined,
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({ theme: 'dark' });
    originalSettingsMessages = messages.settings;
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async () => {}),
      },
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    (messages as { settings: unknown }).settings = originalSettingsMessages;
    vi.clearAllMocks();
  });

  it('renders modal labels from settings i18n messages', async () => {
    const originalSettings = originalSettingsMessages as typeof messages.settings;
    (messages as { settings: unknown }).settings = {
      ...originalSettings,
      apiLogs: {
        ...originalSettings.apiLogs,
        detail: {
          ...originalSettings.apiLogs.detail,
          dialogLabel: 'Detail dialog sentinel',
          closeAriaLabel: 'Close sentinel',
          uidTitle: 'Copy UID sentinel',
          timeLabel: 'Time sentinel',
          durationLabel: 'Duration sentinel',
          tokensLabel: 'Tokens sentinel',
          providerModelLabel: 'Provider sentinel',
          requestPayloadLabel: 'Request sentinel',
          responsePayloadLabel: 'Response sentinel',
          copy: 'Copy sentinel',
          copied: 'Copied sentinel',
        },
      },
    };

    await act(async () => {
      root.render(<ApiLogDetailModal log={log} onClose={() => {}} />);
    });

    expect(document.body.textContent).toContain('Time sentinel');
    expect(document.body.textContent).toContain('Duration sentinel');
    expect(document.body.textContent).toContain('Tokens sentinel');
    expect(document.body.textContent).toContain('Provider sentinel');
    expect(document.body.textContent).toContain('Request sentinel');
    expect(document.body.textContent).toContain('Response sentinel');
    expect(document.body.textContent).toContain('Copy sentinel');
    expect(document.body.querySelector('[aria-label="Detail dialog sentinel"]')).toBeTruthy();
    expect(document.body.querySelector('[aria-label="Close sentinel"]')).toBeTruthy();
    expect(document.body.querySelector('[title="Copy UID sentinel"]')).toBeTruthy();
  });

  it('renders provider and model on a separate full-width row', async () => {
    await act(async () => {
      root.render(<ApiLogDetailModal log={log} onClose={() => {}} />);
    });

    const providerModelLabel = Array.from(document.body.querySelectorAll('p')).find((element) =>
      element.textContent?.includes(messages.settings.apiLogs.detail.providerModelLabel),
    );
    const providerModelRow = providerModelLabel?.parentElement;

    expect(providerModelRow?.className).toContain('mt-4');
    expect(providerModelRow?.textContent).toContain('OpenAI');
    expect(providerModelRow?.textContent).toContain('gpt-4o');
  });
});
