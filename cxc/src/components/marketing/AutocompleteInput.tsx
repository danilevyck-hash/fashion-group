"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  KeyboardEvent,
} from "react";

interface AutocompleteInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  fetchSuggestions: (q: string) => Promise<string[]>;
  placeholder?: string;
  required?: boolean;
  id?: string;
}

/**
 * Input con autocomplete por prefijo.
 * - Debounce 200ms.
 * - ESC cierra. Flechas ↑↓ navegan. Enter selecciona. Tab cierra.
 * - Click fuera cierra.
 * - Caller provee fetchSuggestions que pega a /api/marketing/autocomplete.
 */
export function AutocompleteInput({
  label,
  value,
  onChange,
  fetchSuggestions,
  placeholder,
  required,
  id,
}: AutocompleteInputProps) {
  const autoId = useId();
  const inputId = id ?? `autocomplete-${autoId}`;
  const listboxId = `${inputId}-listbox`;

  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = useRef<string>("");

  // Debounced fetch
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value;
    latestQueryRef.current = q;
    debounceRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetchSuggestions(q);
        // Solo aplica si esta query sigue siendo la última
        if (latestQueryRef.current === q) {
          setSuggestions(res);
          setActiveIndex(res.length > 0 ? 0 : -1);
        }
      } catch {
        if (latestQueryRef.current === q) {
          setSuggestions([]);
          setActiveIndex(-1);
        }
      } finally {
        if (latestQueryRef.current === q) setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, open]);

  // Click fuera cierra
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const cerrar = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const seleccionar = useCallback(
    (valor: string) => {
      onChange(valor);
      cerrar();
    },
    [onChange, cerrar]
  );

  const visibles = useMemo(() => {
    // Filtra por prefijo case-insensitive, respetando server-side results
    const q = value.trim().toLocaleLowerCase("es");
    if (q.length === 0) return suggestions;
    return suggestions.filter((s) =>
      s.toLocaleLowerCase("es").startsWith(q)
    );
  }, [suggestions, value]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cerrar();
      return;
    }
    if (e.key === "Tab") {
      cerrar();
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (visibles.length === 0 ? -1 : (i + 1) % visibles.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        visibles.length === 0 ? -1 : (i - 1 + visibles.length) % visibles.length
      );
      return;
    }
    if (e.key === "Enter") {
      if (open && activeIndex >= 0 && activeIndex < visibles.length) {
        e.preventDefault();
        seleccionar(visibles[activeIndex]);
      }
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <label htmlFor={inputId} className="block text-sm text-gray-600 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
        }
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-0"
      />

      {open && (visibles.length > 0 || loading) && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg"
        >
          {loading && visibles.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-400">Buscando…</li>
          )}
          {visibles.map((opt, idx) => {
            const active = idx === activeIndex;
            return (
              <li
                key={`${opt}-${idx}`}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => {
                  // mousedown evita que blur cierre antes del click
                  e.preventDefault();
                  seleccionar(opt);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`px-3 py-2 text-sm cursor-pointer ${
                  active ? "bg-gray-100" : "bg-white"
                }`}
              >
                {opt}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default AutocompleteInput;
