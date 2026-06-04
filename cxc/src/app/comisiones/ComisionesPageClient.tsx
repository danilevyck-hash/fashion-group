"use client";

import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { ComisionesView } from "@/components/ventas/ComisionesView";

export function ComisionesPageClient({ availableYears }: { availableYears: number[] }) {
  const { authChecked } = useAuth({ moduleKey: "comisiones", allowedRoles: ["admin", "secretaria"] });
  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Comisiones" />
      <main className="mx-auto w-full max-w-[1280px] px-4 py-5 md:px-7 md:py-6">
        <header className="mb-5">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-950 md:text-4xl">
            Comisiones
          </h1>
          <p className="mt-1 text-xs text-stone-500">Comisión por vendedor — venta y cobro</p>
        </header>
        <ComisionesView availableYears={availableYears} />
      </main>
    </div>
  );
}
