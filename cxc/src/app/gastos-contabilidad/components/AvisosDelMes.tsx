"use client";

// Los avisos que devuelve la API (`avisosDelMes`), tal cual. No se resumen ni se
// recortan: cada uno existe porque el número solo, sin él, engaña — el mes
// incompleto, el mes sin un peso de salarios, el impuesto que no cae parejo, el
// gasto que no salió del banco y el alquiler de Boston / Fashion Wear.

import type { Aviso } from "@/lib/mayor/gastos";

export default function AvisosDelMes({ avisos }: { avisos: Aviso[] }) {
  if (avisos.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {avisos.map((a, i) => (
        <li
          key={`${a.tipo}-${i}`}
          className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-sm text-amber-900"
        >
          {a.texto}
        </li>
      ))}
    </ul>
  );
}
