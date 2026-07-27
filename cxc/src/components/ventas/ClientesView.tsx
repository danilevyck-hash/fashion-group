"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowUpDown, Search } from "lucide-react";
import type { Clientes, Cliente } from "./types";
import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import { formatDeltaRatio, type DeltaTone } from "@/lib/ventas/formatDelta";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ClienteHoverCard, type HistorialState } from "./ClienteHoverCard";
import { ClienteSheet } from "./ClienteSheet";
import { OtrosClientesDialog } from "./OtrosClientesDialog";
import { SortSheet } from "./SortSheet";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { coincideBusqueda } from "@/lib/buscar-normalizado";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { SYNC_NOW_VENTAS_SECUENCIA } from "@/components/shared/syncNowOpciones";

type SortKey = "rank" | "nombre" | "empresa" | "ytd" | "delta" | "ultima";
type SortDir = "asc" | "desc";

// Mapping de tono semántico → clase Tailwind para celdas con bg claro.
// Histórico de Clientes usa red-600 para negativos (no orange-600 como Resumen).
const TONE_LIGHT: Record<DeltaTone, string> = {
  emerald: "text-emerald-600",
  orange:  "text-red-600",
  stone:   "text-gray-500",
};

// Label legible del sort actual para el subtitle del header.
const SORT_LABELS: Record<SortKey, string> = {
  rank:    "rank",
  nombre:  "nombre",
  empresa: "empresa",
  ytd:     "compras YTD",
  delta:   "delta",
  ultima:  "última compra",
};

// Pills visibles del filtro de empresa. Joystep, Confecciones Boston y
// Multifashion se ocultan del filtro (decisión visual). Joystep sigue B2B y
// permanece sumada en el agregado "Todas" — solo se quita su pill.
const EMPRESA_PILLS: { id: string; label: string }[] = [
  { id: "todas",                label: "Todas" },
  { id: "vistana",              label: "Vistana International" },
  { id: "fashion_wear",         label: "Fashion Wear" },
  { id: "fashion_shoes",        label: "Fashion Shoes" },
  { id: "active_shoes",         label: "Active Shoes" },
  { id: "active_wear",          label: "Active Wear" },
];

// Pills donde la fila agregada "Otros clientes" NO se renderiza.
// Boston y Multifashion son retail con semántica propia; no consolidan
// huérfanos en una fila agregada.
const SKIP_OTROS_FOR = new Set(["confecciones_boston", "american_classic"]);

// "VENTAS LOCAL" es el cliente-mostrador (ventas de contado en tienda), no un
// cliente real → se marca y se saca del ranking de clientes. (Distinto de
// "VENTAS MAHER", que sí es cliente real.)
const isVentasLocal = (nombre: string) => nombre.trim().toUpperCase() === "VENTAS LOCAL";

interface ClientesViewProps {
  data: Clientes;
  /** Año del selector global. Para año en curso: vista rolling 12m
   *  (chip "Vista 12m"). Para año cerrado: vista YTD anual (chip "Año 2025"). */
  selectedYear: number;
  isClosedYear: boolean;
}

export function ClientesView({ data: initialData, selectedYear, isClosedYear }: ClientesViewProps) {
  const [search, setSearch] = useState("");
  const [empresa, setEmpresa] = useState("todas");
  const [data, setData] = useState<Clientes>(initialData);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // Sort default: año cerrado → ordenar por compras YTD (vista anual);
  // año en curso → última compra (vista rolling 12m).
  const [sortBy, setSortBy] = useState<SortKey>(isClosedYear ? "ytd" : "ultima");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // PERÍODO (universo) separado del ORDEN: ordenar NUNCA cambia qué clientes se
  // ven. "12m" = universo rolling (todos los activos en 12 meses, incluidos los
  // sin compras este año); "ytd" = estricto del año en curso (ytd>0). Antes esto
  // estaba acoplado al sort y ordenar por "Compras YTD" borraba clientes en
  // silencio. Para año cerrado no aplica (la RPC ya filtra el año).
  const [vista, setVista] = useState<"12m" | "ytd">("12m");
  const [otrosOpen, setOtrosOpen] = useState(false);
  const [sheetCliente, setSheetCliente] = useState<Cliente | null>(null);
  const [sortOpen, setSortOpen] = useState(false);

  // Pill click → refetch desde server (la branching cliente/empresa vive en queries.ts)
  const onEmpresaChange = async (next: string) => {
    if (next === empresa) return;
    setEmpresa(next);
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(
        `/api/ventas/clientes-12m?empresa=${encodeURIComponent(next)}&year=${selectedYear}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const fresh = (await res.json()) as Clientes;
      startTransition(() => setData(fresh));
    } catch (err) {
      console.error("[ventas/clientes] refetch failed", err);
      setFetchError(err instanceof Error ? err.message : "error inesperado");
    } finally {
      setLoading(false);
    }
  };

  // Reload de la lista tras "Actualizar ahora" (misma empresa/año vigentes).
  // La data del tab sale de clientes_empresa_12m_vw → el refetch recién tiene
  // sentido DESPUÉS del paso final refresh-vistas de la secuencia.
  const reloadData = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/ventas/clientes-12m?empresa=${encodeURIComponent(empresa)}&year=${selectedYear}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const fresh = (await res.json()) as Clientes;
      startTransition(() => setData(fresh));
    } catch {
      /* el toast del botón ya informó; la lista queda con lo que había */
    }
  }, [empresa, selectedYear]);

  // Cache de historial-mensual por (codigo + empresaKey). Lazy: solo se
  // popula al primer hover/tap sobre cada cliente. El CXC aging se fetchea
  // y cachea internamente en ClienteHoverCard (cache module-level allá).
  const [historialCache, setHistorialCache] = useState<Record<string, HistorialState>>({});
  const histInFlight = useRef<Set<string>>(new Set());

  const loadHistorial = useCallback((codigo: string, empresaKey: string) => {
    const histKey = `${codigo}|${empresaKey}`;
    if (histInFlight.current.has(histKey)) return;
    let trigger = false;
    setHistorialCache(prev => {
      if (prev[histKey] && prev[histKey].status !== "idle") return prev;
      trigger = true;
      return { ...prev, [histKey]: { status: "loading" } };
    });
    if (!trigger) return;
    histInFlight.current.add(histKey);
    fetch(`/api/clientes/${encodeURIComponent(codigo)}/historial-mensual?empresa=${encodeURIComponent(empresaKey)}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then(data => setHistorialCache(prev => ({ ...prev, [histKey]: { status: "ready", data } })))
      .catch(err => setHistorialCache(prev => ({
        ...prev,
        [histKey]: { status: "error", message: err?.message ?? "Error al cargar" },
      })))
      .finally(() => { histInFlight.current.delete(histKey); });
  }, []);

  // Vista 12m (universo rolling) vs YTD strict — el universo cambia con
  // el sort: cuando el usuario ordena por última compra quiere ver a TODOS
  // los clientes activos en los últimos 12 meses, incluyendo los que no
  // compraron aún en el año en curso. Para cualquier otro sort, la lista
  // se restringe a clientes con compras YTD > 0 (vista "estricta del año").
  //
  // Para años cerrados, la vista rolling 12m no aplica — la RPC clientes_anio
  // ya filtra al año específico. Forzamos is12mView=false.
  const is12mView = !isClosedYear && vista === "12m";

  // Etiquetas del chip "Vista".
  //
  // 🩸 Decían "Últimos 12 meses" mientras la columna de plata decía "Compras
  // YTD" — dos períodos distintos en la misma pantalla, y Daniel lo leyó como
  // una contradicción. No lo era, pero el texto mentía por omisión: el chip
  // elige QUÉ CLIENTES se listan (los que compraron en los últimos 12 meses, o
  // sólo los que compraron este año) y la columna SIEMPRE muestra las compras
  // del AÑO EN CURSO. Ahora el chip dice "Clientes: …" y la columna dice
  // "Compras {año}", así que cada texto nombra lo que de verdad hace.
  const vistaChipLabel = isClosedYear
    ? `Año ${selectedYear}`
    : (is12mView ? "Clientes 12m" : `Clientes ${selectedYear}`);
  const vistaChipLong = isClosedYear
    ? `Año ${selectedYear}`
    : (is12mView ? "Clientes: últimos 12 meses" : `Clientes: con compras en ${selectedYear}`);
  // El período NO se repite en el contador de clientes (limpieza jul-2026): el
  // chip "Vista: …" de al lado ya lo dice y además es clicable para cambiarlo.
  const vistaChipTitle = isClosedYear
    ? `Vista anual: clientes con compras en ${selectedYear} y delta vs ${selectedYear - 1}.`
    : (is12mView
        ? "Universo rolling de 12 meses (incluye clientes sin compras este año). Toca para ver solo el año en curso."
        : "Estricto del año en curso (solo clientes con compras YTD). Toca para ver los últimos 12 meses.");
  // Color del chip: teal cuando 12m rolling (señal "expandido"), stone para
  // YTD strict o año cerrado.
  const vistaChipTone = is12mView ? "bg-teal-50 text-teal-700" : "bg-gray-100 text-gray-700";

  // Universo según el PERÍODO (no el sort). VENTAS LOCAL queda fuera (se muestra
  // marcado aparte, fuera del ranking). Esto define qué huérfanos van a "Otros".
  const universe = useMemo(() => {
    const base = data.rows.filter(c => !isVentasLocal(c.nombre));
    return is12mView ? base : base.filter(c => c.ytd > 0);
  }, [data.rows, is12mView]);

  // Fila-mostrador "VENTAS LOCAL" (si existe en el universo de datos cargado).
  const ventasLocalRow = useMemo<Cliente | null>(
    () => data.rows.find(c => isVentasLocal(c.nombre)) ?? null,
    [data.rows],
  );

  // Huérfanos del universo actual (cliente_id NULL en la materialized view).
  // Sólo aplica para pills B2B; Boston/Multi se manejan sin Otros row.
  const orphans = useMemo(() => {
    if (SKIP_OTROS_FOR.has(empresa)) return [];
    return universe.filter(c => c.isOrphan);
  }, [universe, empresa]);

  // Fila sintética "Otros clientes" — null cuando no hay huérfanos
  // (o cuando la pill activa es Boston/Multi).
  const otrosRow = useMemo<Cliente | null>(() => {
    if (orphans.length === 0) return null;
    const sumYtd  = orphans.reduce((s, o) => s + o.ytd, 0);
    const sumPrev = orphans.reduce((s, o) => s + o.prev, 0);
    // Delta same-period agregado: (Σytd - Σprev) / Σprev. Misma fórmula
    // que aplica el resto del módulo (ver migration 040 fix same-period).
    const aggDelta = sumPrev > 0 ? (sumYtd - sumPrev) / sumPrev : 0;
    const maxUltimaIso = orphans
      .map(o => o.ultimaIso)
      .filter(Boolean)
      .sort()
      .pop() ?? "";
    const ultimaDisplay = maxUltimaIso
      ? orphans.find(o => o.ultimaIso === maxUltimaIso)?.ultima ?? ""
      : "";
    const empresaLabel = empresa === "todas"
      ? "Varias"
      : EMPRESA_KEY_TO_NAME[empresa] ?? empresa;
    return {
      rank: 0,
      id: "",
      nombre: `Otros clientes (${orphans.length})`,
      empresa: empresaLabel,
      empresaKey: empresa === "todas" ? "" : empresa,
      ytd: sumYtd,
      prev: sumPrev,
      delta: aggDelta,
      ultima: ultimaDisplay,
      ultimaIso: maxUltimaIso,
      wa: "",
      empresas_count: 1,
      isOrphan: false,
      isOtrosAggregate: true,
    };
  }, [orphans, empresa]);

  const filtered = useMemo(() => {
    // Masters: universo sin huérfanos.
    const masters = universe.filter(c => !c.isOrphan);
    let r = masters.slice();
    if (search) {
      // 🩸 BUSCAR ALCANZA TAMBIÉN A LOS HUÉRFANOS (27-jul-2026). Antes la
      // búsqueda corría sólo sobre `masters`: un cliente sin match en
      // clientes_master quedaba colapsado dentro de "Otros clientes (N)" y era
      // IMPOSIBLE de encontrar escribiendo su nombre. Medido contra producción:
      // 7 clientes con compras en los últimos 12 meses estaban en ese pozo
      // (CEPREDENAC, NIPMAR, KAREN DUTY FREE, FERIA INT DE DAVID, ISABEL
      // MARTINEZ, ALMACEN JORDANIA, MAZAR CITY SHOES) — justo los que le
      // aparecieron a Daniel al buscar "mult". Escribir un nombre tiene que
      // encontrar al cliente exista o no en el maestro.
      //
      // Y se compara normalizando espacios/acentos/mayúsculas, igual que el
      // módulo Clientes: "multifashion" y "Multi Fashion" son la misma búsqueda.
      r = [...masters, ...orphans].filter(c => coincideBusqueda(search, [c.nombre, c.id]));
    }
    r.sort((a, b) => {
      const sign = sortDir === "asc" ? 1 : -1;
      switch (sortBy) {
        case "rank":    return (a.rank - b.rank) * sign;
        case "nombre":  return a.nombre.localeCompare(b.nombre) * sign;
        case "empresa": return a.empresa.localeCompare(b.empresa) * sign;
        case "ytd":     return (a.ytd - b.ytd) * sign;
        case "delta":   return (a.delta - b.delta) * sign;
        case "ultima":  return a.ultimaIso.localeCompare(b.ultimaIso) * sign;
      }
    });
    // La fila "Otros clientes" no participa del sort: se ancla al final
    // independiente del criterio. Razón: es una agregación de huérfanos
    // que no compite con clientes individuales — colocarla al fondo evita
    // que se mezcle entre clientes reales y confunda la lectura.
    // Con búsqueda activa la fila agregada NO va: sus integrantes ya se están
    // buscando uno por uno, y dejarla puesta mostraba "Otros clientes (7)" como
    // si fuera un resultado de la búsqueda cuando ninguno de los 7 coincidía.
    if (otrosRow && !search) r.push(otrosRow);
    return r;
  }, [universe, orphans, search, sortBy, sortDir, otrosRow]);

  const onSort = (col: SortKey) => {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir(col === "nombre" || col === "empresa" ? "asc" : "desc"); }
  };

  // Lookup helper para HoverCard/Sheet
  const histStateFor = (c: Cliente): HistorialState =>
    historialCache[`${c.id}|${c.empresaKey}`] ?? { status: "idle" };

  // En modo "Todas", mostrar la empresa principal en las cards mobile.
  // En modo empresa específica, la empresa está implícita en el filtro,
  // así que se omite del subtítulo para reducir ruido visual.
  const showEmpresaInCard = empresa === "todas";

  return (
    <div className={cn("space-y-3", loading && "opacity-60 pointer-events-none transition-opacity")}>
      {fetchError && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          No se pudo cargar la lista: {fetchError}
        </div>
      )}

      {/* Sticky header: search + counter + pills + sort button (mobile only). */}
      <div className="sticky top-0 z-20 -mx-1 space-y-2 border-b border-gray-200 bg-gray-50 px-1 pb-2.5 pt-2.5">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <div className="relative min-w-[180px] max-w-full flex-1 md:max-w-[360px]">
            {/* La lupa se centra con top-1/2 (antes top-2.5 asumía el h-9 del
                Input; ahora el campo mide 44 y quedaría alta). */}
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente o código…"
              /* h-11 = 44px táctiles (el default del Input es h-9 = 36) y
                 text-base en móvil para que Safari no haga zoom al enfocar
                 (el default text-sm son 14px). Desde sm vuelve a text-sm. */
              className="h-11 w-full pl-8 text-base sm:text-sm"
            />
          </div>

          {/* Sort button — visible sólo en mobile (md-). En desktop se usan
              los headers de columna clickeables. Texto fijo "Ordenar" para
              dejar más ancho al buscador; la opción actual + dirección se
              muestran adentro del SortSheet al abrirlo. */}
          <button
            type="button"
            onClick={() => setSortOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 active:bg-gray-100 md:hidden"
            aria-label="Ordenar lista"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-500" />
            <span>Ordenar</span>
          </button>

          {/* "Actualizar ahora" (admin/secretaria) — la data de este tab sale
              del vw clientes_empresa_12m: misma secuencia completa que Resumen
              (facturas de las 8 + refresh-vistas al final) y refetch. */}
          <SyncNowButton opciones={SYNC_NOW_VENTAS_SECUENCIA} secuencial onSuccess={reloadData} />

          {/* Counter + chip de vista — desktop: una línea. Mobile: apilado debajo. */}
          <div className="ml-auto hidden flex-wrap items-center justify-end gap-2 whitespace-nowrap text-xs text-gray-500 md:flex">
            <p>
              <span className="font-mono text-gray-950">{filtered.length}</span> clientes activos · ordenados por {SORT_LABELS[sortBy]}
            </p>
            {isClosedYear ? (
              <span
                className={cn("rounded-md px-2 py-0.5 text-xs font-medium", vistaChipTone)}
                title={vistaChipTitle}
              >
                Vista: {vistaChipLong}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setVista(v => (v === "12m" ? "ytd" : "12m"))}
                className={cn("rounded-md px-2 py-0.5 text-xs font-medium transition active:scale-[0.97]", vistaChipTone)}
                title={vistaChipTitle}
              >
                Vista: {vistaChipLong} ⇄
              </button>
            )}
          </div>
        </div>

        {/* Counter mobile — texto en línea 1, chip de vista debajo en
            línea 2 con 6px de separación. Evita que el chip quede pegado
            al texto y dé sensación de amontonamiento. */}
        <div className="md:hidden">
          <div className="text-xs text-gray-500">
            <span className="font-mono text-gray-950">{filtered.length}</span> clientes
          </div>
          {isClosedYear ? (
            <span className={cn("mt-1.5 inline-flex rounded px-1.5 py-0.5 text-xs font-medium", vistaChipTone)}>
              {vistaChipLabel}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setVista(v => (v === "12m" ? "ytd" : "12m"))}
              className={cn("mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium active:scale-[0.97]", vistaChipTone)}
              title={vistaChipTitle}
            >
              {vistaChipLabel} ⇄
            </button>
          )}
        </div>

        <div className="-mx-1 overflow-x-auto px-1" style={{ scrollSnapType: "x proximity" }}>
          <div className="flex flex-nowrap gap-1.5">
            {EMPRESA_PILLS.map(p => {
              const active = empresa === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onEmpresaChange(p.id)}
                  disabled={loading}
                  style={{ scrollSnapAlign: "start" }}
                  className={cn(
                    // Box-sizing idéntico entre estados: ambos llevan border
                    // para que el activo no crezca 1px respecto al inactivo.
                    // Sólo cambian bg, text, y el color del border (mismo
                    // color que el bg en activo para que sea invisible).
                    // 44px, no 40: las pills de empresa son una tira scrollable
                    // y en iPhone se tocan de pasada — 4px de más evitan el
                    // filtro equivocado.
                    "min-h-[44px] whitespace-nowrap rounded-full border px-4 py-2.5 text-xs font-medium transition",
                    active
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-gray-200 bg-white text-gray-700"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─────── Desktop (md+): tabla con headers clickeables ─────── */}
      <Card className="hidden overflow-hidden p-0 md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 920 }}>
            <thead>
              <tr className="bg-gray-100">
                <SortHeader col="rank"    align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>#</SortHeader>
                <SortHeader col="nombre"  align="left"  sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Cliente</SortHeader>
                <SortHeader col="empresa" align="left"  sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Empresa</SortHeader>
                <SortHeader col="ytd"     align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Compras {selectedYear}</SortHeader>
                <SortHeader col="delta"   align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Δ vs 2025</SortHeader>
                <SortHeader col="ultima"  align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Última compra</SortHeader>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, idx) => {
                if (c.isOtrosAggregate) {
                  return (
                    <OtrosRow
                      key="__otros__"
                      c={c}
                      onClick={() => setOtrosOpen(true)}
                    />
                  );
                }
                // Bug #5: el rank original de la materialized view era el
                // orden por compras_ytd DESC global. Como el usuario puede
                // sortear por nombre/empresa/última compra, esos IDs salían
                // desordenados (1, 7, 4, ...). Renumeramos 1..N según el
                // orden visual actual (idx + 1).
                return (
                  <ClienteRow
                    key={`${c.empresaKey}-${c.id}-${c.rank}`}
                    c={c}
                    displayRank={idx + 1}
                    histState={histStateFor(c)}
                    empresaScope={empresa}
                    onTriggerHistorial={() => loadHistorial(c.id, c.empresaKey)}
                  />
                );
              })}
              {ventasLocalRow && !search.trim() && (
                <tr className="bg-amber-50/40">
                  <td className="border-b border-gray-200 px-3.5 py-3 text-right">
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">Mostrador</span>
                  </td>
                  <td className="border-b border-gray-200 px-3.5 py-3 text-sm font-medium text-gray-700" colSpan={2}>
                    {ventasLocalRow.nombre}
                    <span className="ml-2 text-xs font-normal text-gray-500">ventas de contado · fuera del ranking</span>
                  </td>
                  <td className="whitespace-nowrap border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm font-medium text-gray-700 tabular-nums">{fmtMoney(ventasLocalRow.ytd)}</td>
                  <td className="border-b border-gray-200 px-3.5 py-3 text-right text-gray-400">—</td>
                  <td className="whitespace-nowrap border-b border-gray-200 px-3.5 py-3 text-right font-mono text-xs text-gray-500 tabular-nums">{ventasLocalRow.ultima || "—"}</td>
                </tr>
              )}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3.5 py-12 text-center text-sm text-gray-500">
                  No se encontraron clientes con esos filtros.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ─────── Mobile (-md): cards verticales ─────── */}
      <div className="space-y-2 md:hidden">
        {filtered.map(c => {
          if (c.isOtrosAggregate) {
            return (
              <OtrosCard
                key="__otros_card__"
                c={c}
                onTap={() => setOtrosOpen(true)}
              />
            );
          }
          return (
            <ClienteCard
              key={`card-${c.empresaKey}-${c.id}-${c.rank}`}
              c={c}
              showEmpresa={showEmpresaInCard}
              onTap={() => setSheetCliente(c)}
            />
          );
        })}
        {ventasLocalRow && !search.trim() && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">Mostrador</span>
              <span className="text-sm font-medium text-gray-700">{ventasLocalRow.nombre}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
              <span>ventas de contado · fuera del ranking</span>
              <span className="font-mono tabular-nums text-gray-700">{fmtMoney(ventasLocalRow.ytd)}</span>
            </div>
          </div>
        )}
        {filtered.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
            No se encontraron clientes con esos filtros.
          </div>
        )}
      </div>

      <OtrosClientesDialog
        open={otrosOpen}
        onClose={() => setOtrosOpen(false)}
        orphans={orphans}
        showEmpresaColumn={empresa === "todas"}
      />

      {/* Sheet mobile: equivalente del HoverCard desktop. Aparece sólo
          en `md:hidden` (su breakpoint interno). El chip CXC se fetchea
          internamente en ClienteHoverCard. */}
      <ClienteSheet
        open={!!sheetCliente}
        onClose={() => setSheetCliente(null)}
        nombre={sheetCliente?.nombre ?? ""}
        codigo={sheetCliente?.id ?? ""}
        empresa={sheetCliente?.empresa ?? ""}
        empresaScope={empresa}
        historial={sheetCliente ? histStateFor(sheetCliente) : { status: "idle" }}
        onFirstHover={() => {
          if (sheetCliente) loadHistorial(sheetCliente.id, sheetCliente.empresaKey);
        }}
      />

      {/* Sort picker mobile — abre desde el botón "Ordenar" arriba. */}
      <SortSheet
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        sortBy={sortBy === "rank" ? "ultima" : sortBy}
        sortDir={sortDir}
        onChange={(key, dir) => { setSortBy(key); setSortDir(dir); }}
      />
    </div>
  );
}

/**
 * Etiqueta "Del grupo": el cliente es una empresa nuestra comprándole a otra
 * empresa nuestra (Multi Fashion Holding, Confecciones Boston).
 *
 * 🩸 Antes estos clientes NO aparecían: la vista los tiraba con una lista negra.
 * Daniel: *"es un cliente al final del dia. tiene que aparecer"*, *"al final es
 * venta real"*. Y es cierto — Fashion Wear le factura y le tiene que cobrar.
 *
 * ⚠️ La etiqueta NO significa que se reste ni que quede fuera de los totales.
 * **Suma como cualquier otro cliente** (y de hecho SIEMPRE sumó: la exclusión
 * vivía sólo en este ranking, nunca en los totales de venta — medido). Está
 * para responder de un vistazo "¿esto lo vendí en la calle o es de casa?".
 */
function DelGrupoBadge() {
  return (
    <span
      className="ml-1.5 inline-flex shrink-0 items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 py-px align-middle text-[10px] font-medium leading-4 text-violet-700"
      title="Empresa del grupo. Es una venta real y cuenta en los totales igual que cualquier cliente; la marca es sólo para reconocerla."
    >
      Del grupo
    </span>
  );
}

function ClienteRow({
  c,
  displayRank,
  histState,
  empresaScope,
  onTriggerHistorial,
}: {
  c: Cliente;
  /** Rank visual 1..N según el sort actual. Reemplaza c.rank (DB rank
   *  global por compras_ytd DESC) que se veía desordenado cuando el
   *  usuario cambiaba el sort. */
  displayRank: number;
  histState: HistorialState;
  empresaScope: string;
  onTriggerHistorial: () => void;
}) {
  const fmt = formatDeltaRatio(c.delta);
  const isMultiEmpresa = c.empresas_count > 1 && (c.empresas_breakdown?.length ?? 0) > 1;
  // Auto-flip: cliente en la mitad inferior de la viewport → HoverCard se
  // abre hacia arriba (side="top") en vez de a la derecha. Evita que el
  // card se corte cuando el row está cerca del bottom del scroll.
  const [hoverSide, setHoverSide] = useState<"right" | "top">("right");

  const handleHoverEnter = (e: React.SyntheticEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const middle = window.innerHeight / 2;
    setHoverSide(rect.top > middle ? "top" : "right");
  };

  return (
    <tr className="cursor-pointer transition hover:bg-gray-50">
      <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-xs text-gray-500 tabular-nums">{displayRank}</td>
      <td className="border-b border-gray-200 px-3.5 py-3 text-sm text-gray-950">
        {/* Desktop (md+): HoverCard con popover. Mobile (< md): el mismo
            botón dispara onMobileTap → abre ClienteSheet en el padre. */}
        <HoverCard openDelay={250} closeDelay={100}>
          <HoverCardTrigger asChild>
            {/* El nombre es link directo a la ficha (/clientes/[codigo]); el
                HoverCard sigue mostrando el preview al hover en desktop. */}
            <Link
              href={`/clientes/${encodeURIComponent(c.id)}`}
              onMouseEnter={handleHoverEnter}
              onFocus={handleHoverEnter}
              className="block max-w-full text-left font-medium leading-tight hover:text-teal-700"
            >
              {c.nombre}
              {c.esDelGrupo && <DelGrupoBadge />}
            </Link>
          </HoverCardTrigger>
          <HoverCardContent
            side={hoverSide}
            align="start"
            collisionPadding={12}
            className="hidden w-[320px] md:block"
          >
            <ClienteHoverCard
              nombre={c.nombre}
              codigo={c.id}
              empresa={c.empresa}
              empresaScope={empresaScope}
              historial={histState}
              onFirstHover={onTriggerHistorial}
            />
          </HoverCardContent>
        </HoverCard>
        <div className="font-mono text-xs leading-tight text-gray-500">{c.id}</div>
      </td>
      <td className="whitespace-nowrap border-b border-gray-200 px-3.5 py-3 text-xs text-gray-700">
        {isMultiEmpresa ? (
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="cursor-help underline decoration-dotted decoration-gray-300 underline-offset-4 hover:text-gray-950"
                >
                  {c.empresas_count} empresas
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="start"
                sideOffset={4}
                collisionPadding={8}
                className="min-w-[240px] border-0 bg-gray-950 p-3 text-white shadow-lg"
              >
                <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Desglose por empresa
                </div>
                <div className="mt-2 space-y-1">
                  {(c.empresas_breakdown ?? []).map(b => (
                    <div key={b.empresaKey} className="flex justify-between gap-4 text-xs">
                      <span className="text-gray-300">{b.empresaNombre}</span>
                      <span className="font-mono text-white tabular-nums">{fmtMoney(b.monto)}</span>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          c.empresa
        )}
      </td>
      <td className="whitespace-nowrap border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm font-medium text-gray-950 tabular-nums">{fmtMoney(c.ytd)}</td>
      <td className={cn("whitespace-nowrap border-b border-gray-200 px-3.5 py-3 text-right font-mono text-xs tabular-nums", TONE_LIGHT[fmt.tone])}>
        {fmt.arrow && <span className="mr-1">{fmt.arrow}</span>}
        {fmt.displayValue}
      </td>
      <td className="whitespace-nowrap border-b border-gray-200 px-3.5 py-3 text-right font-mono text-xs text-gray-500 tabular-nums">{c.ultima || "—"}</td>
    </tr>
  );
}

/**
 * Fila agregada "Otros clientes (N)" — agrupa huérfanos sin master.
 * Background diferenciado, click abre Dialog con detalle. Sin HoverCard
 * (los promedios cross-cliente no aplican) ni WhatsApp (heterogéneo).
 */
function OtrosRow({ c, onClick }: { c: Cliente; onClick: () => void }) {
  const fmt = formatDeltaRatio(c.delta);
  return (
    <tr
      className="cursor-pointer bg-gray-100 transition hover:bg-gray-200"
      onClick={onClick}
      role="button"
      aria-label="Abrir detalle de otros clientes"
    >
      <td className="border-b border-gray-200 px-3.5 py-3 text-right font-mono text-xs text-gray-400 tabular-nums">—</td>
      <td className="border-b border-gray-200 px-3.5 py-3 text-sm text-gray-950">
        <div className="font-medium leading-tight">{c.nombre}</div>
        <div className="font-mono text-xs leading-tight text-gray-500">click para ver detalle</div>
      </td>
      <td className="whitespace-nowrap border-b border-gray-200 px-3.5 py-3 text-xs text-gray-700">
        {c.empresa}
      </td>
      <td className="whitespace-nowrap border-b border-gray-200 px-3.5 py-3 text-right font-mono text-sm font-medium text-gray-950 tabular-nums">
        {fmtMoney(c.ytd)}
      </td>
      <td className={cn("whitespace-nowrap border-b border-gray-200 px-3.5 py-3 text-right font-mono text-xs tabular-nums", TONE_LIGHT[fmt.tone])}>
        {fmt.arrow && <span className="mr-1">{fmt.arrow}</span>}
        {fmt.displayValue}
      </td>
      <td className="whitespace-nowrap border-b border-gray-200 px-3.5 py-3 text-right font-mono text-xs text-gray-500 tabular-nums">
        {c.ultima || "—"}
      </td>
    </tr>
  );
}

/**
 * Card mobile equivalente a ClienteRow. Tap en cualquier parte (menos el
 * botón WhatsApp) abre el ClienteSheet con el detalle. Touch target del
 * WhatsApp ≥ 44px independiente del icono visual.
 */
function ClienteCard({
  c,
  showEmpresa,
  onTap,
}: {
  c: Cliente;
  showEmpresa: boolean;
  onTap: () => void;
}) {
  const fmt = formatDeltaRatio(c.delta);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } }}
      className="rounded-lg border border-gray-200 bg-white active:bg-gray-50"
    >
      <div className="px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <Link
            href={`/clientes/${encodeURIComponent(c.id)}`}
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 truncate text-[15px] font-medium leading-tight text-gray-950 hover:text-teal-700"
          >
            {c.nombre}
            {c.esDelGrupo && <DelGrupoBadge />}
          </Link>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500">
          <span className="font-mono">{c.id}</span>
          {showEmpresa && c.empresa && (
            <>
              <span aria-hidden className="opacity-50">·</span>
              <span className="truncate">{c.empresa}</span>
            </>
          )}
        </div>

        <div className="mt-3 flex items-baseline gap-3">
          <div className="font-mono text-base font-medium tabular-nums text-gray-950">
            {fmtMoneyCompact(c.ytd)}
          </div>
          <div className={cn("font-mono text-xs tabular-nums", TONE_LIGHT[fmt.tone])}>
            {fmt.arrow && <span className="mr-0.5">{fmt.arrow}</span>}
            {fmt.displayValue}
          </div>
          <div className="ml-auto truncate text-xs text-gray-500">
            {c.ultima || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Card mobile equivalente a OtrosRow. Bg gris, sin WhatsApp; tap abre Dialog. */
function OtrosCard({ c, onTap }: { c: Cliente; onTap: () => void }) {
  const fmt = formatDeltaRatio(c.delta);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } }}
      className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3.5 active:bg-gray-100"
    >
      <div className="text-[15px] font-medium leading-tight text-gray-950">{c.nombre}</div>
      <div className="mt-1 text-xs text-gray-500">Ver detalle de huérfanos sin master</div>
      <div className="mt-3 flex items-baseline gap-3">
        <div className="font-mono text-base font-medium tabular-nums text-gray-950">
          {fmtMoneyCompact(c.ytd)}
        </div>
        <div className={cn("font-mono text-xs tabular-nums", TONE_LIGHT[fmt.tone])}>
          {fmt.arrow && <span className="mr-0.5">{fmt.arrow}</span>}
          {fmt.displayValue}
        </div>
        <div className="ml-auto text-xs text-gray-500">{c.ultima || "—"}</div>
      </div>
    </div>
  );
}

function SortHeader({
  col, align, children, sortBy, sortDir, onClick,
}: {
  col: SortKey; align: "left" | "right"; children: React.ReactNode;
  sortBy: SortKey; sortDir: SortDir; onClick: (c: SortKey) => void;
}) {
  const active = sortBy === col;
  return (
    <th
      onClick={() => onClick(col)}
      className={cn(
        "cursor-pointer select-none whitespace-nowrap border-b border-gray-200 bg-gray-100 px-3.5 py-2.5 text-xs font-medium uppercase tracking-wide transition",
        align === "right" ? "text-right" : "text-left",
        active ? "text-gray-950" : "text-gray-500 hover:text-gray-700"
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={cn("text-xs", active ? "opacity-100" : "opacity-35")}>
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  );
}
