import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../stores/appStore';

export const Toast: React.FC = () => {
  const { toast, hideToast, theme } = useAppStore();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(hideToast, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast, hideToast]);

  if (!toast) return null;

  return createPortal(
    <div className="fixed top-4 right-4 z-50 animate-fade-in">
      <div
        className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
          isDark
            ? 'bg-slate-800 border border-slate-700 text-white'
            : 'bg-white border border-slate-200 text-slate-900 shadow-md'
        }`}
      >
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
        <span className="text-sm">{toast}</span>
      </div>
    </div>,
    document.body
  );
};
