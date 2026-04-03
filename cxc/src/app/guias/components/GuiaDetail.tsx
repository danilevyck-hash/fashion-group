"use client";

import type { Guia } from "./types";
import PrintDocument from "./PrintDocument";

interface GuiaDetailProps {
  guia: Guia;
  onBack: () => void;
}

export default function GuiaDetail({ guia, onBack }: GuiaDetailProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex items-center gap-4 mb-8 no-print">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-black transition">
          ← Volver
        </button>
        <button
          onClick={() => window.print()}
          className="text-sm bg-black text-white px-6 py-2.5 rounded-md font-medium hover:bg-gray-800 transition"
        >
          Imprimir
        </button>
      </div>
      <PrintDocument guia={guia} />
    </div>
  );
}
