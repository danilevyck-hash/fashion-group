"use client";

import { useState, useCallback, createContext, useContext } from "react";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import KeyboardShortcutsHelp from "@/components/KeyboardShortcutsHelp";

// ── Context for table shortcuts ────────────────────────────────────

interface TableShortcutContext {
  register: (config: {
    rowCount: number;
    selectedIndex: number;
    onSelect: (index: number) => void;
    onExpand: (index: number) => void;
    onCollapse: () => void;
    onEdit?: (index: number) => void;
  } | null) => void;
}

const TableShortcutCtx = createContext<TableShortcutContext>({
  register: () => {},
});

export function useTableShortcuts() {
  return useContext(TableShortcutCtx);
}

// ── Provider ───────────────────────────────────────────────────────

export default function KeyboardShortcutsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [tableConfig, setTableConfig] = useState<{
    rowCount: number;
    selectedIndex: number;
    onSelect: (index: number) => void;
    onExpand: (index: number) => void;
    onCollapse: () => void;
    onEdit?: (index: number) => void;
  } | null>(null);

  const openSearch = useCallback(() => {
    // Trigger the same ⌘K that SearchBar listens for
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      })
    );
  }, []);

  const showHelp = useCallback(() => setHelpOpen(true), []);
  const hideHelp = useCallback(() => setHelpOpen(false), []);

  const register = useCallback(
    (config: typeof tableConfig) => setTableConfig(config),
    []
  );

  useKeyboardShortcuts({
    onOpenSearch: openSearch,
    onShowHelp: showHelp,
    table: tableConfig ?? undefined,
  });

  return (
    <TableShortcutCtx.Provider value={{ register }}>
      {children}
      <KeyboardShortcutsHelp open={helpOpen} onClose={hideHelp} />
    </TableShortcutCtx.Provider>
  );
}
