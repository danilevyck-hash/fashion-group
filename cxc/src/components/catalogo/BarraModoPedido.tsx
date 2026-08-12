"use client";

// Barra del catálogo en modo "agregando a este pedido". Va PEGADA ARRIBA
// (sticky) porque el catálogo es una pantalla de scroll largo: si la barra se
// va con el scroll, a los tres deslices ya nadie sabe si lo que toca entra al
// pedido o al carrito — y la diferencia entre las dos cosas es un pedido que
// aparece y otro que no.
//
// La salida ("Listo, volver al pedido") vive EN la barra: es el único camino de
// vuelta, y es el mismo botón en las 4 marcas.

import Link from "next/link";
import type { EstadoModoPedido } from "@/lib/hooks/useModoPedido";

export default function BarraModoPedido({
  titulo, totalBultos, hrefVolver, estado,
}: {
  /** "TOM-010 · Aidy Shop No.2" */
  titulo: string;
  totalBultos: number;
  hrefVolver: string;
  estado: EstadoModoPedido;
}) {
  const problema = estado === "bloqueado" || estado === "error";
  return (
    <div
      data-modo-pedido={estado}
      className={`sticky top-0 z-30 -mx-4 px-4 py-2.5 mb-4 border-b ${
        problema ? "bg-amber-50 border-amber-300" : "bg-black border-black"
      }`}
    >
      <div className="max-w-7xl mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {problema ? (
            <p className="text-sm font-medium text-amber-900">
              {estado === "bloqueado"
                ? `Este pedido ya está en Switch — no se le pueden agregar productos`
                : "No se pudo abrir el pedido"}
            </p>
          ) : (
            <>
              {/* 12 px es el piso de la casa: nada baja de ahí (#301). */}
              <p className="text-xs uppercase tracking-wide text-white/70 leading-4">
                Agregando al pedido
              </p>
              <p className="text-sm font-medium text-white truncate">{titulo}</p>
            </>
          )}
          {!problema && (
            <p className="text-xs text-white/70 tabular-nums">
              {totalBultos === 1 ? "1 bulto en el pedido" : `${totalBultos} bultos en el pedido`}
            </p>
          )}
        </div>
        <Link
          href={hrefVolver}
          className={`flex-shrink-0 inline-flex items-center justify-center text-sm font-medium px-4 rounded-md min-h-[44px] transition active:scale-[0.97] ${
            problema
              ? "bg-amber-600 text-white hover:bg-amber-700"
              : "bg-white text-black hover:bg-gray-100"
          }`}
        >
          {problema ? "Volver al pedido" : "Listo, volver al pedido"}
        </Link>
      </div>
    </div>
  );
}
