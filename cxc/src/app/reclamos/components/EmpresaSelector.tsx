"use client";

import AppHeader from "@/components/AppHeader";
import { fmt } from "@/lib/format";
import { hoyPanama } from "@/lib/fecha-panama";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { Reclamo, Contacto } from "./types";
import { reclamoTaxes, calcSub, esPendiente, empresaKeyDeReclamo } from "./constants";
import { matchReclamo, matchHint } from "./search";
import { resumenPortada, tarjetasPorEmpresa } from "@/lib/reclamos/portada";
import { textoReclamado, estaReclamado } from "@/lib/reclamos/reclamado";
import { TODAVIA_SIN_RECLAMOS } from "@/lib/reclamos/empresas-con-reclamos";
import { SkeletonTable, EmptyState } from "@/components/ui";

interface Props {
  role: string;
  reclamos: Reclamo[];
  loading: boolean;
  contactos: Contacto[];
  globalSearch: string;
  setGlobalSearch: (v: string) => void;
  onNewReclamo: () => void;
  onSelectEmpresa: (empresa: string) => void;
  onLoadDetail: (id: string, empresa: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA PORTADA DE RECLAMOS (rediseño del 10-sep-2026, mockup aprobado por Daniel).
//
// Tres números arriba: «Por cobrar», «Sin reclamar» (en rojo: es lo único que
// importa — a quién NO se le ha reclamado) y «Cobrado <año>». Tarjetas por
// empresa ORDENADAS POR PLATA; cada una dice el contacto, «el más viejo lleva N
// días» (desde la FECHA DE FACTURA — Daniel: *«viejo es factura, no creado»*),
// la plata por cobrar y el chip rojo «sin reclamar N» si aplica.
//
// Lo que se fue: «Alertas +45 días» y el chip «Alerta» (salían en 28 de 29 —
// *«un color que sale siempre deja de avisar»*), el «Historial» plegable y los
// ↓Excel/↓PDF de la tarjeta (viven en la página de la empresa, con la lista a
// la vista). Joystep (*«joystep quítalo»*, 0 reclamos en la historia). Nada se
// da por perdido: *«nunca por perdido»*, no hay corte de días.
//
// Todo lo que se dibuja sale de `lib/reclamos/portada.ts` (puro).
// ─────────────────────────────────────────────────────────────────────────────
export default function EmpresaSelector({
  role, reclamos, loading, contactos, globalSearch, setGlobalSearch,
  onNewReclamo, onSelectEmpresa, onLoadDetail,
}: Props) {
  const hoy = hoyPanama();
  const resumen = resumenPortada(reclamos, hoy);
  const tarjetas = tarjetasPorEmpresa(reclamos, contactos, hoy);
  const nombreCorto = (empresa: string) => { const k = empresaKeyDeReclamo(empresa); return k ? nombreCortoEmpresa(k) : empresa; };

  return (
    <div>
      <AppHeader module="Reclamos" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-end mb-5">
          <h1 className="sr-only">Reclamos</h1>
          <button onClick={onNewReclamo} className="text-sm bg-black text-white px-6 min-h-[44px] inline-flex items-center justify-center rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all">Nuevo Reclamo</button>
        </div>

        {(role === "admin" || role === "secretaria") && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5" data-medir="reclamos-portada">
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="text-xs text-gray-400 uppercase tracking-widest">Por cobrar</div>
              <div className="text-xl font-semibold mt-1 tabular-nums">${fmt(resumen.porCobrar.monto)}</div>
              <div className="text-sm text-gray-500 mt-0.5">{resumen.porCobrar.n} reclamo{resumen.porCobrar.n === 1 ? "" : "s"}</div>
            </div>
            <div className={`border rounded-lg p-4 ${resumen.sinReclamar.n > 0 ? "border-red-200 bg-red-50" : "border-gray-200"}`}>
              <div className="text-xs text-gray-400 uppercase tracking-widest">Sin reclamar</div>
              <div className={`text-xl font-semibold mt-1 tabular-nums ${resumen.sinReclamar.n > 0 ? "text-red-600" : ""}`}>
                {resumen.sinReclamar.n > 0 ? `$${fmt(resumen.sinReclamar.monto)}` : "Nada sin reclamar"}
              </div>
              {resumen.sinReclamar.n > 0 && <div className="text-sm text-red-600/80 mt-0.5">{resumen.sinReclamar.n} reclamo{resumen.sinReclamar.n === 1 ? "" : "s"}</div>}
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="text-xs text-gray-400 uppercase tracking-widest">Cobrado {resumen.cobrado.anio}</div>
              <div className="text-xl font-semibold mt-1 tabular-nums">{resumen.cobrado.n > 0 ? `$${fmt(resumen.cobrado.monto)}` : `Nada cobrado en ${resumen.cobrado.anio}`}</div>
              {resumen.cobrado.n > 0 && <div className="text-sm text-gray-500 mt-0.5">{resumen.cobrado.n} reclamo{resumen.cobrado.n === 1 ? "" : "s"}</div>}
            </div>
          </div>
        )}

        <div className="mb-4">
          <input type="text" value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder="Buscar por N° factura, N° reclamo, estilo o empresa…" className="w-full border-b border-gray-200 py-2 min-h-[44px] text-base sm:text-sm outline-none focus:border-black transition max-w-md" />
        </div>

        {globalSearch.trim() ? (() => {
          const q = globalSearch.toLowerCase();
          const results = reclamos
            .map((r) => ({ r, via: matchReclamo(r, globalSearch) }))
            .filter(({ r, via }) => via !== null || (r.empresa || "").toLowerCase().includes(q) || (r.notas || "").toLowerCase().includes(q));
          return (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">{results.length} resultado{results.length === 1 ? "" : "s"} para &quot;{globalSearch}&quot;</p>
                <button onClick={() => setGlobalSearch("")} className="text-sm text-gray-400 hover:text-black transition min-h-[44px] px-2">× Limpiar</button>
              </div>
              {results.length === 0 ? <EmptyState title={`No encontramos nada para "${globalSearch}"`} /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead><tr className="border-b border-gray-200 text-xs uppercase tracking-[0.05em] text-gray-400">
                      <th className="text-left pb-3 font-medium">N° Reclamo</th>
                      <th className="text-left pb-3 font-medium">Empresa</th>
                      <th className="text-left pb-3 font-medium">Reclamado</th>
                      <th className="text-left pb-3 font-medium">Estado</th>
                      <th className="text-right pb-3 font-medium">Total</th>
                    </tr></thead>
                    <tbody>
                      {results.map(({ r, via }) => (
                        <tr key={r.id} onClick={() => onLoadDetail(r.id, r.empresa)} className="border-b border-gray-200 hover:bg-gray-50/80 transition cursor-pointer">
                          <td className="py-3 font-medium">
                            {r.nro_reclamo}
                            {matchHint(r, via) && <span className="block font-normal text-xs text-gray-400 mt-0.5">{matchHint(r, via)}</span>}
                          </td>
                          <td className="py-3 text-gray-500">{nombreCorto(r.empresa)}</td>
                          <td className={`py-3 ${esPendiente(r) && !estaReclamado(r) ? "text-red-600" : "text-gray-500"}`}>{esPendiente(r) ? textoReclamado(r) : "—"}</td>
                          <td className="py-3 text-gray-500">{esPendiente(r) ? "Por cobrar" : "Cobrado"}</td>
                          <td className="py-3 text-right tabular-nums">${fmt(reclamoTaxes(r.empresa, calcSub(r.reclamo_items ?? [])).total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })() : loading ? (
          <SkeletonTable rows={3} cols={2} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-medir="reclamos-tarjetas">
            {tarjetas.map((t) => {
              const sinNada = t.n === 0;
              const detalle = [t.contacto, t.masViejoDias !== null ? `el más viejo lleva ${t.masViejoDias} día${t.masViejoDias === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
              return (
                <div key={t.empresa}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectEmpresa(t.empresa)}
                  onKeyDown={(e) => { if (e.key === "Enter") onSelectEmpresa(t.empresa); }}
                  className={`border border-gray-200 rounded-lg p-5 cursor-pointer hover:border-gray-300 transition ${sinNada && !t.tieneHistoria ? "opacity-50" : ""}`}>
                  <p className="text-sm font-semibold">{t.nombreCorto}</p>
                  {sinNada ? (
                    <p className="text-sm text-gray-400 mt-1">{t.tieneHistoria ? "Nada por cobrar" : TODAVIA_SIN_RECLAMOS}</p>
                  ) : (
                    <>
                      {detalle && <p className="text-sm text-gray-500 mt-1">{detalle}</p>}
                      <div className="flex items-center gap-3 mt-3 flex-wrap">
                        <p className="text-xl font-semibold tabular-nums">${fmt(t.monto)}</p>
                        <span className="text-sm text-gray-400">{t.n} reclamo{t.n === 1 ? "" : "s"}</span>
                        {t.sinReclamar > 0 && (
                          <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium border border-red-100">sin reclamar {t.sinReclamar}</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
