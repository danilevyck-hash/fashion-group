"use client";

/**
 * LAS VENTANAS DEL CHEQUE — detalle, rebotado y «los del día».
 *
 * Salieron del orquestador el 5-sep-2026 por el límite de 800 líneas de la casa
 * (el archivo que se reemplazó tenía 1.693). No cambian de comportamiento: son
 * las mismas tres ventanas, con el mismo texto.
 *
 * 🔴 «Eliminar cheque» vive en el DETALLE, y es a propósito: es la salida para
 * un cheque que no se va a cobrar. Daniel, al rediseñar el módulo: *«no lo
 * quiero marcar»* — no se agregó ningún estado tipo «no se cobró»; se borra.
 * Los DEPOSITADOS no se borran: son data histórica.
 */

import type { ReactNode, RefObject } from "react";
import { ConfirmDeleteModal, ConfirmModal, Modal, StatusBadge } from "@/components/ui";
import { fmt, fmtDate } from "@/lib/format";
import { getCompanyDisplay } from "@/lib/companies";
import { estadoVisible } from "@/lib/recordatorios/agenda";
import type { Recordatorio } from "@/lib/recordatorios/recordatorio";
import type { Cheque } from "../RecordatoriosClient";

// ─── Detalle de un cheque ────────────────────────────────────────────────────

function Fila({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs uppercase tracking-[0.05em] text-gray-400">{label}</span>
      <span className="text-sm text-gray-900 text-right">{value}</span>
    </div>
  );
}

export function DetalleCheque({
  cheque,
  hoy,
  esAdmin,
  onCerrar,
  onEditar,
  onEliminar,
}: {
  cheque: Cheque | null;
  hoy: string;
  esAdmin: boolean;
  onCerrar: () => void;
  onEditar: (id: string) => void;
  onEliminar: (id: string) => void;
}) {
  return (
    <Modal open={!!cheque} onClose={onCerrar} title="Detalle del cheque">
      {cheque &&
        (() => {
          const ve = estadoVisible(cheque, hoy);
          return (
            <div>
              <Fila label="Cliente" value={cheque.cliente} />
              <Fila label="Empresa" value={getCompanyDisplay(cheque.empresa)} />
              <Fila label="N° Cheque" value={cheque.numero_cheque} />
              <Fila
                label="Monto"
                value={<span className="font-medium tabular-nums">${fmt(cheque.monto)}</span>}
              />
              <Fila label="Vence" value={fmtDate(cheque.fecha_deposito)} />
              <Fila
                label="Depositado"
                value={cheque.fecha_depositado ? fmtDate(cheque.fecha_depositado) : "—"}
              />
              <Fila label="Estado" value={<StatusBadge estado={ve} />} />
              {cheque.vendedor && <Fila label="Vendedor" value={cheque.vendedor} />}
              {cheque.notas && <Fila label="Notas" value={cheque.notas} />}
              {cheque.motivo_rebote && <Fila label="Motivo rebote" value={cheque.motivo_rebote} />}
              <div className="flex flex-wrap gap-3 mt-5">
                <button
                  onClick={() => onEditar(cheque.id)}
                  className="flex-1 bg-black text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition min-h-[44px]"
                >
                  Editar
                </button>
                <button
                  onClick={onCerrar}
                  className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition min-h-[44px]"
                >
                  Cerrar
                </button>
              </div>
              {esAdmin && ve !== "depositado" && (
                <button
                  onClick={() => onEliminar(cheque.id)}
                  className="mt-3 text-sm text-gray-400 hover:text-red-600 transition min-h-[44px] inline-flex items-center"
                >
                  Eliminar cheque
                </button>
              )}
            </div>
          );
        })()}
    </Modal>
  );
}

// ─── Las dos confirmaciones ──────────────────────────────────────────────────
// La de DEPOSITAR mueve plata; la de ELIMINAR es destructiva. Las dos dicen el
// número y el monto del cheque: confirmar «¿estás seguro?» a secas no deja
// verificar que se está tocando el que se cree.

export function Confirmaciones({
  cheques,
  depositarId,
  eliminarId,
  onCerrarDepositar,
  onCerrarEliminar,
  onDepositar,
  onEliminar,
}: {
  cheques: Cheque[];
  depositarId: string | null;
  eliminarId: string | null;
  onCerrarDepositar: () => void;
  onCerrarEliminar: () => void;
  onDepositar: (id: string) => void;
  onEliminar: (id: string) => void;
}) {
  const dep = cheques.find((c) => c.id === depositarId);
  const del = cheques.find((c) => c.id === eliminarId);
  return (
    <>
      <ConfirmModal
        open={!!depositarId}
        onClose={onCerrarDepositar}
        onConfirm={() => onDepositar(depositarId as string)}
        title="Depositar cheque"
        message={dep ? `¿Depositar cheque N° ${dep.numero_cheque} por $${fmt(dep.monto)}?` : ""}
        confirmLabel="Sí, depositar"
      />
      <ConfirmDeleteModal
        open={!!eliminarId}
        onCancel={onCerrarEliminar}
        onConfirm={() => onEliminar(eliminarId as string)}
        title="Eliminar cheque"
        description={
          del
            ? `¿Eliminar el cheque N° ${del.numero_cheque} por $${fmt(del.monto)}? Esta acción no se puede deshacer.`
            : "Esta acción no se puede deshacer."
        }
      />
    </>
  );
}

// ─── «Marcar como rebotado» ──────────────────────────────────────────────────

export function ModalRebote({
  abierto,
  motivo,
  panelRef,
  backdrop,
  onMotivo,
  onConfirmar,
  onCancelar,
}: {
  abierto: boolean;
  motivo: string;
  panelRef: RefObject<HTMLDivElement>;
  backdrop: Record<string, unknown>;
  onMotivo: (v: string) => void;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  if (!abierto) return null;
  return (
    // El motivo se escribe a mano, así que el cierre NO lo borra: el clic fuera
    // y el Escape equivalen a Cancelar, nunca a marcar el cheque.
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" {...backdrop}>
      <div ref={panelRef} className="bg-white rounded-lg p-6 w-full max-w-md border border-gray-200">
        <div className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-4">
          Marcar como Rebotado
        </div>
        <label className="text-xs uppercase tracking-[0.05em] text-gray-400">
          Motivo (opcional)
        </label>
        <textarea
          value={motivo}
          onChange={(e) => onMotivo(e.target.value)}
          rows={3}
          placeholder="Fondos insuficientes, firma incorrecta, etc."
          className="w-full border border-gray-200 rounded-lg py-2 px-3 text-base sm:text-sm outline-none focus:border-black transition resize-none mt-1 min-h-[48px]"
        />
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={onConfirmar}
            className="bg-red-600 text-white px-5 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-red-700 transition"
          >
            Confirmar rebotado
          </button>
          <button
            onClick={onCancelar}
            className="text-sm text-gray-400 hover:text-black transition min-h-[44px] min-w-[44px] px-2 -mx-2 inline-flex items-center justify-center"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── «Los del día» — se abre desde el «+N más» del calendario ────────────────

export function ModalDelDia({
  fecha,
  cheques,
  recordatorios,
  hoy,
  onCerrar,
  onAbrirCheque,
  onAbrirRecordatorio,
}: {
  fecha: string | null;
  cheques: Cheque[];
  recordatorios: Recordatorio[];
  hoy: string;
  onCerrar: () => void;
  onAbrirCheque: (id: string) => void;
  onAbrirRecordatorio: (id: string) => void;
}) {
  if (!fecha) return null;
  return (
    <div
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={`Cheques del ${fmtDate(fecha)}`}
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg border border-gray-200 w-full max-w-md max-h-[80vh] flex flex-col"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-medium">Cheques del {fmtDate(fecha)}</h2>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-black transition p-1 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {recordatorios.map((rec) => (
            <button
              key={rec.id}
              data-recordatorio-pill={rec.id}
              onClick={() => onAbrirRecordatorio(rec.id)}
              className="w-full text-left px-5 py-3 bg-blue-50/60 hover:bg-blue-50 transition min-h-[44px]"
            >
              <span className="flex items-start gap-2">
                <span aria-hidden className="flex-shrink-0 mt-0.5">
                  🔔
                </span>
                <span className="block text-sm font-medium text-blue-900 break-words">
                  {rec.texto}
                </span>
              </span>
            </button>
          ))}
          {cheques.map((c) => (
            <div key={c.id} className="px-5 py-3">
              <button onClick={() => onAbrirCheque(c.id)} className="w-full text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{c.cliente}</span>
                  <span className="text-sm font-semibold tabular-nums flex-shrink-0">
                    ${fmt(c.monto)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <StatusBadge estado={estadoVisible(c, hoy)} />
                  <span>N° {c.numero_cheque}</span>
                  <span>·</span>
                  <span className="truncate">{getCompanyDisplay(c.empresa)}</span>
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
