import React from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { Fragment } from 'react';
import { useUIStore } from '../../stores/uiStore';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer }) => {
  const isDark = useUIStore((state) => state.theme) === 'dark';

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className={`w-full max-w-lg transform rounded-xl shadow-2xl transition-all ${isDark ? 'bg-slate-800 ring-1 ring-white/10' : 'bg-white ring-1 ring-black/10'}`}>
                <div className={`flex items-center justify-between border-b p-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                  <DialogTitle as="h3" className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {title}
                  </DialogTitle>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="닫기"
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
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
