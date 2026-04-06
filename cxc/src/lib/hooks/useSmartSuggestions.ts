"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

export interface SmartSuggestion {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

function getDismissedMap(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem("smart_suggestions_dismissed") || "{}");
  } catch {
    return {};
  }
}

function dismissSuggestion(id: string) {
  const map = getDismissedMap();
  map[id] = Date.now();
  // Clean up old entries
  const now = Date.now();
  for (const key of Object.keys(map)) {
    if (now - map[key] > DISMISS_DURATION_MS) delete map[key];
  }
  localStorage.setItem("smart_suggestions_dismissed", JSON.stringify(map));
}

/**
 * Returns at most 1 non-dismissed suggestion from the given candidates.
 * Candidates are evaluated in order; the first non-dismissed one wins.
 */
export function useSmartSuggestions(candidates: SmartSuggestion[]) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const map = getDismissedMap();
    const now = Date.now();
    const active = new Set<string>();
    for (const [key, ts] of Object.entries(map)) {
      if (now - ts < DISMISS_DURATION_MS) active.add(key);
    }
    setDismissedIds(active);
  }, []);

  const suggestion = useMemo(() => {
    for (const c of candidates) {
      if (!dismissedIds.has(c.id)) return c;
    }
    return null;
  }, [candidates, dismissedIds]);

  const dismiss = useCallback((id: string) => {
    dismissSuggestion(id);
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  return { suggestion, dismiss };
}
