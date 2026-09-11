"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * APROBACIONES — una sola lista de decisiones (10-sep-2026).
 *
 * Daniel, textual: *«Aprobaciones es una sola lista de decisiones. Cada renglón
 * es una persona en la quincena, con sus horas extra sumadas. Dos botones: Sí y
 * No. Se decide, y el renglón se va»* · *«Cobra horas extra por default a todos
 * sí»* · *«y si quiero poder ver por día y por persona? con un tab arriba que
 * diga colaborador / día»*.
 *
 * ── 🔴 TRES ESTADOS: SÍ · NO · PENDIENTE ─────────────────────────────────────
 *
 * 🩸 Hasta hoy la casilla era true/false y `false` era PENDIENTE: no existía
 * «lo miré y no se paga». Lo que nadie marcaba quedaba pendiente para siempre,
 * en el aviso ámbar y frenando el cierre. Ahora un «No» es una decisión: no se
 * paga (igual que antes) y deja de ser pendiente. Un «Sí» es EXACTAMENTE lo que
 * era aprobar. Ver `aprobaciones.ts` › TRES ESTADOS.
 *
 * ── 🔴 DOS VISTAS, UNA FUENTE ────────────────────────────────────────────────
 *
 * «Colaborador» (abre por defecto): un renglón por persona con sus extras
 * sumadas. «Día»: lo mismo agrupado por día, como era hasta hoy. Las dos salen
 * del MISMO `DiaAprobacion[]` y las arma `aprobaciones-vistas.ts` (puro).
 *
 * ── LO QUE NO CAMBIÓ ─────────────────────────────────────────────────────────
 *
 * · La unidad guardada sigue siendo el DÍA (27-ago-2026): decidir sobre una
 *   persona manda una fila por cada uno de sus días pendientes.
 * · Se decide un PERMISO, nunca un número: los minutos se recalculan siempre.
 * · Tocar decide en el acto (optimista); el POST va detrás; si falla, vuelve.
 * · «Aprobar todo» sigue: ahora se llama «Sí a todo lo pendiente». No hay «No a
 *   todo»: un No de una quincena entera no se decide de un toque.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { empresaParaPedir } from "@/lib/asistencia/empresa-para-todo";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/ToastSystem";
import RangoFechas, { ultimoRango } from "@/components/ui/RangoFechas";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { useLastUsed } from "@/lib/hooks/useLastUsed";
import { esFechaDeCalendario, quincenasHasta } from "@/lib/asistencia/planilla";
import {
  claveDia,
  etiquetaDePersona,
  PARAM_PERSONA,
  primerDiaPendienteDe,
  previoDe,
  aplicarAprobacionLocal,
  revertirAprobacionLocal,
  type Decision,
  type DiaAprobacion,
  type ToqueAprobacion,
} from "@/lib/asistencia/aprobaciones";
import {
  PARAM_VISTA,
  RECORDAR_VISTA,
  VISTAS,
  agruparPorColaborador,
  agruparPorDia,
  hm,
  separarPorDecidir,
  textoPorDecidir,
  toquesPendientes,
  vistaElegida,
  type Vista,
} from "@/lib/asistencia/aprobaciones-vistas";
import BuscadorDeLista, { VacioDeBusqueda } from "@/components/BuscadorDeLista";
import {
  LIMPIAR_BUSQUEDA,
  PARAM_BUSCAR,
  PLACEHOLDER_COLABORADOR,
  VACIO_BUSQUEDA,
  filtrarPorTexto,
  textoDeConteo,
} from "@/lib/buscar-en-lista";
import PorColaborador from "./aprobaciones/PorColaborador";
import PorDia from "./aprobaciones/PorDia";
import YaDecididas from "./aprobaciones/YaDecididas";

interface Respuesta {
  aprobaciones: DiaAprobacion[] | null;
  puedeAprobar: boolean;
  avisos: { faltaMigracionAprobaciones: string | null; faltaMigracionAprobador?: string | null };
}

/** La recarga completa del período va UNA vez, este tiempo después del último toque. */
export const RECARGA_MS = 1500;

/** El rótulo del botón de arriba. Era «Aprobar todo»; hace lo mismo. */
export const ROTULO_SI_A_TODO = "Sí a todo lo pendiente";

export default function AprobacionesTab({ empresa = "" }: {
  /** El selector de arriba de las pestañas (10-sep-2026). «todas» o vacío = todas. */
  empresa?: string;
} = {}) {
  const { toast } = useToast();

  const hoy = useMemo(
    () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10),
    [],
  );
  // ── 🔴 SE LLEGA DESDE LA PLANILLA, A UNA PERSONA (3-sep-2026) ─────────────
  //
  // El aviso ámbar y el freno del cierre traen `?persona=<código>` y el rango.
  // Acá: el rango de la URL manda, su renglón se abre y se resalta (en «Día»,
  // el primer día donde está pendiente), y arriba un chip dice a quién se
  // mira, con «ver a todos». ⚠️ NO SE FILTRA A LOS DEMÁS.
  const [persona, setPersona] = useUrlState(PARAM_PERSONA, "");
  const sp = useSearchParams();
  const rangoUrl = useMemo(() => {
    const d = sp.get("desde") ?? "";
    const h = sp.get("hasta") ?? "";
    return esFechaDeCalendario(d) && esFechaDeCalendario(h) && d <= h ? { desde: d, hasta: h } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 🔴 LA VISTA: URL (mismo nivel → `replace`) y recordada por usuario ────
  const [vistaUrl, setVistaUrl] = useUrlState<string>(PARAM_VISTA, "");
  const [vistaRecordada, recordarVista] = useLastUsed(RECORDAR_VISTA, "");
  const vista: Vista = vistaElegida(vistaUrl || vistaRecordada);
  const cambiarVista = (v: Vista) => { setVistaUrl(v); recordarVista(v); };

  const quincenaEnCurso = useMemo(() => quincenasHasta(hoy, 1)[0], [hoy]);
  const [desde, setDesde] = useState(rangoUrl?.desde ?? quincenaEnCurso.desde);
  const [hasta, setHasta] = useState(rangoUrl?.hasta ?? quincenaEnCurso.hasta);
  useEffect(() => {
    if (rangoUrl) return;
    const r = ultimoRango("asistencia_aprobaciones");
    if (r) { setDesde(r.desde); setHasta(r.hasta); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [dias, setDias] = useState<DiaAprobacion[] | null>(null);
  const [puedeAprobar, setPuedeAprobar] = useState(true);
  const [avisoMigracion, setAvisoMigracion] = useState<string | null>(null);
  const [avisoAprobador, setAvisoAprobador] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 🔴 SOLO LO QUE VIAJA SE APAGA: claves `codigo|fecha` en vuelo. */
  const [enVuelo, setEnVuelo] = useState<ReadonlySet<string>>(new Set());
  const recarga = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Qué está abierto: códigos (vista colaborador) o fechas (vista día). */
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const alternar = useCallback((k: string) => {
    setAbiertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }, []);

  const cargar = useCallback(async (silenciosa = false) => {
    if (!silenciosa) setCargando(true);
    setError(null);
    try {
      const p = new URLSearchParams({ desde, hasta, aprobaciones: "1" });
      const emp = empresaParaPedir(empresa);
      if (emp) p.set("empresa", emp);
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
  }, [desde, hasta, empresa]);

  useEffect(() => { void cargar(); }, [cargar]);

  // ── Los dos agrupamientos, de la MISMA fuente ─────────────────────────────
  const personas = useMemo(() => agruparPorColaborador(dias ?? []), [dias]);
  const { porDecidir, decididas } = useMemo(() => separarPorDecidir(personas), [personas]);
  const porDia = useMemo(() => agruparPorDia(dias ?? []), [dias]);
  const minutosPendientes = useMemo(() => porDecidir.reduce((a, p) => a + p.minutosPendientes, 0), [porDecidir]);

  // ── 🔴 EL BUSCADOR DE «COLABORADOR» (11-sep-2026) ─────────────────────────
  //
  // Tacha renglones de la vista «Colaborador» y NADA MÁS. En particular:
  //   · El contador «N por decidir · H:MM h» sigue contando TODO lo pendiente
  //     del período —es el trabajo que queda, no lo que se está mirando—.
  //   · 🔴 «Sí a todo lo pendiente» sigue siendo de TODO lo pendiente de la
  //     empresa elegida (`pendientes` sale de `toquesPendientes(dias)` y jamás
  //     mira `busqueda`). Un botón que dijera «todo» y aprobara lo que quedó
  //     filtrado dejaría horas sin decidir sin que nadie se entere.
  //   · El Excel sale de `dias`, completo.
  // Por nombre y por código, sin acentos y por subcadena exacta, nunca por parecido.
  const [busqueda, setBusqueda] = useUrlState(PARAM_BUSCAR, "");
  const porDecidirVistas = useMemo(
    () => filtrarPorTexto(porDecidir, busqueda, (p) => [p.etiqueta, p.codigo]),
    [porDecidir, busqueda],
  );
  const buscando = busqueda.trim() !== "";

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
  const enfocada = useRef<string | null>(null);
  const filaResaltada = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!personaCodigo || dias === null) return;
    if (enfocada.current === personaCodigo) return;
    enfocada.current = personaCodigo;
    if (!primerDiaPendiente) return;
    // En «Colaborador» se abre su renglón; en «Día», el primer día pendiente.
    setAbiertos((s) => new Set([...s, vista === "dia" ? primerDiaPendiente : personaCodigo]));
  }, [personaCodigo, dias, primerDiaPendiente, vista]);
  const scrolleada = useRef<string | null>(null);
  useEffect(() => {
    const el = filaResaltada.current;
    if (!el || !personaCodigo || scrolleada.current === personaCodigo) return;
    scrolleada.current = personaCodigo;
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center" });
  }, [abiertos, personaCodigo]);

  /**
   * UNA función para todas las formas de decidir: la persona, el día, la
   * persona en un día y «Sí a todo» mandan lo mismo con distinta lista.
   */
  const decidir = useCallback(
    async (items: ToqueAprobacion[], decision: Decision) => {
      if (items.length === 0) return;
      // 🔴 OPTIMISTA: la pantalla cambia EN EL ACTO; el POST va detrás; si
      // falla, se revierte y se dice.
      const claves = items.map((i) => claveDia(i.codigo, i.fecha));
      let previo: ReadonlyMap<string, Decision> = new Map();
      setDias((d) => { previo = previoDe(d ?? [], items); return aplicarAprobacionLocal(d ?? [], items, decision); });
      setEnVuelo((v) => new Set([...v, ...claves]));
      try {
        // 🔴 Con empresa elegida, la ruta rechaza cualquier código de otra empresa.
        const emp = empresaParaPedir(empresa);
        const res = await fetch(`/api/asistencia/aprobaciones${emp ? `?empresa=${encodeURIComponent(emp)}` : ""}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, dias: items }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "No se pudo guardar");
        if (j.ok === false) throw new Error(j.aviso ?? "No se pudo guardar");
      } catch (e) {
        setDias((d) => revertirAprobacionLocal(d ?? [], previo));
        toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      } finally {
        setEnVuelo((v) => { const n = new Set(v); for (const k of claves) n.delete(k); return n; });
        // 🔴 EL SERVIDOR MANDA: una sola recarga, 1,5 s después del último toque.
        if (recarga.current) clearTimeout(recarga.current);
        recarga.current = setTimeout(() => { recarga.current = null; void cargar(true); }, RECARGA_MS);
      }
    },
    [cargar, toast, empresa],
  );
  useEffect(() => () => { if (recarga.current) clearTimeout(recarga.current); }, []);

  // 🩸 La librería de Excel se baja al TOCAR el botón, no al abrir la pestaña.
  const bajarExcel = useCallback(async () => {
    if (!dias || dias.length === 0) return;
    try {
      const { construirExcelAprobaciones, nombreArchivoAprobaciones } =
        await import("@/lib/asistencia/aprobaciones-excel");
      const { downloadWorkbook } = await import("@/lib/excel-export");
      downloadWorkbook(
        construirExcelAprobaciones({ dias, desde, hasta }),
        nombreArchivoAprobaciones(desde, hasta, empresa),
      );
    } catch {
      setError("No se pudo armar el Excel. Intenta de nuevo.");
    }
  }, [dias, desde, hasta, empresa]);

  const bloqueado = !puedeAprobar || avisoMigracion !== null;
  const pendientes = useMemo(() => toquesPendientes(dias ?? []), [dias]);

  return (
    <div className="py-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <RangoFechas desde={desde} hasta={hasta} recordarComo="asistencia_aprobaciones" onChange={(d, h) => { setDesde(d); setHasta(h); }} />
        <div className="flex-1" />
        {/* 🔴 EXPORTAR NO ES APROBAR: se puede bajar aunque no se pueda decidir. */}
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
          disabled={bloqueado || pendientes.length === 0}
          onClick={() => void decidir(pendientes, "si")}
          className="min-h-[44px] rounded-md bg-black px-5 text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-30"
        >
          {ROTULO_SI_A_TODO}
        </button>
      </div>

      {avisoMigracion && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {avisoMigracion}
        </div>
      )}
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

      {/* ── El control de dos opciones y el contador, en una línea ──────────── */}
      {!cargando && dias !== null && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div role="radiogroup" aria-label="Ver por" className="inline-flex rounded-md border border-gray-200 p-0.5">
            {VISTAS.map((v) => (
              <button
                key={v.key}
                type="button"
                role="radio"
                aria-checked={vista === v.key}
                onClick={() => cambiarVista(v.key)}
                className={`min-h-[40px] rounded px-4 text-sm font-medium transition ${
                  vista === v.key ? "bg-black text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {v.etiqueta}
              </button>
            ))}
          </div>
          {/* 🔴 El buscador SOLO en «Colaborador»: en «Día» los renglones son
              fechas, no personas, y un campo que dice «Buscar colaborador»
              encima de una lista de días no busca nada. */}
          {vista === "colaborador" && (
            <BuscadorDeLista
              valor={busqueda}
              onCambiar={setBusqueda}
              placeholder={PLACEHOLDER_COLABORADOR}
              etiqueta="Buscar colaborador por nombre o código"
              conteo={textoDeConteo(porDecidirVistas.length, porDecidir.length, busqueda)}
            />
          )}
          <div className="flex items-baseline gap-2 tabular-nums" data-testid="por-decidir">
            {porDecidir.length === 0 ? (
              <>
                <span className="text-[30px] font-semibold leading-none text-emerald-700">✓</span>
                <span className="text-sm text-gray-600">{textoPorDecidir(0, 0)}</span>
              </>
            ) : (
              <>
                <span className="text-[30px] font-semibold leading-none tracking-tight">{porDecidir.length}</span>
                <span className="text-sm text-gray-600">por decidir · {hm(minutosPendientes)} h</span>
              </>
            )}
          </div>
        </div>
      )}

      {cargando && <div className="py-8 text-center text-sm text-gray-500">Cargando…</div>}

      {!cargando && dias !== null && dias.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
          Nadie hizo horas extra en estas fechas.
        </div>
      )}

      {!cargando && dias !== null && dias.length > 0 && (
        vista === "dia" ? (
          <PorDia
            dias={porDia}
            onDecidir={decidir}
            enVuelo={enVuelo}
            bloqueado={bloqueado}
            abiertos={abiertos}
            onAbrir={alternar}
            personaResaltada={personaCodigo}
            refResaltada={filaResaltada}
          />
        ) : buscando && porDecidirVistas.length === 0 ? (
          <VacioDeBusqueda texto={VACIO_BUSQUEDA} onLimpiar={() => setBusqueda("")} rotulo={LIMPIAR_BUSQUEDA} />
        ) : (
          <PorColaborador
            personas={porDecidirVistas}
            onDecidir={decidir}
            enVuelo={enVuelo}
            bloqueado={bloqueado}
            abiertos={abiertos}
            onAbrir={alternar}
            personaResaltada={personaCodigo}
            refResaltada={filaResaltada}
          />
        )
      )}

      {!cargando && dias !== null && (
        <YaDecididas personas={decididas} onDecidir={decidir} enVuelo={enVuelo} bloqueado={bloqueado} />
      )}
    </div>
  );
}
