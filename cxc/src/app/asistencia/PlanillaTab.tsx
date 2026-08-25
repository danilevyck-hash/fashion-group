"use client";

// LA PLANILLA QUINCENAL — el cuadro que la contable armaba a mano en Excel.
//
// Toda la regla vive en `lib/asistencia/planilla.ts` (puro) y los minutos salen
// del MISMO motor que el Reporte, así que las dos pestañas no pueden decir
// cosas distintas sobre los mismos minutos.
//
// ── 🔴 LO QUE ESTA PANTALLA NO HACE ──────────────────────────────────────────
// No muestra $0 por nadie. Quien no tiene salario, jornada o ficha sale en una
// sección aparte con el motivo escrito, y NO entra al total. Hoy hay 6 códigos
// con marcaciones y sin ficha (48 a 53): un cero silencioso en una planilla es
// el error que nadie ve hasta que alguien reclama su pago.
//
// ── EL ANCHO ─────────────────────────────────────────────────────────────────
// Son 19 columnas: en escritorio es una tabla que se arrastra DENTRO de su caja
// (la página nunca se mueve de lado) con la columna Persona pegada a la
// izquierda; en celular son tarjetas. Mismo criterio que `PanelCxcMobile`.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { Ayuda } from "@/components/shared/Ayuda";
import {
  EMPRESAS_ASISTENCIA,
  etiquetaEmpresa,
  MINUTOS_TARDE_QUE_SON_AUSENCIA,
} from "@/lib/asistencia/config";
import {
  EXPLICACION_SERVICIO_PROFESIONAL,
  MOTIVO_FUERA_DE_PLANILLA,
} from "@/lib/asistencia/participacion";
import type { ReglasAsistencia } from "@/lib/asistencia/config";
import {
  aHoras,
  FORMULA_NETO,
  grupoDeLinea,
  quincenasHasta,
  textoAusencias,
  textoTardanzas,
  type LineaPlanilla,
  type ManualesLinea,
  type Periodo,
  type Quincena,
  type TotalesPlanilla,
} from "@/lib/asistencia/planilla";
import type { AvisoPeriodoAbierto, CodigoSinFicha } from "@/lib/asistencia/periodo";
import { fmtMin } from "@/lib/asistencia/reporte";

interface Respuesta {
  quincena: Quincena;
  periodo: Periodo;
  empresa: string | null;
  empresaEtiqueta: string | null;
  lineas: LineaPlanilla[];
  totales: TotalesPlanilla;
  reglas: ReglasAsistencia;
  avisos: {
    faltaMigracionConfiguracion: string | null;
    faltaMigracionManual: string | null;
    faltaMigracionBajas: string | null;
    faltaMigracionServicioProfesional: string | null;
    /** Fichas que no entran a ESTA quincena: ya se habían ido, o todavía no
     *  habían entrado. Una quincena vieja NO cambia por esto: se compara contra
     *  las fechas de la quincena, nunca contra hoy. */
    fueraPorBaja: number;
    /** Dadas de baja que igual marcaron después de irse. */
    marcoDespuesDeIrse: number;
    sinHorario: number;
    salidaAsumida: string;
    horasAusenciaDefault: number;
    conSabado: number;
    /** El período todavía no terminó. `null` cuando ya cerró. */
    periodoAbierto: AvisoPeriodoAbierto | null;
    /** Los códigos que marcaron y no tienen ficha. Van UNA vez, fuera del cuadro. */
    sinFicha: CodigoSinFicha[];
    avisoSinFicha: string | null;
    /** El período pedido NO es una quincena: hay cosas que cambian. */
    rangoLibre: boolean;
    factorBase: number;
    diasCalendario: number;
  };
}

const $ = (n: number | null | undefined): string =>
  n === null || n === undefined || n === 0
    ? "—"
    : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Un monto con su signo de dólares. El cero es una raya PELADA, no "$—". */
const $$ = (n: number): string => (n === 0 ? "—" : `$${$(n)}`);

/**
 * Los 5 montos que se escriben a mano, en el orden del cuadro, con el LADO al
 * que van. 🔴 Cuatro restan y «otros servicios» SUMA: es un pago extra, no un
 * descuento (la fórmula de la contable es `=+L-S+T`).
 */
const MANUALES: Array<[keyof ManualesLinea, string, "+" | "−"]> = [
  ["isr", "ISR", "−"],
  ["prestamo", "Préstamo", "−"],
  ["terceros", "Terceros", "−"],
  ["mercancia", "Mercancía", "−"],
  ["otrosServicios", "Otros servicios", "+"],
];

export default function PlanillaTab() {
  const { toast } = useToast();

  // 🔑 `hoy` se calcula UNA vez y en hora de Panamá. Recalcularlo en cada
  // render haría que la lista de quincenas cambiara sola a la medianoche
  // mientras alguien está escribiendo montos.
  const hoy = useMemo(() => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10), []);
  const quincenas = useMemo(() => quincenasHasta(hoy, 12), [hoy]);

  const [clave, setClave] = useState(quincenas[0].clave);
  // 🔑 El rango libre es un SEGUNDO camino, no el principal: la quincena es lo
  // que se mira el 95% de las veces y sigue siendo lo que abre la pantalla.
  const [modo, setModo] = useState<"quincena" | "rango">("quincena");
  const [desde, setDesde] = useState(quincenas[0].desde);
  const [hasta, setHasta] = useState(quincenas[0].hasta);
  const [empresa, setEmpresa] = useState<string>(EMPRESAS_ASISTENCIA[0]);
  const [data, setData] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const p = modo === "rango"
        ? new URLSearchParams({ desde, hasta, empresa })
        : new URLSearchParams({ quincena: clave, empresa });
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
  }, [clave, desde, empresa, hasta, modo]);

  useEffect(() => { void cargar(); }, [cargar]);

  /** Guarda un monto escrito a mano y refresca los números de esa fila. */
  const guardar = useCallback(
    async (codigo: string, campo: keyof ManualesLinea, valor: string) => {
      if (!data) return;
      const linea = data.lineas.find((l) => l.codigo === codigo);
      if (!linea) return;
      const n = Number(String(valor).replace(",", "."));
      const limpio = Number.isFinite(n) && n > 0 ? n : 0;
      if (limpio === linea.manuales[campo]) return; // no se escribió nada nuevo

      try {
        const res = await fetch("/api/asistencia/planilla", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quincena: clave,
            codigo,
            ...linea.manuales,
            [campo]: limpio,
          }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "No se pudo guardar");
        if (j.ok === false) toast(j.aviso ?? "No se pudo guardar", "error");
        // Se recarga entero: el monto cambia el total de deducciones, el neto y
        // los totales del pie. Pintar solo la celda dejaría un cuadro que no
        // suma, que es peor que esperar medio segundo.
        await cargar();
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      }
    },
    [cargar, clave, data, toast],
  );

  const exportables = useMemo(() => {
    if (!data) return null;
    return {
      lineas: data.lineas,
      totales: data.totales,
      quincena: data.quincena,
      periodo: data.periodo,
      empresaEtiqueta: data.empresaEtiqueta,
      reglas: data.reglas,
      // Los avisos que no se pueden perder al mandar el archivo por correo: el
      // papel sobrevive a la conversación donde se explicaron.
      periodoAbierto: data.avisos.periodoAbierto,
      avisoSinFicha: data.avisos.avisoSinFicha,
    };
  }, [data]);

  // Las librerías de Excel y PDF se bajan al TOCAR el botón — ver la nota larga
  // en `ReporteTab`. ⚠️ Acá `planilla-exportar` ya tenía el cuidado de importar
  // el tipo de xlsx con `import type`, pero dos líneas más abajo importaba
  // VALORES de `lib/excel-export`, que sí trae `xlsx-js-style` estático: el
  // cuidado quedaba anulado. Por eso los dos van dentro del handler.
  //
  // `construirPdfPlanilla` se deja SÍNCRONA a propósito (el `await import` va
  // acá, en el llamador): hay un candado que la busca por el texto
  // `export function construirPdfPlanilla`.
  async function bajarExcel() {
    if (!exportables?.lineas.length) return;
    try {
      const { downloadWorkbook } = await import("@/lib/excel-export");
      const { construirExcelPlanilla, nombreArchivo } = await import("@/lib/asistencia/planilla-exportar");
      downloadWorkbook(construirExcelPlanilla(exportables), nombreArchivo(exportables, "xlsx"));
      toast("Excel listo — revisa tu carpeta de descargas", "success");
    } catch {
      toast("No se pudo armar el Excel. Intenta de nuevo.", "error");
    }
  }
  async function bajarPdf() {
    if (!exportables?.lineas.length) return;
    try {
      const { construirPdfPlanilla, nombreArchivo } = await import("@/lib/asistencia/planilla-exportar");
      construirPdfPlanilla(exportables).save(nombreArchivo(exportables, "pdf"));
      toast("PDF listo — revisa tu carpeta de descargas", "success");
    } catch {
      toast("No se pudo armar el PDF. Intenta de nuevo.", "error");
    }
  }

  // 🔴 CUATRO grupos, no dos, y el reparto lo hace `grupoDeLinea` —la MISMA
  // función que ordena el cuadro, cuenta los totales y arma el Excel y el PDF—.
  // Con la lista partida acá a mano, la pantalla y el papel podían discrepar
  // sobre en qué cajón cae una persona.
  //
  // 🩸 «Falta un dato» y «Decidilo vos» eran UNA SOLA bolsa ámbar, y por eso
  // RODRIGO MIRANDA (trabajo fuera de la oficina) y ELOYN MENDOZA (vacaciones)
  // salían pidiendo que los arreglaran en Configuración, donde no hay nada que
  // arreglarles. Ámbar dice "arreglame"; esto es una decisión, y va en gris.
  const buenas = data?.lineas.filter((l) => grupoDeLinea(l) === "pagada") ?? [];
  const fueraDePlanilla = data?.lineas.filter((l) => grupoDeLinea(l) === "fuera") ?? [];
  const decidir = data?.lineas.filter((l) => grupoDeLinea(l) === "decidir") ?? [];
  const pendientes = data?.lineas.filter((l) => grupoDeLinea(l) === "falta") ?? [];

  return (
    <div className="space-y-4">
      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Período</span>
          <div className="flex flex-wrap items-center gap-2">
            {/* Quincena / Rango de fechas. La quincena manda: es con lo que se
                paga. El rango es para PREGUNTAR («¿cuánto trabajó del 25 al 10?»)
                y la pantalla dice qué cambia cuando se usa. */}
            <div className="flex overflow-hidden rounded-lg border border-gray-200">
              {([["quincena", "Quincena"], ["rango", "Rango de fechas"]] as const).map(([k, t]) => (
                <button
                  key={k} type="button"
                  onClick={() => {
                    // Al pasar a rango se arranca con la quincena que estaba a
                    // la vista: el primer cuadro que se ve es el MISMO, y de ahí
                    // se mueven las fechas. Nadie empieza con la pantalla vacía.
                    if (k === "rango" && modo === "quincena") {
                      const q = quincenas.find((x) => x.clave === clave);
                      if (q) { setDesde(q.desde); setHasta(q.hasta); }
                    }
                    setModo(k);
                  }}
                  className={`min-h-[44px] px-3 text-sm transition ${
                    modo === k ? "bg-black text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {modo === "quincena" ? (
              <select
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm"
              >
                {quincenas.map((q) => (
                  <option key={q.clave} value={q.clave}>{q.etiqueta}</option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="date" value={desde} max={hasta}
                  onChange={(e) => setDesde(e.target.value)}
                  aria-label="Desde"
                  className="min-h-[44px] rounded-lg border border-gray-200 px-2 text-base tabular-nums outline-none transition focus:border-black sm:text-sm"
                />
                <span className="text-xs text-gray-400">a</span>
                <input
                  type="date" value={hasta} min={desde}
                  onChange={(e) => setHasta(e.target.value)}
                  aria-label="Hasta"
                  className="min-h-[44px] rounded-lg border border-gray-200 px-2 text-base tabular-nums outline-none transition focus:border-black sm:text-sm"
                />
              </div>
            )}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Empresa</span>
          <select
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm"
          >
            {EMPRESAS_ASISTENCIA.map((k) => (
              <option key={k} value={k}>{etiquetaEmpresa(k)}</option>
            ))}
          </select>
        </label>

        <div className="flex gap-2">
          <button
            type="button" onClick={bajarExcel} disabled={!data?.lineas.length}
            className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-40"
          >
            Excel
          </button>
          <button
            type="button" onClick={bajarPdf} disabled={!data?.lineas.length}
            className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-40"
          >
            PDF
          </button>
        </div>
      </div>

      {/* ── Avisos: todo lo que hay que saber ANTES de descontarle plata a nadie ── */}
      {/* 🔴 EL PERÍODO NO TERMINÓ. Va arriba de todo: los días que no pasaron
          dejaron de contarse como falta —eran $866,99 de $1.127,78 el día que
          se midió— y un número que baja sin explicación se lee como un número
          que no cuadra. */}
      {data?.avisos.periodoAbierto && (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[13px] text-blue-900">
          {data.avisos.periodoAbierto.texto}
        </p>
      )}
      {/* 🔴 El código que marca y no tiene ficha: UNA vez, arriba, fuera del
          cuadro de cada empresa. Antes salía tres veces —una por empresa— como
          si fueran tres personas distintas. */}
      {data?.avisos.avisoSinFicha && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.avisos.avisoSinFicha}{" "}
          Se le da de alta en <b>Configuración</b>.
        </p>
      )}
      {/* 🔴 EL AVISO DEL RANGO LIBRE. Va PRIMERO y no se esconde detrás de un ⓘ:
          en un rango que no es una quincena, el sueldo base se reparte y los
          montos escritos a mano no entran. Quien imprima este cuadro para pagar
          tiene que leer eso antes que cualquier otra cosa. */}
      {data?.avisos.rangoLibre && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <b>Este cuadro NO es una quincena.</b> Son {data.avisos.diasCalendario} días
          ({data.periodo.etiqueta}).
          <ul className="mt-1 space-y-0.5 text-amber-800">
            <li>
              · El <b>sueldo base se reparte</b>: se paga{" "}
              <b>{(data.avisos.factorBase * 100).toFixed(1)} %</b> de un sueldo quincenal,
              que es la parte de quincena que cubren estas fechas.
            </li>
            <li>
              · El <b>ISR, el préstamo, los terceros, la mercancía y los otros servicios
              NO entran</b>: se escriben por quincena y repartirlos por días sería inventar
              plata. Para pagar, elige la quincena.
            </li>
            <li>· Las horas, las extras, las tardanzas y las ausencias sí son las de estas fechas.</li>
          </ul>
        </div>
      )}
      {data?.avisos.faltaMigracionConfiguracion && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {data.avisos.faltaMigracionConfiguracion}
        </p>
      )}
      {data?.avisos.faltaMigracionManual && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.avisos.faltaMigracionManual}
        </p>
      )}
      {data?.avisos.faltaMigracionBajas && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.avisos.faltaMigracionBajas}
        </p>
      )}
      {data?.avisos.faltaMigracionServicioProfesional && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.avisos.faltaMigracionServicioProfesional}
        </p>
      )}
      {/* 🩸 Que alguien siga marcando después de darse de baja no se esconde:
          o volvió, o alguien está usando su huella. Va en ROJO porque las dos
          explicaciones piden que una persona haga algo. */}
      {!!data?.avisos.marcoDespuesDeIrse && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-800">
          <b>{data.avisos.marcoDespuesDeIrse}</b>{" "}
          {data.avisos.marcoDespuesDeIrse === 1
            ? "persona marcó en el reloj después de la fecha en que salió"
            : "personas marcaron en el reloj después de la fecha en que salieron"}
          . O volvieron a trabajar —hay que reactivarlas en <b>Configuración</b> o la planilla
          les paga cero— o alguien más está usando su huella.
        </p>
      )}
      {!!data?.avisos.fueraPorBaja && (
        <p className="rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
          <b>{data.avisos.fueraPorBaja}</b>{" "}
          {data.avisos.fueraPorBaja === 1 ? "persona no sale" : "personas no salen"} en esta
          quincena: ya no trabajaban acá, o entraron después. Las quincenas en las que sí
          trabajaron siguen igual — se ven eligiendo esa quincena arriba.
        </p>
      )}
      {!!data?.avisos.sinHorario && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <b>{data.avisos.sinHorario}</b>{" "}
          {data.avisos.sinHorario === 1 ? "persona no tiene" : "personas no tienen"} su hora de
          salida confirmada. Mientras tanto se asume {data.avisos.salidaAsumida} para las horas
          extra, y un día de ausencia se cuenta como{" "}
          <b>{data.avisos.horasAusenciaDefault} horas</b>. Revísalo en <b>Horarios</b>.
        </p>
      )}
      {!!data?.avisos.conSabado && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <b>{data.avisos.conSabado}</b>{" "}
          {data.avisos.conSabado === 1 ? "persona trabajó" : "personas trabajaron"} un sábado. El
          cuadro no tiene columna para el sábado, así que esas horas <b>no se pagan acá</b>: las
          ves en la hoja «Horas» del Excel.
        </p>
      )}

      {cargando && <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>}
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!cargando && !error && data?.lineas.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-500">
          No hay nadie en esta empresa para esta quincena. Revisa la pestaña <b>Configuración</b>.
        </p>
      )}

      {!cargando && !error && !!data?.lineas.length && (
        <>
          {/* ── ESCRITORIO: la tabla de 19 columnas ── */}
          <div className="hidden md:block">
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-max min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="sticky left-0 z-10 bg-white px-3 py-2.5 text-left font-medium">Persona</th>
                    {[
                      "Salario\nquincenal", "Extra\n1.25", "Ausen-\ncias", "Tar-\ndanzas",
                      "Extra\n1.50", "Exce-\ndente", "Domin-\ngos", "Feria-\ndos", "Total\nbruto",
                      "Seguro\nsocial", "Seguro\neducativo", "ISR", "Prés-\ntamo", "Ter-\nceros",
                      "Mercan-\ncía", "Total\ndeducc.",
                      // El «(+)» no es adorno: es la única señal en la tabla de
                      // que esta columna SUMA mientras las cuatro de al lado restan.
                      "Otros\nservicios (+)", "Neto a\npagar",
                    ].map((h) => (
                      <th key={h} className="whitespace-pre px-2 py-2.5 text-right font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buenas.map((l) => (
                    <Fila
                      key={l.codigo} l={l} onGuardar={guardar}
                      // En un rango libre no hay dónde guardarlos (la tabla los
                      // guarda por quincena): se muestran apagados, no se
                      // esconden — su ausencia es parte de lo que hay que ver.
                      manualesBloqueados={!!data.avisos.rangoLibre}
                    />
                  ))}
                  {/* Fuera de planilla a propósito: en GRIS, no en ámbar. El
                      color es la mitad del mensaje — ámbar dice "arreglame". */}
                  {fueraDePlanilla.map((l) => (
                    <tr key={l.codigo} className="border-b border-gray-100 last:border-0">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2.5 text-gray-500">
                        {l.etiqueta}
                        <span className="ml-1.5 text-xs text-gray-400">{l.codigo}</span>
                      </td>
                      <td colSpan={18} className="px-2 py-2.5 text-[13px] text-gray-500">
                        {MOTIVO_FUERA_DE_PLANILLA} · se le mide la asistencia, no se le calcula pago
                      </td>
                    </tr>
                  ))}
                  {/* 🔴 DECIDILO VOS: en GRIS, con el motivo escrito y con el
                      quincenal que le correspondería, para que la contadora no
                      tenga que calcularlo aparte. No es un error: es una
                      decisión que el sistema no puede tomar. */}
                  {decidir.map((l) => (
                    <tr key={l.codigo} className="border-b border-gray-100 last:border-0">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2.5 text-gray-700">
                        {l.etiqueta}
                        <span className="ml-1.5 text-xs text-gray-400">{l.codigo}</span>
                      </td>
                      <td colSpan={18} className="px-2 py-2.5 text-[13px] text-gray-600">
                        {l.decidirAMano}
                        {l.quincenalReferencia !== null && (
                          <> — la quincena completa le daría <b>${$(l.quincenalReferencia)}</b></>
                        )}
                      </td>
                    </tr>
                  ))}
                  {pendientes.map((l) => (
                    <tr key={l.codigo} className="border-b border-gray-100 bg-amber-50/50 last:border-0">
                      <td className="sticky left-0 z-10 bg-amber-50 px-3 py-2.5 text-gray-900">
                        {l.etiqueta}
                        <span className="ml-1.5 text-xs text-gray-400">{l.codigo}</span>
                      </td>
                      <td colSpan={18} className="px-2 py-2.5 text-[13px] font-medium text-amber-800">
                        falta configurar — {l.faltaConfigurar.join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2.5">
                      TOTAL · {data.totales.personas}{" "}
                      {data.totales.personas === 1 ? "persona" : "personas"}
                    </td>
                    {[
                      data.totales.salarioQuincenal, data.totales.extraDiurno, data.totales.ausencias,
                      data.totales.tardanzas, data.totales.extraNocturno, data.totales.excedente,
                      data.totales.domingos, data.totales.feriados, data.totales.totalBruto,
                      data.totales.seguroSocial, data.totales.seguroEducativo, data.totales.isr,
                      data.totales.prestamo, data.totales.terceros, data.totales.mercancia,
                      data.totales.totalDeducciones, data.totales.otrosServicios, data.totales.netoPagar,
                    ].map((v, i) => (
                      <td key={i} className="px-2 py-2.5 text-right tabular-nums">
                        {v === 0 ? <span className="text-gray-400">—</span> : $$(v)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* 🔴 EL PIE QUE EXPLICA EL ASTERISCO. Solo aparece cuando hay algo
                que explicar: un cartel permanente se deja de leer, y éste tiene
                que leerse el día que aparece un número raro en «Ausencias». */}
            {buenas.some((l) => (l.dinero?.ausenciaPorTardanza ?? 0) > 0) && (
              <p className="mt-2 px-1 text-[12px] text-gray-600">
                <span className="font-semibold text-amber-700">*</span>{" "}
                Incluye días en que la persona SÍ vino pero llegó más de{" "}
                {MINUTOS_TARDE_QUE_SON_AUSENCIA} minutos tarde. <b>Se descuentan los minutos, igual
                que una tardanza</b> — la columna solo cambia de nombre, el total bruto es el mismo.
                Pasa el cursor por el número para ver cuánto y de cuántos días.
              </p>
            )}
          </div>

          {/* ── CELULAR: una tarjeta por persona ── */}
          <div className="space-y-2 md:hidden">
            {buenas.map((l) => (
              <Tarjeta
                key={l.codigo} l={l}
                abierta={abierta === l.codigo}
                onToggle={() => setAbierta(abierta === l.codigo ? null : l.codigo)}
                onGuardar={guardar}
                manualesBloqueados={!!data.avisos.rangoLibre}
              />
            ))}
            {fueraDePlanilla.map((l) => (
              <div key={l.codigo} className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="font-medium text-gray-700">
                  {l.etiqueta} <span className="text-xs text-gray-400">{l.codigo}</span>
                </p>
                <p className="mt-0.5 text-[13px] text-gray-500">
                  {MOTIVO_FUERA_DE_PLANILLA} · se le mide la asistencia, no se le calcula pago
                </p>
              </div>
            ))}
            {decidir.map((l) => (
              <div key={l.codigo} className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="font-medium text-gray-700">
                  {l.etiqueta} <span className="text-xs text-gray-400">{l.codigo}</span>
                </p>
                <p className="mt-0.5 text-[13px] text-gray-600">
                  {l.decidirAMano}
                  {l.quincenalReferencia !== null && (
                    <> — la quincena completa le daría <b>${$(l.quincenalReferencia)}</b></>
                  )}
                </p>
              </div>
            ))}
            {pendientes.map((l) => (
              <div key={l.codigo} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="font-medium text-gray-900">
                  {l.etiqueta} <span className="text-xs text-gray-400">{l.codigo}</span>
                </p>
                <p className="mt-0.5 text-[13px] text-amber-800">
                  falta configurar — {l.faltaConfigurar.join(" · ")}
                </p>
              </div>
            ))}
            <div className="rounded-lg border-2 border-gray-300 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Total · {data.totales.personas}{" "}
                {data.totales.personas === 1 ? "persona" : "personas"}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                ${$(data.totales.netoPagar)}
              </p>
              <p className="text-[13px] text-gray-500">
                Bruto ${$(data.totales.totalBruto)} · deducciones ${$(data.totales.totalDeducciones)}
              </p>
            </div>
          </div>

          {!!fueraDePlanilla.length && (
            <p className="rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
              <b>{fueraDePlanilla.length}</b>{" "}
              {fueraDePlanilla.length === 1 ? "persona no va" : "personas no van"} en la planilla
              (servicio profesional). {EXPLICACION_SERVICIO_PROFESIONAL} Se cambia en{" "}
              <b>Configuración</b>.
            </p>
          )}

          {/* 🔴 DOS listas con nombre propio, no una bolsa. «Decidilo vos» va en
              GRIS y sin mandar a Configuración: ahí no hay nada que arreglar. */}
          {!!decidir.length && (
            <p className="rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
              <b>Decidilo vos:</b> {decidir.length}{" "}
              {decidir.length === 1 ? "persona quedó" : "personas quedaron"} fuera del total porque
              el sistema no puede saber cuánto le toca —está justificada, o entró o salió a mitad
              del período—. <b>No es un error y no hay nada que arreglar</b>: al lado de cada una
              está el motivo y lo que le daría la quincena completa. Para sacar lo suyo, usa{" "}
              <b>Rango de fechas</b> acá arriba.
            </p>
          )}
          {!!pendientes.length && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              <b>Falta un dato:</b> {pendientes.length}{" "}
              {pendientes.length === 1 ? "persona quedó" : "personas quedaron"} fuera del total
              porque falta configurarles algo. <b>No valen $0</b> — se arreglan en la pestaña{" "}
              <b>Configuración</b>.
            </p>
          )}
        </>
      )}

      {/* La fórmula se aprende UNA vez y no cambia ninguna decisión al abrir la
          pantalla: va al ⓘ. Todo lo de arriba —los avisos de plata— se queda
          en pantalla. */}
      <div className="-ml-2">
        <Ayuda titulo="Cómo se calcula el neto" etiqueta="Cómo se calcula el neto">
          <p>{FORMULA_NETO}</p>
          <p className="mt-1.5">
            Los recargos, los porcentajes de seguro y la hora de corte se cambian en{" "}
            <b>Configuración</b>. El ISR, el préstamo, los terceros, la mercancía y los otros
            servicios se escriben a mano acá: no salen de ningún sistema.
          </p>
        </Ayuda>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type OnGuardar = (codigo: string, campo: keyof ManualesLinea, valor: string) => void;

/** Una celda de dinero que se escribe a mano. Guarda al salir del campo. */
function CeldaManual({
  codigo, campo, valor, onGuardar, ancho = "w-20", bloqueada,
}: {
  codigo: string; campo: keyof ManualesLinea; valor: number; onGuardar: OnGuardar;
  ancho?: string; bloqueada?: boolean;
}) {
  // 🔑 Estado local mientras se escribe: si el valor viniera del padre en cada
  // tecla, el recargo de la fila pisaría lo que la persona está tecleando.
  const [texto, setTexto] = useState(valor ? String(valor) : "");
  useEffect(() => { setTexto(valor ? String(valor) : ""); }, [valor]);

  return (
    <input
      type="text" inputMode="decimal" value={bloqueada ? "" : texto}
      placeholder={bloqueada ? "por quincena" : "—"}
      disabled={bloqueada}
      title={bloqueada ? "Se escribe por quincena, no por rango de fechas" : undefined}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => onGuardar(codigo, campo, texto)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={`${ancho} min-h-[44px] rounded border border-gray-200 bg-white px-1.5 text-right text-sm tabular-nums outline-none transition focus:border-black disabled:bg-gray-100 disabled:text-gray-400 disabled:placeholder:text-[10px]`}
    />
  );
}

function Fila({
  l, onGuardar, manualesBloqueados,
}: { l: LineaPlanilla; onGuardar: OnGuardar; manualesBloqueados?: boolean }) {
  const d = l.dinero!;
  const num = (v: number, extra = "") => (
    <td className={`px-2 py-1.5 text-right tabular-nums ${extra}`}>
      {v === 0 ? <span className="text-gray-300">—</span> : $(v)}
    </td>
  );
  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-gray-900 hover:bg-gray-50">
        {l.etiqueta}
        <span className="ml-1.5 text-xs text-gray-400">{l.codigo}</span>
      </td>
      {num(d.salarioQuincenal)}
      {num(d.extraDiurno)}
      {/* 🔴 EL ASTERISCO NO ES ADORNO. En el escritorio esta celda es todo lo
          que la contadora ve de la ausencia, y desde el 25-ago-2026 puede traer
          minutos de alguien que VINO TODOS LOS DÍAS. Sin la marca, ella lee una
          ausencia donde sabe que la persona trabajó. El `title` da el detalle
          y el pie de la tabla explica qué significa el asterisco. */}
      <td className={`px-2 py-1.5 text-right tabular-nums text-red-700 ${d.ausencias === 0 ? "" : ""}`}>
        {d.ausencias === 0 ? <span className="text-gray-300">—</span> : (
          <span
            title={d.ausenciaPorTardanza > 0
              ? `${$(d.ausenciaPorTardanza)} de estos ${$(d.ausencias)} son de ${l.horas.tardanzaGraveDias} día(s) en que llegó más de ${MINUTOS_TARDE_QUE_SON_AUSENCIA} minutos tarde. Se descuentan los minutos, igual que una tardanza.`
              : undefined}
          >
            {$(d.ausencias)}
            {d.ausenciaPorTardanza > 0 && <span className="ml-0.5 text-amber-700">*</span>}
          </span>
        )}
      </td>
      {num(d.tardanzas, "text-red-700")}
      {num(d.extraNocturno)}
      {num(d.excedente)}
      {num(d.domingos)}
      {num(d.feriados)}
      {num(d.totalBruto, "font-semibold text-gray-900")}
      {num(d.seguroSocial)}
      {num(d.seguroEducativo)}
      {MANUALES.slice(0, 4).map(([campo]) => (
        <td key={campo} className="px-1 py-1.5 text-right">
          <CeldaManual codigo={l.codigo} campo={campo} valor={l.manuales[campo]}
            onGuardar={onGuardar} bloqueada={manualesBloqueados} />
        </td>
      ))}
      {num(d.totalDeducciones)}
      <td className="px-1 py-1.5 text-right">
        <CeldaManual codigo={l.codigo} campo="otrosServicios" valor={l.manuales.otrosServicios}
          onGuardar={onGuardar} bloqueada={manualesBloqueados} />
      </td>
      {num(d.netoPagar, "font-semibold text-gray-900")}
    </tr>
  );
}

function Tarjeta({
  l, abierta, onToggle, onGuardar, manualesBloqueados,
}: {
  l: LineaPlanilla; abierta: boolean; onToggle: () => void; onGuardar: OnGuardar;
  manualesBloqueados?: boolean;
}) {
  const d = l.dinero!;
  const h = l.horas;
  const linea = (k: string, v: number, rojo = false) =>
    v === 0 ? null : (
      <div key={k} className="flex justify-between py-0.5">
        <span className="text-gray-500">{k}</span>
        <span className={`tabular-nums ${rojo ? "text-red-700" : "text-gray-900"}`}>
          {rojo ? "−" : ""}${$(v)}
        </span>
      </div>
    );

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button" onClick={onToggle}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium text-gray-900">{l.etiqueta}</span>
          <span className="text-xs text-gray-400">
            {l.codigo} · bruto ${$(d.totalBruto)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-lg font-semibold tabular-nums text-gray-900">
            ${$(d.netoPagar)}
          </span>
          <span className="text-[11px] text-gray-400">{abierta ? "cerrar" : "ver detalle"}</span>
        </span>
      </button>

      {abierta && (
        <div className="border-t border-gray-100 px-3 py-3 text-[13px]">
          {linea("Salario quincenal", d.salarioQuincenal)}
          {linea(`Horas extra 1.25 (${aHoras(h.extraDiurnoMin)} h)`, d.extraDiurno)}
          {linea(`Horas extra 1.50 (${aHoras(h.extraNocturnoMin)} h)`, d.extraNocturno)}
          {linea(`Excedente 2.625 (${aHoras(h.excedenteMin)} h)`, d.excedente)}
          {linea(`Domingos (${aHoras(h.domingoMin)} h)`, d.domingos)}
          {linea(`Feriados (${aHoras(h.feriadoMin)} h)`, d.feriados)}
          {/* 🔴 LAS DOS ETIQUETAS SALEN DE `planilla.ts`, y no se arman acá.
              Desde el 25-ago-2026 estas dos columnas SE REPARTEN los mismos
              minutos —más de 30 tarde se muestran en «Ausencias»— y escribir el
              texto en la pantalla es la forma de que los minutos dejen de
              cuadrar con los dólares de al lado sin que nadie lo note. */}
          {linea(`Ausencias (${textoAusencias(h)})`, d.ausencias, true)}
          {linea(`Tardanzas (${textoTardanzas(h)})`, d.tardanzas, true)}
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-semibold">
            <span>Total bruto</span>
            <span className="tabular-nums">${$(d.totalBruto)}</span>
          </div>

          <div className="mt-2">
            {linea("Seguro social", d.seguroSocial, true)}
            {linea("Seguro educativo", d.seguroEducativo, true)}
          </div>

          {/* Sin rótulo de grupo: cada campo ya dice su nombre y para qué lado
              va («resta» / «suma»), y que se escriben a mano lo dice el ⓘ del
              pie de la pantalla. */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {MANUALES.map(([campo, etiqueta, signo]) => (
              <label key={campo} className="flex flex-col gap-0.5">
                {/* El signo va en la etiqueta: cuatro de los cinco se restan y
                    «otros servicios» SUMA. Sin decirlo, el que lo escribe no
                    tiene forma de saber para qué lado va su número. */}
                <span className="text-[11px] text-gray-500">
                  {etiqueta}{" "}
                  <span className={signo === "+" ? "text-emerald-700" : "text-red-700"}>
                    ({signo === "+" ? "suma" : "resta"})
                  </span>
                </span>
                <CeldaManual
                  codigo={l.codigo} campo={campo} valor={l.manuales[campo]}
                  onGuardar={onGuardar} ancho="w-full" bloqueada={manualesBloqueados}
                />
              </label>
            ))}
          </div>

          <div className="mt-3 flex justify-between border-t border-gray-200 pt-1">
            <span className="text-gray-500">Total deducciones</span>
            <span className="tabular-nums text-red-700">−${$(d.totalDeducciones)}</span>
          </div>
          {d.otrosServicios > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Otros servicios</span>
              <span className="tabular-nums text-emerald-700">+${$(d.otrosServicios)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold">
            <span>Neto a pagar</span>
            <span className="tabular-nums">${$(d.netoPagar)}</span>
          </div>

          {h.diasARevisar > 0 && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">
              <b>{h.diasARevisar}</b> {h.diasARevisar === 1 ? "día" : "días"} sin las 4 marcas
              {/* ⚠️ «minutos que llegó tarde» y no «minutos de tardanza»: desde
                  el 25-ago-2026 esos minutos se reparten entre las dos columnas,
                  así que llamarlos «de tardanza» ya no cuadraría con el monto
                  que la columna «Tardanzas» muestra al lado. */}
              {h.tardanzaDeDiasARevisarMin > 0 && (
                <> — de ahí salen <b>{fmtMin(h.tardanzaDeDiasARevisarMin)}</b> de los {fmtMin(h.tardanzaMin)} minutos
                que llegó tarde. Míralos antes de descontar.</>
              )}
            </p>
          )}
          {/* 🔴 UN MONTO EN «AUSENCIAS» DE ALGUIEN QUE VINO TODOS LOS DÍAS NO
              PUEDE QUEDAR SIN EXPLICACIÓN. Es la contadora la que revisa este
              cuadro, y sin esta línea vería una ausencia donde ella sabe que la
              persona trabajó. Se dice el monto y de dónde sale. */}
          {d.ausenciaPorTardanza > 0 && (
            <p className="mt-2 rounded bg-blue-50 px-2 py-1.5 text-[12px] text-blue-900">
              De los <b>${$(d.ausencias)}</b> de ausencia, <b>${$(d.ausenciaPorTardanza)}</b> son de{" "}
              <b>{h.tardanzaGraveDias}</b> {h.tardanzaGraveDias === 1 ? "día" : "días"} en que llegó más de{" "}
              {MINUTOS_TARDE_QUE_SON_AUSENCIA} minutos tarde. <b>Se descuentan los minutos, igual que una
              tardanza</b> — la columna solo cambia de nombre, el monto es el mismo.
            </p>
          )}
          {h.sabadoMin > 0 && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">
              Trabajó <b>{aHoras(h.sabadoMin)} h</b> un sábado. No hay columna para el sábado en el
              cuadro, así que esas horas no se pagan acá.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
