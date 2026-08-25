"use client";

// Vista "Todas las empresas" del tab Comisiones: matriz vendedor × empresa con
// columna TOTAL destacada. La agregación (el pivote por NOMBRE de vendedor) se
// sigue haciendo acá; lo que cambió es de dónde vienen los datos. Cada celda =
// comisión total de esa empresa (ya netea sus negativos); TOTAL = suma de la
// fila — nunca se redistribuye entre empresas. El detalle por celda (vendedor,
// empresa) reutiliza el reporte por empresa.
//
// 🩸 ACÁ VIVÍA EL PEOR CASO DE PETICIONES DEL SISTEMA (12-ago-2026). Era un
// `Promise.all` sobre las 5 empresas con un segundo `fetch` anidado adentro:
// **10 peticiones por apertura** —`/api/ventas/comisiones` ×5 en el mismo
// milisegundo y `/api/ventas/comisiones/descuentos` ×5— y **15 consultas a la
// base**. No era un `useEffect` inestable ni componentes duplicados: las deps
// del hook siempre fueron 3 primitivos. Era el bucle sobre empresas, y estaba
// declarado en este mismo comentario desde el día 1.
//
// Ahora es UNA llamada a `/api/ventas/comisiones/consolidado`, que hace las 5
// RPC del lado del servidor y lee los descuentos de las 5 empresas de una sola
// vez (7 consultas en vez de 15). Los números no cambian: la misma RPC con los
// mismos argumentos y la misma regla de descuentos.
//
// 🔴 LA RESTA DE LOS DESCUENTOS YA NO VIVE ACÁ (24-ago-2026). El servidor manda
// `comision_total` NETO (`netearComisiones`, en `lib/comisiones/descuentos`) y
// esta vista solo lo dibuja. Mientras la resta vivía en este pivot, la pestaña
// "Por empresa" —que pide otro endpoint— no la tenía: Reinaldo en Fashion
// Shoes salía $1.573,08 más alto ahí que acá, la misma persona y el mismo mes
// en la misma pantalla. **No volver a restar acá**: sería la segunda resta, y
// la primera ya está hecha.
//
// Nota de identidad: el pivote es por nombre exacto (no hay vendedor_id en Switch).
// Si un mismo vendedor está escrito distinto entre empresas, aparece partido en dos
// filas hasta corregir el nombre en Switch — es dato, no estructura.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui";
import { Coins } from "lucide-react";
import { Ayuda } from "@/components/shared/Ayuda";
import type { ExcelApi } from "./ComisionesView";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";
import { fmtMoney } from "@/lib/ventas/format";
import { exportComisionesConsolidado, type ComisionConsolidadoRow } from "@/lib/ventas/comisionExcel";
import { ComisionesDetalleModal } from "./ComisionesDetalleModal";
import { ComisionesTarjetasConsolidado } from "./ComisionesTarjetas";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Las 6 empresas con CXC — joystep incluida desde el 14-ago-2026. La lista
// vive en `lib/comisiones/empresas`, nunca se filtra acá.
const EMPRESAS = EMPRESAS_COMISIONAN;
const DEFAULT_VENDEDOR = "DEFAULT"; // centinela "cliente sin dueño"

// Vendedores que NO se muestran en Comisiones. Daniel, 3-ago-2026: *"quita el
// vendedor aguas, no lo quiero ver"*.
//
// ⚠️ Se excluye de la TABLA **y de los totales**. AGUAS es un vendedor real en
// Switch (4 facturas de julio en Vistana por $1.148 → $34,66 de comisión), así
// que esconder solo la fila dejaría un total que no cuadra con lo que se ve —
// y un total que no cuadra es lo que hace que nadie vuelva a confiar en la
// pantalla. Es una lista para que agregar otro sea una línea, no un rediseño.
const VENDEDORES_OCULTOS = new Set(["AGUAS"]);

const estaOculto = (v: string) => VENDEDORES_OCULTOS.has(v.trim().toUpperCase());

interface ApiVendedor {
  vendedor: string;
  base: number;
  base_cobro: number;
  /** NETO: el servidor ya le restó los descuentos fijos activos del mes. */
  comision_total: number;
  /** Cuánto se le restó (informativo — ya está descontado del total). */
  descuento?: number;
}
interface ApiResp {
  empresa_key: string;
  vendedores: ApiVendedor[];
}

interface Row extends ComisionConsolidadoRow {
  sumBase: number;
  sumBaseCobro: number;
}

interface Props {
  year: number;
  mes: number;
  /** El botón Excel vive en la barra del shell (ver ComisionesView): esta vista
   *  sigue siendo la dueña del cálculo y solo registra su función acá. */
  onExcel?: (api: ExcelApi | null) => void;
  /** Cambia cuando "Actualizar ahora" termina: fuerza re-pedir los datos. */
  refreshKey?: number;
}

const moneyClass = (n: number) => (n < 0 ? "text-rose-600" : "text-gray-700");

export function ComisionesConsolidadoView({ year, mes, onExcel, refreshKey = 0 }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sinAsignar, setSinAsignar] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<{ empresa: string; vendedor: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // UNA llamada. El servidor corre las 5 RPC y trae los descuentos de las 5
      // empresas juntos.
      //
      // Los descuentos siguen fallando ABIERTO del lado del servidor: si su
      // lectura se cae, la tabla sale con descuentos en 0 en vez de quedar en
      // blanco. 🩸 La tabla mostraba el subtotal ANTES de descuentos mientras
      // el detalle sí restaba: Fashion Shoes de Reinaldo decía $2.859,65
      // cuando lo que se paga son $1.286,57. Daniel: *"me sale en el web el
      // total, y no me resta el descuento"*.
      const res = await fetch(
        `/api/ventas/comisiones/consolidado?year=${year}&mes=${mes}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(String(body.error ?? `HTTP ${res.status}`));
      }
      const { empresas } = (await res.json()) as { empresas?: ApiResp[] };
      const resp = empresas ?? [];

      // Pivot por nombre de vendedor.
      const byName = new Map<string, Row>();
      let def: Row | null = null;
      const blank = (vendedor: string): Row => ({
        vendedor, porEmpresa: {}, total: 0, sumBase: 0, sumBaseCobro: 0,
      });

      for (const r of resp) {
        for (const v of r.vendedores) {
          if (estaOculto(v.vendedor)) continue; // fuera de la tabla Y de los totales
          const target = v.vendedor === DEFAULT_VENDEDOR
            ? (def ??= blank("Sin asignar"))
            : (byName.get(v.vendedor) ?? blank(v.vendedor));
          if (v.vendedor !== DEFAULT_VENDEDOR) byName.set(v.vendedor, target);
          // Una empresa puede repetir vendedor? No, pero sumamos por robustez.
          target.porEmpresa[r.empresa_key] = (target.porEmpresa[r.empresa_key] ?? 0) + (v.comision_total ?? 0);
          target.total += v.comision_total ?? 0;
          target.sumBase += v.base ?? 0;
          target.sumBaseCobro += v.base_cobro ?? 0;
        }
      }

      // Jerarquía: el total por vendedor manda → orden desc por total.
      const all = [...byName.values()].sort((a, b) => b.total - a.total);
      setRows(all);
      setSinAsignar(def);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar. Intenta de nuevo.");
      setRows(null);
      setSinAsignar(null);
    } finally {
      setLoading(false);
    }
  }, [year, mes, refreshKey]);

  useEffect(() => { void load(); }, [load]);

  const hasActivity = (r: Row) => r.total !== 0 || r.sumBase !== 0 || r.sumBaseCobro !== 0;
  const activos = useMemo(() => (rows ?? []).filter(hasActivity), [rows]);
  const inactivos = useMemo(() => (rows ?? []).filter((r) => !hasActivity(r)), [rows]);
  const [showInactivos, setShowInactivos] = useState(false);

  // Totales por columna (incluye "Sin asignar"; los inactivos suman 0).
  const allShown = useMemo(
    () => [...(rows ?? []), ...(sinAsignar ? [sinAsignar] : [])],
    [rows, sinAsignar],
  );
  const colTotal = (key: string) => allShown.reduce((a, r) => a + (r.porEmpresa[key] ?? 0), 0);
  const grandTotal = allShown.reduce((a, r) => a + r.total, 0);

  const empty = !loading && !error && (rows ?? []).length === 0 && !sinAsignar;

  const handleExport = () => {
    if (empty || !rows) return;
    void exportComisionesConsolidado({
      year,
      mes,
      empresas: EMPRESAS.map((k) => ({ key: k, nombre: EMPRESA_KEY_TO_NAME[k] ?? k })),
      vendedores: activos.map(({ vendedor, porEmpresa, total }) => ({ vendedor, porEmpresa, total })),
      sinAsignar: sinAsignar
        ? { vendedor: sinAsignar.vendedor, porEmpresa: sinAsignar.porEmpresa, total: sinAsignar.total }
        : null,
    });
  };

  // El shell dispara el Excel de la vista activa. La función se guarda en un
  // ref (cambia en cada render, con los datos frescos) y solo se re-registra
  // cuando cambia si el botón va habilitado — así el efecto no corre de más.
  const exportRef = useRef(handleExport);
  exportRef.current = handleExport;
  useEffect(() => {
    onExcel?.({ run: () => exportRef.current(), disabled: empty });
    return () => onExcel?.(null);
  }, [onExcel, empty]);

  const renderCells = (r: Row, isTotalBold: boolean) => (
    <>
      {EMPRESAS.map((k) => {
        const val = r.porEmpresa[k];
        if (val === undefined) {
          return <td key={k} className="px-2 py-2.5 text-right tabular-nums text-gray-300 xl:px-3">—</td>;
        }
        return (
          <td
            key={k}
            onClick={(e) => { e.stopPropagation(); setDetalle({ empresa: k, vendedor: r.vendedor === "Sin asignar" ? DEFAULT_VENDEDOR : r.vendedor }); }}
            className={`cursor-pointer px-2 py-2.5 text-right tabular-nums transition hover:bg-gray-100 hover:underline xl:px-3 ${moneyClass(val)}`}
            title={`Ver detalle · ${EMPRESA_KEY_TO_NAME[k] ?? k}`}
          >
            {fmtMoney(val)}
          </td>
        );
      })}
      <td className={`bg-gray-50 px-3 py-2.5 text-right font-semibold tabular-nums xl:px-4 ${r.total < 0 ? "text-rose-600" : "text-gray-900"} ${isTotalBold ? "" : ""}`}>
        {fmtMoney(r.total)}
      </td>
    </>
  );

  const detalleDe = (empresa: string, vendedor: string) =>
    setDetalle({ empresa, vendedor: vendedor === "Sin asignar" ? DEFAULT_VENDEDOR : vendedor });

  return (
    <div className="space-y-4">
      {loading ? (
        <Card className="overflow-hidden rounded-lg border border-gray-200">
          <div className="p-3"><SkeletonTable rows={6} cols={6} /></div>
        </Card>
      ) : error ? (
        <Card className="overflow-hidden rounded-lg border border-gray-200">
          <div className="p-8 text-center text-sm">
            <p className="text-rose-600">{error}</p>
            <button
              onClick={() => void load()}
              className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]"
            >
              Reintentar
            </button>
          </div>
        </Card>
      ) : empty ? (
        <Card className="overflow-hidden rounded-lg border border-gray-200">
          <div className="p-8 text-center text-sm text-gray-500">
            Sin comisiones para {MESES[mes - 1]} {year}.
          </div>
        </Card>
      ) : (
        <>
          {/* Celular: TARJETAS. La tabla de 7 columnas medía 984px de contenido
              en 356px útiles → 628px de arrastre lateral (medido a 390px). */}
          <ComisionesTarjetasConsolidado
            activos={activos}
            sinAsignar={sinAsignar}
            inactivos={inactivos}
            mostrarInactivos={showInactivos}
            onToggleInactivos={() => setShowInactivos((v) => !v)}
            empresas={EMPRESAS}
            nombreEmpresa={(k) => EMPRESA_KEY_TO_NAME[k] ?? k}
            granTotal={grandTotal}
            onDetalle={detalleDe}
          />

          {/* iPad y escritorio: la tabla, intacta. */}
          <Card className="hidden overflow-hidden rounded-lg border border-gray-200 lg:block">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium xl:px-4">Vendedor</th>
                  {EMPRESAS.map((k) => (
                    <th key={k} className="px-2 py-2 text-right font-medium xl:whitespace-nowrap xl:px-3">{EMPRESA_KEY_TO_NAME[k] ?? k}</th>
                  ))}
                  <th className="bg-gray-100 px-3 py-2 text-right font-semibold text-gray-700 xl:px-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {activos.map((r) => (
                  <tr key={r.vendedor} className="border-b border-gray-100 last:border-0 transition hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium text-gray-900 xl:whitespace-nowrap xl:px-4">{r.vendedor}</td>
                    {renderCells(r, false)}
                  </tr>
                ))}
                {sinAsignar && (
                  <tr className="border-b border-gray-100 bg-gray-50/50 last:border-0 transition hover:bg-gray-50">
                    <td className="px-3 py-2.5 italic text-gray-500 xl:whitespace-nowrap xl:px-4">Sin asignar</td>
                    {renderCells(sinAsignar, false)}
                  </tr>
                )}
                {inactivos.length > 0 && (
                  <tr className="border-b border-gray-100 last:border-0">
                    <td colSpan={EMPRESAS.length + 2} className="px-3 py-1.5 xl:px-4">
                      <button
                        onClick={() => setShowInactivos((v) => !v)}
                        /* Era texto suelto de 18 px de alto dentro de la fila.
                           -my-1 compensa para que la fila de la tabla no crezca
                           más de lo necesario en escritorio. */
                        className="inline-flex min-h-[44px] -my-1 items-center text-xs italic text-gray-400 transition hover:text-gray-600"
                      >
                        {showInactivos ? "▾" : "▸"} {inactivos.length} {inactivos.length === 1 ? "vendedor" : "vendedores"} sin actividad este mes
                      </button>
                    </td>
                  </tr>
                )}
                {showInactivos && inactivos.map((r) => (
                  <tr key={r.vendedor} className="border-b border-gray-100 text-gray-400 last:border-0 transition hover:bg-gray-50">
                    <td className="px-3 py-2.5 xl:whitespace-nowrap xl:px-4">{r.vendedor}</td>
                    {renderCells(r, false)}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50 font-medium text-gray-900">
                  <td className="px-3 py-2.5 xl:px-4">Total</td>
                  {EMPRESAS.map((k) => {
                    const t = colTotal(k);
                    return <td key={k} className={`px-2 py-2.5 text-right tabular-nums xl:px-3 ${t < 0 ? "text-rose-600" : ""}`}>{fmtMoney(t)}</td>;
                  })}
                  <td className={`bg-gray-100 px-3 py-2.5 text-right font-semibold tabular-nums xl:px-4 ${grandTotal < 0 ? "text-rose-600" : "text-gray-900"}`}>{fmtMoney(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
            </div>
          </Card>
        </>
      )}

      {/* "Toca para ver el detalle" SE QUEDA: es la única señal de que la celda
          se puede abrir, y esconderla detrás de un ⓘ sería lo mismo que
          borrarla. Lo que pasa al ⓘ es la metodología —qué ya viene restado—,
          que se aprende una vez.
          🩸 Ese texto NO se borra nunca: antes decía solo "lo devuelto" y el
          número parecía mal, porque los descuentos fijos no estaban restados en
          la matriz y el detalle sí los restaba. */}
      <p className="flex items-center gap-1.5 text-xs text-gray-400">
        <Coins className="h-3.5 w-3.5" />
        Toca para ver el detalle
        <Ayuda titulo="Cómo se calcula">
          <p>Ya están descontados lo devuelto y los descuentos.</p>
        </Ayuda>
      </p>

      {detalle && (
        <ComisionesDetalleModal
          empresa={detalle.empresa}
          empresaNombre={EMPRESA_KEY_TO_NAME[detalle.empresa] ?? detalle.empresa}
          year={year}
          mes={mes}
          vendedor={detalle.vendedor}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}
