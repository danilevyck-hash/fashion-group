"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { useLastUsed } from "@/lib/hooks/useLastUsed";
import { SkeletonTable, EmptyState, ScrollableTable, PullToRefresh } from "@/components/ui";
import { getCompanyDisplay } from "@/lib/companies";
import { empresasConCxp } from "@/lib/switch-api/empresas";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { fmt } from "@/lib/format";
import { AGING, type AgingKey } from "@/lib/cxc-aging";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { ROLES_SYNC_PROVEEDORES } from "@/components/shared/syncNowOpciones";

// Las empresas con CxP (empresasConCxp): 6 B2B + Multifashion (american_classic).
const EMPRESAS = empresasConCxp();

// "Actualizar ahora" de la lista: UN clic = CxP de las 7 empresas EN SECUENCIA
// (sesión única Switch — nunca 2 a la vez; ~7s por empresa).
const SYNC_PROVEEDORES_OPCIONES = EMPRESAS.map((k) => ({
  modulo: "proveedores",
  empresa: k as string,
  label: EMPRESA_KEY_TO_NAME[k] ?? k,
}));

// Nombre legible por empresa_key. EMPRESA_KEY_TO_NAME cubre las 7 (incl.
// american_classic → "Multifashion", que companies.ts/getCompanyDisplay no conoce).
function empresaLabel(key: string): string {
  return EMPRESA_KEY_TO_NAME[key] ?? getCompanyDisplay(key);
}

interface ListItem {
  key: string;
  nombre: string;
  saldo_total: number;
  empresas_count: number;
  ultimo_pago_dias: number | null;
  aging_current: number;
  aging_watch: number;
  aging_overdue: number;
}

// useSearchParams exige un boundary de Suspense (misma envoltura que CXC).
export default function ProveedoresListClient() {
  return (
    <Suspense>
      <ProveedoresList />
    </Suspense>
  );
}

function ProveedoresList() {
  const { authChecked } = useAuth({ moduleKey: "proveedores", allowedRoles: ["admin", "contabilidad"] });
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<ListItem[]>([]);
  const [grupoSaldo, setGrupoSaldo] = useState(0);
  // Filtro de empresa, receta CXC (D3): la URL (?empresa=) MANDA si está
  // presente (compartible / sobrevive refresh); si no, cae a la memoria de
  // useLastUsed. Al cambiarlo se escribe en AMBOS. "" = Todas.
  const [urlEmpresa, setUrlEmpresa] = useUrlState("empresa", "");
  const [lastEmpresa, setLastEmpresa] = useLastUsed("proveedores_empresa", "");
  const empresaParamPresent = searchParams.get("empresa") !== null;
  const empresaRaw = empresaParamPresent ? urlEmpresa : lastEmpresa;
  const empresa = (EMPRESAS as string[]).includes(empresaRaw) ? empresaRaw : "";
  const setEmpresa = useCallback((next: string) => {
    setUrlEmpresa(next);
    setLastEmpresa(next);
  }, [setUrlEmpresa, setLastEmpresa]);
  // Búsqueda sembrada desde la URL (?q=), igual que ?search= en CXC.
  const [q, setQ] = useState(() => searchParams.get("q") || "");
  const [loading, setLoading] = useState(true);
  const [showSinSaldo, setShowSinSaldo] = useState(false);
  const [exportando, setExportando] = useState(false);

  const fetchList = useCallback(async (emp: string, query: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (emp) params.set("empresa", emp);
      if (query) params.set("q", query);
      const res = await fetch(`/api/proveedores?${params}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setItems(json.proveedores ?? []);
        setGrupoSaldo(json.grupo_saldo ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = setTimeout(() => fetchList(empresa, q), q ? 200 : 0);
    return () => clearTimeout(h);
  }, [empresa, q, fetchList]);

  if (!authChecked) return null;

  const goFicha = (key: string) => router.push(`/proveedores/${encodeURIComponent(key)}`);

  // El motor de Excel (xlsx-js-style) pesaba 310 kB gzip del arranque de la
  // ruta — más que todo el resto junto — solo para tener el botón. Se carga
  // en el clic, igual que en Guías y Cheques. El botón muestra "Preparando…"
  // mientras baja el chunk para que no parezca que no pasó nada.
  const exportarExcel = async () => {
    if (exportando) return;
    setExportando(true);
    try {
      const { exportProveedoresExcel } = await import("./excel-proveedores");
      const scope = empresa ? empresaLabel(empresa) : "Todo el grupo";
      exportProveedoresExcel(
        items,
        `${scope}${q ? ` — búsqueda: ${q}` : ""} — ${items.length} proveedores`,
        empresa ? empresaLabel(empresa) : undefined
      );
    } finally {
      setExportando(false);
    }
  };

  // Proveedores sin saldo (por pagar = $0) se colapsan bajo un toggle; los que
  // tienen saldo (incluido "a favor" negativo) siempre se muestran.
  const conSaldo = items.filter((it) => Math.abs(it.saldo_total) >= 0.005);
  const sinSaldo = items.filter((it) => Math.abs(it.saldo_total) < 0.005);
  const colsCount = empresa ? 6 : 7;

  const renderRow = (it: ListItem) => (
    <tr
      key={it.key}
      onClick={() => goFicha(it.key)}
      className="border-b border-gray-100 hover:bg-gray-50 transition cursor-pointer"
    >
      <td className="py-2 px-1.5 xl:px-3 font-medium">{it.nombre}</td>
      <AgingCell value={it.aging_current} aging="current" />
      <AgingCell value={it.aging_watch} aging="watch" />
      <AgingCell value={it.aging_overdue} aging="overdue" />
      <SaldoCell value={it.saldo_total} />
      <td className="py-2 px-1.5 xl:px-3 text-right tabular-nums text-gray-500">
        {it.ultimo_pago_dias != null ? `hace ${it.ultimo_pago_dias}d` : <span className="text-gray-300">—</span>}
      </td>
      {!empresa && <td className="py-2 px-1.5 xl:px-3 text-right tabular-nums text-gray-400">{it.empresas_count}</td>}
    </tr>
  );

  const renderCard = (it: ListItem) => (
    <li
      key={it.key}
      onClick={() => goFicha(it.key)}
      className="border-b border-gray-100 px-1 py-3 active:bg-gray-50 cursor-pointer"
    >
      <div className="flex items-baseline justify-between gap-2">
        {/* Heredaba 16px del body y cortaba hasta 46px. text-xs (13px en este
            repo) es lo JUSTO para que entren los 3 nombres largos que se
            cortaban — decisión de Daniel: letra más chica, no dos líneas. */}
        <span className="font-medium truncate text-xs">{it.nombre}</span>
        <span className={`shrink-0 text-sm font-medium tabular-nums ${it.saldo_total < 0 ? "text-blue-600" : it.saldo_total > 0 ? "text-purple-700" : "text-gray-400"}`}>
          {it.saldo_total < 0 ? `+$${fmt(Math.abs(it.saldo_total))}` : `$${fmt(it.saldo_total)}`}
        </span>
      </div>
      <div className="mt-0.5 text-xs text-gray-500 tabular-nums">
        {[
          !empresa && it.empresas_count > 1 ? `${it.empresas_count} empresas` : "",
          it.ultimo_pago_dias != null ? `pago hace ${it.ultimo_pago_dias}d` : "",
        ].filter(Boolean).join(" · ")}
      </div>
      {(it.aging_watch !== 0 || it.aging_overdue !== 0) && (
        <div className="mt-0.5 flex gap-3 text-xs tabular-nums">
          {it.aging_watch !== 0 && <span className={AGING.watch.text}>{AGING.watch.colLabel} ${fmt(it.aging_watch)}</span>}
          {it.aging_overdue !== 0 && <span className={AGING.overdue.text}>{AGING.overdue.colLabel} ${fmt(it.aging_overdue)}</span>}
        </div>
      )}
    </li>
  );

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Proveedores" />
      <PullToRefresh onRefresh={() => fetchList(empresa, q)}>
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Proveedores</h1>
            </div>
            {/* "Actualizar ahora" (admin/secretaria/contabilidad — contabilidad
                es quien vive acá): un clic actualiza el CxP de las 7 empresas
                en secuencia desde Switch. */}
            <SyncNowButton
              opciones={SYNC_PROVEEDORES_OPCIONES}
              secuencial
              roles={ROLES_SYNC_PROVEEDORES}
              subtext="tarda ~1 min"
              onSuccess={async () => { await fetchList(empresa, q); }}
            />
          </div>

          {/* Total por pagar (grupo o empresa filtrada) */}
          <div className="border border-gray-200 rounded-lg p-4 mb-4">
            <div className="text-xs uppercase tracking-[0.05em] text-gray-400">
              {empresa ? `Por pagar · ${empresaLabel(empresa)}` : "Por pagar · grupo"}
            </div>
            <div className={`text-2xl font-semibold tabular-nums mt-1 ${grupoSaldo < 0 ? "text-blue-600" : "text-purple-700"}`}>
              {grupoSaldo < 0 ? `Saldo a favor $${fmt(Math.abs(grupoSaldo))}` : `$${fmt(grupoSaldo)}`}
            </div>
          </div>

          {/* Chips por empresa */}
          <div className="flex flex-wrap gap-2 mb-3">
            <Chip active={empresa === ""} onClick={() => setEmpresa("")}>Todas</Chip>
            {EMPRESAS.map((e) => (
              <Chip key={e} active={empresa === e} onClick={() => setEmpresa(e)}>
                {empresaLabel(e)}
              </Chip>
            ))}
          </div>

          {/* Search */}
          <input
            type="search"
            placeholder="Buscar proveedor…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 min-h-[44px] text-sm outline-none focus:border-black transition mb-4"
          />

          {loading ? (
            <SkeletonTable rows={8} cols={4} />
          ) : items.length === 0 ? (
            <EmptyState title="Sin proveedores" subtitle={q ? "Probá con otra búsqueda." : "No hay datos sincronizados aún."} />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-xs text-gray-500 tabular-nums">
                  {conSaldo.length} {conSaldo.length === 1 ? "proveedor con saldo" : "proveedores con saldo"} · ordenados por monto
                </div>
                {/* min-w fijo: el texto cambia a "Preparando…" mientras baja
                    el chunk de Excel y sin ancho fijo el botón daría un salto. */}
                <button
                  onClick={exportarExcel}
                  disabled={exportando}
                  className="shrink-0 inline-flex min-h-[44px] min-w-[132px] items-center justify-center rounded-md border border-gray-200 px-4 text-xs font-medium text-gray-700 hover:border-gray-300 transition active:scale-[0.97] disabled:text-gray-400 disabled:active:scale-100"
                >
                  {exportando ? "Preparando…" : "Exportar Excel"}
                </button>
              </div>

              {/* Escritorio. El corte es `lg` y no `sm` porque lo que decide es
                  el ancho ÚTIL, no el de la ventana: la barra lateral se lleva
                  224 px, así que un iPad de 834 deja 562 y esta tabla pide 811
                  — 249 px de arrastre, medidos en el navegador. Las tarjetas de
                  abajo ya existían y ya estaban bien; solo se les amplió el
                  tramo. Ver el porqué completo en el encabezado del archivo. */}
              <div data-vista="tabla" className="hidden lg:block">
                <ScrollableTable>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-[0.05em] text-gray-400 border-b border-gray-200">
                        <th className="py-2 px-1.5 xl:px-3">Proveedor</th>
                        <th className="py-2 px-1.5 xl:px-3 text-right">{AGING.current.colLabel}</th>
                        <th className="py-2 px-1.5 xl:px-3 text-right">{AGING.watch.colLabel}</th>
                        <th className="py-2 px-1.5 xl:px-3 text-right">{AGING.overdue.colLabel}</th>
                        <th className="py-2 px-1.5 xl:px-3 text-right">Por pagar</th>
                        <th className="py-2 px-1.5 xl:px-3 text-right">Último pago</th>
                        {!empresa && <th className="py-2 px-1.5 xl:px-3 text-right">Empresas</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {conSaldo.map(renderRow)}
                      {sinSaldo.length > 0 && (
                        <tr className="border-b border-gray-100">
                          <td colSpan={colsCount} className="py-1">
                            <button
                              onClick={() => setShowSinSaldo((v) => !v)}
                              className="inline-flex min-h-[44px] items-center text-xs text-gray-400 hover:text-gray-600 transition"
                            >
                              {showSinSaldo ? "▾" : "▸"} Ver {sinSaldo.length} sin saldo
                            </button>
                          </td>
                        </tr>
                      )}
                      {showSinSaldo && sinSaldo.map(renderRow)}
                    </tbody>
                  </table>
                </ScrollableTable>
              </div>

              {/* Celular e iPad */}
              <ul data-vista="tarjetas" className="border-t border-gray-100 lg:hidden">
                {conSaldo.map(renderCard)}
                {sinSaldo.length > 0 && (
                  <li className="px-1 py-2">
                    <button
                      onClick={() => setShowSinSaldo((v) => !v)}
                      className="inline-flex min-h-[44px] items-center text-xs text-gray-400 hover:text-gray-600 transition"
                    >
                      {showSinSaldo ? "▾" : "▸"} Ver {sinSaldo.length} sin saldo
                    </button>
                  </li>
                )}
                {showSinSaldo && sinSaldo.map(renderCard)}
              </ul>
            </>
          )}
        </main>
      </PullToRefresh>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      // min-h-[44px]: los chips medían 28px de alto (iPhone 390x844).
      className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-xs font-medium border transition active:scale-[0.97] ${
        active ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

// Tramo de aging con el color del vocabulario CXC; cero en gris claro,
// negativo (crédito) en azul.
function AgingCell({ value, aging }: { value: number; aging: AgingKey }) {
  const tone = value === 0 ? "text-gray-300" : value < 0 ? "text-blue-600" : AGING[aging].text;
  return (
    <td className={`py-2 px-1.5 xl:px-3 text-right tabular-nums ${tone}`}>
      {value === 0 ? "—" : value < 0 ? `-$${fmt(Math.abs(value))}` : `$${fmt(value)}`}
    </td>
  );
}

// Por pagar: positivo = púrpura; cero = gris; negativo = "Saldo a favor" azul.
function SaldoCell({ value }: { value: number }) {
  if (value < 0) {
    return <td className="py-2 px-1.5 xl:px-3 text-right tabular-nums text-blue-600">Saldo a favor ${fmt(Math.abs(value))}</td>;
  }
  return (
    <td className={`py-2 px-1.5 xl:px-3 text-right tabular-nums ${value > 0 ? "text-purple-700 font-medium" : "text-gray-400"}`}>
      ${fmt(value)}
    </td>
  );
}
