"use client";

import { useMemo, useState } from "react";
import { mutate } from "swr";
import {
  CASOS_TALLA,
  CASO_TALLA_RESTO,
  MARCA_CATALOGO,
  descripcionesDeMarca,
  norm,
  reglasDeNormalizacionQueHacenFalta,
} from "@/lib/depurador/logic";
import { CASOS_TALLA_REEBOK } from "@/lib/depurador/reebok";
import { CATALOGO_DESCRIPCIONES_KEY, useCatalogoDescripciones } from "@/lib/hooks/useCatalogoDescripciones";

/* ─────────────────────────────────────────────────────────────────────────────
 * «Reglas» — minimalista (8-sep-2026).
 *
 * Daniel: «es solo para nosotros los usuarios ver en caso de algo, se usará muy
 * poco, al menos que lo escribas de manera concisa, justo lo necesario y
 * ordenado de manera minimalista».
 *
 * Quedan DOS secciones:
 *   1) Cómo se elige la talla — GENERADA del código (CASOS_TALLA y
 *      CASOS_TALLA_REEBOK). Antes las dos tablas estaban TECLEADAS aquí y ya se
 *      habían separado de la regla real.
 *   2) Descripciones por marca — la única ventana que la secretaria tiene al
 *      catálogo (la pestaña «Descripciones» es solo de admin). Aquí puede
 *      QUITAR una descripción que escribió mal, y el buscador busca DENTRO de
 *      las descripciones, no solo en los nombres de las correcciones.
 *
 * Se fueron los 8 principios de limpieza y la tabla de 22 reglas de
 * normalización. De esas 22, las 10 que de verdad hacen falta se quedan —
 * derivadas, y mostrando LO QUE SALE AL EXCEL, no el valor crudo del mapa (una
 * fila mentía: decía «Boys-Shirts - Woven Tops S/S» y al Excel sale
 * «Boys-Shirts Woven S/S»).
 * ────────────────────────────────────────────────────────────────────────── */

// Grupos por empresa (igual que en config).
const GRUPOS = [
  { label: "Vistana International", brand: "Calvin Klein", marcas: MARCA_CATALOGO.filter((c) => c.empresa === "Vistana International") },
  { label: "Fashion Wear", brand: "Tommy Hilfiger", marcas: MARCA_CATALOGO.filter((c) => c.empresa === "Fashion Wear") },
  { label: "Fashion Shoes", brand: "Tommy Hilfiger", marcas: MARCA_CATALOGO.filter((c) => c.empresa === "Fashion Shoes") },
  { label: "Active Wear", brand: "Karl Lagerfeld", marcas: MARCA_CATALOGO.filter((c) => c.empresa === "Active Wear") },
];

/** Lo que se dice cuando una marca existe pero nunca se le cargó nada.
 *  Daniel: «no se esconden» — pero un «(0)» pelado no explica qué pasa. */
export const SIN_DESCRIPCIONES = "Todavía sin descripciones cargadas";

export default function ReglasView() {
  const [q, setQ] = useState("");
  const { catalogo, filas, cargando, fallo, reintentar } = useCatalogoDescripciones();
  const [quitando, setQuitando] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Las correcciones de nombre que de VERDAD hacen falta, con el resultado real
  // de normalizeDescripcion. Derivadas: no hay lista tecleada.
  const correcciones = useMemo(() => reglasDeNormalizacionQueHacenFalta(), []);
  const s = norm(q);
  const correccionesFiltradas = useMemo(
    () => (s ? correcciones.filter((r) => norm(r.sucia).includes(s) || norm(r.limpia).includes(s)) : correcciones),
    [correcciones, s]
  );

  // id de cada descripción activa, para poder quitarla.
  const idPorClave = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of filas ?? []) m.set(`${norm(f.marca)}|||${norm(f.descripcion)}`, f.id);
    return m;
  }, [filas]);

  const quitar = async (id: string) => {
    if (quitando) return;
    setQuitando(id);
    setError("");
    try {
      const res = await fetch(`/api/productos/cargar/descripciones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa: false }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error || "No se pudo quitar. Intenta de nuevo.");
        return;
      }
      await mutate(CATALOGO_DESCRIPCIONES_KEY);
    } catch {
      setError("No se pudo quitar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setQuitando(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* ── 1 · Cómo se elige la talla ─────────────────────────────────────── */}
      <section className="mb-8">
        <h3 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-teal-800">Cómo se elige la talla</h3>
        <p className="mb-3 text-[13px] text-stone-500">
          Cada estilo colapsa a una fila y el código de barra que se sube a Switch es el de esta talla.
          Si la talla esperada no existe, se usa la más chica y la fila queda marcada en ámbar para revisar.
        </p>
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full border-collapse text-[13px]" aria-label="Cómo se elige la talla">
            <thead>
              <tr>
                <th className="border-b border-stone-200 px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-stone-500">Caso</th>
                <th className="border-b border-stone-200 px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-stone-500">Cómo se detecta</th>
                <th className="border-b border-stone-200 px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-stone-500">Talla elegida</th>
              </tr>
            </thead>
            <tbody>
              {[...CASOS_TALLA, CASO_TALLA_RESTO].map((r) => (
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
            {CASOS_TALLA_REEBOK.map((r) => (
              <li key={r.id} className="text-[13px]">
                <span className="font-medium text-stone-900">{r.caso}</span>
                <span className="ml-2 text-stone-500">→ {r.talla}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 2 · Descripciones por marca ────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[13px] font-bold uppercase tracking-wide text-teal-800">Descripciones por marca</h3>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar marca o descripción…"
            aria-label="Buscar marca o descripción"
            className="min-h-[44px] w-full max-w-xs rounded-md border border-stone-300 bg-white px-3 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
          />
        </div>

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
              className="min-h-[44px] rounded-md border border-red-300 bg-white px-2.5 text-[12px] font-semibold text-red-700 transition hover:bg-red-100 active:scale-[0.97]"
            >
              Reintentar
            </button>
          </div>
        )}
        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-800">{error}</div>
        )}

        {catalogo && GRUPOS.map((g) => {
          // Una marca se dibuja si su NOMBRE coincide con la búsqueda (así las
          // vacías siguen a la vista) o si alguna de sus descripciones coincide.
          const marcas = g.marcas
            .map((c) => {
              const todas = descripcionesDeMarca(catalogo, c.marca);
              const nombreCoincide = !s || norm(c.marca).includes(s);
              const ds = nombreCoincide ? todas : todas.filter((d) => norm(d).includes(s));
              return { marca: c.marca, ds, todas, visible: nombreCoincide || ds.length > 0 };
            })
            .filter((m) => m.visible);
          if (marcas.length === 0) return null;
          return (
            <div key={g.label} className="mb-5">
              <div className="mb-2 border-b border-stone-200 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-800">
                {g.label}<span className="ml-2 font-normal normal-case tracking-normal text-stone-500">· {g.brand}</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {marcas.map((m) => (
                  <div key={m.marca} className="rounded-lg border border-stone-200 bg-white px-3 py-2">
                    <div className="text-[13px] font-semibold text-stone-900">
                      {m.marca}
                      {m.todas.length > 0 && (
                        <span className="ml-2 text-[12px] font-normal text-stone-400">({m.todas.length})</span>
                      )}
                    </div>
                    {m.todas.length === 0 ? (
                      // 🔴 La marca se MUESTRA igual (Daniel: «no se esconden»),
                      // pero diciendo qué le pasa en vez de un «(0)» pelado.
                      <div className="mt-1 text-[13px] italic text-stone-400">{SIN_DESCRIPCIONES}</div>
                    ) : (
                      <ul className="mt-1 flex flex-wrap gap-x-1 gap-y-1">
                        {m.ds.map((d) => {
                          const id = idPorClave.get(`${norm(m.marca)}|||${norm(d)}`);
                          return (
                            <li key={d} className="inline-flex items-center gap-1 rounded bg-stone-50 pl-1.5 text-[13px] text-stone-600">
                              <span>{d}</span>
                              {id && (
                                <button
                                  type="button"
                                  onClick={() => quitar(id)}
                                  disabled={quitando === id}
                                  aria-label={`Quitar ${d} de ${m.marca}`}
                                  title="Quitar del catálogo (no se borra: deja de valer)"
                                  className="inline-flex h-[44px] w-[32px] items-center justify-center text-stone-400 transition hover:text-red-600 disabled:opacity-50"
                                >
                                  {quitando === id ? "…" : "×"}
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Las 10 correcciones de nombre que hacen falta. Lo que se ve es lo que
            sale al Excel (normalizeDescripcion), nunca el valor crudo del mapa. */}
        {correccionesFiltradas.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-teal-800">
              Nombres que se corrigen solos ({correcciones.length})
            </div>
            <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
              <table className="w-full border-collapse text-[13px]" aria-label="Nombres que se corrigen solos">
                <thead>
                  <tr>
                    <th className="border-b border-stone-200 px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-stone-500">Como lo manda el proveedor</th>
                    <th className="border-b border-stone-200 px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-stone-500">Como sale al Excel</th>
                  </tr>
                </thead>
                <tbody>
                  {correccionesFiltradas.map((r) => (
                    <tr key={r.sucia} className="hover:bg-teal-50">
                      <td className="border-b border-stone-100 px-3 py-1.5 font-mono text-[12px] text-stone-600">{r.sucia}</td>
                      <td className="border-b border-stone-100 px-3 py-1.5 font-mono text-[12px] text-stone-900">{r.limpia}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
