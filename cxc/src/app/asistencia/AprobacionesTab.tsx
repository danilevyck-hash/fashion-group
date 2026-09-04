"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * APROBACIONES — las horas extra que el reloj midió y todavía nadie autorizó.
 *
 * ── 🔴 LA UNIDAD ES EL DÍA (27-ago-2026) ────────────────────────────────────
 *
 * Daniel, textual: *«debe de ser que el usuario entre y vea por dias quienes y
 * cuantas horas, y pueda aprobar seleccionando todos o individualmente, por
 * dia, por semana»*.
 *
 * Y no es una preferencia de pantalla: **el corte de la quincena lo mueve la
 * contadora** (cuenta del 13 al 27, no del 16 al 31, y avisó que las fechas van
 * a variar). Guardado por período, cada corrimiento del corte volvía a
 * preguntar TODO desde cero. Un día es un hecho — «el martes 5 Kevin se quedó
 * hasta las 7» — y el período que se arme después lo recoge, corte donde corte.
 *
 * ⚠️ Aprobar «por semana» o «todo» es cómo se SELECCIONA. Lo que se guarda es
 * siempre una fila por persona y día.
 *
 * ── 🔴 TOCAR LA CASILLA APRUEBA. NO HAY BOTÓN DE CONFIRMAR ──────────────────
 *
 * Daniel: *«con un clic se aprueba y ya, maximo 3 clics»*. Un paso de
 * confirmación duplicaría cada aprobación, y no protege nada: volver a tocar
 * desaprueba, y la fila conserva quién la tocó por última vez.
 *
 * ── 🔴 SE APRUEBA UN PERMISO, NUNCA UN NÚMERO ───────────────────────────────
 *
 * Los minutos se recalculan en cada carga con la base vigente. Si mañana la
 * salida pasa de 17:00 a 16:30, esta pantalla muestra los números nuevos sola.
 * Lo único que se guarda de un número es el TESTIGO, y cuando el testigo y lo
 * medido no coinciden la fila lo dice con los dos a la vista.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/ToastSystem";
import RangoFechas, { ultimoRango } from "@/components/ui/RangoFechas";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { esFechaDeCalendario, quincenasHasta } from "@/lib/asistencia/planilla";
import {
  claveDia,
  etiquetaDia,
  etiquetaDePersona,
  horasBonitas,
  PARAM_PERSONA,
  primerDiaPendienteDe,
  resumenPendientes,
  type DiaAprobacion,
  type PersonaEnDia,
} from "@/lib/asistencia/aprobaciones";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Panamá es UTC−5 fijo. En UTC pelado, de noche el día salta al siguiente. */
function cuandoBonito(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) - 5 * 3600_000);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${hh}:${mm}`;
}

/** «Semana del 17 – 23 ago» */
function etiquetaSemana(lunes: string, dias: readonly DiaAprobacion[]): string {
  const a = dias[0]?.fecha ?? lunes;
  const b = dias[dias.length - 1]?.fecha ?? lunes;
  const dd = (f: string) => Number(f.slice(8, 10));
  const mes = MESES[Number(b.slice(5, 7)) - 1];
  return a === b
    ? `Semana del ${dd(a)} ${mes}`
    : `Semana del ${dd(a)} – ${dd(b)} ${mes}`;
}

/** Horas en «3:45». Es como se lee un rato, no como se lee un decimal. */
function hm(minutos: number): string {
  const m = Math.round(minutos);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

interface Respuesta {
  aprobaciones: DiaAprobacion[] | null;
  puedeAprobar: boolean;
  avisos: { faltaMigracionAprobaciones: string | null; faltaMigracionAprobador?: string | null };
}

/** Una casilla que sabe estar a medias. */
function Casilla({
  estado,
  onChange,
  disabled,
  label,
}: {
  estado: "no" | "si" | "medias";
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = estado === "medias";
  }, [estado]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={estado === "si"}
      disabled={disabled}
      onChange={onChange}
      className="h-[19px] w-[19px] shrink-0 cursor-pointer accent-emerald-600 disabled:opacity-40"
    />
  );
}

export default function AprobacionesTab() {
  const { toast } = useToast();

  const hoy = useMemo(
    () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10),
    [],
  );
  // ── 🔴 SE LLEGA DESDE LA PLANILLA, A UNA PERSONA (3-sep-2026) ─────────────
  //
  // Daniel, textual: *«al hacer clic en el mensaje de aprobacion, que te lleve
  // al colaborador para aprobar»*. El aviso ámbar de la planilla y el freno del
  // cierre traen a esta pestaña con `?persona=<código>` y el rango que se
  // estaba mirando (`desde`/`hasta`). Acá: el rango de la URL manda sobre el
  // recordado, se abre el primer día que esa persona tiene sin aprobar, su
  // fila se resalta y arriba un chip dice a quién se está mirando, con «ver a
  // todos» para limpiarlo. ⚠️ NO SE FILTRA A LOS DEMÁS: se ve todo, con la
  // persona resaltada — esconder al resto es cómo se aprueba a uno y se olvida
  // a veinte. Mismo nivel del breadcrumb → `replace` (default de `useUrlState`).
  const [persona, setPersona] = useUrlState(PARAM_PERSONA, "");
  const sp = useSearchParams();
  const rangoUrl = useMemo(() => {
    const d = sp.get("desde") ?? "";
    const h = sp.get("hasta") ?? "";
    return esFechaDeCalendario(d) && esFechaDeCalendario(h) && d <= h ? { desde: d, hasta: h } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El período arranca PUESTO en la quincena en curso: elegirlo a mano sería un
  // toque antes de empezar. Si la URL trae un rango (se llegó desde la
  // planilla), manda ése: hay que aterrizar en la MISMA quincena.
  const quincenaEnCurso = useMemo(() => quincenasHasta(hoy, 1)[0], [hoy]);
  const [desde, setDesde] = useState(rangoUrl?.desde ?? quincenaEnCurso.desde);
  const [hasta, setHasta] = useState(rangoUrl?.hasta ?? quincenaEnCurso.hasta);

  // 🔑 EL ÚLTIMO RANGO, por dispositivo. Es lo que reemplaza a los presets que
  // se fueron: el segundo día ya abre donde lo dejaste. Corre UNA vez al montar
  // —si no, pisaría cada cambio del usuario con el valor guardado. Y NO pisa el
  // rango que vino en la URL: ése es el de la planilla que se estaba mirando.
  useEffect(() => {
    if (rangoUrl) return;
    const r = ultimoRango("asistencia_aprobaciones");
    if (r) { setDesde(r.desde); setHasta(r.hasta); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [dias, setDias] = useState<DiaAprobacion[] | null>(null);
  const [puedeAprobar, setPuedeAprobar] = useState(true);
  const [avisoMigracion, setAvisoMigracion] = useState<string | null>(null);
  /** Falta la tabla del reparto por empresa: nadie está segmentado todavía. */
  const [avisoAprobador, setAvisoAprobador] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // 🔑 SIN `empresa`: se aprueba a la persona, no a la empresa.
      const p = new URLSearchParams({ desde, hasta, aprobaciones: "1" });
      const res = await fetch(`/api/asistencia/planilla?${p}`, { cache: "no-store" });
      const j = (await res.json()) as Respuesta & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "No se pudo cargar");
      setDias(j.aprobaciones ?? []);
      setPuedeAprobar(j.puedeAprobar !== false);
      setAvisoMigracion(j.avisos?.faltaMigracionAprobaciones ?? null);
      setAvisoAprobador(j.avisos?.faltaMigracionAprobador ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setDias(null);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

  useEffect(() => { void cargar(); }, [cargar]);

  const pend = useMemo(() => resumenPendientes(dias ?? []), [dias]);

  // ── La persona que trajo la URL ───────────────────────────────────────────
  const personaCodigo = persona.trim();
  const personaEtiqueta = useMemo(
    () => (personaCodigo ? etiquetaDePersona(dias ?? [], personaCodigo) ?? personaCodigo : ""),
    [dias, personaCodigo],
  );
  const primerDiaPendiente = useMemo(
    () => (personaCodigo ? primerDiaPendienteDe(dias ?? [], personaCodigo) : null),
    [dias, personaCodigo],
  );
  /** A quién ya se le abrió el día y se le hizo scroll: UNA vez por persona. */
  const enfocada = useRef<string | null>(null);
  const filaResaltada = useRef<HTMLLabelElement | null>(null);
  useEffect(() => {
    if (!personaCodigo || dias === null) return;
    if (enfocada.current === personaCodigo) return;
    enfocada.current = personaCodigo;
    if (primerDiaPendiente) setAbierto(primerDiaPendiente);
  }, [personaCodigo, dias, primerDiaPendiente]);
  const scrolleada = useRef<string | null>(null);
  useEffect(() => {
    // El scroll va cuando la fila ya existe en el DOM (el día abierto), UNA
    // vez por persona. jsdom no implementa `scrollIntoView`: se pregunta antes.
    const el = filaResaltada.current;
    if (!el || !personaCodigo || scrolleada.current === personaCodigo) return;
    if (abierto !== primerDiaPendiente) return;
    scrolleada.current = personaCodigo;
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center" });
  }, [abierto, primerDiaPendiente, personaCodigo]);

  /** Las semanas, en orden, cada una con sus días. */
  const semanas = useMemo(() => {
    const m = new Map<string, DiaAprobacion[]>();
    for (const d of dias ?? []) {
      const arr = m.get(d.semana) ?? [];
      arr.push(d);
      m.set(d.semana, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [dias]);

  /**
   * Aprueba o desaprueba. UNA función para las cuatro formas de tocar: la
   * persona, el día, la semana y «Aprobar todo» mandan lo mismo con distinta
   * lista.
   */
  const marcar = useCallback(
    async (items: Array<{ codigo: string; fecha: string; minutos: number }>, aprobado: boolean) => {
      if (items.length === 0) return;
      setGuardando(true);
      try {
        const res = await fetch("/api/asistencia/aprobaciones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aprobado, dias: items }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "No se pudo guardar");
        if (j.ok === false) {
          toast(j.aviso ?? "No se pudo guardar", "error");
        }
        // Se recarga entero: aprobar cambia el pago, y pintar solo la casilla
        // dejaría la pantalla diciendo una cosa y la planilla pagando otra.
        await cargar();
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      } finally {
        setGuardando(false);
      }
    },
    [cargar, toast],
  );

  // 🩸 La librería de Excel se baja al TOCAR el botón, no al abrir la pestaña:
  // `xlsx-js-style` pesa y esta pantalla se abre para aprobar, no para exportar.
  // Es el mismo patrón que ya usa el Excel del Reporte.
  const bajarExcel = useCallback(async () => {
    if (!dias || dias.length === 0) return;
    try {
      const { construirExcelAprobaciones, nombreArchivoAprobaciones } =
        await import("@/lib/asistencia/aprobaciones-excel");
      const { downloadWorkbook } = await import("@/lib/excel-export");
      downloadWorkbook(
        construirExcelAprobaciones({ dias, desde, hasta }),
        nombreArchivoAprobaciones(desde, hasta),
      );
    } catch {
      setError("No se pudo armar el Excel. Intenta de nuevo.");
    }
  }, [dias, desde, hasta]);

  const deDia = (d: DiaAprobacion) =>
    d.gente.map((g) => ({ codigo: g.codigo, fecha: d.fecha, minutos: g.minutos }));

  const estadoDe = (gente: readonly PersonaEnDia[]): "no" | "si" | "medias" => {
    const n = gente.filter((g) => g.aprobado).length;
    if (n === 0) return "no";
    return n === gente.length ? "si" : "medias";
  };

  const bloqueado = !puedeAprobar || guardando || avisoMigracion !== null;

  return (
    <div className="py-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <RangoFechas desde={desde} hasta={hasta} recordarComo="asistencia_aprobaciones" onChange={(d, h) => { setDesde(d); setHasta(h); }} />
        <div className="flex-1" />
        {/* 🔴 EXPORTAR NO ES APROBAR: se puede bajar el archivo aunque no se
            tenga permiso de aprobar y aunque no quede nada pendiente. Por eso
            NO mira `bloqueado` — solo que haya algo que bajar. */}
        <button
          type="button"
          disabled={!dias || dias.length === 0}
          onClick={() => void bajarExcel()}
          className="min-h-[44px] rounded-md border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:border-gray-400 active:scale-[0.97] disabled:opacity-30"
        >
          Excel
        </button>
        <button
          type="button"
          disabled={bloqueado || pend.pendientes === 0}
          onClick={() => {
            const todos = (dias ?? []).flatMap((d) =>
              d.gente.filter((g) => !g.aprobado).map((g) => ({ codigo: g.codigo, fecha: d.fecha, minutos: g.minutos })),
            );
            void marcar(todos, true);
          }}
          className="min-h-[44px] rounded-md bg-black px-5 text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-30"
        >
          Aprobar todo
        </button>
      </div>

      {avisoMigracion && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {avisoMigracion}
        </div>
      )}
      {/* ⚠️ ÁMBAR, no rojo: nada se rompió. Lo que falta es el reparto por
          empresa, y mientras tanto se aprueba como antes — que es exactamente
          lo que hay que saber para no creer que ya está puesto. NO bloquea el
          botón: bloquearlo dejaría a Julio sin aprobar por una DDL pendiente. */}
      {avisoAprobador && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {avisoAprobador}
        </div>
      )}
      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 🔴 El chip de «a quién estoy mirando». Solo con `persona` en la URL. */}
      {personaCodigo && !cargando && dias !== null && (
        <div
          data-testid="chip-persona"
          className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900"
        >
          <span>
            {primerDiaPendiente
              ? <>Mostrando a <b>{personaEtiqueta}</b></>
              : <><b>{personaEtiqueta}</b> no tiene horas extra pendientes en este período.</>}
          </span>
          <button
            type="button"
            onClick={() => setPersona("")}
            className="inline-flex min-h-[44px] items-center gap-1 font-medium underline underline-offset-2 hover:text-amber-950"
          >
            ver a todos <span aria-hidden="true">×</span>
          </button>
        </div>
      )}

      {!cargando && dias !== null && (
        <div className="mb-4 flex items-baseline gap-2 tabular-nums">
          {pend.pendientes === 0 ? (
            <>
              <span className="text-[30px] font-semibold leading-none text-emerald-700">✓</span>
              <span className="text-sm text-gray-600">Todo aprobado</span>
            </>
          ) : (
            <>
              <span className="text-[30px] font-semibold leading-none tracking-tight">{pend.pendientes}</span>
              <span className="text-sm text-gray-600">
                sin aprobar · {Math.round(pend.minutos / 60)} h
              </span>
            </>
          )}
        </div>
      )}

      {cargando && <div className="py-8 text-center text-sm text-gray-500">Cargando…</div>}

      {!cargando && dias !== null && dias.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
          Nadie hizo horas extra en estas fechas.
        </div>
      )}

      {semanas.map(([lunes, delaSemana]) => {
        const gente = delaSemana.flatMap((d) => d.gente);
        const est = estadoDe(gente);
        return (
          <div key={lunes} className="mb-3.5">
            <label className="flex cursor-pointer items-center gap-3 px-1 pb-2 pt-1.5">
              <Casilla
                estado={est}
                disabled={bloqueado}
                label={`Aprobar la semana del ${lunes}`}
                onChange={() =>
                  void marcar(delaSemana.flatMap(deDia), est !== "si")
                }
              />
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {etiquetaSemana(lunes, delaSemana)}
              </span>
              <span className="ml-auto text-xs tabular-nums text-gray-500">
                <b className="font-semibold text-gray-700">{gente.length}</b>
                {" · "}
                {hm(gente.reduce((a, g) => a + g.minutos, 0))} h
              </span>
            </label>

            {delaSemana.map((d) => {
              const e = estadoDe(d.gente);
              const abierta = abierto === d.fecha;
              return (
                <div
                  key={d.fecha}
                  className={`mb-1.5 overflow-hidden rounded-[10px] border ${
                    e === "si" ? "border-emerald-200 bg-emerald-50/60" : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex min-h-[52px] items-center gap-3 px-3.5 tabular-nums">
                    <label className="-ml-3.5 flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center pl-3.5">
                      <Casilla
                        estado={e}
                        disabled={bloqueado}
                        label={`Aprobar ${etiquetaDia(d.fecha)}`}
                        onChange={() => void marcar(deDia(d), e !== "si")}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setAbierto(abierta ? null : d.fecha)}
                      className="flex min-h-[44px] flex-1 items-center gap-3 text-left"
                      aria-expanded={abierta}
                    >
                      <span className="text-sm text-gray-600">
                        <b className="font-semibold text-gray-900">{d.etiqueta.slice(0, d.etiqueta.lastIndexOf(" "))}</b>
                        {d.etiqueta.slice(d.etiqueta.lastIndexOf(" "))}
                      </span>
                      <span className="ml-auto text-sm text-gray-500">{d.gente.length}</span>
                      <span className="min-w-[58px] text-right text-sm font-semibold">{hm(d.minutos)} h</span>
                      <svg
                        viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className={`shrink-0 text-gray-400 transition-transform ${abierta ? "rotate-180" : ""}`}
                        aria-hidden="true"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                  </div>

                  {abierta && (
                    <div className="border-t border-gray-100">
                      {d.gente.map((g, i) => {
                        // 🔴 La persona que trajo la URL, resaltada (3-sep-2026).
                        const esLaBuscada = personaCodigo !== "" && g.codigo === personaCodigo;
                        return (
                        <label
                          key={g.codigo}
                          ref={esLaBuscada && d.fecha === primerDiaPendiente ? filaResaltada : undefined}
                          aria-current={esLaBuscada ? "true" : undefined}
                          className={`flex min-h-[44px] cursor-pointer items-center gap-3 border-b border-gray-100 px-3.5 tabular-nums last:border-b-0 ${
                            esLaBuscada
                              ? "bg-amber-100"
                              : e === "si" ? "" : i % 2 === 0 ? "bg-gray-50/60" : ""
                          }`}
                        >
                          <Casilla
                            estado={g.aprobado ? "si" : "no"}
                            disabled={bloqueado}
                            label={`Aprobar ${g.etiqueta} el ${d.etiqueta}`}
                            onChange={() =>
                              void marcar(
                                [{ codigo: g.codigo, fecha: d.fecha, minutos: g.minutos }],
                                !g.aprobado,
                              )
                            }
                          />
                          <span className="min-w-0 flex-1 truncate text-[13.5px]">{g.etiqueta}</span>
                          <span className="hidden shrink-0 text-xs text-gray-500 sm:block">
                            {g.empresaEtiqueta ?? ""}
                          </span>
                          {g.salida && (
                            <span className="min-w-[44px] shrink-0 text-right text-xs text-gray-500">{g.salida}</span>
                          )}
                          <span className="min-w-[50px] shrink-0 text-right text-[13.5px] font-semibold">
                            {hm(g.minutos)}
                          </span>
                        </label>
                        );
                      })}
                      {d.gente.some((g) => g.cambio) && (
                        <div className="border-t border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-800">
                          {d.gente
                            .filter((g) => g.cambio)
                            .map((g) => `${g.etiqueta}: se aprobaron ${horasBonitas(g.minutosVistos ?? 0)} y hoy son ${horasBonitas(g.minutos)}`)
                            .join(" · ")}
                        </div>
                      )}
                      {d.gente.some((g) => g.aprobado && g.por) && (
                        <div className="border-t border-gray-100 px-3.5 py-2 text-xs text-gray-500">
                          {(() => {
                            const g = d.gente.find((x) => x.aprobado && x.por)!;
                            return `Aprobado por ${g.por} · ${cuandoBonito(g.cuando)}`;
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
