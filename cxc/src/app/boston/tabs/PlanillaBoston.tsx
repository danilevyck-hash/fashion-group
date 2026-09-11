"use client";

// LA PLANILLA DE CONFECCIONES BOSTON — las 21 personas, CON su plata.
//
// 🔑 NO SE REIMPLEMENTÓ NADA. Esta pestaña llama a `/api/asistencia/planilla`,
// la MISMA ruta y el MISMO motor que la contadora cotejó al centavo contra su
// Excel. Una segunda aritmética de sueldos al lado de la buena tiene un solo
// modo de fallo, y es que dos pantallas paguen distinto.
//
// 🔴 Y POR LO MISMO, LAS COLUMNAS SON LAS DE LA PLANILLA DEL GRUPO — y salen
// de la MISMA lista (`lib/asistencia/columnas-dinero-planilla.ts`, 11-sep-2026),
// con el mismo `$$` (cero → «—»), la misma primera columna pegada al hacer
// scroll y el mismo pie de TOTAL. 🩸 Hasta hoy eran dos listas «en el mismo
// orden»: el 10-sep la del grupo ganó «Salida temprana» y ésta se quedó en 18,
// así que con alguien que saliera temprano las columnas de David no daban el
// Total bruto ni el Neto. No se diseña una tabla «para Boston»: la contadora y
// David tienen que poder mirar la misma fila y ver lo mismo.
//
// 🔴 Y EL CORTE ES EL MISMO QUE VE LA CONTADORA (11-sep-2026): el guardado de la
// quincena cerrada, o el sugerido (13/28). Sin él, David leía el reloj hasta el
// 15 mientras Yulissa cerraba el 13 — dos netos para la misma persona. Ver
// `lib/boston/planilla-corte.ts`. El ajuste de la quincena anterior llega
// adentro de las columnas, igual que en el grupo, y se dice al pie.
//
// ⚠️ SON DE SOLO LECTURA, y no es una decisión de diseño: los cinco montos que
// en el grupo se escriben a mano (ISR, préstamo, terceros, mercancía, otros
// servicios) se guardan con `POST /api/asistencia/planilla`, que exige
// `asistenciaRoles()` — y `gerente_boston` no está ahí. Dibujar un campo que el
// servidor rechaza es peor que dibujar el número. Que David pueda editarlos es
// otra decisión, de Daniel.
//
// 🔴 EL RECORTE SIGUE VIVIENDO EN EL SERVIDOR, y esta pantalla aguanta las dos
// respuestas. Con `VE_SUELDOS_DE_BOSTON = false` la ruta contesta
// `sinSueldos: true`, sin `dinero` y sin `totales`: la tabla vuelve sola a las
// 5 columnas de horas. Por eso el tipo es una UNIÓN y no un `any` — si el flag
// se apaga, la pantalla no se rompe ni muestra un `$NaN`.

import { useCallback, useEffect, useMemo, useState } from "react";
import { hoyPanama } from "@/lib/fecha-panama";
import { periodoDesdeRango, quincenasHasta } from "@/lib/asistencia/planilla";
import { fmtMin } from "@/lib/asistencia/reporte";
import { fmtDate } from "@/lib/format";
import type { LineaSinDinero } from "@/lib/boston/planilla-sin-dinero";
import type { DineroLinea, LineaPlanilla, TotalesPlanilla } from "@/lib/asistencia/planilla";
import { COLUMNAS_DINERO_PLANILLA, montosDePlanilla } from "@/lib/asistencia/columnas-dinero-planilla";
import { notaAjuste, notaCeldaAjuste } from "@/lib/asistencia/corte-quincena";
import { fechaCortaCorte, fraseCorte } from "@/lib/asistencia/elegir-quincena";
import { PLANILLA_UNIDA } from "@/lib/asistencia/planilla-unida";
import { corteParaBoston } from "@/lib/boston/planilla-corte";

import RangoFechas from "@/components/ui/RangoFechas";
/** Una fila puede venir recortada o completa. La pantalla se banca las dos. */
type Linea = LineaSinDinero | LineaPlanilla;

/** ¿Esta fila trae el bloque de dinero? Es la pregunta que decide qué se dibuja
 *  — no `sinSueldos`, que es de la RESPUESTA: una persona «fuera de planilla» o
 *  «Tú decides» viene con `dinero: null` aunque el resto sí lo traiga. */
function conDinero(l: Linea): l is LineaPlanilla & { dinero: DineroLinea } {
  return (l as LineaPlanilla).dinero != null;
}

interface Respuesta {
  empresaEtiqueta: string | null;
  lineas: Linea[];
  /** `true` cuando el servidor recortó la plata (`VE_SUELDOS_DE_BOSTON=false`).
   *  Con los sueldos abiertos NO viene, y entonces llegan `dinero` y `totales`. */
  sinSueldos?: boolean;
  totales?: TotalesPlanilla;
  /** 🔴 El corte con el que se midió (día 13/28). `null` = quincena entera. */
  corte?: string | null;
  /** 🔴 El ajuste de la quincena anterior, testigo: ya está ADENTRO de las columnas. */
  ajusteQuincenaAnterior?: {
    total: number;
    personas: { codigo: string; etiqueta: string; monto: number }[];
    dias?: { desde: string; hasta: string } | null;
  };
  avisos?: { periodoAbierto?: { texto?: string } | null; avisoSinFicha?: string | null };
}

/** El MISMO formato de la planilla del grupo (`PlanillaTab`): dos decimales, y
 *  el cero se dibuja como «—» para que la vista no se llene de $0.00. */
const $ = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $$ = (n: number) => (n === 0 ? "—" : `$${$(n)}`);

/** Las columnas de dinero: LA lista del grupo, no una copia (11-sep-2026). */
const COLUMNAS_DINERO = COLUMNAS_DINERO_PLANILLA;
/** Los montos, en el MISMO orden que `COLUMNAS_DINERO`. La misma función del grupo. */
const montosDe = montosDePlanilla;

interface Horas {
  extraDiurnoMin: number;
  extraNocturnoMin: number;
  tardanzaMin: number;
  ausenciaMin: number;
}

export default function PlanillaBoston() {
  const hoy = useMemo(() => hoyPanama(), []);
  const quincena = useMemo(() => quincenasHasta(hoy, 1)[0], [hoy]);
  const [desde, setDesde] = useState(quincena.desde);
  const [hasta, setHasta] = useState(quincena.hasta);
  // 🔴 IGUAL QUE LA PLANILLA DEL GRUPO: abre VACÍA. Daniel: *«la quincena se
  // paga según el rango de fecha seleccionado»*. Y sin recordar el último, que
  // al abrir la quincena siguiente mostraría la anterior ya cargada, con plata.
  const [elegido, setElegido] = useState(false);
  const [data, setData] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // 🔴 EL CORTE: el guardado si la quincena ya se cerró, si no el sugerido
      // (13/28) — el MISMO pedido que arma la contadora para esa quincena.
      // Lo cerrado se pregunta a la MISMA ruta que usa el grupo; si no contesta,
      // va el sugerido (el servidor sigue forzando la empresa).
      let corteGuardado: string | null = null;
      if (PLANILLA_UNIDA && periodoDesdeRango(desde, hasta)?.esQuincena) {
        try {
          const rg = await fetch(`/api/asistencia/planilla-guardada?${new URLSearchParams({ desde, hasta })}`, { cache: "no-store" });
          const jg = (await rg.json()) as { cerrada?: { corte?: string | null } | null };
          if (rg.ok) corteGuardado = jg.cerrada?.corte ?? null;
        } catch { /* sin respuesta, el sugerido */ }
      }
      const corte = corteParaBoston(desde, hasta, corteGuardado);
      // 🔴 SIN `empresa`: la pone el servidor. Mandarla desde el navegador
      // sugeriría que se puede cambiar, y no se puede.
      const p = new URLSearchParams({ desde, hasta });
      if (corte) p.set("corte", corte);
      const res = await fetch(`/api/asistencia/planilla?${p}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "No se pudo cargar");
      setData(j as Respuesta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setData(null);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    if (elegido) void cargar();
  }, [cargar, elegido]);

  const lineas = data?.lineas ?? [];
  // 🔑 La tabla cambia de forma según lo que el SERVIDOR mandó, no según un flag
  // del navegador: si alguna fila trae `dinero`, se dibujan las 18 columnas.
  const hayDinero = !data?.sinSueldos && lineas.some(conDinero);

  return (
    <div>
      <div className="mb-3">
        <RangoFechas
          desde={desde} hasta={hasta}
          vacio={!elegido}
          onChange={(d, h) => { setDesde(d); setHasta(h); setElegido(true); }}
        />
      </div>

      {/* 🔴 EL CORTE SE DICE, como en el grupo: hasta dónde se leyó el reloj. */}
      {!error && data?.corte && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-gray-600" data-testid="corte-boston">
          <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700">Corte {fechaCortaCorte(data.corte)}</span>
          <span>{fraseCorte(data.corte, hasta) ?? `Se lee el reloj hasta el ${fechaCortaCorte(data.corte)}.`}</span>
        </p>
      )}

      {data?.avisos?.periodoAbierto?.texto && (
        <p className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
          {data.avisos.periodoAbierto.texto}
        </p>
      )}
      {data?.avisos?.avisoSinFicha && (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          {data.avisos.avisoSinFicha}
        </p>
      )}

      {!elegido && !cargando && (
        <div className="rounded-xl border border-dashed border-gray-200 px-4 py-12 text-center">
          <p className="text-sm font-medium text-gray-700">Elige el período que vas a pagar</p>
          <p className="mt-1 text-[13px] text-gray-500">
            La quincena se calcula con las fechas que elijas arriba.
          </p>
        </div>
      )}
      {error && <p className="text-sm text-red-600 py-8">{error}</p>}
      {cargando && !data && <p className="text-sm text-gray-500 py-8">Cargando…</p>}

      {!error && data && (
        <>
          <p className="text-sm text-gray-500 mb-3">
            {lineas.length} {lineas.length === 1 ? "colaborador" : "colaboradores"} · {fmtDate(desde)} al{" "}
            {fmtDate(hasta)}
          </p>

          {/* Corte en `lg` por el ancho ÚTIL, igual que la pestaña CXC. */}
          <div data-vista="tarjetas" className="lg:hidden space-y-2">
            {lineas.map((l) => {
              const h = l.horas as Horas;
              return (
                <div key={l.codigo} className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-gray-900 truncate">{l.etiqueta}</span>
                    <span className="text-xs text-gray-400 shrink-0">{l.codigo}</span>
                  </div>
                  {/* El NETO primero y en grande: es lo que se viene a mirar.
                      Si la fila viene sin dinero (flag apagado, o persona fuera
                      de planilla) no se dibuja nada — nunca un $0.00 inventado. */}
                  {conDinero(l) && (
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <span className="text-xs uppercase tracking-wide text-gray-400">Neto a pagar</span>
                      <span className="text-[17px] font-semibold tabular-nums text-gray-900">
                        {$$(l.dinero.netoPagar)}
                      </span>
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm tabular-nums">
                    {conDinero(l) && (
                      <span className="text-gray-600">Bruto {$$(l.dinero.totalBruto)}</span>
                    )}
                    {conDinero(l) && l.dinero.totalDeducciones > 0 && (
                      <span className="text-gray-600">Deducc. {$$(l.dinero.totalDeducciones)}</span>
                    )}
                    <span className="text-gray-600">
                      Extra {fmtMin(h.extraDiurnoMin + h.extraNocturnoMin)} min
                    </span>
                    <span className={h.tardanzaMin ? "text-amber-600" : "text-gray-400"}>
                      Tarde {fmtMin(h.tardanzaMin)} min
                    </span>
                    <span className={h.ausenciaMin ? "text-red-600" : "text-gray-400"}>
                      Ausencia {fmtMin(h.ausenciaMin)} min
                    </span>
                  </div>
                  {l.faltaConfigurar.length > 0 && (
                    <p className="mt-1 text-xs text-amber-700">{l.faltaConfigurar.join(" · ")}</p>
                  )}
                  {l.decidirAMano && <p className="mt-1 text-xs text-gray-500">{l.decidirAMano}</p>}
                </div>
              );
            })}
          </div>

          <div
            data-vista="tabla"
            className="hidden lg:block rounded-xl border border-gray-200 bg-white overflow-x-auto"
          >
            <table className={`text-sm ${hayDinero ? "w-max min-w-full" : "w-full"}`}>
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                  <th className="sticky left-0 z-10 bg-white text-left font-normal px-4 py-3">Persona</th>
                  {hayDinero ? (
                    COLUMNAS_DINERO.map((c) => (
                      <th key={c.campo} className="whitespace-pre px-2 py-3 text-right font-normal">{c.rotulo}</th>
                    ))
                  ) : (
                    <>
                      <th className="text-right font-normal px-3">Extra 1,25</th>
                      <th className="text-right font-normal px-3">Extra 1,50</th>
                      <th className="text-right font-normal px-3">Tarde</th>
                      <th className="text-right font-normal px-4">Ausencia</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => {
                  const h = l.horas as Horas;
                  return (
                    <tr key={l.codigo} className="border-b border-gray-50 last:border-0">
                      <td className="sticky left-0 z-10 bg-white px-4 py-3">
                        <span className="text-gray-900">{l.etiqueta}</span>
                        {l.faltaConfigurar.length > 0 && (
                          <span className="block text-xs text-amber-700">
                            {l.faltaConfigurar.join(" · ")}
                          </span>
                        )}
                        {l.decidirAMano && (
                          <span className="block text-xs text-gray-500">{l.decidirAMano}</span>
                        )}
                      </td>
                      {hayDinero ? (
                        conDinero(l) ? (
                          montosDe(l.dinero).map((v, i) => (
                            // El `title` de la celda repite el ajuste de la quincena
                            // anterior cuando esa columna lo trae — igual que el grupo.
                            <td key={i} className="px-2 py-3 text-right tabular-nums"
                              title={notaCeldaAjuste(COLUMNAS_DINERO[i].campo as Parameters<typeof notaCeldaAjuste>[0], (l as LineaPlanilla).ajusteDetalle) ?? undefined}>
                              {v === 0 ? <span className="text-gray-300">—</span> : $$(v)}
                            </td>
                          ))
                        ) : (
                          // 🔴 Sin dinero NO se rellena con ceros: una fila de $0.00
                          // se lee como «no ganó nada» y lo que pasa es que falta un
                          // dato o la decide una persona. Es la misma regla del grupo.
                          <td colSpan={COLUMNAS_DINERO.length} className="px-2 py-3 text-[13px] text-gray-500">
                            {l.decidirAMano ?? l.faltaConfigurar.join(" · ") ?? "—"}
                          </td>
                        )
                      ) : (
                        <>
                          <td className="px-3 text-right tabular-nums">{fmtMin(h.extraDiurnoMin)}</td>
                          <td className="px-3 text-right tabular-nums">{fmtMin(h.extraNocturnoMin)}</td>
                          <td className={`px-3 text-right tabular-nums ${h.tardanzaMin ? "text-amber-600" : "text-gray-300"}`}>
                            {fmtMin(h.tardanzaMin)}
                          </td>
                          <td className={`px-4 text-right tabular-nums ${h.ausenciaMin ? "text-red-600" : "text-gray-300"}`}>
                            {fmtMin(h.ausenciaMin)}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {hayDinero && data.totales && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td className="sticky left-0 z-10 bg-gray-50 px-4 py-3">
                      TOTAL · {data.totales.personas}{" "}
                      {data.totales.personas === 1 ? "colaborador" : "colaboradores"}
                    </td>
                    {montosDe(data.totales).map((v, i) => (
                      <td key={i} className="px-2 py-3 text-right tabular-nums">
                        {v === 0 ? <span className="text-gray-300">—</span> : $$(v)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* 🔴 EL AJUSTE DE LA QUINCENA ANTERIOR, DICHO AL PIE — el mismo texto
              del grupo (`notaAjuste`): qué columnas lo traen y de qué días. */}
          {hayDinero && notaAjuste(lineas as LineaPlanilla[]) && (
            <p className="pt-3 text-[12px] text-gray-600" data-testid="ajuste-boston">{notaAjuste(lineas as LineaPlanilla[])}</p>
          )}

          {/* Con el flag apagado la pantalla vuelve a ser la de horas, y ahí este
              pie SÍ explica por qué no hay plata. Con los sueldos abiertos sería
              falso, así que se dibuja solo en el camino recortado. */}
          {data.sinSueldos && (
            <p className="text-xs text-gray-500 pt-3">
              Aquí se ven las horas, las tardanzas y las ausencias. Los sueldos los lleva
              contabilidad.
            </p>
          )}
        </>
      )}
    </div>
  );
}
