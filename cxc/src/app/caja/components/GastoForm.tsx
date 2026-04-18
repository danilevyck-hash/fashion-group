"use client";

import { useState } from "react";
import { fmt } from "@/lib/format";
import { CajaResponsable } from "./types";

export interface GastoFormValues {
  gFecha: string;
  gDescripcion: string;
  gProveedor: string;
  gNroFactura: string;
  gSubtotal: string;
  gItbmsPct: string;
  gCategoria: string;
  gResponsableId: string;
}

export interface GastoFormSetters {
  setGFecha: (v: string) => void;
  setGDescripcion: (v: string) => void;
  setGProveedor: (v: string) => void;
  setGNroFactura: (v: string) => void;
  setGSubtotal: (v: string) => void;
  setGItbmsPct: (v: string) => void;
  setGCategoria: (v: string) => void;
  setGResponsableId: (v: string) => void;
}

export function normalizeStr(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

interface Props {
  values: GastoFormValues;
  setters: GastoFormSetters;
  subtotalNum: number;
  totalNum: number;
  categorias: string[];
  responsablesCatalog: CajaResponsable[];
  showManageCat: boolean;
  newCatName: string;
  isOwner: boolean;
  setCategorias: (v: string[]) => void;
  setShowManageCat: (v: boolean) => void;
  setNewCatName: (v: string) => void;
}

/**
 * Full-width vertical gasto form. Renders only the fields — the parent
 * (currently /caja/[periodoId]/nuevo) owns the save/cancel buttons and
 * the Fondo/Gastado/Saldo summary (shown in the sticky header).
 */
export default function GastoForm({
  values,
  setters,
  subtotalNum,
  totalNum,
  categorias,
  responsablesCatalog,
  showManageCat,
  newCatName,
  isOwner,
  setCategorias,
  setShowManageCat,
  setNewCatName,
}: Props) {
  const {
    gFecha, gDescripcion, gProveedor, gNroFactura,
    gSubtotal, gItbmsPct, gCategoria,
    gResponsableId,
  } = values;
  const {
    setGFecha, setGDescripcion, setGProveedor, setGNroFactura,
    setGSubtotal, setGItbmsPct, setGCategoria,
    setGResponsableId,
  } = setters;

  const [catError, setCatError] = useState<string | null>(null);

  const inputBase =
    "w-full border-b border-gray-200 py-2.5 text-base outline-none bg-transparent focus:border-black transition";
  const selectBase = `${inputBase} appearance-none pr-6`;
  const labelBase = "text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-2 block";

  return (
    <div className="space-y-6">
      <div>
        <label className={labelBase}>Fecha</label>
        <input
          type="date"
          value={gFecha}
          onChange={(e) => setGFecha(e.target.value)}
          className={inputBase}
        />
      </div>

      <div>
        <label className={labelBase}>
          Descripción <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={gDescripcion}
          onChange={(e) => setGDescripcion(e.target.value)}
          placeholder="Qué se compró"
          className={inputBase}
        />
      </div>

      <div>
        <label className={labelBase}>
          Proveedor <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={gProveedor}
          onChange={(e) => setGProveedor(e.target.value)}
          placeholder="Dónde se compró"
          className={inputBase}
        />
      </div>

      <div>
        <label className={labelBase}>N° Factura (opcional)</label>
        <input
          type="text"
          value={gNroFactura}
          onChange={(e) => setGNroFactura(e.target.value)}
          placeholder="Ej: 01234"
          className={inputBase}
        />
      </div>

      <div>
        <label className={labelBase}>
          Categoría <span className="text-red-500">*</span>
        </label>
        <select
          value={gCategoria}
          onChange={(e) => setGCategoria(e.target.value)}
          className={selectBase}
        >
          {categorias.length === 0 && <option value="">—</option>}
          {categorias.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {isOwner && (
          <>
            <button
              onClick={() => { setCatError(null); setShowManageCat(!showManageCat); }}
              className="text-xs text-gray-500 hover:text-black mt-2 inline-flex items-center gap-1 border border-gray-200 rounded px-2 py-1 hover:border-gray-400 transition"
              title="Gestionar categorias"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              Gestionar categorías
            </button>
            {showManageCat && (
              <div className="mt-3 p-3 bg-gray-50 rounded text-sm space-y-2">
                {categorias.map((c) => (
                  <div key={c} className="flex items-center justify-between py-1">
                    <span>{c}</span>
                    <button
                      onClick={async () => {
                        setCatError(null);
                        const res = await fetch("/api/caja/categorias", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ nombre: c }),
                        });
                        if (!res.ok) {
                          const payload = await res.json().catch(() => null);
                          setCatError(payload && typeof payload.error === "string" ? payload.error : "No se pudo eliminar la categoría.");
                          return;
                        }
                        setCategorias(categorias.filter((x) => x !== c));
                      }}
                      className="text-gray-300 hover:text-red-500 text-sm ml-3"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Nueva categoría"
                    className="flex-1 border-b border-gray-200 py-1 text-sm outline-none"
                  />
                  <button
                    onClick={async () => {
                      setCatError(null);
                      const normalized = normalizeStr(newCatName);
                      if (!normalized || categorias.includes(normalized)) return;
                      const res = await fetch("/api/caja/categorias", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ nombre: normalized }),
                      });
                      if (!res.ok) {
                        const payload = await res.json().catch(() => null);
                        setCatError(payload && typeof payload.error === "string" ? payload.error : "No se pudo crear la categoría.");
                        return;
                      }
                      setCategorias([...categorias, normalized]);
                      setNewCatName("");
                    }}
                    className="text-sm text-gray-500 hover:text-black"
                  >
                    ＋
                  </button>
                </div>
                {catError && <p className="text-xs text-red-600">{catError}</p>}
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <label className={labelBase}>
          Responsable <span className="text-red-500">*</span>
        </label>
        <select
          value={gResponsableId}
          onChange={(e) => setGResponsableId(e.target.value)}
          className={selectBase}
        >
          <option value="">—</option>
          {responsablesCatalog.map((r) => (
            <option key={r.id} value={r.id}>{r.nombre}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelBase}>
            Sub-total <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={gSubtotal}
            onChange={(e) => setGSubtotal(e.target.value)}
            placeholder="0.00"
            className={inputBase}
          />
          {gSubtotal && subtotalNum <= 0 && (
            <p className="text-[11px] text-red-500 mt-1">El monto debe ser mayor a $0</p>
          )}
        </div>
        <div>
          <label className={labelBase}>ITBMS</label>
          <select
            value={gItbmsPct}
            onChange={(e) => setGItbmsPct(e.target.value)}
            className={selectBase}
          >
            <option value="0">0%</option>
            <option value="7">7%</option>
          </select>
        </div>
      </div>

      <div className="flex items-baseline justify-between border-t border-gray-200 pt-4">
        <span className="text-[11px] uppercase tracking-[0.05em] text-gray-400">Total</span>
        <span className="text-lg font-semibold tabular-nums">${fmt(totalNum)}</span>
      </div>
    </div>
  );
}
