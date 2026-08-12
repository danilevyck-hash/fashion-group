"use client";

// ============================================================================
// "Por marca" — el mismo gasto de la pantalla, repartido entre las marcas.
//
// La marca ya no es la unidad del módulo (eso pasó a ser el PROVEEDOR), pero
// sigue siendo un desglose útil: una factura de PVH puede ser 70% Tommy y 30%
// Calvin, y esta lista es donde eso se ve.
//
// 🩸 Los montos vienen ya repartidos de `GET /api/marketing/inicio`, que solo
// cuenta lo de los períodos ABIERTOS — igual que el número grande de arriba.
// Un desglose que sumara más que el titular sería una pantalla mintiendo.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatearMonto } from "@/lib/marketing/normalizar";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { useBackdropDismiss, useEscapeClose } from "@/lib/hooks/useModalDismiss";
import type { MarcaInicio } from "./InicioMarketing";

interface Props {
  porMarca: Record<string, number>;
  marcas: MarcaInicio[];
  onClose: () => void;
}

export default function PorMarcaModal({ porMarca, marcas, onClose }: Props) {
  useBodyScrollLock(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const cerrar = useCallback(() => onClose(), [onClose]);
  const backdrop = useBackdropDismiss(cerrar);
  useEscapeClose(true, cerrar);

  const filas = useMemo(() => {
    const nombre = new Map(marcas.map((m) => [String(m.id), m.nombre]));
    return Object.entries(porMarca)
      .map(([id, monto]) => ({
        id,
        // Una marca que ya no está en el catálogo igual tiene que aparecer: si
        // se descartara, la lista sumaría menos que el titular de la pantalla.
        nombre: nombre.get(String(id)) ?? "Sin marca",
        monto,
      }))
      .filter((f) => f.monto !== 0)
      .sort((a, b) => b.monto - a.monto);
  }, [porMarca, marcas]);

  const total = useMemo(() => filas.reduce((s, f) => s + f.monto, 0), [filas]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      {...backdrop}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div className="relative bg-white w-full sm:max-w-md rounded-lg max-h-[90vh] flex flex-col border border-gray-200">
        <div className="border-b border-gray-100 pl-5 pr-2 py-2.5 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">Por marca</h2>
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

        <div className="p-5 overflow-auto">
          {filas.length === 0 ? (
            <p className="text-sm text-gray-500">Todavía no hay gasto que mostrar.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className="border-b border-gray-100">
                    <td className="py-2.5 pr-3 text-gray-900">{f.nombre}</td>
                    <td className="py-2.5 text-right tabular-nums text-gray-900">
                      {formatearMonto(f.monto)}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2.5 pr-3 text-gray-900">Total</td>
                  <td className="py-2.5 text-right tabular-nums text-gray-900">
                    {formatearMonto(total)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
