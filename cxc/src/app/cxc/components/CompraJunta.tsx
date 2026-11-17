"use client";

// Los documentos que forman la «última compra» (interruptor
// `ULTIMA_COMPRA_JUNTA_2026_11`): facturas del mismo día en esa empresa y, si
// hubo, la nota de crédito que resta. Lo usan el desglose del celular y la
// fila expandida de la computadora.
import { fmt, fmtDate } from "@/lib/format";
import { facturaParaMostrar } from "@/lib/guias/numero-factura";
import type { DocumentoDeCompra } from "@/lib/cxc/ultima-compra-junta";

/** Cuántas FACTURAS forman la compra (las notas de crédito no cuentan). */
export function cuantasFacturas(docs: DocumentoDeCompra[] | null | undefined): number {
  return (docs ?? []).filter((d) => d.tipo === "Factura").length;
}

/** «3 facturas», o «3 facturas · 1 NC» si alguna nota de crédito resta. */
export function rotuloDeLaCompra(docs: DocumentoDeCompra[]): string {
  const f = cuantasFacturas(docs);
  const nc = docs.length - f;
  return `${f} ${f === 1 ? "factura" : "facturas"}${nc > 0 ? ` · ${nc} NC` : ""}`;
}

interface ListaProps {
  fecha: string;
  monto: number;
  documentos: DocumentoDeCompra[];
}

export function ListaDocumentosCompra({ fecha, monto, documentos }: ListaProps) {
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-[12px] tabular-nums">
      <p className="mb-1 font-semibold text-gray-700">Compra del {fmtDate(fecha)}</p>
      <ul className="divide-y divide-gray-100">
        {documentos.map((d) => {
          const esNc = d.tipo !== "Factura";
          return (
            <li key={`${d.tipo}-${d.secuencial}`} className="flex justify-between gap-4 py-1">
              <span className="text-gray-600">
                {esNc ? "Nota de crédito" : "Factura"} {facturaParaMostrar(d.secuencial)}
              </span>
              <span className={esNc ? "text-red-600" : "text-gray-900"}>
                {esNc ? "−" : ""}
                ${fmt(d.total)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 flex justify-between border-t border-gray-300 pt-1 font-semibold text-gray-900">
        <span>Total de la compra</span>
        <span>${fmt(monto)}</span>
      </p>
    </div>
  );
}
