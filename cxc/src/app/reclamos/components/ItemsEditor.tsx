"use client";

import { fmt } from "@/lib/format";
import { RItem } from "./types";
import { TALLAS, GENEROS, generoLabel, DEFAULT_MOTIVOS, emptyItem } from "./constants";
import { filaRepetida } from "@/lib/reclamos/lineas-factura";

interface Props {
  items: RItem[];
  setItems: React.Dispatch<React.SetStateAction<RItem[]>>;
  /** Título de la sección (arriba de la tabla). */
  titulo?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS RENGLONES TECLEADOS A MANO — la tabla de siempre, sacada de ReclamoForm
// (10-sep-2026) para que el formulario entre en 800 líneas. Es el camino de
// cuando el lector no saca las líneas del PDF, y también el de «¿no está en la
// factura?». Lo que cambió:
//   · el MOTIVO es una lista cerrada (los 6 de siempre): «+ Agregar motivo» y
//     los motivos personalizados se retiraron — 0 usos en toda la historia,
//     y 14 grafías para 5 problemas en lo tecleado;
//   · «Repetir el anterior» (Daniel: sí) copia talla, género, precio y motivo
//     del último renglón — con 4,2 renglones por reclamo, se re-elegían casi
//     siempre iguales.
// La talla y el género se guardan igual que siempre.
// ─────────────────────────────────────────────────────────────────────────────
export default function ItemsEditor({ items, setItems, titulo = "Renglones del reclamo" }: Props) {
  function updateItem(idx: number, field: string, val: string | number) {
    setItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const u = { ...item, [field]: val };
      u.subtotal = (Number(u.cantidad) || 0) * (Number(u.precio_unitario) || 0);
      return u;
    }));
  }
  const quitar = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));
  const agregar = () => setItems((p) => [...p, emptyItem()]);
  const repetir = () => setItems((p) => (p.length ? [...p, filaRepetida(p[p.length - 1])] : [emptyItem()]));

  return (
    <div>
      <div className="text-sm font-semibold text-gray-900 mb-2">{titulo}</div>
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm [&_td]:py-3 [&_th]:pb-3 [&_th]:px-5 [&_td]:px-5 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide font-medium text-gray-500">
              <th className="pb-2 font-medium text-left">Estilo *</th>
              <th className="pb-2 font-medium text-left">Descripción *</th>
              <th className="pb-2 font-medium text-left" style={{ minWidth: 70 }}>Talla *</th>
              <th className="pb-2 font-medium text-left" style={{ minWidth: 90 }}>Género *</th>
              <th className="pb-2 font-medium text-right" style={{ minWidth: 60 }}>Cant. *</th>
              <th className="pb-2 font-medium text-right" style={{ minWidth: 80 }}>Precio U. *</th>
              <th className="pb-2 font-medium text-left">Motivo *</th>
              <th className="pb-2 font-medium text-right" style={{ minWidth: 80 }}>Subtotal</th>
              <th className="pb-2 w-6"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b border-gray-200">
                <td className="py-2 pr-1"><input type="text" value={item.referencia} onChange={(e) => updateItem(idx, "referencia", e.target.value)} aria-label="Estilo" className="w-full border-b border-gray-200 min-h-[44px] xl:min-h-0 py-1 text-sm outline-none" /></td>
                <td className="py-2 pr-1"><input type="text" value={item.descripcion} onChange={(e) => updateItem(idx, "descripcion", e.target.value)} aria-label="Descripción" className="w-full border-b border-gray-200 min-h-[44px] xl:min-h-0 py-1 text-sm outline-none" /></td>
                <td className="py-2 pr-1">
                  {(!TALLAS.includes(item.talla) && item.talla !== "") ? (
                    <div className="flex items-center gap-1">
                      <input type="text" value={item.talla} onChange={(e) => updateItem(idx, "talla", e.target.value)} placeholder="Talla" className="w-full border-b border-gray-200 min-h-[44px] xl:min-h-0 py-1 text-sm outline-none" style={{ minWidth: 50 }} />
                      <button type="button" aria-label="Volver a la lista de tallas" onClick={() => updateItem(idx, "talla", "")} className="text-gray-300 hover:text-black text-xs">×</button>
                    </div>
                  ) : (
                    <select value={item.talla} onChange={(e) => { if (e.target.value === "Otros") updateItem(idx, "talla", " "); else updateItem(idx, "talla", e.target.value); }} aria-label="Talla" className="border-b border-gray-200 min-h-[44px] xl:min-h-0 py-1 text-sm outline-none bg-transparent" style={{ minWidth: 60 }}>
                      <option value="">—</option>
                      {TALLAS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                </td>
                <td className="py-2 pr-1">
                  <select value={item.genero} onChange={(e) => updateItem(idx, "genero", e.target.value)} aria-label="Género" className={`w-full border-b min-h-[44px] xl:min-h-0 py-1 text-sm outline-none bg-transparent ${item.genero ? "border-gray-200 text-black" : "border-gray-200 text-gray-400"}`} style={{ minWidth: 80 }}>
                    <option value="">Género…</option>
                    {/* value = lo que se GUARDA (inglés, lo exige el CHECK de la base); el texto = lo que se LEE. */}
                    {GENEROS.map((g) => <option key={g} value={g}>{generoLabel(g)}</option>)}
                  </select>
                </td>
                <td className="py-2 pr-1"><input type="number" min={0} value={item.cantidad} onChange={(e) => updateItem(idx, "cantidad", parseInt(e.target.value) || 0)} aria-label="Cantidad" className="w-full min-w-[44px] border-b border-gray-200 min-h-[44px] xl:min-h-0 py-1 text-sm outline-none text-right" /></td>
                <td className="py-2 pr-1"><input type="number" step="0.50" min={0} value={item.precio_unitario} onChange={(e) => updateItem(idx, "precio_unitario", parseFloat(e.target.value) || 0)} aria-label="Precio unitario" className="w-full min-w-[44px] border-b border-gray-200 min-h-[44px] xl:min-h-0 py-1 text-sm outline-none text-right" /></td>
                <td className="py-2 pr-1">
                  <select value={item.motivo} onChange={(e) => updateItem(idx, "motivo", e.target.value)} aria-label="Motivo" className="w-full border-b border-gray-200 min-h-[44px] xl:min-h-0 py-1 text-sm outline-none bg-transparent">
                    <option value="">--</option>
                    {DEFAULT_MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </td>
                <td className="py-2 text-right tabular-nums text-gray-500 text-xs">${fmt((item.cantidad || 0) * (item.precio_unitario || 0))}</td>
                <td className="py-2 text-center">{items.length > 1 && <button type="button" aria-label="Quitar renglón" onClick={() => quitar(idx)} className="text-gray-300 hover:text-black text-sm py-1.5 px-2 min-h-[44px]">×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Celular: una tarjeta por renglón con campos apilados y etiquetados.
          text-base para que Safari no haga zoom al enfocar. */}
      <div className="sm:hidden space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="rounded-lg border border-gray-200 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Renglón {idx + 1}</span>
              {items.length > 1 && (
                <button type="button" onClick={() => quitar(idx)} className="text-xs text-gray-400 hover:text-red-500 min-h-[44px] px-2">Quitar</button>
              )}
            </div>
            <label className="block">
              <span className="text-xs text-gray-500">Estilo *</span>
              <input type="text" value={item.referencia} onChange={(e) => updateItem(idx, "referencia", e.target.value)} className="w-full border-b border-gray-200 py-2.5 text-base outline-none focus:border-black min-h-[44px]" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Descripción *</span>
              <input type="text" value={item.descripcion} onChange={(e) => updateItem(idx, "descripcion", e.target.value)} className="w-full border-b border-gray-200 py-2.5 text-base outline-none focus:border-black min-h-[44px]" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-500">Talla *</span>
                {(!TALLAS.includes(item.talla) && item.talla !== "") ? (
                  <div className="flex items-center gap-1">
                    <input type="text" value={item.talla} onChange={(e) => updateItem(idx, "talla", e.target.value)} placeholder="Talla" className="w-full border-b border-gray-200 py-2.5 text-base outline-none focus:border-black min-h-[44px]" />
                    <button type="button" aria-label="Volver a la lista de tallas" title="Volver a la lista de tallas" onClick={() => updateItem(idx, "talla", "")} className="text-gray-300 hover:text-black text-xs inline-flex items-center justify-center min-w-[44px] min-h-[44px] shrink-0">×</button>
                  </div>
                ) : (
                  <select value={item.talla} onChange={(e) => { if (e.target.value === "Otros") updateItem(idx, "talla", " "); else updateItem(idx, "talla", e.target.value); }} className="w-full border-b border-gray-200 py-2.5 text-base outline-none bg-transparent min-h-[44px]">
                    <option value="">—</option>
                    {TALLAS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Cantidad *</span>
                <input type="number" inputMode="numeric" min={0} value={item.cantidad} onChange={(e) => updateItem(idx, "cantidad", parseInt(e.target.value) || 0)} className="w-full border-b border-gray-200 py-2.5 text-base outline-none focus:border-black min-h-[44px]" />
              </label>
            </div>
            <label className="block">
              <span className="text-xs text-gray-500">Género *</span>
              <select value={item.genero} onChange={(e) => updateItem(idx, "genero", e.target.value)} className={`w-full border-b border-gray-200 py-2.5 text-base outline-none bg-transparent focus:border-black min-h-[44px] ${item.genero ? "text-black" : "text-gray-400"}`}>
                <option value="">Género…</option>
                {GENEROS.map((g) => <option key={g} value={g}>{generoLabel(g)}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-500">Precio U. *</span>
                <input type="number" inputMode="decimal" step="0.50" min={0} value={item.precio_unitario} onChange={(e) => updateItem(idx, "precio_unitario", parseFloat(e.target.value) || 0)} className="w-full border-b border-gray-200 py-2.5 text-base outline-none focus:border-black min-h-[44px]" />
              </label>
              <div className="block">
                <span className="text-xs text-gray-500">Subtotal</span>
                <p className="py-2 text-sm tabular-nums text-gray-600">${fmt((item.cantidad || 0) * (item.precio_unitario || 0))}</p>
              </div>
            </div>
            <label className="block">
              <span className="text-xs text-gray-500">Motivo *</span>
              <select value={item.motivo} onChange={(e) => updateItem(idx, "motivo", e.target.value)} className="w-full border-b border-gray-200 py-2.5 text-base outline-none bg-transparent min-h-[44px]">
                <option value="">--</option>
                {DEFAULT_MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>
        ))}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4">
        <button type="button" onClick={agregar} className="text-sm text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px] px-2 -mx-2">+ Agregar renglón</button>
        <button type="button" onClick={repetir} className="text-sm text-gray-700 hover:text-black transition inline-flex items-center min-h-[44px] px-2 -mx-2 font-medium">Repetir el anterior</button>
      </div>
    </div>
  );
}
