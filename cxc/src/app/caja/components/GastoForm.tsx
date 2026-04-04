"use client";

import { useState } from "react";
import { fmt } from "@/lib/format";
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

export function normalizeStr(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function AutocompleteInput({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const matches = value.length >= 1
    ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : options.slice(0, 8);

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        className={className}
      />
      {open && matches.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 mt-1 max-h-48 overflow-y-auto">
          {matches.map((m) => (
            <button
              key={m}
              type="button"
              onMouseDown={() => { onChange(m); setOpen(false); }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition"
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  values: GastoFormValues;
  setters: GastoFormSetters;
  addingGasto: boolean;
  subtotalNum: number;
  totalNum: number;
  categorias: string[];
  allCategorias: string[];
  responsables: string[];
  allResponsables: string[];
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
  allCategorias,
  responsables,
  allResponsables,
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

  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  return (
    <div className="mb-10">
      <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">
        Agregar Gasto
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 items-end mb-3">
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
        <div className="hidden lg:block">
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
        <div className="hidden lg:block">
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
            Categoría <span className="text-red-500">*</span>
          </label>
          <AutocompleteInput
            value={gCategoria}
            onChange={(v) => setGCategoria(v)}
            options={allCategorias}
            placeholder="Ej: Transporte"
            className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent focus:border-black transition"
          />
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
                      setCategorias(categorias.filter((x) => x !== c));
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
                  onClick={async () => {
                    const normalized = normalizeStr(newCatName);
                    if (!normalized || categorias.includes(normalized))
                      return;
                    await fetch("/api/caja/categorias", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ nombre: normalized }),
                    });
                    setCategorias([...categorias, normalized]);
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

      {/* Mobile-only collapsible for optional fields */}
      <div className="lg:hidden mb-3">
        <button onClick={() => setShowMoreDetails(!showMoreDetails)} className="text-xs text-gray-400 hover:text-black transition flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showMoreDetails ? "rotate-90" : ""}`}><polyline points="9 18 15 12 9 6"/></svg>
          {showMoreDetails ? "Ocultar detalles opcionales" : "Mas detalles (Proveedor, Factura, Responsable)"}
        </button>
        {showMoreDetails && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end mt-2">
            <div>
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">Proveedor</label>
              <input type="text" value={gProveedor} onChange={(e) => setGProveedor(e.target.value)} placeholder="Dónde se compró" className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">N° Factura</label>
              <input type="text" value={gNroFactura} onChange={(e) => setGNroFactura(e.target.value)} placeholder="Opcional" className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">Responsable</label>
              <AutocompleteInput
                value={gResponsable}
                onChange={(v) => setGResponsable(v)}
                options={allResponsables}
                placeholder="Nombre"
                className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent focus:border-black transition"
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
        <div className="hidden lg:block">
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
            Responsable
          </label>
          <AutocompleteInput
            value={gResponsable}
            onChange={(v) => setGResponsable(v)}
            options={allResponsables}
            placeholder="Nombre"
            className="w-full border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent focus:border-black transition"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
            Empresa <span className="text-red-500">*</span>
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
            Sub-total <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            value={gSubtotal}
            onChange={(e) => setGSubtotal(e.target.value)}
            className="w-full border-b border-gray-200 py-1.5 text-sm outline-none focus:border-black transition"
          />
          {gSubtotal && subtotalNum <= 0 && <p className="text-[10px] text-red-500 mt-0.5">El monto debe ser mayor a $0</p>}
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
            onClick={() => { onAddGasto(); setJustSaved(true); setTimeout(() => setJustSaved(false), 2000); }}
            disabled={addingGasto || !gDescripcion || subtotalNum <= 0}
            className="bg-black text-white px-6 py-1.5 rounded-full text-sm hover:bg-gray-800 transition disabled:opacity-50"
          >
            {justSaved ? "Guardado \u2713" : "Agregar"}
          </button>
        </div>
      </div>
    </div>
  );
}
