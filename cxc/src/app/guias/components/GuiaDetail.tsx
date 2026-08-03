"use client";

import type { Guia } from "./types";
import PrintDocument from "./PrintDocument";
import HojaEscalada from "./HojaEscalada";

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
          Mide ~548px (7 columnas: cliente, dirección, empresa, facturas,
          bultos, guía de transporte) y en un iPhone de 390 no entra.

          **No se convierte en tarjetas a propósito.** Esto es la guía que se
          imprime, se firma y se le entrega al transportista: partirla en una
          versión de pantalla y otra de papel rompe el respaldo de la entrega.
          Daniel eligió verla COMPLETA Y ACHICADA, como la vista previa de un
          PDF, y tocarla para agrandarla. El porqué, la aritmética del corte y
          —sobre todo— el candado para que el papel no se entere de la escala
          están en `HojaEscalada`. */}
      <HojaEscalada>
        <PrintDocument guia={guia} />
      </HojaEscalada>
    </div>
  );
}
