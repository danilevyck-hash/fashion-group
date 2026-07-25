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
import { useCatalogoDescripciones } from "@/lib/hooks/useCatalogoDescripciones";

// Regla de talla del EAN representativo (espejo de pickEAN en lib/depurador/logic.ts).
// Solo lectura: si se cambia la regla en el código hay que actualizar esta tabla.
const REGLA_TALLA: { caso: string; detecta: string; talla: string }[] = [
  { caso: "Calzado hombre", detecta: "descripción con palabra de calzado (sneaker, sandal, shoe…) + Men", talla: "41" },
  { caso: "Calzado dama", detecta: "descripción con palabra de calzado + Women", talla: "37" },
  { caso: "Pantalón / short hombre", detecta: "descripción con short, pant, denim, jean, chino… + Men", talla: "32" },
  { caso: "Pantalón / short dama", detecta: "descripción con short, pant, denim, jean, chino… + Women", talla: "27" },
  { caso: "Kids", detecta: "género o descripción con Kids (Boys/Girls/Toddler van por la regla general)", talla: "8 · si no existe, M" },
  { caso: "Resto (tops, ropa interior, accesorios…)", detecta: "todo lo demás", talla: "M" },
];

// Regla Reebok (espejo de pickSample en lib/depurador/reebok.ts).
const REGLA_TALLA_REEBOK: { caso: string; talla: string }[] = [
  { caso: "Footwear · Male", talla: "9 · si no existe, la numérica más cercana (queda en ámbar)" },
  { caso: "Footwear · Female", talla: "7 · si no existe, la numérica más cercana (queda en ámbar)" },
  { caso: "Footwear · Kids / Unisex (AGE GROUP ≠ Adult o GENDER Unisex)", talla: "mediana de las tallas disponibles" },
  { caso: "Apparel / Hardware", talla: "M · si no hay M, la talla única (ámbar si hay varias)" },
];

// Grupos por empresa (igual que en config).
const GRUPOS = [
  { label: "Vistana International", brand: "Calvin Klein", marcas: MARCA_CATALOGO.filter((c) => c.empresa === "Vistana International") },
  { label: "Fashion Wear", brand: "Tommy Hilfiger", marcas: MARCA_CATALOGO.filter((c) => c.empresa === "Fashion Wear") },
  { label: "Fashion Shoes", brand: "Tommy Hilfiger", marcas: MARCA_CATALOGO.filter((c) => c.empresa === "Fashion Shoes") },
  { label: "Active Wear", brand: "Karl Lagerfeld", marcas: MARCA_CATALOGO.filter((c) => c.empresa === "Active Wear") },
];

export default function ReglasView() {
  const [q, setQ] = useState("");
  // Catálogo de descripciones (tabla depurador_descripciones — fuente de verdad).
  const { catalogo, cargando, fallo, reintentar } = useCatalogoDescripciones();
  const normEntries = useMemo(() => Object.entries(NORMALIZACION).sort((a, b) => a[0].localeCompare(b[0], "es")), []);
  const filteredNorm = useMemo(() => {
    const s = norm(q);
    return s ? normEntries.filter(([k, v]) => norm(k).includes(s) || norm(v).includes(s)) : normEntries;
  }, [normEntries, q]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5 border-b-2 border-stone-900 pb-4">
        <p className="text-sm text-stone-500">
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

      {/* Sección — Regla de talla del EAN representativo (solo lectura) */}
      <section className="mb-8">
        <h3 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-teal-800">Regla de talla (EAN representativo)</h3>
        <p className="mb-3 text-[13px] text-stone-500">
          Cada estilo colapsa a una fila y el código de barra que se sube a Switch es el de esta talla.
          Si la talla esperada no existe, se usa la más chica y la fila queda marcada en ámbar para revisar.
        </p>
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="border-b border-stone-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500">Caso</th>
                <th className="border-b border-stone-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500">Cómo se detecta</th>
                <th className="border-b border-stone-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500">Talla elegida</th>
              </tr>
            </thead>
            <tbody>
              {REGLA_TALLA.map((r) => (
                <tr key={r.caso} className="hover:bg-teal-50">
                  <td className="border-b border-stone-100 px-3 py-1.5 font-medium text-stone-900">{r.caso}</td>
                  <td className="border-b border-stone-100 px-3 py-1.5 text-stone-500">{r.detecta}</td>
                  <td className="border-b border-stone-100 px-3 py-1.5 font-mono text-[12px] text-stone-900">{r.talla}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-lg border border-stone-200 bg-white px-3.5 py-3">
          <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-teal-800">Reebok · Active Shoes (talla-muestra)</div>
          <ul className="space-y-1.5">
            {REGLA_TALLA_REEBOK.map((r) => (
              <li key={r.caso} className="text-[13px]">
                <span className="font-medium text-stone-900">{r.caso}</span>
                <span className="ml-2 text-stone-500">→ {r.talla}</span>
              </li>
            ))}
          </ul>
        </div>
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

      {/* Sección C — Catálogo de marcas y descripciones (desde la tabla) */}
      <section>
        <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-teal-800">Catálogo de marcas y descripciones</h3>
        {cargando && (
          <div className="mb-4 rounded-lg border border-stone-200 bg-white px-3.5 py-2.5 text-[13px] text-stone-600">
            Cargando catálogo de descripciones…
          </div>
        )}
        {fallo && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-800">
            <span>No se pudo cargar el catálogo de descripciones. Intenta de nuevo.</span>
            <button
              type="button"
              onClick={reintentar}
              className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-red-700 transition hover:bg-red-100 active:scale-[0.97]"
            >
              Reintentar
            </button>
          </div>
        )}
        {catalogo && GRUPOS.map((g) => (
          <div key={g.label} className="mb-5">
            <div className="mb-2 border-b border-stone-200 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-800">
              {g.label}<span className="ml-2 font-normal normal-case tracking-normal text-stone-500">· {g.brand}</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {g.marcas.map((c) => {
                const ds = descripcionesDeMarca(catalogo, c.marca);
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
