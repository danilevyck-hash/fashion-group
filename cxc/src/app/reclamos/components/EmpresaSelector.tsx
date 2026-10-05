"use client";

import AppHeader from "@/components/AppHeader";
import { fmt } from "@/lib/format";
import { hoyPanama } from "@/lib/fecha-panama";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { Reclamo, Contacto } from "./types";
import { reclamoTaxes, calcSub, esPendiente, empresaKeyDeReclamo } from "./constants";
import { matchReclamo, matchHint } from "./search";
import { resumenPortada, tarjetasPorEmpresa } from "@/lib/reclamos/portada";
import { resumenViejos, DIAS_RECLAMO_VIEJO } from "@/lib/reclamos/viejos";
import { textoReclamado, estaReclamado } from "@/lib/reclamos/reclamado";
import { TODAVIA_SIN_RECLAMOS } from "@/lib/reclamos/empresas-con-reclamos";
import { SkeletonTable, EmptyState } from "@/components/ui";
import { RECLAMOS_APPLE_2026_10, lineaPendientes } from "@/lib/reclamos/apple-2026-10";
import { lineaEmpresa } from "@/lib/reclamos/celular";

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
  /** El celular dibuja su propio encabezado: el contenedor lo pone UNA vez. */
  sinEncabezado?: boolean;
  /** `RECLAMOS_APPLE_2026_10` (5-oct-2026). Las pruebas lo fuerzan. */
  apple?: boolean;
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
  onNewReclamo, onSelectEmpresa, onLoadDetail, sinEncabezado,
  apple = RECLAMOS_APPLE_2026_10,
}: Props) {
  const hoy = hoyPanama();
  const resumen = resumenPortada(reclamos, hoy);
  const viejos = resumenViejos(reclamos, hoy);
  const tarjetas = tarjetasPorEmpresa(reclamos, contactos, hoy);
  // 🔴 UNA CAJA EN CERO NO SE DIBUJA (20-sep-2026). «Sin reclamar» se llevaba un
  // tercio de la fila para decir «Nada sin reclamar» —medido: hoy hay 0—, y las
  // dos que SÍ tienen algo que decir quedaban angostas. Cuando vuelva a haber
  // uno sin reclamar, la caja vuelve sola y en rojo. ⚠️ El NÚMERO no cambia:
  // sigue saliendo de `resumenPortada`, que no se tocó.
  const veSinReclamar = resumen.sinReclamar.n > 0;
  const cajas = veSinReclamar ? "sm:grid-cols-3" : "sm:grid-cols-2";
  const nombreCorto = (empresa: string) => { const k = empresaKeyDeReclamo(empresa); return k ? nombreCortoEmpresa(k) : empresa; };
  const veTotales = role === "admin" || role === "secretaria";
  const buscador = (clase: string) => (
    <input type="text" value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder="Buscar por N° factura, N° reclamo, estilo o empresa…" className={`border-b border-gray-200 py-2 min-h-[44px] text-base sm:text-sm outline-none focus:border-black transition max-w-md ${clase}`} />
  );
  const botonNuevo = (clase = "") => (
    <button onClick={onNewReclamo} className={`text-sm bg-black text-white px-6 min-h-[44px] inline-flex items-center justify-center rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all ${clase}`}>Nuevo reclamo</button>
  );

  // 🔴 «COMO LO HARÍA APPLE» (5-oct-2026, `RECLAMOS_APPLE_2026_10`, apagado):
  // las cajas de totales pasan a UN número grande con su línea gris (como CxC y
  // Multifashion); «Nuevo reclamo» va en la fila del buscador; las empresas son
  // filas de dos renglones con ›; lo cobrado del año, una línea gris al pie.
  // Los números son los MISMOS (`resumenPortada`, `resumenViejos`, `tarjetasPorEmpresa`).
  const linea = lineaPendientes(resumen.porCobrar.n, viejos.n, resumen.sinReclamar.n);
  const cabeceraApple = (
    <>
          {veTotales && (
            <div data-cabecera-apple className="mb-5">
              <p className="text-[34px] font-normal leading-none tracking-tight tabular-nums text-gray-800">${fmt(resumen.porCobrar.monto)}</p>
              <p className="pt-2 text-sm text-gray-500">
                {linea.texto}
                {linea.alertas.map((a) => <span key={a}> · <span className="text-red-600">{a}</span></span>)}
              </p>
            </div>
          )}
    </>
  );
  const listaApple = (
    <>
              <ul data-lista="reclamos-empresas-apple" className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
                {tarjetas.map((t) => {
                  const l = lineaEmpresa(t.n, t.masViejoDias);
                  return (
                    <li key={t.empresa}>
                      <button type="button" onClick={() => onSelectEmpresa(t.empresa)} className="flex w-full min-h-[56px] items-center gap-4 px-4 py-3 text-left transition hover:bg-gray-50">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-900">{t.nombreCorto}</span>
                          <span className="mt-0.5 block truncate text-sm text-gray-500">
                            {t.n === 0 ? (
                              <span className="text-gray-400">{t.tieneHistoria ? "Sin pendientes" : TODAVIA_SIN_RECLAMOS}</span>
                            ) : (
                              <>
                                {l.texto}
                                {t.contacto && ` · ${t.contacto}`}
                                {l.dias && <> · <span className="text-red-600">{l.dias}</span></>}
                                {t.sinReclamar > 0 && <> · <span className="text-red-600">{t.sinReclamar} sin reclamar</span></>}
                              </>
                            )}
                          </span>
                        </span>
                        {t.n > 0 && <span className="shrink-0 text-sm tabular-nums text-gray-900">${fmt(t.monto)}</span>}
                        <span aria-hidden className="shrink-0 text-gray-300">›</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {veTotales && (
                <p data-pie="reclamos-cobrado" className="mt-3 text-xs text-gray-500 tabular-nums">
                  {resumen.cobrado.n > 0
                    ? `Cobrado en ${resumen.cobrado.anio}: $${fmt(resumen.cobrado.monto)} · ${resumen.cobrado.n} reclamo${resumen.cobrado.n === 1 ? "" : "s"}`
                    : `Nada cobrado en ${resumen.cobrado.anio}`}
                </p>
              )}
    </>
  );

  function resultadosDeBusqueda() {
    return <ResultadosDeBusqueda reclamos={reclamos} globalSearch={globalSearch} setGlobalSearch={setGlobalSearch} onLoadDetail={onLoadDetail} nombreCorto={nombreCorto} />;
  }

  return (
    <div>
      {!sinEncabezado && <AppHeader module="Reclamos" />}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6" data-reclamos-apple={apple ? "portada" : undefined}>
        {apple && cabeceraApple}
        {/* Apple: «Nuevo reclamo» va en la fila del buscador (antes, solo en una fila entera). */}
        <div className="flex items-center justify-end mb-5 gap-3">
          <h1 className="sr-only">Reclamos</h1>
          {apple && buscador("min-w-0 flex-1")}
          {apple ? botonNuevo("ml-auto shrink-0") : (
          <button onClick={onNewReclamo} className="text-sm bg-black text-white px-6 min-h-[44px] inline-flex items-center justify-center rounded-md font-medium hover:bg-gray-800 active:scale-[0.97] transition-all">Nuevo reclamo</button>
          )}
        </div>

        {!apple && (role === "admin" || role === "secretaria") && (
          <div className={`grid grid-cols-1 ${cajas} gap-2 mb-5`} data-medir="reclamos-portada">
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="text-xs text-gray-400 uppercase tracking-widest">Pendiente de cobro</div>
              <div className="text-xl font-semibold mt-1 tabular-nums">${fmt(resumen.porCobrar.monto)}</div>
              <div className="text-sm text-gray-500 mt-0.5">{resumen.porCobrar.n} reclamo{resumen.porCobrar.n === 1 ? "" : "s"}</div>
              {/* Lo viejo se dice AQUÍ, donde está la plata que se debe cobrar.
                  El corte vive en UNA constante (`DIAS_RECLAMO_VIEJO`), la misma
                  que usa el aviso de los lunes: no hay dos definiciones de
                  «viejo». Sin ninguno, la línea no se dibuja. */}
              {viejos.n > 0 && (
                <div className="text-sm text-red-600 mt-0.5 font-medium">{viejos.n} pasa{viejos.n === 1 ? "" : "n"} de {DIAS_RECLAMO_VIEJO} días</div>
              )}
            </div>
            {veSinReclamar && (
              <div className="border rounded-lg p-4 border-red-200 bg-red-50">
                <div className="text-xs text-gray-400 uppercase tracking-widest">Sin reclamar</div>
                <div className="text-xl font-semibold mt-1 tabular-nums text-red-600">${fmt(resumen.sinReclamar.monto)}</div>
                <div className="text-sm text-red-600/80 mt-0.5">{resumen.sinReclamar.n} reclamo{resumen.sinReclamar.n === 1 ? "" : "s"}</div>
              </div>
            )}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="text-xs text-gray-400 uppercase tracking-widest">Cobrado {resumen.cobrado.anio}</div>
              <div className="text-xl font-semibold mt-1 tabular-nums">{resumen.cobrado.n > 0 ? `$${fmt(resumen.cobrado.monto)}` : `Nada cobrado en ${resumen.cobrado.anio}`}</div>
              {resumen.cobrado.n > 0 && <div className="text-sm text-gray-500 mt-0.5">{resumen.cobrado.n} reclamo{resumen.cobrado.n === 1 ? "" : "s"}</div>}
            </div>
          </div>
        )}

        {!apple && <div className="mb-4">
          <input type="text" value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder="Buscar por N° factura, N° reclamo, estilo o empresa…" className="w-full border-b border-gray-200 py-2 min-h-[44px] text-base sm:text-sm outline-none focus:border-black transition max-w-md" />
        </div>}

        {globalSearch.trim() ? resultadosDeBusqueda() : loading ? (
          <SkeletonTable rows={3} cols={2} />
        ) : apple ? listaApple : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-medir="reclamos-tarjetas">
            {tarjetas.map((t) => {
              const sinNada = t.n === 0;
              // 🔴 LOS DÍAS AL FRENTE (20-sep-2026). Iban en gris chico al final
              // de una línea con el contacto —«Isaac Amar · el más viejo lleva
              // 103 días»—, o sea el dato que decide a quién apurar, escondido
              // detrás de un nombre. Ahora es un chip rojo pegado al nombre de
              // la empresa. El número NO cambió: es el mismo `masViejoDias`.
              const detalle = t.contacto ?? "";
              return (
                <div key={t.empresa}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectEmpresa(t.empresa)}
                  onKeyDown={(e) => { if (e.key === "Enter") onSelectEmpresa(t.empresa); }}
                  className={`border border-gray-200 rounded-lg p-5 cursor-pointer hover:border-gray-300 transition ${sinNada && !t.tieneHistoria ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{t.nombreCorto}</p>
                    {!sinNada && t.masViejoDias !== null && (
                      <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium border border-red-100 tabular-nums">
                        el más viejo lleva {t.masViejoDias} día{t.masViejoDias === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  {sinNada ? (
                    <p className="text-sm text-gray-400 mt-1">{t.tieneHistoria ? "Sin pendientes" : TODAVIA_SIN_RECLAMOS}</p>
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

/** Los resultados de buscar en la portada (la tabla de siempre). */
function ResultadosDeBusqueda({ reclamos, globalSearch, setGlobalSearch, onLoadDetail, nombreCorto }: {
  reclamos: Reclamo[];
  globalSearch: string;
  setGlobalSearch: (v: string) => void;
  onLoadDetail: (id: string, empresa: string) => void;
  nombreCorto: (empresa: string) => string;
}) {
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
              {results.length === 0 ? <EmptyState title={`Sin resultados para «${globalSearch}»`} /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead><tr className="border-b border-gray-200 text-xs uppercase tracking-[0.05em] text-gray-400">
                      <th className="text-left pb-3 font-medium">N° de reclamo</th>
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
                          <td className="py-3 text-gray-500">{esPendiente(r) ? "Pendiente" : "Cobrado"}</td>
                          <td className="py-3 text-right tabular-nums">${fmt(reclamoTaxes(r.empresa, calcSub(r.reclamo_items ?? [])).total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
}
