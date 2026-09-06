"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Tarjetas de Comisiones — EL layout del celular (<md). Las dos vistas del
// módulo (Todas las empresas / Por empresa) lo comparten, así que el mecanismo
// vive en UN archivo y no en dos copias.
//
// ── 🩸 POR QUÉ (medido, 30-jul-2026, build de producción, datos reales) ──────
//
// La tabla de /comisiones tiene 7 columnas en "Todas las empresas" (Vendedor +
// 5 empresas + Total) y 6 en "Por empresa". A 390px eso NO entra, y las dos
// fallaban distinto:
//
//   Todas las empresas ... 984px de contenido en 356px útiles → **628px** de
//        arrastre lateral dentro del `overflow-x-auto`. La columna Total —la
//        que se va a mirar— quedaba fuera de la pantalla.
//   Por empresa .......... 636px de contenido y NI SIQUIERA arrastraba: el
//        `Card` de arriba tiene `overflow-hidden`, así que **279px quedaban
//        RECORTADOS** y "Com. cobro" y "Com. total" no se podían ver de
//        ninguna manera. Peor que el scroll: invisible y sin aviso.
//
// Daniel ya pidió lo mismo en todo el sistema: en el celular, tabla ancha →
// TARJETAS. El patrón de referencia es `app/cxc/components/PanelCxcMobile.tsx`
// (las tarjetas de CXC) y esto lo sigue: `<article>` redondeada con borde, el
// nombre truncado a una línea, el número en `font-mono tabular-nums`, targets
// de 44px y el detalle a un toque.
//
// **Ningún número cambia.** Se usa el MISMO `fmtMoney` que la tabla (no el
// formato compacto: una comisión es plata que se le paga a alguien, así que van
// los centavos). Lo único que cambia es la forma de mostrarlo. El nombre va
// capitalizado («Reynaldo Espinosa», `nombreVendedorEnPantalla`) igual que en
// la tabla; la `key` y el detalle siguen con el nombre tal cual llega.
//
// Escritorio e iPad (≥md) siguen viendo la tabla, intacta.
//
// ── 6-sep-2026: tres cambios de forma, cero de cálculo ───────────────────────
//  · **`text-sm` (14 px) mínimo para los DATOS.** Era el ÚNICO lugar del módulo
//    por debajo del piso de la casa: los montos iban en `text-xs` (12 px) y el
//    nombre del vendedor en `text-[13px]`. Las ETIQUETAS («Ventas», «Com. venta»,
//    el nombre de la empresa) se quedan en 12: son rótulos, no datos.
//  · **La línea «N vendedores sin actividad este mes» se fue** — un renglón para
//    decir que no hay nada que decir. En su lugar está «Ver los que no se pagan»,
//    que sí esconde números (Oficina y Daniel Levy) y hace que lo visible sume
//    exactamente el total del pie.
//  · **Una sola forma de decir «nada»: el guion** (`lib/comisiones/matriz-celda`),
//    la misma que la tabla. Y donde hay descuento, la celda lo DICE.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type ReactNode } from "react";
import { fmtMoney } from "@/lib/ventas/format";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { ROTULO_NO_SE_PAGA, ROTULO_VER_MENOS, rotuloVerNoSePagan } from "@/lib/comisiones/sin-pago";
import { celdaVacia, desgloseDeCelda } from "@/lib/comisiones/matriz-celda";
import type { ClienteSinComisionConEmpresa } from "./MarcaClientesSinComision";

/** Rojo para lo negativo, igual que la tabla. */
const claseMonto = (n: number) => (n < 0 ? "text-rose-600" : "text-gray-900");

// ── Piezas compartidas ───────────────────────────────────────────────────────

/**
 * Contenedor de la lista de tarjetas. Celular **y iPad vertical** (<lg).
 *
 * 🩸 EL CORTE ES `lg` (1024px) Y NO `md`, Y ES ARITMÉTICA, NO GUSTO. Medido a
 * 834px (iPad vertical): dentro de la tarjeta hay **552px** útiles — el
 * viewport miente porque la barra lateral se lleva ~225px. Los DATOS de las 7
 * columnas de "Todas las empresas", puro texto, sin un solo píxel de relleno y
 * sin encabezados, miden **554px**. O sea que la tabla no entra a 834px por
 * 2px ANTES de dibujar una sola línea: no hay abreviatura ni relleno que la
 * haga entrar. A 1024px sí entra (742 útiles), y ahí se muestra la tabla.
 */
function ListaTarjetas({ children }: { children: ReactNode }) {
  return <ul className="space-y-2 lg:hidden">{children}</ul>;
}

/**
 * Cierre de la lista con el total del mes. Va ABAJO, en el mismo lugar que el
 * `<tfoot>` de la tabla: si fuera un "hero" arriba empujaría la primera fila y
 * se comería el encabezado de 193px que costó ganar
 * (`__tests__/iphone-comisiones-encabezado.test.ts`).
 */
function TarjetaTotal({ total, aPagar }: { total: number; aPagar?: boolean }) {
  return (
    <li>
      {/* data-comision-total: gancho de MEDICIÓN. Antes el verificador buscaba
          la tarjeta por su clase de breakpoint (`.md\:hidden`) y al mover el
          corte de md a lg se quedó leyendo null — o sea que el chequeo de "el
          total no cambió" pasó a no chequear nada. El gancho no depende de
          cómo esté maquetado. */}
      <div
        data-comision-total
        className="flex items-center justify-between gap-2 rounded-xl bg-gray-900 px-3 py-3"
      >
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">{aPagar ? "Total a pagar" : "Total"}</span>
        <span className="font-mono text-base font-semibold tabular-nums text-white">
          {fmtMoney(total)}
        </span>
      </div>
    </li>
  );
}

/** «Ver los que no se pagan (2)» — mismo texto que la tabla. */
function LineaNoSePagan({
  cantidad,
  abierto,
  onToggle,
}: {
  cantidad: number;
  abierto: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        className="inline-flex min-h-[44px] w-full items-center justify-center text-xs text-gray-400 active:text-gray-600"
      >
        {abierto ? ROTULO_VER_MENOS : rotuloVerNoSePagan(cantidad)}
      </button>
    </li>
  );
}

/** «se calcula pero no se paga» — DEFAULT y Daniel. Lo decide el servidor (`se_paga`). */
function MarcaNoSePaga() {
  return (
    <span className="ml-1.5 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-normal not-italic text-gray-500">
      {ROTULO_NO_SE_PAGA}
    </span>
  );
}

// ── Vista "Todas las empresas" — matriz vendedor × empresa ───────────────────

export interface FilaConsolidado {
  vendedor: string;
  porEmpresa: Record<string, number>;
  /** Lo que se le restó en CADA empresa (informativo: el total ya viene neto). */
  descuentoPorEmpresa?: Record<string, number>;
  total: number;
  /** false = se muestra, pero no entra al total a pagar. */
  se_paga?: boolean;
  /** Clientes por los que no comisiona (con su empresa); ya restados por la RPC. */
  sinComision?: ClienteSinComisionConEmpresa[];
}

interface PropsConsolidado {
  /** Los que SÍ se pagan: lo que se ve suma exactamente el total del pie. */
  activos: FilaConsolidado[];
  /** Oficina (DEFAULT) y Daniel Levy — detrás de «Ver los que no se pagan». */
  noSePagan: FilaConsolidado[];
  verNoSePagan: boolean;
  onVerNoSePagan: () => void;
  /** Keys de empresa, en el mismo orden que las columnas de la tabla. */
  // `readonly` porque la lista viene de `EMPRESAS_COMISIONAN`, que se deriva de
  // `B2B_EMPRESA_KEYS` (un `as const`). Estas tarjetas solo la RECORREN.
  empresas: readonly string[];
  nombreEmpresa: (key: string) => string;
  granTotal: number;
  /** Abre el mismo modal de detalle que la celda de la tabla. */
  onDetalle: (empresa: string, vendedor: string) => void;
}

export function ComisionesTarjetasConsolidado({
  activos,
  noSePagan,
  verNoSePagan,
  onVerNoSePagan,
  empresas,
  nombreEmpresa,
  granTotal,
  onDetalle,
}: PropsConsolidado) {
  return (
    <ListaTarjetas>
      {activos.map((r) => (
        <TarjetaVendedorMatriz
          key={r.vendedor}
          fila={r}
          empresas={empresas}
          nombreEmpresa={nombreEmpresa}
          onDetalle={onDetalle}
        />
      ))}

      {noSePagan.length > 0 && (
        <LineaNoSePagan
          cantidad={noSePagan.length}
          abierto={verNoSePagan}
          onToggle={onVerNoSePagan}
        />
      )}
      {verNoSePagan &&
        noSePagan.map((r) => (
          <TarjetaVendedorMatriz
            key={r.vendedor}
            fila={r}
            empresas={empresas}
            nombreEmpresa={nombreEmpresa}
            onDetalle={onDetalle}
            apagada
          />
        ))}

      <TarjetaTotal total={granTotal} aPagar={noSePagan.length > 0} />
    </ListaTarjetas>
  );
}

/**
 * Cerrada mide UNA línea (nombre + total), casi lo que medía la fila de la
 * tabla: así el celular no pierde vendedores por pantalla al pasar a tarjetas.
 * Abierta muestra las 6 empresas, cada una tocable → mismo detalle que la celda
 * de la tabla. Las empresas sin nada van «—» y no se pueden tocar, igual que la
 * celda vacía del escritorio.
 */
function TarjetaVendedorMatriz({
  fila,
  empresas,
  nombreEmpresa,
  onDetalle,
  apagada,
}: {
  fila: FilaConsolidado;
  // `readonly` porque la lista viene de `EMPRESAS_COMISIONAN`, que se deriva de
  // `B2B_EMPRESA_KEYS` (un `as const`). Estas tarjetas solo la RECORREN.
  empresas: readonly string[];
  nombreEmpresa: (key: string) => string;
  onDetalle: (empresa: string, vendedor: string) => void;
  apagada?: boolean;
}) {
  const [abierta, setAbierta] = useState(false);

  return (
    <li>
      <article
        data-comision-card
        className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
      >
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2.5 text-left active:bg-gray-50"
        >
          {/* pr-0.5: `truncate` recorta el vuelo de la ITÁLICA — «Oficina (DEFAULT)»
              se leía "Sin asignaı" aunque sobrara ancho. Medido en captura. */}
          <span
            className={`flex min-w-0 items-center truncate pr-0.5 text-sm leading-5 tracking-tight ${
              apagada || fila.se_paga === false ? "text-gray-400" : "font-medium text-gray-900"
            }`}
          >
            <span className="truncate">{nombreVendedorEnPantalla(fila.vendedor)}</span>
            {fila.se_paga === false && <MarcaNoSePaga />}
          </span>
          <span
            className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${
              apagada ? "text-gray-400" : claseMonto(fila.total)
            }`}
          >
            {fmtMoney(fila.total)}
          </span>
        </button>

        {abierta && (
          <ul className="divide-y divide-gray-100 border-t border-gray-100 bg-gray-50">
            {empresas.map((k) => {
              const val = fila.porEmpresa[k];
              const desc = fila.descuentoPorEmpresa?.[k] ?? 0;
              if (celdaVacia(val, desc)) {
                return (
                  <li
                    key={k}
                    className="flex min-h-[44px] items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="truncate text-xs text-gray-400">{nombreEmpresa(k)}</span>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-gray-300">—</span>
                  </li>
                );
              }
              const desglose = desgloseDeCelda(val, desc);
              return (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => onDetalle(k, fila.vendedor)}
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 text-left active:bg-gray-100"
                  >
                    <span className="truncate text-xs text-gray-600">{nombreEmpresa(k)}</span>
                    <span className="shrink-0 text-right">
                      <span className={`block font-mono text-sm tabular-nums ${claseMonto(val ?? 0)}`}>
                        {fmtMoney(val ?? 0)}
                      </span>
                      {/* El descuento SE VE: antes había que abrir el detalle
                          para enterarse de que ahí dentro hay plata restada. */}
                      {desglose && (
                        <span className="block font-mono text-xs tabular-nums text-gray-500">
                          {fmtMoney(desglose.bruto)} − {fmtMoney(desglose.descuento)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </li>
  );
}

// ── Vista "Por empresa" — una empresa, 5 números por vendedor ────────────────

export interface FilaPorEmpresa {
  vendedor: string;
  base: number;
  comision: number;
  base_cobro: number;
  comision_cobro: number;
  /** NETO: el servidor ya le restó los descuentos fijos activos del mes. */
  comision_total: number;
  /** Cuánto se le restó (informativo — ya está descontado del total). */
  descuento?: number;
  /** false = se muestra, pero no entra al total a pagar. */
  se_paga?: boolean;
  /** Clientes por los que no comisiona en esta empresa; ya restados por la RPC. */
  clientes_sin_comision?: ClienteSinComisionConEmpresa[];
}

interface PropsPorEmpresa {
  /** Lo que se ve. Con «Ver los que no se pagan» abierto, incluye a esos dos. */
  activos: FilaPorEmpresa[];
  /** Cuántos hay detrás de «Ver los que no se pagan». */
  noSePagan: number;
  verNoSePagan: boolean;
  onVerNoSePagan: () => void;
  total: number;
  /** Abre el reporte detallado del vendedor (igual que tocar la fila). */
  onDetalle: (vendedor: string) => void;
}

export function ComisionesTarjetasPorEmpresa({
  activos,
  noSePagan,
  verNoSePagan,
  onVerNoSePagan,
  total,
  onDetalle,
}: PropsPorEmpresa) {
  return (
    <ListaTarjetas>
      {activos.map((v) => (
        <li key={v.vendedor}>
          <article
            data-comision-card
            className="rounded-xl border border-gray-200 bg-white shadow-sm"
          >
            {/* Toda la tarjeta abre el reporte detallado, igual que la fila de
                la tabla en escritorio. No hay estado "expandida": los cuatro
                números que la fila tenía a la derecha ya están acá. */}
            <button
              type="button"
              onClick={() => onDetalle(v.vendedor)}
              className="min-h-[44px] w-full px-3 py-2.5 text-left active:bg-gray-50"
            >
              <div className="flex min-h-[24px] items-baseline justify-between gap-2">
                <span className={`flex min-w-0 items-center truncate text-sm font-medium leading-5 tracking-tight ${v.se_paga === false ? "text-gray-400" : "text-gray-900"}`}>
                  <span className="truncate">{nombreVendedorEnPantalla(v.vendedor)}</span>
                  {v.se_paga === false && <MarcaNoSePaga />}
                </span>
                <span
                  className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${claseMonto(
                    v.comision_total,
                  )}`}
                >
                  {fmtMoney(v.comision_total)}
                </span>
              </div>
              <dl className="mt-1.5 grid grid-cols-2 gap-x-3">
                <Dato etiqueta="Ventas" valor={v.base} />
                <Dato etiqueta="Com. venta" valor={v.comision} />
                <Dato etiqueta="Cobros" valor={v.base_cobro} />
                <Dato etiqueta="Com. cobro" valor={v.comision_cobro} />
                {/* Solo cuando hay: si no, sería una línea en $0.00 que dice
                    que se le descontó algo. El total de arriba YA lo tiene
                    restado. */}
                {(v.descuento ?? 0) > 0 && (
                  <Dato etiqueta="Descuentos" valor={-(v.descuento ?? 0)} />
                )}
              </dl>
            </button>
          </article>
        </li>
      ))}

      {noSePagan > 0 && (
        <LineaNoSePagan cantidad={noSePagan} abierto={verNoSePagan} onToggle={onVerNoSePagan} />
      )}

      <TarjetaTotal total={total} aPagar={noSePagan > 0} />
    </ListaTarjetas>
  );
}

/** Etiqueta + monto en una línea. Mismos nombres que los `<th>` de la tabla.
 *  El DATO va en `text-sm` (el piso de la casa); la etiqueta, que es un rótulo
 *  y no un dato, se queda en 12. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 py-0.5">
      <dt className="shrink-0 text-xs text-gray-500">{etiqueta}</dt>
      <dd className={`truncate font-mono text-sm tabular-nums ${claseMonto(valor)}`}>
        {fmtMoney(valor)}
      </dd>
    </div>
  );
}
