"use client";

import { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download, Plus, ShoppingBag, TrendingUp, Contact } from "lucide-react";
import { ResumenView } from "@/components/ventas/ResumenView";
import { ClientesView } from "@/components/ventas/ClientesView";
import { MultifashionView } from "@/components/ventas/MultifashionView";
import { exportResumenToExcel } from "@/lib/ventas/excel";
import type { VentasResumen, Clientes, Multifashion } from "@/components/ventas/types";

interface VentasShellProps {
  year: number;
  availableYears: number[];
  resumen: VentasResumen | null;
  clientes: Clientes | null;
  multi: Multifashion | null;
}

export function VentasShell({
  year: initialYear,
  availableYears,
  resumen: initialResumen,
  clientes,
  multi,
}: VentasShellProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [resumen, setResumen] = useState<VentasResumen | null>(initialResumen);
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const onYearChange = useCallback(async (year: number) => {
    if (year === selectedYear) return;
    setSelectedYear(year);
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/ventas/resumen?year=${year}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as VentasResumen;
      startTransition(() => {
        setResumen(data);
      });
    } catch (err) {
      console.error("[ventas] resumen refetch failed", err);
      setFetchError(err instanceof Error ? err.message : "error inesperado");
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  const onExportExcel = async () => {
    if (!resumen) return;
    try {
      await exportResumenToExcel(resumen);
    } catch (err) {
      console.error("[ventas] excel export failed", err);
    }
  };

  const isClosedYear = selectedYear < currentYear;
  const mesesLabel = isClosedYear
    ? "año cerrado"
    : (resumen && resumen.mesActual > 0
        ? `cierre ${MES_SHORT[resumen.mesActual - 1]} (mes en curso ${MES_SHORT[Math.min(11, resumen.mesActual)]})`
        : "sin cierres aún");

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 py-5 md:px-7 md:py-6">
      {/* Page head */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-950 md:text-4xl">
            Ventas
          </h1>
          <p className="mt-1 text-xs text-stone-500">
            8 empresas · año fiscal {selectedYear} · {mesesLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExportExcel} disabled={!resumen}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Excel
          </Button>
          <Button size="sm" asChild>
            <Link href="/upload?tab=ventas">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Cargar archivo
            </Link>
          </Button>
        </div>
      </header>

      <Tabs defaultValue="resumen" className="w-full">
        <TabsList className="-mx-4 flex h-auto w-auto justify-start gap-0 overflow-x-auto rounded-none border-b border-stone-200 bg-transparent px-4 p-0 md:mx-0 md:px-0">
          <TabsTrigger
            value="resumen"
            className="gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-4 py-3 text-stone-500 data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-stone-950 data-[state=active]:shadow-none"
          >
            <TrendingUp className="h-3.5 w-3.5" /> Resumen
          </TabsTrigger>
          <TabsTrigger
            value="clientes"
            className="gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-4 py-3 text-stone-500 data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-stone-950 data-[state=active]:shadow-none"
          >
            <Contact className="h-3.5 w-3.5" /> Clientes
          </TabsTrigger>
          <TabsTrigger
            value="multifashion"
            className="gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-4 py-3 text-stone-500 data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-stone-950 data-[state=active]:shadow-none"
          >
            <ShoppingBag className="h-3.5 w-3.5" /> Multifashion
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-5">
          {resumen ? (
            <ResumenView
              data={resumen}
              availableYears={availableYears}
              selectedYear={selectedYear}
              isClosedYear={isClosedYear}
              loading={loading}
              error={fetchError}
              onYearChange={onYearChange}
            />
          ) : <ErrorState scope="resumen" />}
        </TabsContent>
        <TabsContent value="clientes" className="mt-5">
          {clientes ? <ClientesView data={clientes} /> : <ErrorState scope="clientes" />}
        </TabsContent>
        <TabsContent value="multifashion" className="mt-5">
          {multi ? <MultifashionView data={multi} /> : <ErrorState scope="multifashion" />}
        </TabsContent>
      </Tabs>
    </main>
  );
}

function ErrorState({ scope }: { scope: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-8 text-center">
      <p className="text-sm text-stone-700">
        No se pudieron cargar los datos de <strong>{scope}</strong>.
      </p>
      <p className="mt-1 text-xs text-stone-500">Intenta recargar en unos segundos.</p>
    </div>
  );
}

const MES_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
