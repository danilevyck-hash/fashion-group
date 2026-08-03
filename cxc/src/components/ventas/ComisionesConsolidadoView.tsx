"use client";

// Vista "Todas las empresas" del tab Comisiones: matriz vendedor × empresa con
// columna TOTAL destacada. V1 = agregación client-side: 5 llamadas en paralelo a
// /api/ventas/comisiones (una por empresa que comisiona) pivoteadas por NOMBRE de
// vendedor. Cada celda = comisión total de esa empresa (ya netea sus negativos);
// TOTAL = suma de la fila — nunca se redistribuye entre empresas. El detalle por
// celda (vendedor, empresa) reutiliza el reporte por empresa.
//
// Nota de identidad: el pivote es por nombre exacto (no hay vendedor_id en Switch).
// Si un mismo vendedor está escrito distinto entre empresas, aparece partido en dos
// filas hasta corregir el nombre en Switch — es dato, no estructura.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui";
import { Coins } from "lucide-react";
import type { ExcelApi } from "./ComisionesView";
import { EMPRESA_KEY_TO_NAME, B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { fmtMoney } from "@/lib/ventas/format";
import { exportComisionesConsolidado, type ComisionConsolidadoRow } from "@/lib/ventas/comisionExcel";
import { ComisionesDetalleModal } from "./ComisionesDetalleModal";
import { ComisionesTarjetasConsolidado } from "./ComisionesTarjetas";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Joystep NO comisiona — fuera de la matriz.
const EMPRESAS = B2B_EMPRESA_KEYS.filter((k) => k !== "joystep");
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

/** Los montos vienen de dos fuentes; sin esto la resta arrastra centavos. */
const round2 = (n: number) => Math.round(n * 100) / 100;

interface ApiVendedor {
  vendedor: string;
  base: number;
  base_cobro: number;
  comision_total: number;
}
interface ApiResp {
  empresa_key: string;
  vendedores: ApiVendedor[];
}

interface Row extends ComisionConsolidadoRow {
  sumBase: number;
  sumBaseCobro: number;
  /** Descuentos fijos activos del mes, ya sumados. Se restan del total. */
  sumDescuento: number;
}

interface Props {
  year: number;
  mes: number;
  /** El botón Excel vive en la barra del shell (ver ComisionesView): esta vista
   *  sigue siendo la dueña del cálculo y solo registra su función acá. */
  onExcel?: (api: ExcelApi | null) => void;
}

const moneyClass = (n: number) => (n < 0 ? "text-rose-600" : "text-gray-700");

export function ComisionesConsolidadoView({ year, mes, onExcel }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sinAsignar, setSinAsignar] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<{ empresa: string; vendedor: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 5 llamadas en paralelo (una por empresa que comisiona).
      const resp = await Promise.all(
        EMPRESAS.map(async (empresa) => {
          const res = await fetch(
            `/api/ventas/comisiones?empresa=${empresa}&year=${year}&mes=${mes}`,
            { cache: "no-store" },
          );
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(`${EMPRESA_KEY_TO_NAME[empresa] ?? empresa}: ${body.error ?? `HTTP ${res.status}`}`);
          }
          const comisiones = (await res.json()) as ApiResp;

          // Descuentos fijos ACTIVOS del mes, de todos los vendedores de la
          // empresa. 🩸 La tabla mostraba el subtotal ANTES de descuentos
          // mientras el detalle sí restaba: Fashion Shoes de Reinaldo decía
          // $2.859,65 cuando lo que se paga son $1.286,57. Daniel: *"me sale en
          // el web el total, y no me resta el descuento"*.
          //
          // Si esta llamada falla NO se tumba la pantalla: se sigue con
          // descuentos en 0 y la tabla queda como estaba antes. Un total de
          // comisiones visible vale más que una pantalla en blanco.
          let porVendedor: Record<string, number> = {};
          try {
            const rd = await fetch(
              `/api/ventas/comisiones/descuentos?empresa=${empresa}&year=${year}&mes=${mes}`,
              { cache: "no-store" },
            );
            if (rd.ok) {
              const body = (await rd.json()) as { porVendedor?: Record<string, number> };
              porVendedor = body.porVendedor ?? {};
            }
          } catch {
            /* se queda en 0 */
          }
          return { ...comisiones, porVendedor };
        }),
      );

      // Pivot por nombre de vendedor.
      const byName = new Map<string, Row>();
      let def: Row | null = null;
      const blank = (vendedor: string): Row => ({
        vendedor, porEmpresa: {}, total: 0, sumBase: 0, sumBaseCobro: 0, sumDescuento: 0,
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
        // El descuento es por (empresa, vendedor), así que se resta de LA CELDA
        // de esa empresa —que es la que Daniel estaba mirando: la columna
        // Fashion Shoes decía $2.859,65 cuando lo que se paga son $1.286,57— y
        // por arrastre del total de la fila.
        for (const [nombre, monto] of Object.entries(r.porVendedor ?? {})) {
          if (!monto || estaOculto(nombre) || nombre === DEFAULT_VENDEDOR) continue;
          const target = byName.get(nombre);
          if (!target) continue; // descuento de alguien sin comisión este mes
          target.porEmpresa[r.empresa_key] = round2((target.porEmpresa[r.empresa_key] ?? 0) - monto);
          target.total = round2(target.total - monto);
          target.sumDescuento = round2(target.sumDescuento + monto);
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
  }, [year, mes]);

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

      <p className="flex items-center gap-1.5 text-xs text-gray-400">
        <Coins className="h-3.5 w-3.5" />
        {/* Antes decía solo "lo devuelto" y por eso el número parecía mal: los
            descuentos fijos NO estaban restados y el detalle sí los restaba. */}
        Ya están descontados lo devuelto y los descuentos · Toca para ver el detalle
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
