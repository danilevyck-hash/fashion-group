"use client";

import type { Guia } from "./types";
import PrintDocument from "./PrintDocument";

interface GuiaDetailProps {
  guia: Guia;
  onBack: () => void;
}

export default function GuiaDetail({ guia, onBack }: GuiaDetailProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-4 mb-8 no-print">
        <button onClick={onBack} className="inline-flex min-h-[44px] items-center text-sm text-gray-400 hover:text-black transition">
          ← Guías
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex min-h-[44px] items-center justify-center text-sm bg-black text-white px-6 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all"
        >
          Imprimir
        </button>
      </div>
      {/* ── 🩸 LA GUÍA IMPRESA ES UN DOCUMENTO DE PAPEL, NO UNA TABLA ──────
          En iPhone la página entera se arrastraba 158px: el documento mide 548px
          (7 columnas: cliente, dirección, empresa, facturas, bultos, guía) y el
          arrastre estaba en el CUERPO, así que se movía todo — encabezado y
          botón Imprimir incluidos.

          **No se convierte en tarjetas a propósito.** Esto es la guía que se
          imprime, se firma y se le entrega al transportista; cambiarle la forma
          cambia un documento físico del negocio, y esa es una decisión de
          Daniel, no un ajuste técnico. Lo que sí se arregla es que el arrastre
          no sea de la PÁGINA: ahora el documento scrollea dentro de su propio
          marco (como cualquier vista previa de PDF) y el cuerpo queda en 0.

          `print:overflow-visible` + `print:mx-0`: al imprimir no puede haber
          ningún contenedor con scroll ni márgenes negativos, o el papel saldría
          cortado. El `@media print` de PrintDocument manda igual. */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 print:overflow-visible print:mx-0 print:px-0">
        <PrintDocument guia={guia} />
      </div>
    </div>
  );
}
