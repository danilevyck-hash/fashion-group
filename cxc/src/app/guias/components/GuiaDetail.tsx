"use client";

import { useRouter } from "next/navigation";
import type { Guia } from "./types";
import PrintDocument from "./PrintDocument";

interface GuiaDetailProps {
  guia: Guia;
  onBack: () => void;
}

export default function GuiaDetail({ guia, onBack }: GuiaDetailProps) {
  const router = useRouter();
  function handleBack() {
    router.replace("/guias");
    onBack();
  }
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-4 mb-8 no-print">
        <button onClick={handleBack} className="text-sm text-gray-400 hover:text-black transition">
          ← Guías
        </button>
        <button
          onClick={() => window.print()}
          className="text-sm bg-black text-white px-6 py-2.5 rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all"
        >
          Imprimir
        </button>
      </div>
      <PrintDocument guia={guia} />
    </div>
  );
}
