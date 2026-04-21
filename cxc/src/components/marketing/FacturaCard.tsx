"use client";

import type { FacturaConAdjuntos, MkMarca } from "@/lib/marketing/types";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";

interface PorcentajeMarca {
  marca: MkMarca;
  porcentaje: number;
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

  const desgloseCobrable = porcentajesMarcas
    .map((m) => {
      const cobrable = (factura.total * m.porcentaje) / 100;
      return `${m.marca.nombre} ${m.porcentaje}%: ${formatearMonto(cobrable)}`;
    })
    .join(" · ");

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
          {tienePdf && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-900 text-white font-semibold tracking-wide">
              PDF
            </span>
          )}
          {anulada && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">
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
          <div className="text-gray-400">ITBMS</div>
          <div className={`tabular-nums font-mono ${textoBase}`}>
            {formatearMonto(factura.itbms)}
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
        <div className="text-xs text-gray-500 border-t border-gray-100 pt-2">
          {desgloseCobrable}
        </div>
      )}
    </div>
  );

  if (!onClick) return <div className={base}>{body}</div>;

  return (
    <button type="button" onClick={onClick} className={`w-full text-left ${base}`}>
      {body}
    </button>
  );
}

export default FacturaCard;
