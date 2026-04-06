"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const DRAFT_PREFIX = "fg_draft_";
const STALE_DAYS = 7;
const SAVE_INTERVAL_MS = 5000;

interface DraftEnvelope<T> {
  data: T;
  savedAt: number;
}

function getUserId(): string {
  if (typeof window === "undefined") return "anon";
  return sessionStorage.getItem("fg_user_id") || "anon";
}

function buildKey(key: string): string {
  return `${DRAFT_PREFIX}${key}_${getUserId()}`;
}

function isStale(savedAt: number): boolean {
  return Date.now() - savedAt > STALE_DAYS * 24 * 60 * 60 * 1000;
}

function timeAgo(savedAt: number): string {
  const diffMs = Date.now() - savedAt;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "hace unos segundos";
  if (mins < 60) return `hace ${mins} minuto${mins === 1 ? "" : "s"}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} hora${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `hace ${days} día${days === 1 ? "" : "s"}`;
}

export interface DraftAutoSaveResult<T> {
  draft: (T & { savedAt: number }) | null;
  hasDraft: boolean;
  clearDraft: () => void;
  draftTimeAgo: string;
}

export function useDraftAutoSave<T>(
  key: string,
  data: T,
  isEmpty: (data: T) => boolean
): DraftAutoSaveResult<T> {
  const [draft, setDraft] = useState<(T & { savedAt: number }) | null>(null);
  const lastSavedJson = useRef<string>("");
  const storageKey = useRef(buildKey(key));

  // On mount, check for existing draft
  useEffect(() => {
    storageKey.current = buildKey(key);
    try {
      const raw = localStorage.getItem(storageKey.current);
      if (!raw) return;
      const envelope: DraftEnvelope<T> = JSON.parse(raw);
      if (isStale(envelope.savedAt)) {
        localStorage.removeItem(storageKey.current);
        return;
      }
      setDraft({ ...envelope.data, savedAt: envelope.savedAt });
    } catch {
      localStorage.removeItem(storageKey.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Auto-save every 5 seconds if data changed and not empty
  useEffect(() => {
    const interval = setInterval(() => {
      if (isEmpty(data)) return;
      const json = JSON.stringify(data);
      if (json === lastSavedJson.current) return;
      lastSavedJson.current = json;
      const envelope: DraftEnvelope<T> = { data, savedAt: Date.now() };
      try {
        localStorage.setItem(storageKey.current, JSON.stringify(envelope));
      } catch {
        // localStorage full or unavailable — silently skip
      }
    }, SAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [data, isEmpty]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(storageKey.current);
    setDraft(null);
    lastSavedJson.current = "";
  }, []);

  const draftTimeAgo = draft ? timeAgo(draft.savedAt) : "";

  return { draft, hasDraft: !!draft, clearDraft, draftTimeAgo };
}
