"use client";

import { useMemo, useState } from "react";
import { fmt } from "@/lib/format";
import { RItem } from "./types";
import { GENEROS, generoLabel, DEFAULT_MOTIVOS } from "./constants";
import { buscarLineas, itemDesdeLinea, ROTULOS_LINEAS, type LineaFactura } from "@/lib/reclamos/lineas-factura";

interface Props {
  lineas: LineaFactura[];
  /** Los renglones marcados, por índice de línea. */
  seleccion: Record<number, RItem>;
  setSeleccion: React.Dispatch<React.SetStateAction<Record<number, RItem>>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// «¿QUÉ RECLAMAS? BUSCA EN LA FACTURA» — el mockup «Reclamar un renglón de
// cien», aprobado por Daniel (11-sep-2026). Del PDF salen y NO se editan:
// Estilo · Descripción · Cantidad · Precio. Andrea marca la línea y llena, como
// hoy: Talla (texto, «S», «32», «todas») · Cant. reclamada · Motivo (lista) —
// y el Género, que el formulario exige desde siempre y no se tocó. Rótulos
// exactos de `ROTULOS_LINEAS` (Daniel: *«palabras de novatos confunden»*).
//
// El buscador filtra por estilo y descripción; con búsqueda vacía se ven todas.
// Marcar una línea la agrega con la cantidad de la factura; desmarcarla la
// quita. Cada línea marcada guarda su propio ítem (talla, cantidad, motivo,
// género), así cambiar la búsqueda no pierde nada.
// ─────────────────────────────────────────────────────────────────────────────
export default function RenglonesDesdeFactura({ lineas, seleccion, setSeleccion }: Props) {
  const [q, setQ] = useState("");
  const visibles = useMemo(() => {
    const filtradas = buscarLineas(lineas, q);
    return filtradas.map((l) => ({ l, idx: lineas.indexOf(l) }));
  }, [lineas, q]);

  function alternar(idx: number, l: LineaFactura) {
    setSeleccion((prev) => {
      if (prev[idx]) { const { [idx]: _quitado, ...resto } = prev; void _quitado; return resto; }
      return { ...prev, [idx]: itemDesdeLinea(l) };
    });
  }
  function cambiar(idx: number, campo: keyof RItem, valor: string | number) {
    setSeleccion((prev) => {
      const it = prev[idx];
      if (!it) return prev;
      const u = { ...it, [campo]: valor } as RItem;
      u.subtotal = (Number(u.cantidad) || 0) * (Number(u.precio_unitario) || 0);
      return { ...prev, [idx]: u };
    });
  }

  const nMarcados = Object.keys(seleccion).length;
  const campo = "border-b border-gray-200 min-h-[44px] xl:min-h-0 py-1 text-sm outline-none bg-transparent";

  return (
    <div>
      <div className="text-sm font-semibold text-gray-900 mb-2">¿Qué reclamas? Busca en la factura</div>
      <div className="flex items-center gap-3 mb-3 max-w-xl">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Estilo o descripción…"
          aria-label="Buscar en la factura"
          className="flex-1 border border-gray-300 rounded-md px-3 min-h-[44px] text-base xl:text-sm outline-none focus:border-black"
        />
        <span className="text-xs text-gray-500 whitespace-nowrap tabular-nums">
          {q.trim() ? `${visibles.length} de ${lineas.length}` : `${lineas.length} renglones`}
          {nMarcados > 0 && ` · ${nMarcados} marcado${nMarcados === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Escritorio e iPad: la tabla. Las 4 primeras columnas vienen del PDF y
          no se editan; las 4 de la derecha las llena Andrea. */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide font-medium text-gray-500">
              <th className="pb-2 w-8"></th>
              {ROTULOS_LINEAS.map((r) => (
                <th key={r} className={`pb-2 pr-3 font-medium ${r === "Cantidad" || r === "Precio" || r === "Cant. reclamada" ? "text-right" : "text-left"}`}>{r}</th>
              ))}
              <th className="pb-2 font-medium text-left">Género</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(({ l, idx }) => {
              const it = seleccion[idx];
              return (
                <tr key={idx} className={`border-b border-gray-100 ${it ? "bg-amber-50/60" : ""}`}>
                  <td className="py-1">
                    <label className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] cursor-pointer">
                      <input type="checkbox" checked={!!it} onChange={() => alternar(idx, l)} aria-label={`Reclamar ${l.referencia}`} className="accent-black w-4 h-4" />
                    </label>
                  </td>
                  <td className="py-1 pr-3 font-medium tabular-nums">{l.referencia}</td>
                  <td className="py-1 pr-3 text-gray-600">{l.descripcion || "—"}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{l.cantidad}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">${fmt(l.precio)}</td>
                  <td className="py-1 pr-3">
                    {it ? <input type="text" value={it.talla} onChange={(e) => cambiar(idx, "talla", e.target.value)} placeholder="S · 32 · todas" aria-label="Talla" className={`${campo} w-24`} /> : <span className="text-gray-400">{l.talla || "—"}</span>}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    {it ? <input type="number" min={0} value={it.cantidad} onChange={(e) => cambiar(idx, "cantidad", parseInt(e.target.value) || 0)} aria-label="Cantidad reclamada" className={`${campo} w-20 text-right`} /> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-1 pr-3">
                    {it ? (
                      <select value={it.motivo} onChange={(e) => cambiar(idx, "motivo", e.target.value)} aria-label="Motivo" className={`${campo} w-44`}>
                        <option value="">--</option>
                        {DEFAULT_MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-1">
                    {it ? (
                      <select value={it.genero} onChange={(e) => cambiar(idx, "genero", e.target.value)} aria-label="Género" className={`${campo} w-32 ${it.genero ? "" : "text-gray-400"}`}>
                        <option value="">Género…</option>
                        {GENEROS.map((g) => <option key={g} value={g}>{generoLabel(g)}</option>)}
                      </select>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibles.length === 0 && <p className="text-sm text-gray-400 py-4">Ningún renglón dice «{q}». Borra la búsqueda para ver los {lineas.length}.</p>}
      </div>

      {/* Celular: una tarjeta por línea; lo editable solo aparece al marcar. */}
      <div className="lg:hidden space-y-2">
        {visibles.map(({ l, idx }) => {
          const it = seleccion[idx];
          return (
            <div key={idx} className={`rounded-lg border p-3 ${it ? "border-gray-900 bg-amber-50/40" : "border-gray-200"}`}>
              <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
                <input type="checkbox" checked={!!it} onChange={() => alternar(idx, l)} aria-label={`Reclamar ${l.referencia}`} className="accent-black w-5 h-5 mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium tabular-nums">{l.referencia}</div>
                  <div className="text-sm text-gray-600">{l.descripcion || "—"}</div>
                  <div className="text-sm text-gray-500 tabular-nums">{l.cantidad} × ${fmt(l.precio)}{l.talla ? ` · talla ${l.talla}` : ""}</div>
                </div>
              </label>
              {it && (
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <label className="block"><span className="text-xs text-gray-500">Talla</span><input type="text" value={it.talla} onChange={(e) => cambiar(idx, "talla", e.target.value)} placeholder="S · 32 · todas" className="w-full border-b border-gray-200 py-2.5 text-base outline-none min-h-[44px]" /></label>
                  <label className="block"><span className="text-xs text-gray-500">Cant. reclamada</span><input type="number" inputMode="numeric" min={0} value={it.cantidad} onChange={(e) => cambiar(idx, "cantidad", parseInt(e.target.value) || 0)} className="w-full border-b border-gray-200 py-2.5 text-base outline-none min-h-[44px]" /></label>
                  <label className="block"><span className="text-xs text-gray-500">Motivo</span><select value={it.motivo} onChange={(e) => cambiar(idx, "motivo", e.target.value)} className="w-full border-b border-gray-200 py-2.5 text-base outline-none bg-transparent min-h-[44px]"><option value="">--</option>{DEFAULT_MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
                  <label className="block"><span className="text-xs text-gray-500">Género</span><select value={it.genero} onChange={(e) => cambiar(idx, "genero", e.target.value)} className="w-full border-b border-gray-200 py-2.5 text-base outline-none bg-transparent min-h-[44px]"><option value="">Género…</option>{GENEROS.map((g) => <option key={g} value={g}>{generoLabel(g)}</option>)}</select></label>
                </div>
              )}
            </div>
          );
        })}
        {visibles.length === 0 && <p className="text-sm text-gray-400 py-4">Ningún renglón dice «{q}». Borra la búsqueda para ver los {lineas.length}.</p>}
      </div>
    </div>
  );
}
