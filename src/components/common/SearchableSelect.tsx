import { useState, Fragment } from 'react';
import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions, Transition } from '@headlessui/react';
import { useUIStore } from '../../stores/uiStore';

interface Option {
  value: string;
  label: string;
  subLabel?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '검색...',
  disabled = false,
  loading = false,
}) => {
  const theme = useUIStore((state) => state.theme);
  const isDark = theme === 'dark';
  
  const [query, setQuery] = useState('');

  const selectedOption = options.find(o => o.value === value) ?? null;

  const filteredOptions = query === ''
    ? options
    : options.filter((option) => {
        const searchLower = query.toLowerCase();
        return (
          option.label.toLowerCase().includes(searchLower) ||
          option.value.toLowerCase().includes(searchLower) ||
          (option.subLabel?.toLowerCase().includes(searchLower) ?? false)
        );
      });

  return (
    <Combobox
      value={selectedOption}
      onChange={(option) => option && onChange(option.value)}
      disabled={disabled}
    >
      <div className="relative">
        <div className="relative">
          <ComboboxInput
            className={`w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isDark 
                ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' 
                : 'bg-slate-100 border-slate-300 text-slate-900 placeholder-slate-400'
            } border ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            displayValue={(option: Option | null) => option?.label ?? ''}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={loading ? '로딩 중...' : placeholder}
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
            <svg 
              className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </ComboboxButton>
        </div>

        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
          afterLeave={() => setQuery('')}
        >
          <ComboboxOptions
            className={`absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg shadow-lg border py-1 focus:outline-none ${
              isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
            }`}
          >
            {filteredOptions.length === 0 && query !== '' ? (
              <div className={`px-3 py-2 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                검색 결과 없음
              </div>
            ) : (
              filteredOptions.map((option) => (
                <ComboboxOption
                  key={option.value}
                  value={option}
                  className={({ focus, selected }) =>
                    `relative cursor-pointer select-none px-3 py-2 text-sm ${
                      selected
                        ? isDark ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'
                        : focus
                          ? isDark ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-900'
                          : isDark ? 'text-white' : 'text-slate-900'
                    }`
                  }
                >
                  <div className="flex items-center justify-between">
                    <span>{option.label}</span>
                    {option.subLabel && (
                      <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {option.subLabel}
                      </span>
                    )}
                  </div>
                </ComboboxOption>
              ))
            )}
          </ComboboxOptions>
        </Transition>
      </div>
    </Combobox>
  );
};
