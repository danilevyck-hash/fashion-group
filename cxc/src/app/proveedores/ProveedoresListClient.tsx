"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { SkeletonTable, EmptyState, ScrollableTable, PullToRefresh } from "@/components/ui";
import { empresasConCxp } from "@/lib/switch-api/empresas";
import { EMPRESA_KEY_TO_NAME, nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { fmt } from "@/lib/format";
import { AGING } from "@/lib/cxc-aging";
import { tonoDeMonto, textoDeMonto } from "@/lib/proveedores/tono";
import AvisoRechazosSwitch from "@/components/AvisoRechazosSwitch";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { ROLES_SYNC_PROVEEDORES } from "@/components/shared/syncNowOpciones";
import { textoActualizado } from "@/lib/proveedores/actualizado";

// Las empresas con CxP (empresasConCxp): 6 B2B + Multifashion (american_classic).
const EMPRESAS = empresasConCxp();

// "Actualizar ahora" de la lista: UN clic = CxP de las 7 empresas EN SECUENCIA
// (sesión única Switch — nunca 2 a la vez; ~7s por empresa).
const SYNC_PROVEEDORES_OPCIONES = EMPRESAS.map((k) => ({
  modulo: "proveedores",
  empresa: k as string,
  label: EMPRESA_KEY_TO_NAME[k] ?? k,
}));

interface ListItem {
  key: string;
  nombre: string;
  saldo_total: number;
  // 🔴 DE QUÉ EMPRESAS VIENE. Hasta el 6-sep-2026 acá había un NÚMERO pelado
  // («3») y el proveedor venía partido en varias filas, así que ni el número
  // era cierto: Confecciones Boston salía en 3 filas de 5 empresas y ninguna
  // decía que las otras existían.
  empresas: string[];
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

  const [items, setItems] = useState<ListItem[]>([]);
  const [grupoSaldo, setGrupoSaldo] = useState(0);
  const [avisoMontos, setAvisoMontos] = useState<string | null>(null);
  const [sincronizado, setSincronizado] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSinSaldo, setShowSinSaldo] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [falloLectura, setFalloLectura] = useState(false);

  // ── 🔴 UNA LECTURA QUE FALLA SE DICE, NO SE DISFRAZA DE «no hay nada» ──────
  // 🩸 11-sep-2026. Este `fetch` ignoraba todo lo que no fuera 200: no guardaba
  // el error, no reintentaba, y la pantalla se quedaba con la lista vacía —o
  // sea, con el cartel «Sin proveedores — No hay datos sincronizados aún»,
  // que es MENTIRA: los datos están, lo que se cayó fue la consulta. Con
  // $4.696.830,50 en la cartera, «no hay nada» es la peor respuesta posible.
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proveedores`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      setItems(json.proveedores ?? []);
      setGrupoSaldo(json.grupo_saldo ?? 0);
      setAvisoMontos(json.avisoMontos ?? null);
      setSincronizado(json.synced_at ?? null);
      setFalloLectura(false);
    } catch {
      // No se pisa lo que ya se había leído: si la pantalla tenía datos, se
      // quedan y arriba aparece el aviso con «Intenta de nuevo».
      setFalloLectura(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

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
      exportProveedoresExcel(items);
    } finally {
      setExportando(false);
    }
  };

  // Proveedores sin saldo (por pagar = $0) se colapsan bajo un toggle; los que
  // tienen saldo (incluido "a favor" negativo) siempre se muestran.
  const conSaldo = items.filter((it) => Math.abs(it.saldo_total) >= 0.005);
  const sinSaldo = items.filter((it) => Math.abs(it.saldo_total) < 0.005);
  const colsCount = 7;

  const renderRow = (it: ListItem) => (
    <tr
      key={it.key}
      onClick={() => goFicha(it.key)}
      className="border-b border-gray-100 hover:bg-gray-50 transition cursor-pointer"
    >
      <td className="py-2 px-1.5 xl:px-3 font-medium">{it.nombre}</td>
      <AgingCell value={it.aging_current} />
      <AgingCell value={it.aging_watch} />
      <AgingCell value={it.aging_overdue} viejo />
      <SaldoCell value={it.saldo_total} />
      <td className="py-2 px-1.5 xl:px-3 text-right tabular-nums text-gray-500">
        {it.ultimo_pago_dias != null ? `hace ${it.ultimo_pago_dias}d` : <span className="text-gray-300">—</span>}
      </td>
      <td className="py-2 px-1.5 xl:px-3 text-right text-xs text-gray-500">
        {(it.empresas ?? []).map(nombreCortoEmpresa).join(" · ")}
      </td>
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
          (it.empresas ?? []).map(nombreCortoEmpresa).join(" · "),
          it.ultimo_pago_dias != null ? `pago hace ${it.ultimo_pago_dias}d` : "",
        ].filter(Boolean).join(" — ")}
      </div>
      {(it.aging_watch !== 0 || it.aging_overdue !== 0) && (
        <div className="mt-0.5 flex gap-3 text-xs tabular-nums text-gray-500">
          {it.aging_watch !== 0 && <span>{AGING.watch.colLabel} {textoDeMonto(it.aging_watch, fmt)}</span>}
          {it.aging_overdue !== 0 && <span className="font-medium">{AGING.overdue.colLabel} {textoDeMonto(it.aging_overdue, fmt)}</span>}
        </div>
      )}
    </li>
  );

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Proveedores" />
      <PullToRefresh onRefresh={() => fetchList()}>
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          {/* ── 🔴 ARRIBA, UNA SOLA LÍNEA: CUÁNDO ES EL DATO Y QUÉ SE PUEDE
                 HACER CON ÉL (20-sep-2026) ──────────────────────────────────
              Antes acá arriba había un botón solo, y debajo ocho pestañas de
              empresa y un buscador. Daniel, textual: *«¿por qué buscar
              proveedor si ya está todo en la lista? solo es desplegar»*. Se
              fueron las dos cosas; queda lo que no se podía hacer de ninguna
              otra forma: saber de cuándo es el número y bajarlo. */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h1 className="sr-only">Proveedores</h1>
            {/* 🔑 Sin fecha no se dibuja: nunca «Actualizado: —». */}
            <p className="text-xs text-gray-500 tabular-nums">{textoActualizado(sincronizado)}</p>
            <div className="flex flex-wrap items-center gap-3">
              {/* min-w fijo: el texto cambia a "Preparando…" mientras baja el
                  chunk de Excel y sin ancho fijo el botón daría un salto. */}
              <button
                onClick={exportarExcel}
                disabled={exportando}
                className="shrink-0 inline-flex min-h-[44px] min-w-[132px] items-center justify-center rounded-md border border-gray-200 px-4 text-xs font-medium text-gray-700 hover:border-gray-300 transition active:scale-[0.97] disabled:text-gray-400 disabled:active:scale-100"
              >
                {exportando ? "Preparando…" : "Descargar Excel"}
              </button>
              {/* "Actualizar ahora" (admin/secretaria/contabilidad — contabilidad
                  es quien vive acá): un clic actualiza el CxP de las 7 empresas
                  en secuencia desde Switch. */}
              <SyncNowButton
                opciones={SYNC_PROVEEDORES_OPCIONES}
                secuencial
                roles={ROLES_SYNC_PROVEEDORES}
                subtext="tarda ~1 min"
                onSuccess={async () => { await fetchList(); }}
              />
            </div>
          </div>

          {/* Qué se quedó AFUERA del total de abajo. Arriba del número, igual
              que en el CXC. Sin rechazos no se dibuja nada. */}
          <AvisoRechazosSwitch texto={avisoMontos} className="mb-3" />

          {falloLectura && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <span>No se pudo cargar. Intenta de nuevo en unos segundos.</span>
              <button
                type="button"
                onClick={() => { void fetchList(); }}
                className="min-h-[44px] rounded-md border border-red-300 bg-white px-3 text-sm font-medium text-red-800 transition active:scale-[0.97]"
              >
                Intentar de nuevo
              </button>
            </div>
          )}

          {/* 🔴 Un solo número arriba, y ya no cambia con ningún filtro: la
              pantalla muestra SIEMPRE el grupo entero. */}
          <div className="border border-gray-200 rounded-lg p-4 mb-4">
            <div className="text-xs uppercase tracking-[0.05em] text-gray-400">Por pagar · grupo</div>
            <div className={`text-2xl font-semibold tabular-nums mt-1 ${grupoSaldo < 0 ? "text-blue-600" : "text-purple-700"}`}>
              {grupoSaldo < 0 ? `Saldo a favor $${fmt(Math.abs(grupoSaldo))}` : `$${fmt(grupoSaldo)}`}
            </div>
          </div>

          {loading ? (
            <SkeletonTable rows={8} cols={4} />
          ) : items.length === 0 ? (
            <EmptyState
              title={falloLectura ? "No se pudo cargar" : "Sin proveedores"}
              subtitle={falloLectura ? "Intenta de nuevo en unos segundos." : "No hay datos sincronizados aún."}
            />
          ) : (
            <>
              <div className="text-xs text-gray-500 tabular-nums mb-2">
                {conSaldo.length} {conSaldo.length === 1 ? "proveedor con saldo" : "proveedores con saldo"}
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
                        <th className="py-2 px-1.5 xl:px-3 text-right">Empresas</th>
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


// 🔴 UN SOLO TONO, nunca rojo ni ámbar: en CxP el dato de Switch es la EDAD del
// documento, no días de mora, así que el color no puede decir «vencido». El
// porqué completo, en `lib/proveedores/tono.ts`. El peso lo da la negrita del
// tramo más viejo, no el color.
function AgingCell({ value, viejo = false }: { value: number; viejo?: boolean }) {
  return (
    <td
      className={`py-2 px-1.5 xl:px-3 text-right tabular-nums ${tonoDeMonto(value)} ${viejo && value !== 0 ? "font-medium" : ""}`}
    >
      {textoDeMonto(value, fmt)}
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
