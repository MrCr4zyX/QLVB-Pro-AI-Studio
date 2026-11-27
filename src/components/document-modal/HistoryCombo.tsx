import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { searchKey } from '../../utils/dateUtils';

export interface HistoryComboProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  mono?: boolean;
}

// Editable combo box: offers existing values without restricting free typing.
export const HistoryCombo: React.FC<HistoryComboProps> = ({
  value,
  onChange,
  options,
  placeholder,
  required,
  mono,
}) => {
  const [open, setOpen] = useState(false);
  const [querying, setQuerying] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = querying ? searchKey(value.trim()) : '';
    return options.filter((item) => !q || searchKey(item).includes(q));
  }, [options, querying, value]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div className="flex items-stretch rounded-lg border border-slate-300 bg-slate-50 focus-within:ring-2 focus-within:ring-blue-200">
        <input
          type="text"
          value={value}
          required={required}
          placeholder={placeholder}
          onChange={(event) => {
            onChange(event.target.value);
            setQuerying(true);
            setOpen(true);
          }}
          onFocus={() => {
            setQuerying(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setQuerying(false);
              setOpen(true);
            }
          }}
          className={`min-w-0 w-full bg-transparent p-2 text-slate-800 font-medium outline-none ${mono ? 'font-mono' : ''}`}
        />
        <button
          type="button"
          aria-label="Xem lịch sử đã nhập"
          aria-expanded={open}
          onClick={() => {
            setQuerying(false);
            setOpen((v) => !v);
          }}
          className="shrink-0 px-2 border-l border-slate-200 text-slate-600 hover:bg-slate-100 rounded-r-lg"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[100] max-h-48 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white shadow-xl">
          {matches.length ? (
            matches.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                  setQuerying(false);
                }}
                className="block w-full px-3 py-2 text-left text-xs text-slate-800 hover:bg-blue-50 focus:bg-blue-50 break-words"
              >
                {item}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-slate-500">Chưa có giá trị phù hợp</div>
          )}
        </div>
      )}
    </div>
  );
};
