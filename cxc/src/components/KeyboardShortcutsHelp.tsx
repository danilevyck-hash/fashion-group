"use client";

import { useEffect, useRef } from "react";
import { SHORTCUT_GROUPS } from "@/lib/hooks/useKeyboardShortcuts";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsHelp({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [open, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        ref={dialogRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16h12" />
            </svg>
            <span className="text-sm font-medium text-gray-800">Atajos de teclado</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition p-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-[11px] uppercase tracking-wider font-medium text-gray-400 mb-2.5">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-gray-600">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-[10px] text-gray-300 mx-0.5">/</span>}
                          {k.includes(" ") ? (
                            // Multi-key chord like "G H"
                            k.split(" ").map((part, pi) => (
                              <span key={pi} className="flex items-center gap-0.5">
                                {pi > 0 && (
                                  <span className="text-[10px] text-gray-300 mx-0.5">luego</span>
                                )}
                                <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-md shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                                  {part}
                                </kbd>
                              </span>
                            ))
                          ) : (
                            <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-md shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                              {k}
                            </kbd>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
          <p className="text-[11px] text-gray-400 text-center">
            Los atajos se desactivan cuando un campo de texto tiene foco
          </p>
        </div>
      </div>
    </div>
  );
}
