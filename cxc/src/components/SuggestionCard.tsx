"use client";

import type { SmartSuggestion } from "@/lib/hooks/useSmartSuggestions";

interface Props {
  suggestion: SmartSuggestion;
  onDismiss: (id: string) => void;
}

export default function SuggestionCard({ suggestion, onDismiss }: Props) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4 flex items-start gap-3">
      <span className="text-base flex-shrink-0 mt-0.5">💡</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">Sugerencia</p>
        <p className="text-sm text-gray-700">{suggestion.message}</p>
        {suggestion.actionLabel && suggestion.onAction && (
          <button
            onClick={suggestion.onAction}
            className="mt-2 text-xs bg-black text-white px-4 py-1.5 rounded-md hover:bg-gray-800 active:scale-[0.97] transition-all"
          >
            {suggestion.actionLabel}
          </button>
        )}
      </div>
      <button
        onClick={() => onDismiss(suggestion.id)}
        className="text-gray-300 hover:text-gray-500 transition flex-shrink-0 mt-0.5"
        aria-label="Cerrar sugerencia"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
