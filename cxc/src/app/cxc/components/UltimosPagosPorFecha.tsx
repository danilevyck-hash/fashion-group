"use client";

// ─────────────────────────────────────────────────────────────────────────────
// «ÚLTIMOS PAGOS», POR FECHA — el bloque del panel expandido.
//
// 🩸 POR QUÉ NO ES POR EMPRESA (5-sep-2026). Los clientes grandes le pagan a
// varias empresas EL MISMO DÍA: el 29-jun-2026 D-25 pagó $241.857,77 repartido
// en las SEIS. Con el corte por empresa eso eran 6 bloques de 3 pagos = **18
// líneas para decir lo que dicen 3**, y ninguna decía cuánto entró ese día.
//
// Lo que se lee ahora, con los números reales de D-25:
//   20 ago · $234,189.21 · Vistana · Fashion Wear · Active Shoes · Fashion Shoes
//   29 jul · $70,129.85 · Vistana · Fashion Shoes
//   22 jul · $187,651.51 · Fashion Wear
//
// 🔴 Es la lectura del GRUPO. La cartera de Boston tiene la suya y no comparten
// ni una función de consulta.
// ─────────────────────────────────────────────────────────────────────────────

import { fmt } from "@/lib/format";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { fechaCortaPago, type PagoDelDia } from "@/lib/cxc/pagos-por-fecha";
import { TITULO_ULTIMOS_PAGOS, SIN_PAGOS, CARGANDO_PAGOS, ERROR_PAGOS } from "@/lib/cxc/ultimos-pagos";
import { hoyPanama } from "@/lib/fecha-panama";

export default function UltimosPagosPorFecha({
  pagos,
}: {
  /** `null` = cargando · `"error"` = no se pudo · lista (vacía si no hay). */
  pagos: PagoDelDia[] | null | "error";
}) {
  const hoy = hoyPanama();
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        {TITULO_ULTIMOS_PAGOS}
      </p>
      {pagos === null && <p className="text-xs text-gray-400">{CARGANDO_PAGOS}</p>}
      {pagos === "error" && <p className="text-xs text-red-600">{ERROR_PAGOS}</p>}
      {Array.isArray(pagos) && pagos.length === 0 && (
        <p className="text-xs text-gray-400">{SIN_PAGOS}</p>
      )}
      {Array.isArray(pagos) && pagos.length > 0 && (
        <ul className="space-y-0.5">
          {pagos.map((p) => (
            <li key={p.fecha} className="text-xs text-gray-600 tabular-nums">
              <span className="text-gray-500">{fechaCortaPago(p.fecha, hoy)}</span>
              {" · "}
              <span className="font-medium text-gray-900">${fmt(p.monto)}</span>
              {p.empresas.length > 0 && (
                <span className="text-gray-500">
                  {" · "}
                  {p.empresas.map((e) => EMPRESA_KEY_TO_NAME[e] ?? e).join(" · ")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
