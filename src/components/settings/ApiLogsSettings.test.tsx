import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiLogsSettings } from './ApiLogsSettings';
import { messages } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';

const apiLogStoreState = {
  logs: [],
  totalCount: 0,
  currentPage: 1,
  pageSize: 50,
  filter: 'all' as const,
  isLoading: false,
  fetchLogs: vi.fn(async () => {}),
  setFilter: vi.fn(),
  setPage: vi.fn(),
  clearLogs: vi.fn(async () => {}),
};

vi.mock('../../stores/apiLogStore', () => ({
  useApiLogStore: () => apiLogStoreState,
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  ask: vi.fn(),
}));

vi.mock('./ApiLogDetailModal', () => ({
  ApiLogDetailModal: () => null,
}));

describe('ApiLogsSettings', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalSettingsMessages: unknown;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({ theme: 'dark' });
    originalSettingsMessages = messages.settings;
    apiLogStoreState.logs = [];
    apiLogStoreState.totalCount = 0;
    apiLogStoreState.currentPage = 1;
    apiLogStoreState.filter = 'all';
    apiLogStoreState.isLoading = false;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    (messages as { settings: unknown }).settings = originalSettingsMessages;
    vi.clearAllMocks();
  });

  it('renders labels from settings i18n messages', async () => {
    const originalSettings = originalSettingsMessages as typeof messages.settings;
    (messages as { settings: unknown }).settings = {
      ...originalSettings,
      apiLogs: {
        ...originalSettings.apiLogs,
        title: 'API logs title sentinel',
        description: 'API logs description sentinel',
        filters: {
          ...originalSettings.apiLogs.filters,
          all: 'All sentinel',
          error: 'Error sentinel',
          success: 'Success sentinel',
        },
        totalCount: (count: number) => `Total sentinel ${count}`,
        clearAction: 'Clear logs sentinel',
        empty: 'Empty logs sentinel',
      },
    };

    await act(async () => {
      root.render(<ApiLogsSettings />);
    });

    expect(container.textContent).toContain('API logs title sentinel');
    expect(container.textContent).toContain('API logs description sentinel');
    expect(container.textContent).toContain('All sentinel');
    expect(container.textContent).toContain('Error sentinel');
    expect(container.textContent).toContain('Success sentinel');
    expect(container.textContent).toContain('Total sentinel 0');
    expect(container.textContent).toContain('Clear logs sentinel');
    expect(container.textContent).toContain('Empty logs sentinel');
  });
});
