import React from 'react';
import { Field, Label, Switch } from '@headlessui/react';
import { useUIStore } from '../../stores/uiStore';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({
  label,
  checked,
  onChange,
  disabled = false,
}) => {
  const isDark = useUIStore((state) => state.theme) === 'dark';

  return (
    <Field className={`flex items-center justify-between gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <Label className={`text-sm cursor-pointer ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
        {label}
      </Label>
      <Switch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
          checked
            ? 'bg-blue-500'
            : isDark
              ? 'bg-slate-600'
              : 'bg-slate-300'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </Switch>
    </Field>
  );
};
