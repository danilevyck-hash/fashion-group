"use client";

import type { FacturaConAdjuntos, MkMarca } from "@/lib/marketing/types";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import {
  PORCENTAJE_IMPORTACION_ZONA_LIBRE,
  calcularImportacion,
} from "@/lib/marketing-calc";
import AdjuntosFactura from "./AdjuntosFactura";

interface PorcentajeMarca {
  marca: MkMarca;
  porcentaje: number;
  empresa_pagadora_codigo?: string | null;
}

interface FacturaCardProps {
  factura: FacturaConAdjuntos;
  porcentajesMarcas: PorcentajeMarca[];
  onClick?: () => void;
}

export function FacturaCard({
  factura,
  porcentajesMarcas,
  onClick,
}: FacturaCardProps) {
  const anulada = factura.anulado_en !== null;
  const tienePdf = factura.adjuntos.some((a) => a.tipo === "pdf_factura");

  const textoBase = anulada ? "text-gray-400 line-through" : "text-gray-900";
  const textoSec = anulada ? "text-gray-400 line-through" : "text-gray-600";

  const base = `rounded-lg border border-gray-200 bg-white p-3 transition ${
    onClick ? "hover:border-black cursor-pointer" : ""
  }`;

  // Chip por marca con inicial coloreada (sin %, sin reparto).
  function colorParaMarca(codigo: string): string {
    if (codigo === "TH") return "bg-red-50 text-red-700 border-red-200";
    if (codigo === "CK") return "bg-gray-100 text-gray-800 border-gray-300";
    if (codigo === "RBK") return "bg-blue-50 text-blue-700 border-blue-200";
    if (codigo === "J") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    return "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200";
  }

  const body = (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
        <div className="min-w-0">
          <div className={`text-sm font-medium truncate ${textoBase}`}>
            {factura.numero_factura}
          </div>
          <div className={`text-xs ${textoSec}`}>
            {formatearFecha(factura.fecha_factura)} · {factura.proveedor}
          </div>
          <div className={`text-xs mt-0.5 truncate ${textoSec}`}>
            {factura.concepto}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!anulada && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded border font-medium ${
                factura.estado_pago === "pagado"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-gray-100 text-gray-600 border-gray-300"
              }`}
            >
              {factura.estado_pago === "pagado" ? "Pagado" : "Creado"}
            </span>
          )}
          {factura.tiene_importacion && !anulada && (
            <span
              className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium"
              title={`Compra en zona libre · ${PORCENTAJE_IMPORTACION_ZONA_LIBRE}% de importación incluido en el total`}
            >
              Zona libre
            </span>
          )}
          {tienePdf && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-900 text-white font-semibold tracking-wide">
              PDF
            </span>
          )}
          {anulada && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">
              Anulada
            </span>
          )}
        </div>
      </div>

      <div className={`grid grid-cols-3 gap-2 text-xs ${textoSec}`}>
        <div>
          <div className="text-gray-400">Subtotal</div>
          <div className={`tabular-nums font-mono ${textoBase}`}>
            {formatearMonto(factura.subtotal)}
          </div>
        </div>
        <div>
          <div className="text-gray-400">
            {factura.tiene_importacion
              ? `Importación ${PORCENTAJE_IMPORTACION_ZONA_LIBRE}%`
              : "ITBMS"}
          </div>
          <div className={`tabular-nums font-mono ${textoBase}`}>
            {factura.tiene_importacion
              ? formatearMonto(
                  calcularImportacion(factura.subtotal, true),
                )
              : formatearMonto(factura.itbms)}
          </div>
        </div>
        <div>
          <div className="text-gray-400">Total</div>
          <div className={`tabular-nums font-mono ${textoBase}`}>
            {formatearMonto(factura.total)}
          </div>
        </div>
      </div>

      {porcentajesMarcas.length > 0 && !anulada && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2">
          {porcentajesMarcas.map((m) => {
            const inicial = (m.marca.nombre || m.marca.codigo || "?")
              .charAt(0)
              .toUpperCase();
            return (
              <div
                key={m.marca.id}
                className={`inline-flex items-center gap-1.5 border rounded-md px-1.5 py-0.5 text-xs ${colorParaMarca(m.marca.codigo)}`}
              >
                <span className="font-semibold">[{inicial}]</span>
                <span className="font-medium">{m.marca.nombre}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // Adjuntos (PDFs/fotos de la factura) inline — visibles al abrir el proyecto,
  // sin tener que descargar el ZIP. Se renderizan como hermano del área
  // clickable para no anidar interactivos dentro de un <button>.
  const adjuntosBlock = !anulada && factura.adjuntos.length > 0 ? (
    <AdjuntosFactura adjuntos={factura.adjuntos} />
  ) : null;

  if (!onClick) {
    return (
      <div className={base}>
        {body}
        {adjuntosBlock}
      </div>
    );
  }

  return (
    <div className={base}>
      <button type="button" onClick={onClick} className="w-full text-left">
        {body}
      </button>
      {adjuntosBlock}
    </div>
  );
}

export default FacturaCard;
