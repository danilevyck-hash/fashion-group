"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Search } from "lucide-react";
import { SkeletonTable } from "@/components/ui";
import { Ayuda } from "@/components/shared/Ayuda";
import {
  fmtMargen,
  fmtMoneySigned,
  exportUtilidadToExcel,
  type UtilidadClienteResponse,
  type UtilidadClienteRow,
} from "@/lib/ventas/utilidad-cliente";

type SortKey = "ventas" | "utilidad" | "margen";
const PAGE = 25;

/** Criterios del selector de orden de las tarjetas. Mismas etiquetas que los
 *  encabezados de la tabla — no se abrevió ni se renombró nada. */
const ORDEN_TARJETAS: { key: SortKey; label: string }[] = [
  { key: "ventas", label: "Ventas" },
  { key: "utilidad", label: "Utilidad" },
  { key: "margen", label: "Margen %" },
];

export function UtilidadView({ selectedYear }: { selectedYear: number }) {
  const [data, setData] = useState<UtilidadClienteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "utilidad", dir: "desc" });
  const [visible, setVisible] = useState(PAGE);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ventas/utilidad-cliente?year=${selectedYear}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as UtilidadClienteResponse;
      setData(json);
      setVisible(PAGE);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error inesperado");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    let r = data.rows;
    if (q) r = r.filter((c) => c.cliente.toLowerCase().includes(q) || c.empresa.toLowerCase().includes(q));
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...r].sort((a, b) => {
      // null margen al fondo siempre (independiente de dir).
      if (sort.key === "margen") {
        if (a.margen == null && b.margen == null) return 0;
        if (a.margen == null) return 1;
        if (b.margen == null) return -1;
      }
      const av = (a[sort.key] ?? -Infinity) as number;
      const bv = (b[sort.key] ?? -Infinity) as number;
      return (av - bv) * dir;
    });
  }, [data, search, sort]);

  const visibleRows = rows.slice(0, visible);
  const negativos = data?.rows.filter((r) => r.utilidad < 0).length ?? 0;

  const toggleSort = (key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  };

  const onExcel = async () => { if (data) await exportUtilidadToExcel(data); };

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setVisible(PAGE); }}
            placeholder="Buscar cliente o empresa…"
            /* h-11 = 44px táctiles; text-base en móvil para que Safari no
               haga zoom al enfocar (text-xs = 12px). Desde sm, text-xs. */
            className="h-11 pl-8 text-base sm:text-xs"
          />
        </div>
        {/* size="sm" da 32px de alto — min-h-[44px] lo lleva al mínimo. */}
        <Button variant="outline" size="sm" onClick={onExcel} disabled={!data || loading} className="min-h-[44px]">
          <Download className="mr-1.5 h-3.5 w-3.5" /> Excel
        </Button>
      </div>

      {/* Ordenar en tarjetas. En la tabla el orden se cambia desde los
          encabezados; sin tabla hacía falta un control propio o el celular se
          quedaba sin poder ordenar. Mismos 3 criterios y mismo toggle
          asc/desc: tocar el criterio activo lo da vuelta. */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 lg:hidden">
        <span className="text-xs text-gray-400">Ordenar por</span>
        {ORDEN_TARJETAS.map((o) => {
          const activo = sort.key === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => toggleSort(o.key)}
              aria-pressed={activo}
              className={`inline-flex min-h-[44px] items-center gap-1 rounded-full border px-3.5 text-xs font-medium transition ${
                activo ? "border-teal-700 bg-teal-700 text-white" : "border-gray-200 bg-white text-gray-700"
              }`}
            >
              {o.label}
              {activo && <span aria-hidden>{sort.dir === "desc" ? "▼" : "▲"}</span>}
            </button>
          );
        })}
      </div>

      {/* Totales + alcance. De dónde sale el costo se aprende UNA vez → ⓘ. Lo
          que sí se queda en pantalla es el aviso de utilidades negativas: eso
          cambia a quién hay que mirar este mes. */}
      {data && !loading && (
        <p className="mb-3 flex flex-wrap items-center text-sm text-gray-600">
          <span>
            Ventas <span className="font-mono font-semibold tabular-nums text-gray-900">{fmtMoneySigned(data.totales.ventas)}</span>
            <span className="mx-2 text-gray-300">·</span>
            Utilidad <span className="font-mono font-semibold tabular-nums text-gray-900">{fmtMoneySigned(data.totales.utilidad)}</span>
            <span className="mx-2 text-gray-300">·</span>
            Margen <span className="font-mono font-semibold tabular-nums text-gray-900">{fmtMargen(data.totales.margen)}</span>
          </span>
          <Ayuda titulo="Cómo se calcula">
            <p>Costo real por documento (5 empresas B2B).</p>
          </Ayuda>
        </p>
      )}

      {data && !loading && negativos > 0 && (
        <p className="mb-3 text-xs text-rose-600">
          {negativos} cliente{negativos === 1 ? "" : "s"} con utilidad negativa (devoluciones netas).
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-700">
          No se pudo cargar la utilidad por cliente. <button onClick={load} className="underline">Reintentar</button>
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <SkeletonTable rows={8} cols={6} />
        </div>
      )}

      {/* ─── Tarjetas (< lg): iPhone e iPad ───────────────────────────────
          🩸 POR QUÉ NO LA TABLA. Medido con scripts/_ancho-util-ventas.mjs, que
          clona la tabla en una jaula de 1 px para que el navegador la colapse a
          su ancho MÍNIMO real (parte los textos donde puede). Ese mínimo es lo
          que la tabla necesita sí o sí:

            · iPhone 390 → mínimo 413 px contra 356 disponibles. Y eso con sólo
              4 columnas visibles: las tres de plata solas ya se comen el ancho y
              al nombre del cliente no le queda nada.
            · iPad 834 → mínimo 635 px contra 552. Ojo con el ancho ÚTIL: la
              barra lateral se lleva 223 px, así que un iPad de 834 deja 552 —
              MÁS ANGOSTO que un iPhone acostado. Por eso el iPad no se arregla
              solo por ser más grande.

          Nada de relleno que sacar ni encabezado que partir alcanza contra un
          faltante de 83 px. Se va a tarjetas, patrón de PanelCxcMobile /
          ResumenViewMobile.

          NO SE PIERDE NINGÚN DATO: la tarjeta trae los 6 campos de la fila,
          incluidos Empresa y Costo, que en la tabla angosta estaban ocultos por
          `sm:`/`md:table-cell`. En celular hoy se ven MÁS números que antes. */}
      {data && !loading && !error && (
        <div className="space-y-2 lg:hidden">
          {visibleRows.length === 0 && (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
              Sin clientes para este filtro.
            </div>
          )}
          {visibleRows.map((r) => (
            <UtilidadCard key={`card|${r.empresaKey}|${r.clienteSwitchId ?? r.cliente}`} r={r} />
          ))}
        </div>
      )}

      {/* ─── Tabla (lg+): el escritorio no se tocó ─────────────────────────
          A 1024 px el útil es 745 y el mínimo de la tabla 635: entra entera.
          De ahí para arriba se queda como estaba. */}
      {data && !loading && !error && (
        <div className="hidden overflow-x-auto rounded-lg border border-gray-200 lg:block">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-[0.04em] text-gray-400">
                <th className="px-3 py-2.5 font-normal">Cliente</th>
                <th className="px-3 py-2.5 font-normal">Empresa</th>
                <SortableTh label="Ventas" active={sort} sortKey="ventas" onClick={toggleSort} />
                <th className="px-3 py-2.5 text-right font-normal">Costo</th>
                <SortableTh label="Utilidad" active={sort} sortKey="utilidad" onClick={toggleSort} />
                <SortableTh label="Margen %" active={sort} sortKey="margen" onClick={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Sin clientes para este filtro.</td></tr>
              )}
              {visibleRows.map((r) => (
                <UtilidadRow key={`${r.empresaKey}|${r.clienteSwitchId ?? r.cliente}`} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && !loading && !error && rows.length > visible && (
        <div className="mt-3 text-center">
          <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE)} className="min-h-[44px]">
            Mostrar más ({rows.length - visible} restantes)
          </Button>
        </div>
      )}
    </div>
  );
}

function SortableTh({
  label, active, sortKey, onClick, className = "",
}: {
  label: string;
  active: { key: SortKey; dir: "asc" | "desc" };
  sortKey: SortKey;
  onClick: (k: SortKey) => void;
  className?: string;
}) {
  const isActive = active.key === sortKey;
  return (
    <th className={`px-3 py-0 text-right font-normal ${className}`}>
      {/* 44 px de alto: el iPad horizontal (1194) también es táctil y cae del
          lado de la tabla. El `py` pasó del th al button para no duplicar alto. */}
      <button
        onClick={() => onClick(sortKey)}
        className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-end gap-0.5 hover:text-gray-700 ${isActive ? "text-gray-900" : ""}`}
      >
        {label}
        <span className="w-2 text-xs">{isActive ? (active.dir === "desc" ? "▼" : "▲") : ""}</span>
      </button>
    </th>
  );
}

/** Clave estable de una fila/tarjeta. El verificador la usa para cruzar la
 *  tarjeta del celular contra la fila del escritorio: es un `data-` fijo, NO una
 *  clase de breakpoint, justo para que mover el corte no deje la búsqueda vacía
 *  y el chequeo pasando en falso. */
const filaKey = (r: UtilidadClienteRow) => `${r.empresaKey}|${r.clienteSwitchId ?? r.cliente}`;

function UtilidadRow({ r }: { r: UtilidadClienteRow }) {
  const neg = r.utilidad < 0;
  // Negativo = devolución neta. Se ve claro (rojo) pero NO como error.
  const utilCls = neg ? "text-rose-600" : "text-gray-900";
  const margenCls = r.margen == null ? "text-gray-400" : r.margen < 0 ? "text-rose-600" : "text-gray-700";
  return (
    <tr data-fila-utilidad={filaKey(r)} className="border-b border-gray-100 hover:bg-gray-50">
      <td data-col="cliente" className="px-3 py-2.5">
        <span className="text-gray-800">{r.cliente}</span>
        {neg && (
          <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-600" title="Devoluciones netas: las notas de crédito superan las ventas del período">
            dev. neta
          </span>
        )}
      </td>
      <td data-col="empresa" className="px-3 py-2.5 text-gray-500">{r.empresa}</td>
      <td data-col="ventas" className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-700">{fmtMoneySigned(r.ventas)}</td>
      <td data-col="costo" className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-500">{fmtMoneySigned(r.costo)}</td>
      <td data-col="utilidad" className={`px-3 py-2.5 text-right font-mono font-medium tabular-nums ${utilCls}`}>{fmtMoneySigned(r.utilidad)}</td>
      <td data-col="margen" className={`px-3 py-2.5 text-right font-mono tabular-nums ${margenCls}`}>{fmtMargen(r.margen)}</td>
    </tr>
  );
}

/**
 * Tarjeta (< lg) equivalente a UtilidadRow. Trae los SEIS campos de la fila con
 * el mismo formateo — mismos `fmtMoneySigned` / `fmtMargen`, ningún redondeo ni
 * abreviatura propia — para que el número que se lee en el celular sea, carácter
 * por carácter, el mismo que el del escritorio.
 */
function UtilidadCard({ r }: { r: UtilidadClienteRow }) {
  const neg = r.utilidad < 0;
  const utilCls = neg ? "text-rose-600" : "text-gray-900";
  const margenCls = r.margen == null ? "text-gray-400" : r.margen < 0 ? "text-rose-600" : "text-gray-700";
  return (
    <div data-fila-utilidad={filaKey(r)} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span data-col="cliente" className="text-[15px] font-medium leading-tight text-gray-900">{r.cliente}</span>
        {neg && (
          <span
            className="rounded bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-600"
            title="Devoluciones netas: las notas de crédito superan las ventas del período"
          >
            dev. neta
          </span>
        )}
      </div>
      <div data-col="empresa" className="mt-0.5 text-xs text-gray-500">{r.empresa}</div>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-gray-400">Ventas</dt>
          <dd data-col="ventas" className="font-mono tabular-nums text-gray-700">{fmtMoneySigned(r.ventas)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-gray-400">Costo</dt>
          <dd data-col="costo" className="font-mono tabular-nums text-gray-500">{fmtMoneySigned(r.costo)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-gray-400">Utilidad</dt>
          <dd data-col="utilidad" className={`font-mono font-medium tabular-nums ${utilCls}`}>{fmtMoneySigned(r.utilidad)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-gray-400">Margen %</dt>
          <dd data-col="margen" className={`font-mono tabular-nums ${margenCls}`}>{fmtMargen(r.margen)}</dd>
        </div>
      </dl>
    </div>
  );
}
