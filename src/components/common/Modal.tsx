import React from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../stores/appStore';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer }) => {
  const isDark = useAppStore((state) => state.theme) === 'dark';
  
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/50 backdrop-blur-sm p-4">
      <div className={`relative w-full max-w-lg rounded-xl shadow-2xl ${isDark ? 'bg-slate-800 ring-1 ring-white/10' : 'bg-white ring-1 ring-black/10'}`}>
        <div className={`flex items-center justify-between border-b p-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
          <button
            onClick={onClose}
            className={`rounded-lg p-1 transition-colors ${isDark ? 'text-slate-400 hover:bg-slate-700 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className={`p-4 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          {children}
        </div>
        {footer && (
          <div className={`flex items-center justify-end gap-3 border-t p-4 rounded-b-xl ${isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'}`}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
