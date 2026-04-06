import { useState, useCallback, useRef } from "react";

const UNDO_TIMEOUT_MS = 5000;

interface UndoState {
  id: string;
  message: string;
  timer: ReturnType<typeof setTimeout>;
  execute: () => Promise<void>;
  startedAt: number;
}

/**
 * Hook for delayed-execution undo pattern.
 * The action is NOT executed immediately — it waits 5 seconds.
 * If user clicks "Deshacer", the action is cancelled.
 * If timeout expires, the action executes.
 *
 * Returns:
 * - scheduleAction: queue an action with undo capability
 * - undoAction: cancel the pending action
 * - pendingUndo: current pending undo state (for rendering toast)
 */
export function useUndoAction() {
  const [pendingUndo, setPendingUndo] = useState<{
    id: string;
    message: string;
    startedAt: number;
  } | null>(null);
  const stateRef = useRef<UndoState | null>(null);
  const revertRef = useRef<(() => void) | undefined>(undefined);

  const scheduleAction = useCallback(
    (opts: {
      id: string;
      message: string;
      execute: () => Promise<void>;
      onOptimistic?: () => void;
      onRevert?: () => void;
    }) => {
      // Clear any existing pending undo
      if (stateRef.current) {
        clearTimeout(stateRef.current.timer);
        // Execute the previous pending action immediately
        stateRef.current.execute();
      }

      // Apply optimistic UI update
      if (opts.onOptimistic) opts.onOptimistic();
      revertRef.current = opts.onRevert;

      const startedAt = Date.now();
      const timer = setTimeout(async () => {
        stateRef.current = null;
        setPendingUndo(null);
        try {
          await opts.execute();
        } catch {
          // If execution fails, revert the optimistic update
          if (opts.onRevert) opts.onRevert();
        }
      }, UNDO_TIMEOUT_MS);

      const state: UndoState = {
        id: opts.id,
        message: opts.message,
        timer,
        execute: opts.execute,
        startedAt,
      };
      stateRef.current = state;
      setPendingUndo({ id: opts.id, message: opts.message, startedAt });
    },
    []
  );

  const undoAction = useCallback(() => {
    if (!stateRef.current) return;
    clearTimeout(stateRef.current.timer);
    stateRef.current = null;
    setPendingUndo(null);
    // Revert optimistic UI update
    if (revertRef.current) {
      revertRef.current();
      revertRef.current = undefined;
    }
  }, []);

  const dismissUndo = useCallback(() => {
    if (!stateRef.current) return;
    clearTimeout(stateRef.current.timer);
    stateRef.current.execute();
    stateRef.current = null;
    setPendingUndo(null);
  }, []);

  return { pendingUndo, scheduleAction, undoAction, dismissUndo };
}
