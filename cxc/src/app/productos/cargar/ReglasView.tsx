"use client";

import { useMemo, useState } from "react";
import {
  NORMALIZACION,
} from "@/lib/depurador/marca-descripciones";
import {
  PRINCIPIOS_LIMPIEZA,
  MARCA_CATALOGO,
  descripcionesDeMarca,
  norm,
} from "@/lib/depurador/logic";

// Grupos por empresa (igual que en config).
const GRUPOS = [
  { label: "Vistana International", brand: "Calvin Klein", marcas: MARCA_CATALOGO.filter((c) => c.empresa === "Vistana International") },
  { label: "Fashion Wear / Fashion Shoes", brand: "Tommy Hilfiger", marcas: MARCA_CATALOGO.filter((c) => c.empresa === "Fashion Wear") },
  { label: "Active Wear", brand: "Karl Lagerfeld", marcas: MARCA_CATALOGO.filter((c) => c.empresa === "Active Wear") },
];

export default function ReglasView() {
  const [q, setQ] = useState("");
  const normEntries = useMemo(() => Object.entries(NORMALIZACION).sort((a, b) => a[0].localeCompare(b[0], "es")), []);
  const filteredNorm = useMemo(() => {
    const s = norm(q);
    return s ? normEntries.filter(([k, v]) => norm(k).includes(s) || norm(v).includes(s)) : normEntries;
  }, [normEntries, q]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5 border-b-2 border-stone-900 pb-4">
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-stone-900">Reglas del depurador</h2>
        <p className="mt-1.5 text-sm text-stone-500">
          Referencia de cómo se limpian y mapean las descripciones. Si el proveedor cambia algo, manda
          captura a Daniel para actualizar estas reglas en el código.
        </p>
      </div>

      {/* Sección B — Principios */}
      <section className="mb-8">
        <h3 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-teal-800">Principios de limpieza</h3>
        <p className="mb-3 text-[13px] text-stone-500">Se aplican en orden a cada descripción antes de buscar en el catálogo.</p>
        <ol className="space-y-1.5">
          {PRINCIPIOS_LIMPIEZA.map((p, i) => (
            <li key={i} className="rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-[13px]">
              <span className="mr-2 inline-block w-5 text-right font-semibold text-teal-700">{i + 1}.</span>
              <span className="font-medium text-stone-900">{p.titulo}</span>
              <span className="ml-2 font-mono text-[12px] text-stone-500">{p.ejemplo}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Sección A — Reglas directas de normalización */}
      <section className="mb-8">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-bold uppercase tracking-wide text-teal-800">Reglas de normalización ({normEntries.length})</h3>
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…"
            className="w-48 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[13px] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
          />
        </div>
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="border-b border-stone-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500">Texto sucio</th>
                <th className="border-b border-stone-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500">Texto limpio</th>
              </tr>
            </thead>
            <tbody>
              {filteredNorm.map(([k, v]) => (
                <tr key={k} className="hover:bg-teal-50">
                  <td className="border-b border-stone-100 px-3 py-1.5 font-mono text-[12px] text-stone-600">{k}</td>
                  <td className="border-b border-stone-100 px-3 py-1.5 font-mono text-[12px] text-stone-900">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sección C — Catálogo de marcas y descripciones */}
      <section>
        <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-teal-800">Catálogo de marcas y descripciones</h3>
        {GRUPOS.map((g) => (
          <div key={g.label} className="mb-5">
            <div className="mb-2 border-b border-stone-200 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-800">
              {g.label}<span className="ml-2 font-normal normal-case tracking-normal text-stone-500">· {g.brand}</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {g.marcas.map((c) => {
                const ds = descripcionesDeMarca(c.marca);
                return (
                  <div key={c.marca} className="rounded-lg border border-stone-200 bg-white px-3 py-2">
                    <div className="text-[13px] font-semibold text-stone-900">{c.marca} <span className="text-[11px] font-normal text-stone-400">({ds.length})</span></div>
                    <div className="mt-1 text-[12px] leading-snug text-stone-500">{ds.join(" · ")}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
