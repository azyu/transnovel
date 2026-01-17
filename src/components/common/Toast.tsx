import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../stores/appStore';

export const Toast: React.FC = () => {
  const { toast, hideToast, theme } = useAppStore();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (toast) {
      const duration = toast.type === 'error' ? 8000 : 3000;
      const timer = setTimeout(hideToast, duration);
      return () => clearTimeout(timer);
    }
  }, [toast, hideToast]);

  if (!toast) return null;

  const isError = toast.type === 'error';

  return createPortal(
    <div className="fixed top-4 right-4 z-50 animate-fade-in max-w-md">
      <div
        className={`px-4 py-3 rounded-lg shadow-lg border ${
          isError
            ? isDark
              ? 'bg-red-900/80 border-red-700 text-red-100'
              : 'bg-red-50 border-red-200 text-red-900'
            : isDark
              ? 'bg-slate-800 border-slate-700 text-white'
              : 'bg-white border-slate-200 text-slate-900 shadow-md'
        }`}
      >
        <div className="flex items-start gap-3">
          {isError ? (
            <svg
              className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 text-green-500 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{toast.message}</p>
            {toast.detail && (
              <p className={`text-xs mt-1 break-words ${
                isError
                  ? isDark ? 'text-red-300' : 'text-red-700'
                  : isDark ? 'text-slate-400' : 'text-slate-500'
              }`}>
                {toast.detail}
              </p>
            )}
          </div>
          <button
            onClick={hideToast}
            className={`flex-shrink-0 ${
              isError
                ? isDark ? 'text-red-400 hover:text-red-200' : 'text-red-500 hover:text-red-700'
                : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
