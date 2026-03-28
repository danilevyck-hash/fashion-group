"use client";

import { fmt } from "@/lib/format";
import { CATEGORIAS_DEFAULT } from "./types";
import { EMPRESAS } from "@/lib/companies";

export const CAJA_EMPRESAS = [...EMPRESAS, "Multifashion", "Otro / General"];

export interface GastoFormValues {
  gFecha: string;
  gDescripcion: string;
  gProveedor: string;
  gNroFactura: string;
  gSubtotal: string;
  gItbmsPct: string;
  gCategoria: string;
  gCategoriaOtro: string;
  gResponsable: string;
  gEmpresa: string;
  gEmpresaOtro: string;
}

export interface GastoFormSetters {
  setGFecha: (v: string) => void;
  setGDescripcion: (v: string) => void;
  setGProveedor: (v: string) => void;
  setGNroFactura: (v: string) => void;
  setGSubtotal: (v: string) => void;
  setGItbmsPct: (v: string) => void;
  setGCategoria: (v: string) => void;
  setGCategoriaOtro: (v: string) => void;
  setGResponsable: (v: string) => void;
  setGEmpresa: (v: string) => void;
  setGEmpresaOtro: (v: string) => void;
}

interface Props {
  values: GastoFormValues;
  setters: GastoFormSetters;
  addingGasto: boolean;
  subtotalNum: number;
  totalNum: number;
  categorias: string[];
  responsables: string[];
  showManageCat: boolean;
  showAddResponsable: boolean;
  newCatName: string;
  newResponsable: string;
  setCategorias: (v: string[]) => void;
  setShowManageCat: (v: boolean) => void;
  setShowAddResponsable: (v: boolean) => void;
  setNewCatName: (v: string) => void;
  setNewResponsable: (v: string) => void;
  setResponsables: (v: string[]) => void;
  onAddGasto: () => void;
}

export default function GastoForm({
  values,
  setters,
  addingGasto,
  subtotalNum,
  totalNum,
  categorias,
  responsables,
  showManageCat,
  showAddResponsable,
  newCatName,
  newResponsable,
  setCategorias,
  setShowManageCat,
  setShowAddResponsable,
  setNewCatName,
  setNewResponsable,
  setResponsables,
  onAddGasto,
}: Props) {
  const {
    gFecha, gDescripcion, gProveedor, gNroFactura,
    gSubtotal, gItbmsPct, gCategoria, gCategoriaOtro,
    gResponsable, gEmpresa, gEmpresaOtro,
  } = values;
  const {
    setGFecha, setGDescripcion, setGProveedor, setGNroFactura,
    setGSubtotal, setGItbmsPct, setGCategoria, setGCategoriaOtro,
    setGResponsable, setGEmpresa, setGEmpresaOtro,
  } = setters;

  return (
    <div className="mb-10">
      <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">
        Agregar Gasto
      </div>
      <div className="grid grid-cols-5 gap-3 items-end mb-3">
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
            Fecha
          </label>
          <input
            type="date"
            value={gFecha}
            onChange={(e) => setGFecha(e.target.value)}
            className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
            Descripción <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={gDescripcion}
            onChange={(e) => setGDescripcion(e.target.value)}
            placeholder="Qué se compró"
            className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
            Proveedor
          </label>
          <input
            type="text"
            value={gProveedor}
            onChange={(e) => setGProveedor(e.target.value)}
            placeholder="Dónde se compró"
            className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
            N° Factura
          </label>
          <input
            type="text"
            value={gNroFactura}
            onChange={(e) => setGNroFactura(e.target.value)}
            placeholder="Opcional"
            className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
            Categoría
          </label>
          <select
            value={gCategoria}
            onChange={(e) => {
              setGCategoria(e.target.value);
              if (e.target.value !== "Otro") setGCategoriaOtro("");
            }}
            className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent focus:border-black transition appearance-none"
          >
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {gCategoria === "Otro" && (
            <input
              type="text"
              value={gCategoriaOtro}
              onChange={(e) => setGCategoriaOtro(e.target.value)}
              placeholder="Especificar categoría"
              className="w-full border-b border-gray-200 py-1 text-xs outline-none focus:border-black transition mt-1"
            />
          )}
          <button
            onClick={() => setShowManageCat(!showManageCat)}
            className="text-[10px] text-gray-300 hover:text-gray-500 mt-1 block"
          >
            Gestionar categorías
          </button>
          {showManageCat && (
            <div className="mt-2 p-2 bg-gray-50 rounded text-xs space-y-1">
              {categorias.map((c) => (
                <div key={c} className="flex items-center justify-between py-1">
                  <span>{c}</span>
                  <button
                    onClick={() => {
                      const updated = categorias.filter((x) => x !== c);
                      setCategorias(updated);
                      localStorage.setItem(
                        "fg_categorias",
                        JSON.stringify(
                          updated.filter((x) => !CATEGORIAS_DEFAULT.includes(x))
                        )
                      );
                      if (CATEGORIAS_DEFAULT.includes(c)) {
                        const del = JSON.parse(
                          localStorage.getItem("fg_categorias_deleted") || "[]"
                        );
                        localStorage.setItem(
                          "fg_categorias_deleted",
                          JSON.stringify([...del, c])
                        );
                      }
                    }}
                    className="text-gray-300 hover:text-red-500 text-xs ml-3"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-1 mt-1">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Nueva categoría"
                  className="flex-1 border-b border-gray-200 py-0.5 text-xs outline-none"
                />
                <button
                  onClick={() => {
                    if (!newCatName.trim() || categorias.includes(newCatName.trim()))
                      return;
                    const updated = [...categorias, newCatName.trim()];
                    setCategorias(updated);
                    localStorage.setItem(
                      "fg_categorias",
                      JSON.stringify(
                        updated.filter((x) => !CATEGORIAS_DEFAULT.includes(x))
                      )
                    );
                    setNewCatName("");
                  }}
                  className="text-xs text-gray-500 hover:text-black"
                >
                  ＋
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3 items-end">
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
            Responsable
            {!showAddResponsable && (
              <button
                onClick={() => setShowAddResponsable(true)}
                className="text-gray-300 hover:text-gray-500 transition text-xs ml-1"
              >
                ＋
              </button>
            )}
          </label>
          {showAddResponsable ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newResponsable}
                onChange={(e) => setNewResponsable(e.target.value)}
                placeholder="Nombre"
                className="flex-1 border-b border-gray-300 py-1 text-xs outline-none focus:border-black"
                autoFocus
              />
              <button
                onClick={async () => {
                  if (!newResponsable.trim()) return;
                  await fetch("/api/caja/responsables", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ nombre: newResponsable.trim() }),
                  });
                  setResponsables([...responsables, newResponsable.trim()]);
                  setGResponsable(newResponsable.trim());
                  setNewResponsable("");
                  setShowAddResponsable(false);
                }}
                className="text-xs text-gray-500 hover:text-black"
              >
                OK
              </button>
              <button
                onClick={() => {
                  setNewResponsable("");
                  setShowAddResponsable(false);
                }}
                className="text-xs text-gray-300 hover:text-black"
              >
                ×
              </button>
            </div>
          ) : (
            <select
              value={gResponsable}
              onChange={(e) => setGResponsable(e.target.value)}
              className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent focus:border-black transition appearance-none"
            >
              <option value="">—</option>
              {responsables.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
            Empresa
          </label>
          <select
            value={gEmpresa}
            onChange={(e) => {
              setGEmpresa(e.target.value);
              if (e.target.value !== "Otro / General") setGEmpresaOtro("");
            }}
            className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent focus:border-black transition appearance-none"
          >
            <option value="">—</option>
            {CAJA_EMPRESAS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          {gEmpresa === "Otro / General" && (
            <input
              type="text"
              value={gEmpresaOtro}
              onChange={(e) => setGEmpresaOtro(e.target.value)}
              placeholder="Especificar empresa"
              className="w-full border-b border-gray-200 py-1 text-xs outline-none focus:border-black transition mt-1"
            />
          )}
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
            Sub-total
          </label>
          <input
            type="number"
            step="0.01"
            value={gSubtotal}
            onChange={(e) => setGSubtotal(e.target.value)}
            className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
            ITBMS
          </label>
          <select
            value={gItbmsPct}
            onChange={(e) => setGItbmsPct(e.target.value)}
            className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent focus:border-black transition appearance-none"
          >
            <option value="0">0%</option>
            <option value="7">7%</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
            Total
          </label>
          <input
            type="text"
            readOnly
            value={`$${fmt(totalNum)}`}
            className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent tabular-nums"
          />
        </div>
        <div>
          <button
            onClick={onAddGasto}
            disabled={addingGasto || !gDescripcion || subtotalNum <= 0}
            className="bg-black text-white px-6 py-1.5 rounded-full text-sm hover:bg-gray-800 transition disabled:opacity-40"
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
