import React from 'react';
import { useUIStore } from '../../stores/uiStore';

interface NumberStepperProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  className?: string;
  decimals?: number;
}

export const NumberStepper: React.FC<NumberStepperProps> = ({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  unit,
  className = '',
  decimals,
}) => {
  const generatedId = React.useId();
  const isDark = useUIStore((state) => state.theme) === 'dark';

  const precision = decimals ?? (step < 1 ? String(step).split('.')[1]?.length ?? 0 : 0);

  const roundToPrecision = (num: number) => {
    return Number(num.toFixed(precision));
  };

  const handleDecrement = () => {
    const newValue = roundToPrecision(Math.max(min, value - step));
    onChange(newValue);
  };

  const handleIncrement = () => {
    const newValue = roundToPrecision(Math.min(max, value + step));
    onChange(newValue);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    if (inputValue === '' || inputValue === '-') {
      return;
    }
    
    const numValue = parseFloat(inputValue);
    if (!isNaN(numValue)) {
      const clampedValue = Math.max(min, Math.min(max, numValue));
      onChange(roundToPrecision(clampedValue));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    if (inputValue === '' || inputValue === '-') {
      onChange(min);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleIncrement();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleDecrement();
    }
  };

  const buttonStyles = isDark
    ? 'bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-200 border-slate-600'
    : 'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 border-slate-300';

  const inputStyles = isDark
    ? 'bg-slate-900 border-slate-700 text-white'
    : 'bg-white border-slate-300 text-slate-900';

  const displayValue = precision > 0 ? value.toFixed(precision) : value;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={generatedId}
          className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
        >
          {label}
        </label>
      )}
      <div className="flex items-center">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={value <= min}
          className={`flex items-center justify-center w-10 h-10 rounded-l-lg border border-r-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${buttonStyles}`}
          aria-label="감소"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <div className="relative flex-1">
          <input
            id={generatedId}
            type="text"
            inputMode="decimal"
            value={displayValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={`w-full h-10 px-3 text-center text-sm font-medium border-y focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:z-10 transition-colors ${inputStyles}`}
          />
          {unit && (
            <span
              className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${
                isDark ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              {unit}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleIncrement}
          disabled={value >= max}
          className={`flex items-center justify-center w-10 h-10 rounded-r-lg border border-l-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${buttonStyles}`}
          aria-label="증가"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  );
};
