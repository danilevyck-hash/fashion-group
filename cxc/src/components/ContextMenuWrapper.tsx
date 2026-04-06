"use client";

import { ContextMenuProvider } from "@/components/ui";

export function ContextMenuProviderWrapper({ children }: { children: React.ReactNode }) {
  return <ContextMenuProvider>{children}</ContextMenuProvider>;
}
