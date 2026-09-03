"use client";

import {
  CARGANDO_PAGOS,
  ERROR_PAGOS,
  SIN_PAGOS,
  TITULO_ULTIMOS_PAGOS,
  lineaPago,
  type PagoReciente,
} from "@/lib/cxc/ultimos-pagos";

/** Lo que una superficie sabe de los pagos de un cliente en una empresa:
 *  todavía no llegaron (`null`), fallaron (`"error"`), o la lista (puede ir vacía). */
export type EstadoPagos = PagoReciente[] | null | "error";

// El bloque «Últimos pagos» de UNA empresa. Es solo dibujo: recibe los pagos
// ya leídos y no sabe de qué cartera vienen. Quien lo monta decide la ruta.
export default function UltimosPagos({
  pagos,
  empresa,
  compacto = false,
}: {
  pagos: EstadoPagos;
  /** Nombre de la empresa; se omite cuando la pantalla ya lo dijo arriba. */
  empresa?: string;
  /** En celular el bloque va adentro de la tarjeta de la empresa, sin marco. */
  compacto?: boolean;
}) {
  return (
    <div className={compacto ? "mt-1.5" : "rounded-md border border-gray-200 bg-white px-3 py-2 min-w-[220px]"}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {TITULO_ULTIMOS_PAGOS}
        {empresa ? <span className="font-normal normal-case tracking-normal text-gray-400"> · {empresa}</span> : null}
      </p>
      {pagos === null ? (
        <p className="mt-1 text-xs text-gray-400">{CARGANDO_PAGOS}</p>
      ) : pagos === "error" ? (
        <p className="mt-1 text-xs text-red-600">{ERROR_PAGOS}</p>
      ) : pagos.length === 0 ? (
        <p className="mt-1 text-xs text-gray-400">{SIN_PAGOS}</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {pagos.map((p, i) => (
            <li key={`${p.fecha}-${i}`} className="text-xs text-gray-700 tabular-nums whitespace-nowrap">
              {lineaPago(p)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
