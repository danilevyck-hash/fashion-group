"use client";

import type { GuiaItem } from "./types";
import AddNewInline from "./AddNewInline";

interface GuiaFormProps {
  editingId: string | null;
  formNumero: number;
  fecha: string;
  setFecha: (v: string) => void;
  transportista: string;
  setTransportista: (v: string) => void;
  transportistaOtro: string;
  setTransportistaOtro: (v: string) => void;
  entregadoPor: string;
  setEntregadoPor: (v: string) => void;
  observaciones: string;
  setObservaciones: (v: string) => void;
  items: GuiaItem[];
  transportistas: string[];
  clientes: string[];
  direcciones: string[];
  empresas: string[];
  validationErrors: Set<string>;
  error: string | null;
  saving: boolean;
  onAddTransportista: (v: string) => void;
  onAddCliente: (v: string) => void;
  onAddDireccion: (v: string) => void;
  onAddEmpresa: (v: string) => void;
  onUpdateItem: (idx: number, field: keyof GuiaItem, value: string | number) => void;
  onAddRow: () => void;
  onRemoveRow: (idx: number) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function GuiaForm({
  editingId,
  formNumero,
  fecha,
  setFecha,
  transportista,
  setTransportista,
  transportistaOtro,
  setTransportistaOtro,
  entregadoPor,
  setEntregadoPor,
  observaciones,
  setObservaciones,
  items,
  transportistas,
  clientes,
  direcciones,
  empresas,
  validationErrors,
  error,
  saving,
  onAddTransportista,
  onAddCliente,
  onAddDireccion,
  onAddEmpresa,
  onUpdateItem,
  onAddRow,
  onRemoveRow,
  onSave,
  onCancel,
}: GuiaFormProps) {
  const totalBultos = items.reduce((s, i) => s + (i.bultos || 0), 0);

  function inputClass(key: string, base: string) {
    return `${base} ${
      validationErrors.has(key) ||
      validationErrors.has(key + "-format") ||
      validationErrors.has(key + "-separator")
        ? "border-red-400"
        : ""
    }`;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <button
        onClick={onCancel}
        className="text-sm text-gray-400 hover:text-black transition mb-8 block"
      >
        ← Guías
      </button>
      <div className="flex flex-wrap items-baseline gap-4 mb-10">
        <h1 className="text-xl font-light tracking-tight">
          {editingId ? "Editar" : "Nueva"} Guía de Transporte
        </h1>
        <span className="text-sm text-gray-400">N° {formNumero}</span>
      </div>

      {/* Header fields */}
      <div className="mb-10">
        <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">
          Información General
        </div>
        <div className="grid grid-cols-2 gap-x-12 gap-y-6">
          <div>
            <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
              Fecha <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={inputClass(
                "fecha",
                "w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition",
              )}
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
              Transportista <span className="text-red-500">*</span>
              <AddNewInline placeholder="Nombre" onAdd={onAddTransportista} />
            </label>
            <select
              value={transportista}
              onChange={(e) => setTransportista(e.target.value)}
              className={inputClass(
                "transportista",
                "w-full border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition appearance-none",
              )}
            >
              <option value="">Seleccionar...</option>
              {transportistas.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="__other__">Otro...</option>
            </select>
            {transportista === "__other__" && (
              <input
                type="text"
                placeholder="Nombre del transportista"
                value={transportistaOtro}
                onChange={(e) => setTransportistaOtro(e.target.value)}
                className={inputClass(
                  "transportista",
                  "w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition mt-3",
                )}
              />
            )}
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
              Entregado por <span className="text-red-500">*</span>
            </label>
            <select
              value={entregadoPor}
              onChange={(e) => setEntregadoPor(e.target.value)}
              className={inputClass(
                "entregadoPor",
                "w-full border-b border-gray-200 py-2 text-sm outline-none bg-transparent focus:border-black transition appearance-none",
              )}
            >
              <option value="">Seleccionar...</option>
              <option value="Julio">Julio</option>
              <option value="Rodrigo">Rodrigo</option>
            </select>
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="mb-10">
        <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-4">
          Detalle de Envío
        </div>

        <datalist id="clientes-list">
          {clientes.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id="direcciones-list">
          {direcciones.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>

        {validationErrors.has("items-empty") && (
          <p className="text-red-500 text-xs mb-3">
            Agrega al menos un envío con todos los campos completos.
          </p>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-[11px] uppercase tracking-[0.05em] text-gray-400">
              <th className="py-3 px-4 font-normal w-10 text-left">#</th>
              <th className="py-3 px-4 font-normal text-left">
                Cliente <span className="text-red-500">*</span>
                <AddNewInline placeholder="Cliente" onAdd={onAddCliente} />
              </th>
              <th className="py-3 px-4 font-normal text-left">
                Dirección <span className="text-red-500">*</span>
                <AddNewInline placeholder="Ciudad" onAdd={onAddDireccion} />
              </th>
              <th className="py-3 px-4 font-normal text-left">
                Empresa <span className="text-red-500">*</span>
                <AddNewInline placeholder="Empresa" onAdd={onAddEmpresa} />
              </th>
              <th className="py-3 px-4 font-normal text-left">
                Factura(s) <span className="text-red-500">*</span>
                <div className="text-[9px] text-gray-400 mt-0.5 font-normal normal-case tracking-normal">
                  Ej: 10234, 10235
                </div>
              </th>
              <th className="py-3 px-4 font-normal w-20 text-center">
                Bultos <span className="text-red-500">*</span>
              </th>
              <th className="py-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b border-gray-100">
                <td className="py-2 text-gray-300">{idx + 1}</td>
                <td className="py-2 pr-2">
                  <input
                    list="clientes-list"
                    type="text"
                    value={item.cliente}
                    onChange={(e) => onUpdateItem(idx, "cliente", e.target.value)}
                    className={inputClass(
                      `item-${idx}-cliente`,
                      "w-full border-b border-gray-100 py-1 text-sm outline-none focus:border-black transition",
                    )}
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    list="direcciones-list"
                    type="text"
                    value={item.direccion}
                    onChange={(e) => onUpdateItem(idx, "direccion", e.target.value)}
                    className={inputClass(
                      `item-${idx}-direccion`,
                      "w-full border-b border-gray-100 py-1 text-sm outline-none focus:border-black transition",
                    )}
                  />
                </td>
                <td className="py-2 pr-2">
                  <select
                    value={item.empresa}
                    onChange={(e) => onUpdateItem(idx, "empresa", e.target.value)}
                    className={inputClass(
                      `item-${idx}-empresa`,
                      "w-full border-b border-gray-100 py-1 text-sm outline-none bg-transparent focus:border-black transition appearance-none",
                    )}
                  >
                    <option value="">Seleccionar...</option>
                    {empresas.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="text"
                    value={item.facturas}
                    onChange={(e) => onUpdateItem(idx, "facturas", e.target.value)}
                    className={inputClass(
                      `item-${idx}-facturas`,
                      "w-full border-b border-gray-100 py-1 text-sm outline-none focus:border-black transition",
                    )}
                  />
                  {validationErrors.has(`item-${idx}-facturas-separator`) && (
                    <p className="text-[9px] text-red-500 mt-0.5">
                      Separar con coma y espacio (ej: FA-001, FA-002)
                    </p>
                  )}
                  {validationErrors.has(`item-${idx}-facturas-format`) &&
                    !validationErrors.has(`item-${idx}-facturas-separator`) && (
                      <p className="text-[9px] text-red-500 mt-0.5">Mín. 4 dígitos por factura</p>
                    )}
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    min={0}
                    value={item.bultos}
                    onChange={(e) => onUpdateItem(idx, "bultos", parseInt(e.target.value) || 0)}
                    className={inputClass(
                      `item-${idx}-bultos`,
                      "w-full border-b border-gray-100 py-1 text-sm outline-none text-center focus:border-black transition",
                    )}
                  />
                </td>
                <td className="py-2 text-center">
                  {items.length > 1 && (
                    <button
                      onClick={() => onRemoveRow(idx)}
                      className="text-gray-300 hover:text-black transition text-sm"
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={onAddRow}
          className="text-sm text-gray-400 hover:text-black transition mt-3"
        >
          + Agregar fila
        </button>
      </div>

      {/* Observaciones */}
      <div className="mb-10">
        <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
          Observaciones (opcional)
        </label>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
          className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none"
        />
      </div>

      {/* Footer */}
      <div className="mb-10">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.05em] text-gray-400">
            Total de bultos:
          </span>
          <span className="text-lg font-semibold tabular-nums">{totalBultos}</span>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      <div className="flex flex-wrap items-center gap-6">
        <button
          onClick={onSave}
          disabled={saving || !items.some((i) => i.cliente)}
          className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40"
        >
          {saving ? "Guardando..." : editingId ? "Guardar Cambios" : "Guardar Guía"}
        </button>
        <button
          onClick={onCancel}
          className="text-sm text-gray-400 hover:text-black transition"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
