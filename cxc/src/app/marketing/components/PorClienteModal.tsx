"use client";

// ============================================================================
// "Por cliente" — cuánto costó cada tienda, sumando TODAS las marcas.
//
// 🔴 ESTE CUADRO NO SE LE REPORTA A NADIE, y la pantalla lo dice. Cada marca
// solo recibe SU columna; esta tabla las cruza y existe para que Daniel sepa
// cuánto le costó cada tienda en total. Sin esa línea, alguien podría mandarle
// a Tommy un papel con las cifras de Reebok adentro.
//
// 🩸 LA FILA "Impulsadoras y gastos sueltos" NO SE ESCONDE. Son gastos sin
// cliente (medido el 11-ago-2026: $13.600,00) y si se filtraran, la columna de
// una marca sumaría MENOS que su bloque de arriba: la pantalla se contradiría
// a sí misma.
//
// ⚠️ LOS CLIENTES DUPLICADOS VIENEN YA FUSIONADOS. D-87 y D-25 existen dos
// veces cada uno en el directorio; el agrupamiento por cliente lo hace el
// servidor y acá se dibuja lo que llega, sin volver a partirlo en dos filas.
//
// No se hace ninguna cuenta acá salvo el total de cada columna, que se saca
// sumando LO QUE SE ESTÁ MOSTRANDO — así el pie no puede decir algo distinto
// de lo que el ojo ve arriba.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatearMonto } from "@/lib/marketing/normalizar";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { useBackdropDismiss, useEscapeClose } from "@/lib/hooks/useModalDismiss";
import type { BloqueResumen, FilaClienteInicio } from "./InicioMarketing";

interface Props {
  bloques: BloqueResumen[];
  filas: FilaClienteInicio[];
  onClose: () => void;
}

export default function PorClienteModal({ bloques, filas, onClose }: Props) {
  useBodyScrollLock(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const cerrar = useCallback(() => onClose(), [onClose]);
  const backdrop = useBackdropDismiss(cerrar);
  useEscapeClose(true, cerrar);

  const totales = useMemo(() => {
    const porBloque: Record<string, number> = {};
    let total = 0;
    for (const f of filas) {
      for (const b of bloques) {
        porBloque[b.key] = (porBloque[b.key] ?? 0) + (f.porBloque[b.key] ?? 0);
      }
      total += f.total;
    }
    return { porBloque, total };
  }, [filas, bloques]);

  if (!mounted) return null;

  const celda = (v: number) =>
    v === 0 ? <span className="text-gray-300">—</span> : formatearMonto(v);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      {...backdrop}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div className="relative bg-white w-full sm:max-w-3xl rounded-lg max-h-[90vh] flex flex-col border border-gray-200">
        <div className="border-b border-gray-100 pl-5 pr-2 py-2.5 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">Por cliente</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-md text-gray-500 hover:text-black active:scale-[0.97] transition"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              &times;
            </span>
          </button>
        </div>

        <div className="px-5 pt-4">
          <p className="text-xs text-gray-500">
            Cuánto te costó cada tienda en total, sumando todas las marcas.
            Esto es solo para verlo tú — no se le reporta a ninguna marca.
          </p>
        </div>

        <div className="p-5 overflow-auto">
          {filas.length === 0 ? (
            <p className="text-sm text-gray-500">Todavía no hay gasto que mostrar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-gray-500">
                    <th className="text-left font-medium py-2 pr-3 whitespace-nowrap">
                      Cliente
                    </th>
                    {bloques.map((b) => (
                      <th
                        key={b.key}
                        className="text-right font-medium py-2 px-3 whitespace-nowrap"
                      >
                        {b.nombre}
                      </th>
                    ))}
                    <th className="text-right font-medium py-2 pl-3 whitespace-nowrap">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => (
                    <tr
                      key={`${f.clienteCodigo ?? f.cliente}-${i}`}
                      className="border-t border-gray-100"
                    >
                      <td className="py-2 pr-3 text-gray-900">{f.cliente}</td>
                      {bloques.map((b) => (
                        <td
                          key={b.key}
                          className="py-2 px-3 text-right tabular-nums text-gray-700"
                        >
                          {celda(f.porBloque[b.key] ?? 0)}
                        </td>
                      ))}
                      <td className="py-2 pl-3 text-right tabular-nums font-medium text-gray-900">
                        {formatearMonto(f.total)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 font-semibold">
                    <td className="py-2 pr-3 text-gray-900">TOTAL</td>
                    {bloques.map((b) => (
                      <td
                        key={b.key}
                        className="py-2 px-3 text-right tabular-nums text-gray-900"
                      >
                        {formatearMonto(totales.porBloque[b.key] ?? 0)}
                      </td>
                    ))}
                    <td className="py-2 pl-3 text-right tabular-nums text-gray-900">
                      {formatearMonto(totales.total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
