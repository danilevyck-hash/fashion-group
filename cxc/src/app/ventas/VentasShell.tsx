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
  clientes: initialClientes,
  multi: initialMulti,
}: VentasShellProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [resumen, setResumen] = useState<VentasResumen | null>(initialResumen);
  const [clientes, setClientes] = useState<Clientes | null>(initialClientes);
  const [multi, setMulti] = useState<Multifashion | null>(initialMulti);
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const onYearChange = useCallback(async (year: number) => {
    if (year === selectedYear) return;
    setSelectedYear(year);
    setLoading(true);
    setFetchError(null);
    try {
      // Refetch los 3 datasets en paralelo. El selector global de año
      // debe propagarse a TODOS los tabs (Resumen, Clientes, Multifashion).
      const [resumenRes, clientesRes, multiRes] = await Promise.all([
        fetch(`/api/ventas/resumen?year=${year}`, { cache: "no-store" }),
        fetch(`/api/ventas/clientes-12m?year=${year}`, { cache: "no-store" }),
        fetch(`/api/multifashion/overview?year=${year}`, { cache: "no-store" }),
      ]);

      const errors: string[] = [];
      if (!resumenRes.ok) errors.push(`resumen: HTTP ${resumenRes.status}`);
      if (!clientesRes.ok) errors.push(`clientes: HTTP ${clientesRes.status}`);
      if (!multiRes.ok) errors.push(`multifashion: HTTP ${multiRes.status}`);
      if (errors.length) throw new Error(errors.join(" · "));

      const [resumenData, clientesData, multiData] = await Promise.all([
        resumenRes.json() as Promise<VentasResumen>,
        clientesRes.json() as Promise<Clientes>,
        multiRes.json() as Promise<Multifashion>,
      ]);

      startTransition(() => {
        setResumen(resumenData);
        setClientes(clientesData);
        setMulti(multiData);
      });
    } catch (err) {
      console.error("[ventas] year change refetch failed", err);
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
  // resumen.mesActual (1-indexed) = último mes con data en el año en curso.
  // Semánticamente es el "mes en curso" (data parcial cargada). El mes
  // cerrado inmediatamente anterior es mesActual - 1.
  //   mesActual = 5 (May) → "cierre Abr (mes en curso May)"
  //   mesActual = 1 (solo Ene)  → "mes en curso Ene" (no hay cerrado en este año)
  const mesesLabel = isClosedYear
    ? "año cerrado"
    : (resumen && resumen.mesActual > 0
        ? (resumen.mesActual >= 2
            ? `cierre ${MES_SHORT[resumen.mesActual - 2]} (mes en curso ${MES_SHORT[resumen.mesActual - 1]})`
            : `mes en curso ${MES_SHORT[resumen.mesActual - 1]}`)
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
              multi={multi}
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
          {clientes ? (
            // key={selectedYear} fuerza remount al cambiar año — resetea state
            // interno (search, pill, sort) que asume el universo del año cargado.
            <ClientesView
              key={selectedYear}
              data={clientes}
              selectedYear={selectedYear}
              isClosedYear={isClosedYear}
            />
          ) : <ErrorState scope="clientes" />}
        </TabsContent>
        <TabsContent value="multifashion" className="mt-5">
          {multi ? (
            <MultifashionView
              key={selectedYear}
              data={multi}
              selectedYear={selectedYear}
              isClosedYear={isClosedYear}
            />
          ) : <ErrorState scope="multifashion" />}
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
