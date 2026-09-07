"use client";

import { useState } from "react";
import { fmt, fmtDate } from "@/lib/format";
import { CajaGasto } from "./types";
import OverflowMenu from "@/components/ui/OverflowMenu";
import AutocompleteInput from "./AutocompleteInput";
import ZonaFotos from "./ZonaFotos";
import { centavos } from "@/lib/caja/dinero";

/**
 * UN GASTO EN PANTALLA ANGOSTA — la ficha (celular e iPad, por debajo de
 * 1024 px).
 *
 * 🩸 **«Editar» no hacía nada.** El menú «···» lo ofrecía en la ficha, pero el
 * formulario de edición solo existía dentro de la tabla de escritorio: tocarlo
 * abajo de 1024 px marcaba la fila y ahí terminaba todo. Un botón que no hace
 * nada es un botón que miente. Ahora la ficha edita de verdad, con los mismos
 * campos y el mismo guardado que la tabla.
 *
 * 🩸 **Faltaba el N° de factura.** La ficha mostraba descripción, monto,
 * categoría y «fecha · proveedor» — por eso los dos recibos repetidos de Super
 * 99 (misma factura, 39 segundos de diferencia) se veían idénticos.
 *
 * ⚠️ Angela trabaja en la computadora: esto no es urgente, pero un camino roto
 * no se deja abierto.
 */

interface Props {
  gasto: CajaGasto;
  isOpen: boolean;
  categorias: string[];
  editando: boolean;
  editGasto: Partial<CajaGasto>;
  setEditGasto: (g: Partial<CajaGasto>) => void;
  onEditar: () => void;
  onCancelar: () => void;
  onGuardar: () => void;
  onEliminar: () => void;
  resaltado?: boolean;
}

const campoStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 10px",
  fontSize: 14,
  color: "var(--caja-fg-strong)",
  background: "#fff",
  outline: "none",
  borderRadius: 6,
  border: "1px solid var(--caja-border-default)",
};

export default function FichaGasto({
  gasto: g,
  isOpen,
  categorias,
  editando,
  editGasto,
  setEditGasto,
  onEditar,
  onCancelar,
  onGuardar,
  onEliminar,
  resaltado = false,
}: Props) {
  const [verFotos, setVerFotos] = useState(false);

  if (editando) {
    const totalEnVivo = centavos(centavos(editGasto.subtotal) + centavos(editGasto.itbms));
    return (
      <div
        data-gasto-fila={g.id}
        data-gasto-editando="1"
        className="rounded-lg p-4 space-y-3"
        style={{ background: "var(--caja-bg-page)", border: "1px solid var(--caja-accent)" }}
      >
        <input
          type="date"
          aria-label="Fecha"
          value={editGasto.fecha || ""}
          onChange={(e) => setEditGasto({ ...editGasto, fecha: e.target.value })}
          className="caja-mono"
          style={campoStyle}
        />
        <input
          type="text"
          aria-label="Descripción"
          placeholder="¿En qué se gastó?"
          value={editGasto.descripcion || ""}
          onChange={(e) => setEditGasto({ ...editGasto, descripcion: e.target.value })}
          style={campoStyle}
        />
        <input
          type="text"
          aria-label="Proveedor"
          placeholder="Proveedor"
          value={editGasto.proveedor || ""}
          onChange={(e) => setEditGasto({ ...editGasto, proveedor: e.target.value })}
          style={campoStyle}
        />
        <input
          type="text"
          aria-label="Nº de factura"
          placeholder="Nº de factura (opcional)"
          value={editGasto.nro_factura || ""}
          onChange={(e) => setEditGasto({ ...editGasto, nro_factura: e.target.value })}
          className="caja-mono"
          style={campoStyle}
        />
        <AutocompleteInput
          value={editGasto.categoria || "Varios"}
          onChange={(v) => setEditGasto({ ...editGasto, categoria: v })}
          options={categorias}
          placeholder="Categoría"
          className="w-full min-h-[44px] px-2.5 text-sm outline-none bg-white rounded-md"
        />
        <input
          type="number"
          step="0.01"
          inputMode="decimal"
          aria-label="Subtotal"
          placeholder="0.00"
          value={editGasto.subtotal ?? ""}
          onChange={(e) => setEditGasto({ ...editGasto, subtotal: parseFloat(e.target.value) || 0 })}
          className="caja-mono text-right"
          style={campoStyle}
        />
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs" style={{ color: "var(--caja-fg-muted)" }}>
            Total <span className="caja-mono" style={{ color: "var(--caja-fg-strong)" }}>${fmt(totalEnVivo)}</span>
          </span>
          <div className="flex gap-2">
            <button
              onClick={onCancelar}
              className="px-3 min-h-[44px] rounded-md text-sm"
              style={{ background: "#fff", color: "var(--caja-fg-default)", border: "1px solid var(--caja-border-default)" }}
            >
              Cancelar
            </button>
            <button
              onClick={onGuardar}
              className="px-3 min-h-[44px] rounded-md text-sm font-medium active:scale-[0.97] transition-transform"
              style={{ background: "var(--caja-accent)", color: "#fff" }}
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const items = [
    { label: "Editar", onClick: onEditar },
    { label: (g.fotos ?? 0) > 0 ? `Foto del recibo (${g.fotos})` : "Foto del recibo", onClick: () => setVerFotos((v) => !v) },
    { label: "Eliminar", onClick: onEliminar, destructive: true },
  ];

  return (
    <div
      data-gasto-fila={g.id}
      className={`rounded-lg p-4 ${resaltado ? "new-row-highlight" : ""}`}
      style={{
        background: "var(--caja-bg-surface)",
        border: "1px solid var(--caja-border-subtle)",
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p
          className="text-sm font-medium truncate flex-1"
          style={{ color: "var(--caja-fg-strong)" }}
          data-gasto-campo="descripcion"
        >
          {g.descripcion || g.nombre || "—"}
        </p>
        <p className="caja-money caja-money-strong text-sm whitespace-nowrap" data-gasto-campo="total">
          ${fmt(g.total)}
        </p>
        {isOpen && (
          <div className="-my-2 -mr-2">
            <OverflowMenu items={items} />
          </div>
        )}
      </div>
      <div className="mb-1" data-gasto-campo="categoria">
        <span className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--caja-fg-default)" }}>
          {g.categoria || "Varios"}
        </span>
      </div>
      <p className="text-sm caja-mono" style={{ color: "var(--caja-fg-subtle)" }}>
        {fmtDate(g.fecha)}
        {g.proveedor && ` · ${g.proveedor}`}
      </p>
      {/* 🔴 El N° de factura: es lo que distingue dos recibos del mismo día, del
          mismo lugar y por el mismo monto. */}
      {g.nro_factura?.trim() && (
        <p className="text-sm caja-mono mt-0.5" data-gasto-campo="factura" style={{ color: "var(--caja-fg-subtle)" }}>
          #{g.nro_factura}
        </p>
      )}
      {verFotos && (
        <div className="mt-3">
          <ZonaFotos gastoId={g.id} soloVer={!isOpen} />
        </div>
      )}
    </div>
  );
}
