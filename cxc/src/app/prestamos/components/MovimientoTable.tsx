"use client";

import { fmt, fmtDate } from "@/lib/format";
import { Movimiento } from "./types";
import { EmptyState } from "@/components/ui";
import { etiquetaConcepto, esCargo } from "@/lib/prestamos-conceptos";
import { ESTADO_PENDIENTE, NOMBRE_CUENTA, cuentaDeMovimiento } from "@/lib/prestamos-saldo";
import { desdeCuandoEspera } from "@/lib/prestamos-tope";

interface Props {
  sortedMovs: Movimiento[];
  saldoByMov: Map<string, number>;
  hoy: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (m: Movimiento) => void;
  onDelete: (movId: string) => void;
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

/**
 * EL ESTADO DE CUENTA.
 *
 * 🩸 SE FUERON LAS CUATRO PESTAÑAS de estado (Todos · Pendientes · Aprobados ·
 * Rechazados). Con 443 filas de 443 en `aprobado` decían siempre `443 · 0 · 0`,
 * la columna Estado nunca se pintaba y el botón verde «Aprobar» era inalcanzable.
 *
 * 🔴 Y LO QUE ESPERA APROBACIÓN NO VUELVE A UNA PESTAÑA: va **resaltado en la
 * misma lista**, con «Esperando a Daniel · hace N días». Esconder lo que espera
 * detrás de un filtro que nadie toca es exactamente cómo los $700 de LUIS
 * ADRIAN ARROYO pasaron 22 días invisibles. Se aprueba en «Préstamos por
 * aprobar», que solo Daniel puede tocar.
 */
export default function MovimientoTable({ sortedMovs, saldoByMov, hoy, canEdit, canDelete, onEdit, onDelete }: Props) {
  const movs = sortedMovs;
  const total = movs.length;
  const hayDano = movs.some((m) => cuentaDeMovimiento(m) === "dano");

  return (
    <div className="mb-6">
      {/* `sr-only`: es la única tabla de la ficha del empleado y sus columnas
          ya dicen qué es. El encabezado queda para quien usa lector. */}
      <div className="flex items-baseline justify-end mb-3">
        <h2 className="sr-only">Estado de Cuenta</h2>
        {total > 0 && (
          <span className="text-xs text-gray-400 tabular-nums">{total} movimiento{total !== 1 ? "s" : ""}</span>
        )}
      </div>

      {movs.length === 0 ? (
        <EmptyState title="Sin movimientos" />
      ) : (
        <>
        {/* ── Tarjetas (celular y iPad) ──────────────────────────────────────
            La tabla es IMPOSIBLE por debajo de 1024 px y está MEDIDO: sus
            columnas piden 740 px de contenido, y el ancho útil es 358 px en un
            iPhone de 390 y 562 px en un iPad de 834 (la barra lateral se lleva
            224 px desde los 768). En tarjetas no falta ni un dato. */}
        <div className="lg:hidden space-y-2">
          {movs.map((m) => {
            const cargo = esCargo(m.concepto);
            const sign = cargo ? "+" : "−";
            const saldo = saldoByMov.get(m.id);
            const espera = m.estado === ESTADO_PENDIENTE;
            const puedeEditar = canEdit && (espera || (Date.now() - new Date(m.created_at).getTime() < 24 * 60 * 60 * 1000));
            return (
              <div
                key={m.id}
                data-mov-fila={m.id}
                className={`rounded-lg border p-3 ${espera ? "border-amber-300 bg-amber-50" : "border-gray-200"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900" data-mov-campo="concepto">{etiquetaConcepto(m.concepto)}</p>
                    <p className="text-xs text-gray-500 tabular-nums mt-0.5" data-mov-campo="fecha">{fmtDate(m.fecha)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium tabular-nums text-gray-900" data-mov-campo="monto">{sign}${fmt(m.monto)}</p>
                    <p className="text-xs tabular-nums text-gray-500 mt-0.5" data-mov-campo="saldo">
                      {espera ? "No suma" : saldo !== undefined ? `Saldo $${fmt(saldo)}` : "Saldo —"}
                    </p>
                  </div>
                </div>

                {espera && (
                  <p className="mt-2 text-xs font-medium text-amber-800" data-mov-campo="espera">
                    Esperando a Daniel · {desdeCuandoEspera(m.fecha, hoy)}
                  </p>
                )}

                <p className="text-xs text-gray-500 mt-2 break-words" data-mov-campo="notas">
                  {[hayDano ? NOMBRE_CUENTA[cuentaDeMovimiento(m)] : null, m.origen_pago, m.notas ? toSentence(m.notas) : null]
                    .filter(Boolean).join(" · ") || "—"}
                </p>

                {(puedeEditar || canDelete) && (
                  <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
                    <div className="ml-auto flex items-center gap-1">
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
                {hayDano && (
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Cuenta</th>
                )}
                <th className="text-left py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Notas</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Monto</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Saldo</th>
                <th className="py-3 px-4 text-xs uppercase tracking-[0.05em] text-gray-400 font-normal">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {movs.map((m, i) => {
                const cargo = esCargo(m.concepto);
                // Sin color por concepto: el signo del monto carga la semántica.
                const sign = cargo ? "+" : "−";
                const saldo = saldoByMov.get(m.id);
                const espera = m.estado === ESTADO_PENDIENTE;
                return (
                <tr key={m.id} data-mov-fila={m.id} className={`${espera ? "bg-amber-50" : i % 2 === 1 ? "bg-gray-50/50" : ""} hover:bg-gray-50 transition-colors`}>
                  <td className="py-3 px-4 tabular-nums text-gray-600" data-mov-campo="fecha">{fmtDate(m.fecha)}</td>
                  <td className="py-3 px-4 font-medium text-gray-900" data-mov-campo="concepto">
                    {etiquetaConcepto(m.concepto)}
                    {espera && (
                      <span className="ml-2 text-xs font-medium text-amber-800" data-mov-campo="espera">
                        Esperando a Daniel · {desdeCuandoEspera(m.fecha, hoy)}
                      </span>
                    )}
                  </td>
                  {hayDano && (
                    <td className="py-3 px-4 text-xs text-gray-500" data-mov-campo="cuenta">{NOMBRE_CUENTA[cuentaDeMovimiento(m)]}</td>
                  )}
                  {/* La nota se ENVUELVE (antes `truncate`): se cortaba en los 3
                      anchos — a 1440 la peor perdía 942 px de texto. */}
                  <td className="py-3 px-4 text-gray-400 text-xs max-w-[200px] break-words" data-mov-campo="notas">
                    {[m.origen_pago, m.notas ? toSentence(m.notas) : null].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium text-gray-900" data-mov-campo="monto">{sign}${fmt(m.monto)}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium text-gray-700" data-mov-campo="saldo">
                    {espera ? <span className="text-xs text-gray-400">No suma</span>
                      : saldo !== undefined ? `$${fmt(saldo)}` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      {canEdit && (m.estado === ESTADO_PENDIENTE || (Date.now() - new Date(m.created_at).getTime() < 24 * 60 * 60 * 1000)) && (
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
