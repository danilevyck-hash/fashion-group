"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { SkeletonTable, EmptyState, ScrollableTable, PullToRefresh } from "@/components/ui";
import { empresasConCxp } from "@/lib/switch-api/empresas";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { fmt } from "@/lib/format";
import AvisoRechazosSwitch from "@/components/AvisoRechazosSwitch";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { ROLES_SYNC_PROVEEDORES } from "@/components/shared/syncNowOpciones";
import { textoActualizado } from "@/lib/proveedores/actualizado";
import { tonoDeMonto, textoDeMonto } from "@/lib/proveedores/tono";
import { TRAMOS, TRAMOS_KEYS, frasePartida } from "@/lib/proveedores/tramos";
import {
  textoTambienEn,
  type CarteraCxp,
  type EmpresaCxp,
  type ProveedorEnEmpresa,
} from "@/lib/proveedores/por-empresa";

// Las empresas con CxP (empresasConCxp): 6 B2B + Multifashion (american_classic).
// ⚠️ Boston NO está: `cxp: false`, 0 filas, excluida a propósito.
const EMPRESAS = empresasConCxp();

// "Actualizar ahora" de la lista: UN clic = CxP de las 7 empresas EN SECUENCIA
// (sesión única Switch — nunca 2 a la vez; ~7s por empresa).
const SYNC_PROVEEDORES_OPCIONES = EMPRESAS.map((k) => ({
  modulo: "proveedores",
  empresa: k as string,
  label: EMPRESA_KEY_TO_NAME[k] ?? k,
}));

// Cuántas columnas tiene la tabla: Empresa + los cuatro tramos + Por pagar.
const COLUMNAS = TRAMOS.length + 2;

const CARTERA_VACIA: CarteraCxp = {
  empresas: [],
  total: {
    tramos: { t0_90: 0, t91_120: 0, t121_365: 0, tMas365: 0 },
    saldo: { debes: 0, a_favor: 0, por_pagar: 0 },
  },
  proveedores_con_saldo: 0,
  synced_at: null,
};

// useSearchParams exige un boundary de Suspense (misma envoltura que CXC).
export default function ProveedoresListClient() {
  return (
    <Suspense>
      <ProveedoresList />
    </Suspense>
  );
}

/**
 * ── 🔴 LA LISTA SON LAS EMPRESAS, Y CADA UNA SE DESPLIEGA (20-sep-2026) ──────
 *
 * 🩸 Antes la lista eran los 31 proveedores del grupo y una columna decía de
 * qué empresas venía cada uno. Pero la contadora paga POR EMPRESA —cada una con
 * su banco y su chequera—, así que para saber qué debe Fashion Wear había que
 * leer 31 filas buscando cuáles la nombraban. Daniel lo dio vuelta: siete
 * filas, y se toca la que se quiere ver.
 *
 * Lo que la columna «Empresas» decía ahora se lee donde sirve: en la fila del
 * proveedor, «también en Fashion Shoes», con enlace a esa empresa.
 */
function ProveedoresList() {
  const { authChecked } = useAuth({ moduleKey: "proveedores", allowedRoles: ["admin", "contabilidad"] });
  const router = useRouter();

  const [cartera, setCartera] = useState<CarteraCxp>(CARTERA_VACIA);
  const [avisoMontos, setAvisoMontos] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [falloLectura, setFalloLectura] = useState(false);
  // Qué empresa está abierta. Vive en la URL (?empresa=) para que el enlace se
  // pueda compartir y sobreviva al refresco; es un cambio del MISMO nivel, así
  // que va con `replace` y el Back no cicla por las siete.
  const [abierta, setAbierta] = useUrlState("empresa", "");

  // ── 🔴 UNA LECTURA QUE FALLA SE DICE, NO SE DISFRAZA DE «no hay nada» ──────
  // 🩸 11-sep-2026. Este `fetch` ignoraba todo lo que no fuera 200: no guardaba
  // el error, no reintentaba, y la pantalla se quedaba con la lista vacía —o
  // sea, con el cartel «Sin proveedores — No hay datos sincronizados aún»,
  // que es MENTIRA: los datos están, lo que se cayó fue la consulta. Con
  // $4.829.819,40 en la cartera, «no hay nada» es la peor respuesta posible.
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proveedores`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      setCartera({ ...CARTERA_VACIA, ...json });
      setAvisoMontos(json.avisoMontos ?? null);
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
  const alternar = (key: string) => setAbierta(abierta === key ? "" : key);

  // El motor de Excel (xlsx-js-style) pesaba 310 kB gzip del arranque de la
  // ruta — más que todo el resto junto — solo para tener el botón. Se carga
  // en el clic, igual que en Guías y Cheques. El botón muestra "Preparando…"
  // mientras baja el chunk para que no parezca que no pasó nada.
  const exportarExcel = async () => {
    if (exportando) return;
    setExportando(true);
    try {
      const { exportProveedoresExcel } = await import("./excel-proveedores");
      exportProveedoresExcel(cartera);
    } finally {
      setExportando(false);
    }
  };

  const { empresas, total } = cartera;
  const fraseTotal = frasePartida(total.saldo, fmt);

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
            <p className="text-xs text-gray-500 tabular-nums">{textoActualizado(cartera.synced_at)}</p>
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

          {loading && empresas.length === 0 ? (
            <SkeletonTable rows={7} cols={6} />
          ) : empresas.length === 0 ? (
            <EmptyState
              title={falloLectura ? "No se pudo cargar" : "Sin proveedores"}
              subtitle={falloLectura ? "Intenta de nuevo en unos segundos." : "No hay datos sincronizados aún."}
            />
          ) : (
            <>
              <div className="text-xs text-gray-500 tabular-nums mb-2">
                {cartera.proveedores_con_saldo}{" "}
                {cartera.proveedores_con_saldo === 1 ? "proveedor con saldo" : "proveedores con saldo"}
                {" · toca una empresa para ver a quién le debe"}
              </div>

              {/* ── Escritorio ──────────────────────────────────────────────
                  El corte es `lg` y no `sm` porque lo que decide es el ancho
                  ÚTIL, no el de la ventana: la barra lateral se lleva 224 px,
                  así que un iPad de 834 deja 562. Las tarjetas de abajo cubren
                  celular e iPad. */}
              <div data-vista="tabla" className="hidden lg:block">
                <ScrollableTable>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-[0.05em] text-gray-400 border-b border-gray-200">
                        <th className="py-2 px-1.5 xl:px-3">Empresa</th>
                        {TRAMOS.map((t) => (
                          <th key={t.key} className="py-2 px-1.5 xl:px-3 text-right">{t.label}</th>
                        ))}
                        <th className="py-2 px-1.5 xl:px-3 text-right">Por pagar</th>
                      </tr>
                    </thead>
                    {empresas.map((e) => (
                      <FilaEmpresa
                        key={e.empresa_key}
                        empresa={e}
                        abierta={abierta === e.empresa_key}
                        onAlternar={() => alternar(e.empresa_key)}
                        onProveedor={goFicha}
                        onEmpresa={setAbierta}
                      />
                    ))}
                    <tfoot>
                      {/* 🔴 EL TOTAL AL PIE ES LA SUMA DE LAS SIETE EMPRESAS,
                          nunca un número leído aparte. Lo deriva el servidor. */}
                      <tr className="border-t-2 border-gray-300 font-medium">
                        <td className="py-2.5 px-1.5 xl:px-3">Total</td>
                        {TRAMOS_KEYS.map((k) => (
                          <MontoCell key={k} value={total.tramos[k]} viejo={k === "tMas365"} />
                        ))}
                        <MontoCell value={total.saldo.por_pagar} viejo />
                      </tr>
                      {fraseTotal && (
                        <tr>
                          <td colSpan={COLUMNAS} className="pb-2 px-1.5 xl:px-3 text-right text-xs text-gray-500 tabular-nums">
                            {fraseTotal}
                          </td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </ScrollableTable>
              </div>

              {/* ── Celular e iPad ───────────────────────────────────────── */}
              <ul data-vista="tarjetas" className="border-t border-gray-100 lg:hidden">
                {empresas.map((e) => (
                  <TarjetaEmpresa
                    key={e.empresa_key}
                    empresa={e}
                    abierta={abierta === e.empresa_key}
                    onAlternar={() => alternar(e.empresa_key)}
                    onProveedor={goFicha}
                    onEmpresa={setAbierta}
                  />
                ))}
                <li className="flex items-baseline justify-between gap-2 border-t-2 border-gray-300 px-1 py-3 text-sm font-medium">
                  <span>Total</span>
                  <span className={`tabular-nums ${tonoDeMonto(total.saldo.por_pagar)}`}>
                    {textoDeMonto(total.saldo.por_pagar, fmt)}
                  </span>
                </li>
                {fraseTotal && (
                  <li className="px-1 pb-3 text-xs text-gray-500 tabular-nums">{fraseTotal}</li>
                )}
              </ul>
            </>
          )}
        </main>
      </PullToRefresh>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// La empresa y, adentro, sus proveedores. Un `<tbody>` por empresa: así lo
// desplegado son filas de la MISMA tabla y las columnas siguen alineadas.
// ─────────────────────────────────────────────────────────────────────────────
function FilaEmpresa({
  empresa,
  abierta,
  onAlternar,
  onProveedor,
  onEmpresa,
}: {
  empresa: EmpresaCxp;
  abierta: boolean;
  onAlternar: () => void;
  onProveedor: (key: string) => void;
  onEmpresa: (empresaKey: string) => void;
}) {
  const frase = frasePartida(empresa.saldo, fmt);
  const [verSinSaldo, setVerSinSaldo] = useState(false);
  const vacia = empresa.proveedores.length === 0 && empresa.sin_saldo.length === 0;

  return (
    <tbody className="border-b border-gray-200">
      <tr
        onClick={onAlternar}
        aria-expanded={abierta}
        className={`cursor-pointer transition hover:bg-gray-50 ${abierta ? "bg-gray-50" : ""}`}
      >
        <td className="py-3 px-1.5 xl:px-3 font-medium">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="w-3 inline-block text-gray-400">{abierta ? "▾" : "▸"}</span>
            {empresa.nombre}
          </span>
        </td>
        {TRAMOS_KEYS.map((k) => (
          <MontoCell key={k} value={empresa.tramos[k]} viejo={k === "tMas365"} />
        ))}
        <MontoCell value={empresa.saldo.por_pagar} viejo />
      </tr>

      {/* 🔴 LO QUE ESTÁ A FAVOR SE VE. Solo sale cuando lo hay: una frase de
          tres partes con un cero adentro es ruido. */}
      {abierta && frase && (
        <tr>
          <td colSpan={COLUMNAS} className="pb-2 pl-6 pr-1.5 xl:pl-9 xl:pr-3 text-xs text-gray-500 tabular-nums">
            {frase}
          </td>
        </tr>
      )}

      {abierta && vacia && (
        <tr>
          <td colSpan={COLUMNAS} className="pb-3 pl-6 pr-1.5 xl:pl-9 xl:pr-3 text-xs text-gray-500">
            Todavía no hay proveedores traídos de Switch para esta empresa.
          </td>
        </tr>
      )}

      {abierta &&
        empresa.proveedores.map((p) => (
          <FilaProveedor key={p.key} p={p} onProveedor={onProveedor} onEmpresa={onEmpresa} />
        ))}

      {abierta && empresa.sin_saldo.length > 0 && (
        <tr>
          <td colSpan={COLUMNAS} className="pl-6 pr-1.5 xl:pl-9 xl:pr-3">
            <button
              onClick={() => setVerSinSaldo((v) => !v)}
              className="inline-flex min-h-[44px] items-center text-xs text-gray-400 hover:text-gray-600 transition"
            >
              {verSinSaldo ? "▾" : "▸"} Ver {empresa.sin_saldo.length} sin saldo
            </button>
          </td>
        </tr>
      )}
      {abierta &&
        verSinSaldo &&
        empresa.sin_saldo.map((p) => (
          <FilaProveedor key={p.key} p={p} onProveedor={onProveedor} onEmpresa={onEmpresa} />
        ))}
    </tbody>
  );
}

function FilaProveedor({
  p,
  onProveedor,
  onEmpresa,
}: {
  p: ProveedorEnEmpresa;
  onProveedor: (key: string) => void;
  onEmpresa: (empresaKey: string) => void;
}) {
  const frase = frasePartida(p.saldo, fmt);
  return (
    <tr
      onClick={() => onProveedor(p.key)}
      className="border-t border-gray-100 cursor-pointer transition hover:bg-gray-50"
    >
      <td className="py-2 pl-6 pr-1.5 xl:pl-9 xl:pr-3">
        <span className="text-gray-700">{p.nombre}</span>
        <TambienEn empresas={p.tambien_en} onEmpresa={onEmpresa} />
        {frase && <div className="mt-0.5 text-xs text-gray-400 tabular-nums">{frase}</div>}
      </td>
      {TRAMOS_KEYS.map((k) => (
        <MontoCell key={k} value={p.tramos[k]} viejo={k === "tMas365"} />
      ))}
      <MontoCell value={p.saldo.por_pagar} />
    </tr>
  );
}

/**
 * 🔴 «también en Fashion Shoes» — lo que reemplazó a la columna «Empresas».
 * Cada nombre es un botón que ABRE esa empresa, así que frena el clic de la
 * fila (que va a la ficha del proveedor).
 */
function TambienEn({
  empresas,
  onEmpresa,
}: {
  empresas: readonly string[];
  onEmpresa: (empresaKey: string) => void;
}) {
  if (empresas.length === 0) return null;
  return (
    <span className="ml-2 text-xs text-gray-400">
      también en{" "}
      {empresas.map((e, i) => (
        <span key={e}>
          {i > 0 && (i === empresas.length - 1 ? " y " : ", ")}
          <button
            type="button"
            onClick={(ev) => { ev.stopPropagation(); onEmpresa(e); }}
            className="underline decoration-dotted underline-offset-2 transition hover:text-gray-700"
          >
            {EMPRESA_KEY_TO_NAME[e] ?? e}
          </button>
        </span>
      ))}
    </span>
  );
}

function TarjetaEmpresa({
  empresa,
  abierta,
  onAlternar,
  onProveedor,
  onEmpresa,
}: {
  empresa: EmpresaCxp;
  abierta: boolean;
  onAlternar: () => void;
  onProveedor: (key: string) => void;
  onEmpresa: (empresaKey: string) => void;
}) {
  const frase = frasePartida(empresa.saldo, fmt);
  return (
    <li className="border-b border-gray-100">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        className="flex min-h-[44px] w-full items-baseline justify-between gap-2 px-1 py-3 text-left active:bg-gray-50"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <span aria-hidden className="w-3 inline-block text-gray-400">{abierta ? "▾" : "▸"}</span>
          {empresa.nombre}
        </span>
        <span className={`shrink-0 text-sm font-medium tabular-nums ${tonoDeMonto(empresa.saldo.por_pagar)}`}>
          {textoDeMonto(empresa.saldo.por_pagar, fmt)}
        </span>
      </button>
      {abierta && (
        <div className="pb-3 pl-5 pr-1">
          {frase && <p className="mb-2 text-xs text-gray-500 tabular-nums">{frase}</p>}
          {/* Los cuatro tramos, que en el celular no caben como columnas. */}
          <div className="mb-2 grid grid-cols-4 gap-2">
            {TRAMOS.map((t) => (
              <div key={t.key}>
                <div className="text-[11px] text-gray-400">{t.label}</div>
                <div
                  className={`text-xs tabular-nums ${tonoDeMonto(empresa.tramos[t.key])} ${t.key === "tMas365" && empresa.tramos[t.key] !== 0 ? "font-medium" : ""}`}
                >
                  {textoDeMonto(empresa.tramos[t.key], fmt)}
                </div>
              </div>
            ))}
          </div>
          <ul>
            {empresa.proveedores.map((p) => (
              <li key={p.key} className="border-t border-gray-100 py-2">
                <button
                  type="button"
                  onClick={() => onProveedor(p.key)}
                  className="flex w-full items-baseline justify-between gap-2 text-left"
                >
                  <span className="truncate text-xs">{p.nombre}</span>
                  <span className={`shrink-0 text-xs tabular-nums ${tonoDeMonto(p.saldo.por_pagar)}`}>
                    {textoDeMonto(p.saldo.por_pagar, fmt)}
                  </span>
                </button>
                {p.tambien_en.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onEmpresa(p.tambien_en[0])}
                    className="mt-0.5 text-[11px] text-gray-400 underline decoration-dotted underline-offset-2"
                  >
                    {textoTambienEn(p.tambien_en)}
                  </button>
                )}
              </li>
            ))}
            {empresa.proveedores.length === 0 && (
              <li className="py-2 text-xs text-gray-500">
                Todavía no hay proveedores traídos de Switch para esta empresa.
              </li>
            )}
          </ul>
        </div>
      )}
    </li>
  );
}

// 🔴 UN SOLO TONO, nunca rojo ni ámbar: en CxP el dato de Switch es la EDAD del
// documento, no días de mora, así que el color no puede decir «vencido». El
// porqué completo, en `lib/proveedores/tono.ts`. El peso lo da la negrita del
// tramo más viejo, no el color.
function MontoCell({ value, viejo = false }: { value: number; viejo?: boolean }) {
  return (
    <td
      className={`py-2 px-1.5 xl:px-3 text-right tabular-nums ${tonoDeMonto(value)} ${viejo && value !== 0 ? "font-medium" : ""}`}
    >
      {textoDeMonto(value, fmt)}
    </td>
  );
}
