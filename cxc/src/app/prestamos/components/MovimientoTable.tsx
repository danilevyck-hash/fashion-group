"use client";

import { useState } from "react";
import { fmt, fmtDate } from "@/lib/format";
import { Movimiento } from "./types";
import { EmptyState, StatusBadge } from "@/components/ui";

interface Props {
  sortedMovs: Movimiento[];
  saldoByMov: Map<string, number>;
  isAdmin: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onApprove: (movId: string) => void;
  onEdit: (m: Movimiento) => void;
  onDelete: (movId: string) => void;
}

const PRESTAMO_CONCEPTOS = ["Préstamo", "Responsabilidad por daño"];

function isCargo(concepto: string) {
  return PRESTAMO_CONCEPTOS.includes(concepto);
}

// Sentence case: normaliza notas GRITADAS (todo mayúsculas) sin mangear texto
// normal ni acrónimos en minúscula/mixto.
function toSentence(s: string): string {
  const t = s.trim();
  if (!t) return t;
  const hasLower = /[a-záéíóúñ]/.test(t);
  const base = hasLower ? t : t.toLowerCase();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

type FiltroEstado = "todos" | "pendiente_aprobacion" | "aprobado" | "rechazado";

export default function MovimientoTable({ sortedMovs, saldoByMov, isAdmin, canEdit, canDelete, onApprove, onEdit, onDelete }: Props) {
  const [filtro, setFiltro] = useState<FiltroEstado>("todos");

  const countPend = sortedMovs.filter(m => m.estado === "pendiente_aprobacion").length;
  const countAprob = sortedMovs.filter(m => m.estado === "aprobado").length;
  const countRech = sortedMovs.filter(m => m.estado === "rechazado").length;

  const movs = filtro === "todos" ? sortedMovs : sortedMovs.filter(m => m.estado === filtro);
  const total = movs.length;
  const hasMixedEstados = movs.some(m => m.estado !== "aprobado");

  const tabs: { key: FiltroEstado; label: string; count: number }[] = [
    { key: "todos", label: "Todos", count: sortedMovs.length },
    { key: "pendiente_aprobacion", label: "Pendientes", count: countPend },
    { key: "aprobado", label: "Aprobados", count: countAprob },
    { key: "rechazado", label: "Rechazados", count: countRech },
  ];

  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs uppercase tracking-[0.05em] text-gray-400">Estado de Cuenta</h2>
        {total > 0 && (
          <span className="text-xs text-gray-400 tabular-nums">{total} movimiento{total !== 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Filtro por estado (antes vivía en la lista de empleados).
          `flex-wrap` en vez de `overflow-x-auto`: las 4 pestañas medían 89 px
          de más a 390 px y "Rechazados" quedaba fuera de la pantalla. Envueltas
          entran solas y en escritorio siguen en una sola fila. */}
      <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-0.5 mb-4 max-w-md">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setFiltro(t.key)}
            className={`flex min-h-[44px] items-center gap-1.5 px-3 text-sm rounded-md transition whitespace-nowrap ${filtro === t.key ? "bg-white text-black font-medium shadow-sm" : "text-gray-500"}`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${filtro === t.key ? "text-gray-600 bg-gray-100" : "text-gray-400 bg-gray-200"}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {movs.length === 0 ? (
        <EmptyState title={filtro === "todos" ? "Sin movimientos" : "Sin movimientos con este estado"} />
      ) : (
        <>
        {/* ── Tarjetas (celular y iPad) ──────────────────────────────────────
            La tabla es IMPOSIBLE por debajo de 1024 px y está MEDIDO: sus 7
            columnas piden 740 px de contenido, y el ancho útil es 358 px en un
            iPhone de 390 y 562 px en un iPad de 834 (la barra lateral se lleva
            224 px desde los 768). Resultado antes de esto: 366 px de arrastre a
            390 y 178 a 834 — de 6 columnas se veían 2, y las que quedaban fuera
            eran MONTO y SALDO. En tarjetas no falta ni un dato. */}
        <div className="lg:hidden space-y-2">
          {movs.map((m) => {
            const cargo = isCargo(m.concepto);
            const sign = cargo ? "+" : "−";
            const saldo = saldoByMov.get(m.id);
            const puedeEditar = canEdit && (m.estado !== "aprobado" || (Date.now() - new Date(m.created_at).getTime() < 24 * 60 * 60 * 1000));
            return (
              <div
                key={m.id}
                data-mov-fila={m.id}
                className="rounded-lg border border-gray-200 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900" data-mov-campo="concepto">{m.concepto}</p>
                    <p className="text-xs text-gray-500 tabular-nums mt-0.5" data-mov-campo="fecha">{fmtDate(m.fecha)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium tabular-nums text-gray-900" data-mov-campo="monto">{sign}${fmt(m.monto)}</p>
                    <p className="text-xs tabular-nums text-gray-500 mt-0.5" data-mov-campo="saldo">
                      {saldo !== undefined ? `Saldo $${fmt(saldo)}` : "Saldo —"}
                    </p>
                  </div>
                </div>

                {/* La nota va COMPLETA y en su propio renglón: en la tabla se
                    cortaba en los 3 anchos (la peor perdía 1003 px de texto). */}
                <p className="text-xs text-gray-500 mt-2 break-words" data-mov-campo="notas">
                  {m.notas ? toSentence(m.notas) : "—"}
                </p>

                {(hasMixedEstados || m.estado === "pendiente_aprobacion" || puedeEditar || canDelete) && (
                  <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
                    {hasMixedEstados && (
                      <span data-mov-campo="estado">
                        <StatusBadge estado={m.estado === "pendiente_aprobacion" ? "En revisión" : m.estado} />
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      {m.estado === "pendiente_aprobacion" && isAdmin && (
                        <button onClick={() => onApprove(m.id)} className="inline-flex min-h-[44px] items-center justify-center text-xs bg-green-600 text-white px-3 rounded-md hover:bg-green-700 transition">Aprobar</button>
                      )}
                      {puedeEditar && (
                        <button onClick={() => onEdit(m)} className="inline-flex h-11 w-11 items-center justify-center hover:bg-blue-50 rounded-lg transition text-gray-400 hover:text-blue-500" title="Editar" aria-label="Editar">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => onDelete(m.id)} className="inline-flex h-11 w-11 items-center justify-center hover:bg-red-50 rounded-lg transition text-gray-400 hover:text-red-500" title="Eliminar" aria-label="Eliminar">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Tabla (escritorio) ─────────────────────────────────────────── */}
        <div className="hidden lg:block overflow-x-auto">
          <div className="min-w-[640px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Fecha</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Concepto</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Notas</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Monto</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Saldo</th>
                {hasMixedEstados && (
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Estado</th>
                )}
                <th className="py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {movs.map((m, i) => {
                const cargo = isCargo(m.concepto);
                // Sin color por concepto: el signo del monto carga la semántica.
                const sign = cargo ? "+" : "−";
                const saldo = saldoByMov.get(m.id);
                return (
                <tr key={m.id} data-mov-fila={m.id} className={`${i % 2 === 1 ? "bg-gray-50/50" : ""} hover:bg-gray-50 transition-colors`}>
                  <td className="py-3 px-4 tabular-nums text-gray-600" data-mov-campo="fecha">{fmtDate(m.fecha)}</td>
                  <td className="py-3 px-4 font-medium text-gray-900" data-mov-campo="concepto">{m.concepto}</td>
                  {/* La nota se ENVUELVE (antes `truncate`): se cortaba en los 3
                      anchos — a 1440 la peor perdía 942 px de texto. */}
                  <td className="py-3 px-4 text-gray-400 text-xs max-w-[200px] break-words" data-mov-campo="notas">{m.notas ? toSentence(m.notas) : "—"}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium text-gray-900" data-mov-campo="monto">{sign}${fmt(m.monto)}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium text-gray-700" data-mov-campo="saldo">
                    {saldo !== undefined ? `$${fmt(saldo)}` : <span className="text-gray-300">—</span>}
                  </td>
                  {hasMixedEstados && (
                    <td className="py-3 px-4" data-mov-campo="estado">
                      <StatusBadge estado={m.estado === "pendiente_aprobacion" ? "En revisión" : m.estado} />
                    </td>
                  )}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      {m.estado === "pendiente_aprobacion" && isAdmin && (
                        <button onClick={() => onApprove(m.id)} className="inline-flex min-h-[44px] items-center justify-center text-xs bg-green-600 text-white px-3 rounded-md hover:bg-green-700 transition">Aprobar</button>
                      )}
                      {canEdit && (m.estado !== "aprobado" || (Date.now() - new Date(m.created_at).getTime() < 24 * 60 * 60 * 1000)) && (
                        <button onClick={() => onEdit(m)} className="inline-flex h-11 w-11 items-center justify-center hover:bg-blue-50 rounded-lg transition text-gray-400 hover:text-blue-500" title="Editar">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => onDelete(m.id)} className="inline-flex h-11 w-11 items-center justify-center hover:bg-red-50 rounded-lg transition text-gray-400 hover:text-red-500" title="Eliminar">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
