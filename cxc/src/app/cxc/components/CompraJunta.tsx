"use client";

// Los documentos que forman la «última compra» (interruptor
// `ULTIMA_COMPRA_JUNTA_2026_11`): las facturas de los 7 días que terminan en la
// última, en esa empresa, y las notas de crédito que restan. Lo usan el
// desglose del celular, la fila expandida de la computadora y la ficha.
import { fmt, fmtDate } from "@/lib/format";
import { facturaParaMostrar } from "@/lib/guias/numero-factura";
import { rangoDeLaCompra, type DocumentoDeCompra } from "@/lib/cxc/ultima-compra-junta";

/** Cuántas FACTURAS forman la compra (las notas de crédito no cuentan). */
export function cuantasFacturas(docs: DocumentoDeCompra[] | null | undefined): number {
  return (docs ?? []).filter((d) => d.tipo === "Factura").length;
}

/** «3 facturas · 15–17 nov», con « · 1 NC» si alguna nota de crédito resta. */
export function rotuloDeLaCompra(docs: DocumentoDeCompra[]): string {
  const f = cuantasFacturas(docs);
  const nc = docs.length - f;
  const rango = rangoDeLaCompra(docs);
  return `${f} ${f === 1 ? "factura" : "facturas"}${nc > 0 ? ` · ${nc} NC` : ""}${rango ? ` · ${rango}` : ""}`;
}

interface ListaProps {
  fecha: string;
  monto: number;
  documentos: DocumentoDeCompra[];
}

export function ListaDocumentosCompra({ fecha, monto, documentos }: ListaProps) {
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-[12px] tabular-nums">
      <p className="mb-1 font-semibold text-gray-700">Compras {rangoDeLaCompra(documentos) || fmtDate(fecha)}</p>
      <ul className="divide-y divide-gray-100">
        {documentos.map((d) => {
          const esNc = d.tipo !== "Factura";
          return (
            <li key={`${d.tipo}-${d.secuencial}`} className="flex justify-between gap-4 py-1">
              <span className="text-gray-600">
                {d.dia && <span className="text-gray-400">{fmtDate(d.dia)} · </span>}
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
