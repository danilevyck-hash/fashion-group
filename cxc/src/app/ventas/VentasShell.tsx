"use client";

import { useState, useTransition, useCallback } from "react";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, Contact, Package } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import dynamic from "next/dynamic";
import { exportResumenToExcel } from "@/lib/ventas/excel";
import { PullToRefresh } from "@/components/ui";
import type { VentasResumen, Clientes, Multifashion } from "@/components/ventas/types";

// Tabs cargados LAZY: cada vista va en su propio chunk y solo se descarga al
// activarse su tab → fuera del bundle inicial de /ventas. Skeleton mientras
// carga. Mismo patrón que multifashion (recharts vía next/dynamic, ssr:false).
function TabSkeleton() {
  return (
    <div className="mt-5 space-y-3" aria-hidden>
      <div className="h-8 w-48 animate-pulse rounded bg-stone-100" />
      <div className="h-64 w-full animate-pulse rounded-lg bg-stone-100" />
    </div>
  );
}
const ResumenView = dynamic(
  () => import("@/components/ventas/ResumenView").then((m) => m.ResumenView),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const ClientesView = dynamic(
  () => import("@/components/ventas/ClientesView").then((m) => m.ClientesView),
  { ssr: false, loading: () => <TabSkeleton /> },
);
const ProductosView = dynamic(
  () => import("@/components/ventas/ProductosView").then((m) => m.ProductosView),
  { ssr: false, loading: () => <TabSkeleton /> },
);

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
  // Tab activo en la URL (?tab=resumen|clientes) para que refresh, back/forward
  // y compartir-link mantengan dónde estaba el usuario. Multifashion se separó
  // a su propio módulo (/multifashion); Ventas queda con Resumen + Clientes.
  const [tab, setTab] = useUrlState("tab", "resumen");

  const loadData = useCallback(async (year: number) => {
    setLoading(true);
    setFetchError(null);
    try {
      // Refetch en paralelo. resumen + clientes son los tabs visibles; multi
      // (overview Multifashion) ya no tiene tab propio aquí, pero ResumenView
      // lo usa para el tooltip de desglose retail/mayoreo de la fila
      // Multifashion del heatmap, así que se sigue refetcheando con el año.
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
  }, []);

  const onYearChange = useCallback(async (year: number) => {
    if (year === selectedYear) return;
    setSelectedYear(year);
    await loadData(year);
  }, [selectedYear, loadData]);

  // Pull-to-refresh (mobile): recarga el año actual sin cambiarlo.
  const onRefresh = useCallback(async () => {
    await loadData(selectedYear);
  }, [selectedYear, loadData]);

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
    <PullToRefresh onRefresh={onRefresh}>
    <main className="mx-auto w-full max-w-[1280px] px-4 py-5 md:px-7 md:py-6">
      {/* Page head — `relative z-20` para garantizar stacking context propio
          encima del TabsList (que tiene overflow-x-auto y crea su propio
          stacking en algunos browsers, tapando los buttons del header en
          viewports angostos). Sin esto, el botón Excel no respondía a click
          en producción. */}
      <header className="relative z-20 mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-950 md:text-4xl">
            Ventas
          </h1>
          <p className="mt-1 text-xs text-stone-500">
            8 empresas · año fiscal {selectedYear} · {mesesLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Bug #1 fix: selector año visible desde cualquier tab (antes solo
              en Resumen). State global ya existía — solo cambio de placement. */}
          <Select value={String(selectedYear)} onValueChange={v => onYearChange(parseInt(v, 10))}>
            <SelectTrigger className="h-9 w-auto min-w-[88px] gap-1.5 text-xs font-mono tabular-nums" disabled={loading}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(y => (
                <SelectItem key={y} value={String(y)} className="font-mono tabular-nums">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Excel global = export del Resumen. En el tab Productos se oculta
              porque ese tab trae su propio export (por empresa + período). */}
          {tab !== "productos" && (
            <Button variant="outline" size="sm" onClick={onExportExcel} disabled={!resumen}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Excel
            </Button>
          )}
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
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
            value="productos"
            className="gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-4 py-3 text-stone-500 data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-stone-950 data-[state=active]:shadow-none"
          >
            <Package className="h-3.5 w-3.5" /> Productos
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
        <TabsContent value="productos" className="mt-5">
          {/* key={selectedYear} remonta al cambiar año global → resetea empresa/
              período/sort internos al universo del año cargado. */}
          <ProductosView key={selectedYear} selectedYear={selectedYear} />
        </TabsContent>
      </Tabs>
    </main>
    </PullToRefresh>
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
