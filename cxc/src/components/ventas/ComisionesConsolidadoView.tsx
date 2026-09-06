"use client";

// La vista «Fashion Group» del módulo Comisiones: matriz vendedor × empresa con
// columna TOTAL destacada. La agregación (el pivote por NOMBRE de vendedor) se
// sigue haciendo acá; lo que cambió es de dónde vienen los datos. Cada celda =
// comisión total de esa empresa (ya netea sus negativos); TOTAL = suma de la
// fila — nunca se redistribuye entre empresas.
//
// 🔴 «FASHION GROUP» SON LAS 6 DEL GRUPO Y NO INCLUYE A MULTIFASHION. Se
// calculan distinto (0,5 % con filtro de utilidad > 20 % contra 0,5 % sobre toda
// la venta) y no se suman nunca; Multifashion es otra OPCIÓN del selector de
// arriba, no una columna de esta matriz. Ver `lib/comisiones/vistas.ts`.
//
// 🩸 ACÁ VIVÍA EL PEOR CASO DE PETICIONES DEL SISTEMA (12-ago-2026). Era un
// `Promise.all` sobre las 5 empresas con un segundo `fetch` anidado adentro:
// **10 peticiones por apertura** —`/api/ventas/comisiones` ×5 en el mismo
// milisegundo y `/api/ventas/comisiones/descuentos` ×5— y **15 consultas a la
// base**. No era un `useEffect` inestable ni componentes duplicados: las deps
// del hook siempre fueron 3 primitivos. Era el bucle sobre empresas, y estaba
// declarado en este mismo comentario desde el día 1.
//
// Ahora es UNA llamada a `/api/ventas/comisiones/consolidado`, que hace las 6
// RPC del lado del servidor y lee los descuentos de las 6 empresas de una sola
// vez. Los números no cambian: la misma RPC con los mismos argumentos y la
// misma regla de descuentos.
//
// 🔴 LA RESTA DE LOS DESCUENTOS NO VIVE ACÁ (24-ago-2026). El servidor manda
// `comision_total` NETO (`netearComisiones`, en `lib/comisiones/descuentos`) y
// esta vista solo lo dibuja. Mientras la resta vivía en este pivot, la vista de
// una empresa —que pide otro endpoint— no la tenía: Reinaldo en Fashion Shoes
// salía $1.573,08 más alto ahí que acá, la misma persona y el mismo mes en la
// misma pantalla. **No volver a restar acá**: sería la segunda resta.
//
// ── 6-sep-2026: cuatro cambios de forma, cero de cálculo ─────────────────────
//  · 🔴 **Una sola forma de decir «nada»: el guion.** La fila mezclaba `—` y
//    `$0.00` y para quien mira significan lo mismo. Medido: en septiembre 2026 la
//    fila de Reynaldo tiene 4 celdas en $0.00 y 2 en `—`, con UN solo número que
//    importa (−$1.513,08). La regla vive en `lib/comisiones/matriz-celda`.
//  · 🔴 **El descuento SE VE en la celda.** Decía `−$1,513.08` sin decir que ahí
//    dentro hay $1.573,08 restados: había que abrir el detalle para enterarse.
//    Ahora, debajo del número, `$60.00 − $1,573.08` (medido en septiembre).
//  · 🔴 **Los que no se pagan (Oficina y Daniel Levy) van detrás de «Ver los que
//    no se pagan».** Así lo visible suma EXACTAMENTE el «Total a pagar» del pie
//    — que es lo que antes no pasaba. El cálculo no cambia: `VENDEDORES_SIN_PAGO`
//    sigue siendo la fuente única y el Excel los sigue llevando.
//  · 🔴 **El detalle se abre ABAJO, no encima.** La matriz son 3 filas y ocupa un
//    tercio de la pantalla; el modal tapaba justo lo que estabas mirando. Al
//    tocar una celda el detalle aparece debajo de la tabla y la celda tocada
//    queda resaltada. El modal SIGUE EXISTIENDO: es lo que se imprime.
//
// Nota de identidad: el pivote es por nombre exacto (no hay vendedor_id en Switch).
// Desde la v8 (3-sep-2026) el SERVIDOR ya junta las grafías de una misma persona
// por `comision_vendedor_alias` (REINALDO/REYNALDO/REINDALDO → REYNALDO ESPINOSA,
// AGUAS → REY STOUTE AGUAS), así que acá llega una fila por persona. Una grafía
// nueva que nadie cargó en el alias sí aparece partida — es dato, no estructura.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui";
import { Coins } from "lucide-react";
import { Ayuda } from "@/components/shared/Ayuda";
import type { ExcelApi } from "./ComisionesView";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";
import { ETIQUETA_DEFAULT } from "@/lib/comisiones/vendedor-default";
import {
  ROTULO_NO_SE_PAGA,
  ROTULO_VER_MENOS,
  rotuloVerNoSePagan,
  sumarPagable,
} from "@/lib/comisiones/sin-pago";
import { estaRetirado } from "@/lib/comisiones/retirados";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { celdaVacia, desgloseDeCelda } from "@/lib/comisiones/matriz-celda";
import { esTodoElAnio, etiquetaPeriodo } from "@/lib/comisiones/periodo";
import type { ClienteSinComision } from "@/lib/comisiones/exclusiones";
import { fmtMoney } from "@/lib/ventas/format";
import { exportComisionesConsolidado, type ComisionConsolidadoRow } from "@/lib/ventas/comisionExcel";
import { ComisionesDetalleModal } from "./ComisionesDetalleModal";
import { ComisionesTarjetasConsolidado } from "./ComisionesTarjetas";

// Las 6 empresas con CXC — joystep incluida desde el 14-ago-2026. La lista
// vive en `lib/comisiones/empresas`, nunca se filtra acá.
const EMPRESAS = EMPRESAS_COMISIONAN;
// El usuario DEFAULT de Switch (la oficina). Desde v6 cobra: sus recibos
// comisionan y se muestran en su propia fila, rotulada ETIQUETA_DEFAULT.
const DEFAULT_VENDEDOR = "DEFAULT";

// Vendedores RETIRADOS de Comisiones (Daniel, 3-ago-2026: *"quita el vendedor
// aguas, no lo quiero ver"*; 3-sep-2026: *"esconder rey stoute"* y *"te dije que
// eliminaras Rey Stoute Aguas."*). La lista vive en `lib/comisiones/retirados`
// y compara por el nombre CANÓNICO: acá vivía como `new Set(["AGUAS"])` y,
// cuando el alias de la v8 empezó a mandar «REY STOUTE AGUAS», la fila volvió a
// aparecer. Se excluye de la tabla **y de los totales**.

interface ApiVendedor {
  vendedor: string;
  base: number;
  base_cobro: number;
  /** NETO: el servidor ya le restó los descuentos fijos activos del mes. */
  comision_total: number;
  /** Cuánto se le restó (informativo — ya está descontado del total). */
  descuento?: number;
  /** false = se calcula y se muestra, pero NO entra al total a pagar (DEFAULT y Daniel). */
  se_paga?: boolean;
  /** Clientes por los que este vendedor NO comisiona en esa empresa (ya restados por la RPC). */
  clientes_sin_comision?: ClienteSinComision[];
}
interface ApiResp {
  empresa_key: string;
  vendedores: ApiVendedor[];
}

interface Row extends ComisionConsolidadoRow {
  /** Lo que se le restó en cada empresa. El total de la celda ya viene neto. */
  descuentoPorEmpresa: Record<string, number>;
  sumBase: number;
  sumBaseCobro: number;
  /** Lo dice el servidor (lib/comisiones/sin-pago); acá solo se pinta y se suma. */
  se_paga: boolean;
  /** Clientes sin comisión de este vendedor, con la empresa de cada uno (para el tooltip). */
  sinComision: (ClienteSinComision & { empresa: string })[];
}

interface Props {
  year: number;
  mes: number;
  /** El botón de descarga vive en la barra del shell (ver ComisionesView): esta
   *  vista sigue siendo la dueña del cálculo y solo registra su función acá. */
  onExcel?: (api: ExcelApi | null) => void;
  /** Cambia cuando "Actualizar ahora" termina: fuerza re-pedir los datos. */
  refreshKey?: number;
}

const moneyClass = (n: number) => (n < 0 ? "text-rose-600" : "text-gray-700");

/** La marca de «se calcula pero no se paga» — DEFAULT y Daniel. Misma en tabla y tarjetas. */
export function MarcaNoSePaga() {
  return (
    <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 align-middle text-[11px] font-normal not-italic text-gray-500">
      {ROTULO_NO_SE_PAGA}
    </span>
  );
}

export function ComisionesConsolidadoView({ year, mes, onExcel, refreshKey = 0 }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sinAsignar, setSinAsignar] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<{ empresa: string; vendedor: string } | null>(null);
  const [verNoSePagan, setVerNoSePagan] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // UNA llamada. El servidor corre las 6 RPC y trae los descuentos de las 6
      // empresas juntos. Con «Todo el año» corre las 6 × los meses del año, y
      // los suma después de netear cada mes.
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
        vendedor, porEmpresa: {}, descuentoPorEmpresa: {}, total: 0,
        sumBase: 0, sumBaseCobro: 0, se_paga: true, sinComision: [],
      });

      for (const r of resp) {
        for (const v of r.vendedores) {
          if (estaRetirado(v.vendedor)) continue; // retirado: fuera de la tabla Y de los totales
          const target = v.vendedor === DEFAULT_VENDEDOR
            ? (def ??= blank(ETIQUETA_DEFAULT))
            : (byName.get(v.vendedor) ?? blank(v.vendedor));
          if (v.vendedor !== DEFAULT_VENDEDOR) byName.set(v.vendedor, target);
          // Una empresa puede repetir vendedor? No, pero sumamos por robustez.
          target.porEmpresa[r.empresa_key] = (target.porEmpresa[r.empresa_key] ?? 0) + (v.comision_total ?? 0);
          target.descuentoPorEmpresa[r.empresa_key] =
            (target.descuentoPorEmpresa[r.empresa_key] ?? 0) + (v.descuento ?? 0);
          target.total += v.comision_total ?? 0;
          target.sumBase += v.base ?? 0;
          target.sumBaseCobro += v.base_cobro ?? 0;
          // La marca es por NOMBRE, así que todas las empresas de la fila
          // dicen lo mismo; con que una diga «no» alcanza.
          if (v.se_paga === false) target.se_paga = false;
          for (const c of v.clientes_sin_comision ?? []) target.sinComision.push({ ...c, empresa: r.empresa_key });
        }
      }

      // Jerarquía: el total por vendedor manda → orden desc por total.
      const all = [...byName.values()].sort((a, b) => b.total - a.total);
      setRows(all);
      setSinAsignar(def);
      setDetalle(null);
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
  /** Con actividad = lo que se dibuja y lo que baja al Excel (igual que antes). */
  const conActividad = useMemo(() => (rows ?? []).filter(hasActivity), [rows]);
  /** Los que SÍ se pagan: son los que suman el total del pie. */
  const activos = useMemo(() => conActividad.filter((r) => r.se_paga !== false), [conActividad]);
  /** Oficina (DEFAULT) y Daniel Levy — detrás de «Ver los que no se pagan». */
  const noSePagan = useMemo(
    () => [...conActividad.filter((r) => r.se_paga === false), ...(sinAsignar ? [sinAsignar] : [])],
    [conActividad, sinAsignar],
  );

  // Totales por columna: SOLO lo pagable. La fila de la oficina y la de Daniel
  // se ven con su número (al abrirlas), pero no suman al pie («no me autopago»).
  const allShown = useMemo(
    () => [...(rows ?? []), ...(sinAsignar ? [sinAsignar] : [])],
    [rows, sinAsignar],
  );
  const colTotal = (key: string) => sumarPagable(allShown, (r) => r.porEmpresa[key] ?? 0);
  const grandTotal = sumarPagable(allShown, (r) => r.total);
  const haySinPago = noSePagan.length > 0;

  const empty = !loading && !error && (rows ?? []).length === 0 && !sinAsignar;

  const handleExport = () => {
    if (empty || !rows) return;
    void exportComisionesConsolidado({
      year,
      mes,
      // Nombre CORTO de la empresa también en el Excel (diccionario § 0).
      empresas: EMPRESAS.map((k) => ({ key: k, nombre: nombreCortoEmpresa(k) })),
      // El Excel lleva a TODOS los que tuvieron actividad, incluidos los que no
      // se pagan (con su marca): esconderlos en pantalla no los borra del papel.
      vendedores: conActividad.map(({ vendedor, porEmpresa, total, se_paga }) => ({ vendedor, porEmpresa, total, se_paga })),
      sinAsignar: sinAsignar
        ? { vendedor: sinAsignar.vendedor, porEmpresa: sinAsignar.porEmpresa, total: sinAsignar.total, se_paga: sinAsignar.se_paga }
        : null,
    });
  };

  // El shell dispara la descarga de la vista activa. La función se guarda en un
  // ref (cambia en cada render, con los datos frescos) y solo se re-registra
  // cuando cambia si el botón va habilitado — así el efecto no corre de más.
  const exportRef = useRef(handleExport);
  exportRef.current = handleExport;
  useEffect(() => {
    onExcel?.({ run: () => exportRef.current(), disabled: empty });
    return () => onExcel?.(null);
  }, [onExcel, empty]);

  // 🔴 CON «TODO EL AÑO» NO SE ABRE EL DETALLE. El reporte por vendedor es de UN
  // mes (`comision_b2b_detalle` recibe year + mes) y armar doce y pegarlos sería
  // otra cuenta del año, además de la que ya suma la matriz. Se dice en el pie
  // en vez de ofrecer un botón que no lleva a ninguna parte.
  const conDetalle = !esTodoElAnio(mes);

  const renderCells = (r: Row) => (
    <>
      {EMPRESAS.map((k) => {
        const val = r.porEmpresa[k];
        const desc = r.descuentoPorEmpresa[k] ?? 0;
        // 🔴 UNA sola forma de decir «nada»: el guion. Sin número o en cero es
        // lo mismo para quien mira — salvo que adentro haya un descuento.
        if (celdaVacia(val, desc)) {
          return <td key={k} className="px-2 py-2.5 text-right tabular-nums text-gray-300 xl:px-3">—</td>;
        }
        const desglose = desgloseDeCelda(val, desc);
        const abierta = detalle?.empresa === k && detalle?.vendedor === claveDetalle(r.vendedor);
        return (
          <td
            key={k}
            onClick={conDetalle ? (e) => { e.stopPropagation(); detalleDe(k, r.vendedor); } : undefined}
            aria-current={abierta ? "true" : undefined}
            className={`px-2 py-2.5 text-right tabular-nums transition xl:px-3 ${
              conDetalle ? "cursor-pointer hover:bg-gray-100 hover:underline" : ""
            } ${abierta ? "bg-gray-900/5 ring-1 ring-inset ring-gray-900/20" : ""} ${
              r.se_paga ? moneyClass(val ?? 0) : "text-gray-400"
            }`}
            title={conDetalle ? `Ver detalle · ${nombreCortoEmpresa(k)}` : undefined}
          >
            {fmtMoney(val ?? 0)}
            {/* 🔴 El descuento SE VE acá: antes había que abrir el detalle para
                saber que dentro de −$1,513.08 hay $1,573.08 restados. */}
            {desglose && (
              <span className="block text-xs font-normal text-gray-500">
                {fmtMoney(desglose.bruto)} − {fmtMoney(desglose.descuento)}
              </span>
            )}
          </td>
        );
      })}
      <td className={`bg-gray-50 px-3 py-2.5 text-right font-semibold tabular-nums xl:px-4 ${!r.se_paga ? "text-gray-400" : r.total < 0 ? "text-rose-600" : "text-gray-900"}`}>
        {fmtMoney(r.total)}
      </td>
    </>
  );

  /** La oficina se muestra con su etiqueta pero se pide con su nombre de Switch. */
  const claveDetalle = (vendedor: string) =>
    vendedor === ETIQUETA_DEFAULT ? DEFAULT_VENDEDOR : vendedor;
  const detalleDe = (empresa: string, vendedor: string) =>
    setDetalle({ empresa, vendedor: claveDetalle(vendedor) });

  const filaVendedor = (r: Row, italica = false) => (
    <tr
      key={r.vendedor}
      data-se-paga={r.se_paga ? "si" : "no"}
      className={`border-b border-gray-100 last:border-0 transition hover:bg-gray-50 ${r.se_paga ? "" : "text-gray-400"}`}
    >
      <td className={`px-3 py-2.5 font-medium xl:whitespace-nowrap xl:px-4 ${italica ? "italic text-gray-500" : r.se_paga ? "text-gray-900" : "text-gray-400"}`}>
        {/* Solo se MUESTRA capitalizado («Reynaldo Espinosa»); la clave de la
            fila, el pivote y el detalle siguen con el nombre tal cual llega. */}
        {nombreVendedorEnPantalla(r.vendedor)}
        {!r.se_paga && <MarcaNoSePaga />}
      </td>
      {renderCells(r)}
    </tr>
  );

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
            Sin comisiones para {etiquetaPeriodo(year, mes)}.
          </div>
        </Card>
      ) : (
        <>
          {/* Celular: TARJETAS. La tabla de 8 columnas medía 984px de contenido
              en 356px útiles → 628px de arrastre lateral (medido a 390px). */}
          <ComisionesTarjetasConsolidado
            activos={activos}
            noSePagan={noSePagan}
            verNoSePagan={verNoSePagan}
            onVerNoSePagan={() => setVerNoSePagan((v) => !v)}
            empresas={EMPRESAS}
            nombreEmpresa={nombreCortoEmpresa}
            granTotal={grandTotal}
            onDetalle={conDetalle ? detalleDe : () => {}}
          />

          {/* iPad y escritorio: la tabla, intacta. */}
          <Card className="hidden overflow-hidden rounded-lg border border-gray-200 lg:block">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium xl:px-4">Vendedor</th>
                  {EMPRESAS.map((k) => (
                    <th key={k} className="px-2 py-2 text-right font-medium xl:whitespace-nowrap xl:px-3">{nombreCortoEmpresa(k)}</th>
                  ))}
                  <th className="bg-gray-100 px-3 py-2 text-right font-semibold text-gray-700 xl:px-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {activos.map((r) => filaVendedor(r))}
                {/* 🔴 Lo que se ve suma EXACTAMENTE el «Total a pagar»: Oficina y
                    Daniel Levy están detrás de este enlace. */}
                {noSePagan.length > 0 && (
                  <tr className="border-b border-gray-100 last:border-0">
                    <td colSpan={EMPRESAS.length + 2} className="px-3 py-1.5 xl:px-4">
                      <button
                        onClick={() => setVerNoSePagan((v) => !v)}
                        aria-expanded={verNoSePagan}
                        /* -my-1 compensa el target de 44px para que la fila de la
                           tabla no crezca más de lo necesario en escritorio. */
                        className="inline-flex min-h-[44px] -my-1 items-center text-xs text-gray-400 transition hover:text-gray-600"
                      >
                        {verNoSePagan ? ROTULO_VER_MENOS : rotuloVerNoSePagan(noSePagan.length)}
                      </button>
                    </td>
                  </tr>
                )}
                {verNoSePagan && noSePagan.map((r) => filaVendedor(r, r.vendedor === ETIQUETA_DEFAULT))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50 font-medium text-gray-900">
                  <td className="px-3 py-2.5 xl:px-4">{haySinPago ? "Total a pagar" : "Total"}</td>
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
        {conDetalle ? "Toca para ver el detalle" : "Elige un mes para ver el detalle"}
        <Ayuda titulo="Cómo se calcula">
          <p>Ya están descontados lo devuelto y los descuentos.</p>
        </Ayuda>
      </p>

      {/* 🔴 EL DETALLE VA ABAJO, NO ENCIMA (6-sep-2026). Es el MISMO componente
          del modal, en modo `inline`: no hay una segunda pantalla de detalle. Y
          sigue siendo el que se imprime — su hoja de impresión viaja en un
          portal, así que imprimir desde acá sale igual que desde el modal. */}
      {detalle && (
        <ComisionesDetalleModal
          inline
          empresa={detalle.empresa}
          empresaNombre={nombreCortoEmpresa(detalle.empresa)}
          year={year}
          mes={mes}
          vendedor={detalle.vendedor}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}
