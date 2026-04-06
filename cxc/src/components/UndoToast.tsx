"use client";

import { useEffect, useState } from "react";

interface UndoToastProps {
  message: string;
  startedAt: number;
  onUndo: () => void;
  durationMs?: number;
}

/**
 * Dark toast with "Deshacer" button and countdown progress bar.
 * Shown for 5 seconds. If user clicks Deshacer, parent cancels the action.
 */
export default function UndoToast({ message, startedAt, onUndo, durationMs = 5000 }: UndoToastProps) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    let raf: number;
    function tick() {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, 1 - elapsed / durationMs) * 100;
      setProgress(remaining);
      if (remaining > 0) {
        raf = requestAnimationFrame(tick);
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startedAt, durationMs]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom fade-in duration-200">
      <div className="bg-gray-900 text-white rounded-lg shadow-lg overflow-hidden min-w-[280px] max-w-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-sm flex-1">{message}</span>
          <button
            onClick={onUndo}
            className="text-sm font-medium text-white underline hover:no-underline whitespace-nowrap transition"
          >
            Deshacer
          </button>
        </div>
        <div className="h-[3px] bg-gray-700">
          <div
            className="h-full bg-white/60 transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
