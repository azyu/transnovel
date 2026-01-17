import React from 'react';
import { useAppStore } from '../../stores/appStore';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className = '',
  id,
  ...props
}) => {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  const isDark = useAppStore((state) => state.theme) === 'dark';

  const baseStyles = isDark
    ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500'
    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400';

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${baseStyles} ${className} ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
        {...props}
      />
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
};
