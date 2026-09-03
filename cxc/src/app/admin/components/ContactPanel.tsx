"use client";

import { useState } from "react";
import Link from "next/link";
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import { fmt, fmtDate } from "@/lib/format";
import { daysSince, daysAgingColor } from "@/lib/cxc-aging";
import UltimosPagos from "@/components/cxc/UltimosPagos";
import { useUltimosPagosGrupo } from "../hooks/useUltimosPagosGrupo";

interface Props {
  client: ConsolidatedClient;
  // 🔴 `onSaveEdit` se RETIRÓ (24-ago-2026). Este panel dejó de editar contacto
  // cuando la edición se mudó a la ficha (`/clientes/[codigo]`), pero el prop
  // siguió viajando desde el padre "por compatibilidad" y con él la función que
  // lo alimentaba. Nadie lo desestructuraba acá: era una promesa de guardado que
  // no guardaba nada.
  companyFilter: string;
  roleCompanies: Company[];
  onOpenEstado?: (client: ConsolidatedClient) => void;
  /** La fila está abierta. El panel vive montado aunque esté cerrado (el
   *  acordeón solo lo esconde), así que los pagos se piden recién aquí. */
  activo?: boolean;
}

export default function ContactPanel({
  client,
  companyFilter,
  roleCompanies,
  onOpenEstado,
  activo = true,
}: Props) {
  const [desgloseOpen, setDesgloseOpen] = useState(true);

  const visibleCompanies = companyFilter !== "all"
    ? roleCompanies.filter((co) => co.key === companyFilter && client.companies[co.key])
    : roleCompanies.filter((co) => client.companies[co.key]);

  // Código del cliente para la ficha (mismo D-XXX en todas las empresas).
  const codigo = Object.values(client.companies).find((c) => c?.codigo)?.codigo ?? null;

  // Últimos 3 pagos POR EMPRESA (fecha y monto). Es el detalle de la columna
  // «Último pago» de arriba, que solo dice el más reciente y hace cuánto.
  const ultimosPagos = useUltimosPagosGrupo(codigo, activo);

  return (
    <div className="bg-gray-50/80 px-6 py-4 border-b border-gray-200 space-y-3">

      {/* ── Desglose por empresa (aging) ──── */}
      {visibleCompanies.length > 0 && (
        <div>
          <button
            onClick={() => setDesgloseOpen(!desgloseOpen)}
            className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5 hover:text-gray-700 transition"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${desgloseOpen ? "rotate-90" : ""}`} fill="currentColor"><path d="M3 1l5 4-5 4V1z"/></svg>
            {roleCompanies.length === 1 || companyFilter !== "all" ? "Detalle de saldo" : `Desglose por empresa (${visibleCompanies.length})`}
          </button>
          {desgloseOpen && (
            <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide">
                  {roleCompanies.length > 1 && <th className="text-left py-1.5 font-medium">Empresa</th>}
                  <th className="text-right py-1.5 font-medium text-emerald-600" title="0-30 + 31-60 + 61-90 días">Por vencer</th>
                  <th className="text-right py-1.5 font-medium text-amber-600" title="91-120 días">Vencido reciente</th>
                  <th className="text-right py-1.5 font-medium text-red-500" title="121-180 + 181-270 + 271-365 + +365 días">Vencido crítico</th>
                  <th className="text-right py-1.5 font-medium">Total</th>
                  <th className="text-right py-1.5 font-medium" title="Cobro real más reciente del cliente en esta empresa (excluye retenciones y recibos en cero)">Último pago</th>
                  <th className="text-right py-1.5 font-medium" title="Última factura del cliente en esta empresa (las notas de crédito no son compras)">Última compra</th>
                </tr>
              </thead>
              <tbody>
                {visibleCompanies.map((co) => {
                  const d = client.companies[co.key];
                  const current = d.d0_30 + d.d31_60 + d.d61_90;
                  const watch = d.d91_120;
                  const overdue = d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365;
                  const tipCurrent = `0-30: $${fmt(d.d0_30)} · 31-60: $${fmt(d.d31_60)} · 61-90: $${fmt(d.d61_90)}`;
                  const tipOverdue = `121-180: $${fmt(d.d121_180)} · 181-270: $${fmt(d.d181_270)} · 271-365: $${fmt(d.d271_365)} · +365: $${fmt(d.mas_365)}`;
                  const ultDias = daysSince(d.ultimoPagoFecha);
                  const compraDias = daysSince(d.ultimaCompraFecha);
                  return (
                    <tr key={co.key} className="border-t border-gray-200 hover:bg-white transition">
                      {roleCompanies.length > 1 && <td className="py-1.5 font-medium">{co.name}</td>}
                      <td className="text-right py-1.5 tabular-nums text-emerald-700 cursor-help" title={tipCurrent}>{fmt(current)}</td>
                      <td className="text-right py-1.5 tabular-nums text-amber-600 cursor-help" title="91-120 días">{fmt(watch)}</td>
                      <td className="text-right py-1.5 tabular-nums text-red-600 cursor-help" title={tipOverdue}>{fmt(overdue)}</td>
                      <td className="text-right py-1.5 tabular-nums font-semibold">{fmt(d.total)}</td>
                      <td
                        className="text-right py-1.5 tabular-nums whitespace-nowrap"
                        title={d.ultimoPagoFecha ? `Último pago: ${fmtDate(d.ultimoPagoFecha)}` : undefined}
                      >
                        {d.ultimoPagoFecha ? (
                          <span>
                            {d.ultimoPagoMonto != null && (
                              <span className="text-gray-600">${fmt(d.ultimoPagoMonto)} · </span>
                            )}
                            <span className={daysAgingColor(ultDias)}>{ultDias != null ? `${ultDias} d` : ""}</span>
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      {/* Última compra: MISMO formato que el último pago (monto ·
                          N d). Los días van en gris y NO con daysAgingColor: en
                          esta pantalla el rojo significa "plata vencida", y una
                          compra vieja no es plata en riesgo — pintarla igual
                          diría algo que no es. */}
                      <td
                        className="text-right py-1.5 tabular-nums whitespace-nowrap"
                        title={d.ultimaCompraFecha ? `Última compra: ${fmtDate(d.ultimaCompraFecha)}` : "Sin compras registradas"}
                      >
                        {d.ultimaCompraFecha ? (
                          <span>
                            {d.ultimaCompraMonto != null && (
                              <span className="text-gray-600">${fmt(d.ultimaCompraMonto)} · </span>
                            )}
                            <span className="text-gray-500">{compraDias != null ? `${compraDias} d` : ""}</span>
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {/* ── Últimos pagos, un bloque POR EMPRESA ─────────────────────
          Daniel: "no me interesa saber qué factura pagó, solo ver sus últimos
          3 pagos y fecha". No se mezclan en una sola lista: un cliente con
          tres empresas ve tres bloques, cada uno con sus tres. ──────────── */}
      {visibleCompanies.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visibleCompanies.map((co) => (
            <UltimosPagos
              key={co.key}
              empresa={roleCompanies.length > 1 ? co.name : undefined}
              pagos={ultimosPagos.de(co.key)}
            />
          ))}
        </div>
      )}

      {/* ── Acciones: estado de cuenta + ficha completa ──────── */}
      <div className="flex items-center gap-3">
        {onOpenEstado && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenEstado(client); }}
            className="inline-flex items-center gap-1.5 rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white transition active:scale-[0.97]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
            </svg>
            Estado de cuenta
          </button>
        )}
        {codigo && (
          <Link
            href={`/clientes/${encodeURIComponent(codigo)}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition"
          >
            Ver ficha completa ›
          </Link>
        )}
      </div>
    </div>
  );
}
