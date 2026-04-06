"use client";

import { createContext, useContext } from "react";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";

interface OnlineContextValue {
  isOnline: boolean;
  wasOffline: boolean;
}

const OnlineContext = createContext<OnlineContextValue>({ isOnline: true, wasOffline: false });

export function OnlineProvider({ children }: { children: React.ReactNode }) {
  const status = useOnlineStatus();
  return (
    <OnlineContext.Provider value={status}>
      {children}
    </OnlineContext.Provider>
  );
}

export function useOnline(): boolean {
  return useContext(OnlineContext).isOnline;
}

export function useOnlineContext(): OnlineContextValue {
  return useContext(OnlineContext);
}
