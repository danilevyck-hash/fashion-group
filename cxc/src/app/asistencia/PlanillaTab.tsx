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
import { CHIP_NO_MARCA_RELOJ } from "@/lib/asistencia/sueldo-fijo";
import { CHIP_REPARTIDO, type RepartoRechazado } from "@/lib/asistencia/reparto";
// 🔑 `baseSeguros` es EL MISMO LECTOR que usan el servidor y el motor. Acá hace
// falta de verdad: una línea armada a mano —hay fixtures de tests que lo hacen,
// y una respuesta vieja del servidor guardada en caché también— llega SIN el
// campo, y un `!== null` pelado dejaría pasar el `undefined` y reventaría la
// pantalla entera al formatearlo. Ante la duda: no hay sello, o sea lo de ayer.
import { baseSeguros, chipBaseSeguros } from "@/lib/asistencia/seguros-base";
import type { AvisoPeriodoAbierto, CodigoSinFicha } from "@/lib/asistencia/periodo";
import type { ExtraNoAprobada } from "@/lib/asistencia/aprobaciones";
import type {
  PrestamoSinAtar,
  SugerenciaPrestamo,
} from "@/lib/asistencia/prestamos-planilla";
import type { VacacionNoPagada } from "@/lib/asistencia/vacaciones";
import { fmtMin } from "@/lib/asistencia/reporte";

import RangoFechas, { ultimoRango } from "@/components/ui/RangoFechas";
interface Respuesta {
  quincena: Quincena;
  periodo: Periodo;
  empresa: string | null;
  empresaEtiqueta: string | null;
  lineas: LineaPlanilla[];
  totales: TotalesPlanilla;
  reglas: ReglasAsistencia;
  /** 🔴 Lo que el módulo de Préstamos dice que hay que descontar esta quincena,
   *  persona por persona. Vacío en un rango libre.
   *
   *  🩸 OPCIONAL A PROPÓSITO: una respuesta guardada por SWR de ANTES de este
   *  cambio no lo trae, y esa respuesta se pinta antes de que llegue la nueva.
   *  Declararlo obligatorio le mentiría al compilador sobre lo que de verdad
   *  puede llegar, y el precio sería la planilla en blanco. */
  prestamos?: SugerenciaPrestamo[];
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
    /** Lo que la planilla DEJÓ DE PAGAR por vacaciones marcadas «ya se le pagó».
     *  Nada se descarta en silencio: va con nombre, rango y monto. */
    vacacionesNoPagadas: VacacionNoPagada[];
    avisoVacacionesNoPagadas: string | null;
    /** Falta correr el SQL de las vacaciones. Nadie está de vacaciones y la
     *  planilla paga lo de siempre — pero se dice. */
    faltaMigracionVacaciones: string | null;
    /** 🔴 Las horas extra que este cuadro NO pagó porque nadie las autorizó.
     *  Contadora, textual: *«Sólo se pagan las horas extras autorizadas»*.
     *  Nada se descarta en silencio: va con nombre y cantidad. */
    extraSinAprobar: ExtraNoAprobada[];
    avisoExtraSinAprobar: string | null;
    /** Falta correr el SQL de las aprobaciones. NO se exige aprobación: se paga
     *  todo lo que midió el reloj, como hasta hoy — pero se dice. */
    faltaMigracionAprobaciones: string | null;
    /** Falta correr el SQL del reparto. Nadie reparte su sueldo entre dos
     *  empresas y cada persona sale en una sola planilla, como hoy — pero se
     *  dice: quien ya dio a Julio por repartido va a esperar verlo en las dos. */
    faltaMigracionReparto: string | null;
    /** 🔴 Los repartos que el guard NO aplicó, con nombre y motivo. Esa persona
     *  cobró en UNA sola planilla, y sin este aviso nadie se enteraría. */
    repartosRechazados: RepartoRechazado[];
    avisoRepartoRechazado: string | null;
    /** 🔴 Los descuentos de préstamo que este cuadro NO hizo porque nadie los
     *  aprobó. Contadora, textual: *«El préstamo si debe ser por aprobarlo»*.
     *  Nada se descarta en silencio: va con nombre y monto.
     *  🩸 Opcionales por el mismo motivo que `prestamos`: una respuesta vieja
     *  guardada por SWR no los trae. */
    prestamoSinAprobar?: SugerenciaPrestamo[];
    avisoPrestamoSinAprobar?: string | null;
    /** 🔴 Préstamos CON SALDO que no están atados a nadie de la planilla: no se
     *  le descuentan a ninguna persona. */
    prestamoSinAtar?: PrestamoSinAtar[];
    avisoPrestamoSinAtar?: string | null;
    /** Falta correr el SQL del amarre. La casilla se sigue escribiendo a mano,
     *  como hasta hoy — pero se dice. */
    faltaMigracionAmarrePrestamos?: string | null;
    /** Falta correr el SQL de la aprobación del préstamo. Ídem. */
    faltaMigracionPrestamoAprobado?: string | null;
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
  // ⛔ EL MODO «QUINCENA» SE RETIRÓ (25-ago-2026). Daniel, textual: *"quita
  // periodo quincena en planilla, eso no se usara asi. y sisi, que el usuario
  // eliga el rango"*. Con un solo modo, el control segmentado sobraba: los dos
  // campos de fecha se muestran directo.
  //
  // 🔴 PERO LA QUINCENA NO DESAPARECIÓ DEL CÁLCULO, y eso es lo que sostiene
  // todo lo de abajo: `periodoDesdeRango` reconoce un rango que COINCIDE con
  // una quincena y devuelve esa quincena —misma clave de montos manuales, mismo
  // factor 1—, así que el caso normal sigue pagando exactamente lo de siempre.
  // Por eso el rango arranca en la quincena en curso: el primer cuadro que se
  // ve es el de siempre y de ahí se mueven las fechas.
  const quincenaEnCurso = useMemo(() => quincenasHasta(hoy, 1)[0], [hoy]);
  const [desde, setDesde] = useState(quincenaEnCurso.desde);
  const [hasta, setHasta] = useState(quincenaEnCurso.hasta);

  // 🔑 EL ÚLTIMO RANGO, por dispositivo. Es lo que reemplaza a los presets que
  // se fueron: el segundo día ya abre donde lo dejaste. Corre UNA vez al montar
  // —si no, pisaría cada cambio del usuario con el valor guardado.
  useEffect(() => {
    const r = ultimoRango("asistencia_planilla");
    if (r) { setDesde(r.desde); setHasta(r.hasta); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [empresa, setEmpresa] = useState<string>(EMPRESAS_ASISTENCIA[0]);
  const [data, setData] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const p = new URLSearchParams({ desde, hasta, empresa });
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
  }, [desde, empresa, hasta]);

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
      // 🔴 SIN QUINCENA NO HAY DÓNDE GUARDARLO. El campo ya va deshabilitado en
      // un rango libre, pero el freno tiene que vivir también del lado que
      // escribe: `asistencia_planilla_manual` guarda por quincena y su CHECK no
      // acepta otra clave, así que mandar el POST sin ella sería un 400 en la
      // cara de quien acaba de escribir un monto.
      if (!data.periodo.claveManuales) return;

      try {
        const res = await fetch("/api/asistencia/planilla", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // 🔴 LA CLAVE SALE DE LA RESPUESTA, no de un estado propio. Es la
            // quincena que el servidor reconoció en estas fechas
            // (`periodo.claveManuales`), o sea la MISMA con la que ya estaban
            // guardados: escribir una clave calculada acá sería una segunda
            // definición de «a qué quincena pertenece este cuadro», y el día
            // que difieran los montos se guardarían en una quincena y se
            // leerían de otra.
            quincena: data.periodo.claveManuales,
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
    [cargar, data, toast],
  );

  // ── 🔴 APROBAR EL DESCUENTO DE PRÉSTAMO ────────────────────────────────────
  //
  // Contadora, textual: *«El préstamo si debe ser por aprobarlo»*. Aprobar
  // ESCRIBE el monto en la casilla —que queda editable— y deja registro de
  // quién lo hizo. Retirar la aprobación la vacía, salvo que alguien la haya
  // corregido a mano: eso no se pisa, y el servidor lo devuelve en `noTocadas`.
  const [aprobandoPrestamo, setAprobandoPrestamo] = useState(false);
  const aprobarPrestamo = useCallback(
    async (personas: Array<{ codigo: string; monto: number }>, aprobado: boolean) => {
      if (!data || personas.length === 0) return;
      // 🔴 LA CLAVE SALE DE LA RESPUESTA, no de un estado propio — mismo motivo
      // que en `guardar`: una segunda definición de «a qué quincena pertenece
      // este cuadro» terminaría guardando en una y leyendo de otra.
      if (!data.periodo.claveManuales) return;
      setAprobandoPrestamo(true);
      try {
        const res = await fetch("/api/asistencia/prestamos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quincena: data.periodo.claveManuales, aprobado, personas }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "No se pudo guardar");
        if (j.ok === false) {
          toast(j.aviso ?? "No se pudo guardar", "error");
        } else if (Array.isArray(j.noTocadas) && j.noTocadas.length > 0) {
          // 🔴 Nada se descarta en silencio: si una casilla se dejó como estaba
          // porque alguien la había corregido, se DICE.
          toast(
            `Se retiró la aprobación, pero ${j.noTocadas.length === 1 ? "1 casilla quedó" : `${j.noTocadas.length} casillas quedaron`} `
            + "con el monto que alguien escribió a mano. Corrígelo en el cuadro si hace falta.",
            "warning",
          );
        }
        // Se recarga entero: el monto cambia el total de deducciones, el neto y
        // los totales del pie.
        await cargar();
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      } finally {
        setAprobandoPrestamo(false);
      }
    },
    [cargar, data, toast],
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
      // 🔴 El descuento por vacaciones ya pagadas VIAJA AL PAPEL: si la
      // pantalla lo avisa y el archivo no, el archivo es el que va a decidir un
      // pago con menos información que la pantalla.
      avisoVacacionesNoPagadas: data.avisos.avisoVacacionesNoPagadas,
      // 🔴 Igual que el anterior: si la pantalla avisa que unas horas extra no
      // se pagaron y el archivo no, el archivo es el que va a decidir un pago
      // con menos información que la pantalla.
      avisoExtraSinAprobar: data.avisos.avisoExtraSinAprobar,
      // 🔴 Y lo mismo con el préstamo: si la pantalla dice que a alguien no se
      // le descontó su cuota y el papel no, el papel es el que va a decidir un
      // pago con menos información que la pantalla.
      avisoPrestamoSinAprobar: data.avisos.avisoPrestamoSinAprobar ?? null,
      avisoPrestamoSinAtar: data.avisos.avisoPrestamoSinAtar ?? null,
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
          {/* 🔴 UN SOLO MODO: el rango. Sin control segmentado que elegir —
              con una sola opción, el segmentado no es una elección: es un
              botón que no hace nada. Arranca en la quincena en curso, así que
              el caso normal sigue siendo abrir y mirar. */}
          <RangoFechas
            desde={desde} hasta={hasta} label={null}
            recordarComo="asistencia_planilla"
            onChange={(d, h) => { setDesde(d); setHasta(h); }}
          />
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
      {/* 🔴 NADA SE DESCARTA EN SILENCIO. Si la planilla dejó de pagar días por
          una vacación marcada, se dice acá: nombre, rango y monto. Va ARRIBA,
          con los avisos de plata, no escondido en el detalle de una fila. */}
      {data?.avisos.avisoVacacionesNoPagadas && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {data.avisos.avisoVacacionesNoPagadas}
        </p>
      )}

      {data?.avisos.faltaMigracionVacaciones && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.avisos.faltaMigracionVacaciones}
        </p>
      )}

      {/* 🔴 LO MISMO CON LAS HORAS EXTRA SIN APROBAR. Contadora, textual: *«Sólo
          se pagan las horas extras autorizadas y las reportadas por Julio
          Garay»*. No se pagan — pero se DICEN, con nombre y cantidad, arriba y
          en ámbar. Rechazar sí, esconder no. */}
      {data?.avisos.avisoExtraSinAprobar && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {data.avisos.avisoExtraSinAprobar}
        </p>
      )}

      {/* 🔴 LO QUE EL GUARD RECHAZÓ SE DICE, con el nombre y el motivo. Sin
          esto, la persona cobraría en una sola planilla y el reparto se vería
          «deshecho solo». Ámbar y no rojo: no se rompió nada, está mal cargado. */}
      {data?.avisos.avisoRepartoRechazado && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {data.avisos.avisoRepartoRechazado}
        </p>
      )}
      {data?.avisos.faltaMigracionReparto && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {data.avisos.faltaMigracionReparto}
        </p>
      )}
      {data?.avisos.faltaMigracionAprobaciones && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.avisos.faltaMigracionAprobaciones}
        </p>
      )}

      {/* 🔴 Y LO MISMO CON EL PRÉSTAMO. Contadora, textual: *«El préstamo si
          debe ser por aprobarlo»*. Lo que no se aprobó no se descontó — pero se
          DICE, con nombre y monto. Es la lección del #651: un freno que esconde
          plata es peor que no tener freno. */}
      {data?.avisos.avisoPrestamoSinAprobar && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {data.avisos.avisoPrestamoSinAprobar}
        </p>
      )}

      {/* 🔴 Un préstamo con saldo que no es de nadie es plata que NUNCA se va a
          descontar. Va en rojo: pide que una persona haga algo. */}
      {data?.avisos.avisoPrestamoSinAtar && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {data.avisos.avisoPrestamoSinAtar}
        </p>
      )}

      {data?.avisos.faltaMigracionAmarrePrestamos && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.avisos.faltaMigracionAmarrePrestamos}
        </p>
      )}

      {data?.avisos.faltaMigracionPrestamoAprobado && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.avisos.faltaMigracionPrestamoAprobado}
        </p>
      )}

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
      {/* 🔴 UNA LÍNEA, NO UN PÁRRAFO. Eran tres viñetas, escritas cuando el
          rango era la excepción; hoy es el único modo y ese bloque saldría en
          cada cuadro que no cuadre con una quincena. Se conserva lo único que
          es PLATA —que el sueldo base se reparte, y en qué proporción—, porque
          eso cambia el número y nada se descarta en silencio. Lo de los montos
          a mano se dice donde están los campos, no acá. */}
      {data?.avisos.rangoLibre && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <b>Estas fechas no son una quincena</b> ({data.avisos.diasCalendario} días): del sueldo
          base se paga <b>{(data.avisos.factorBase * 100).toFixed(1)} %</b> de un quincenal.
        </p>
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
          No hay nadie en esta empresa para estas fechas. Revisa la pestaña <b>Configuración</b>.
        </p>
      )}

      {!cargando && !error && !!data?.lineas.length && (
        <>
          {/* 🔴 UNA LÍNEA, Y VA DONDE ESTÁN LOS CAMPOS. Los cinco montos que se
              escriben a mano viven por quincena (`asistencia_planilla_manual`,
              con la clave «2026-08-1» y un CHECK que no acepta otra cosa), así
              que en un rango que no es una quincena no hay dónde guardarlos y
              quedan apagados. Enterarse DESPUÉS de escribir un ISR es el
              problema; el porqué se dice acá, sin párrafo. */}
          {data.avisos.rangoLibre && (
            <p className="text-[13px] text-gray-500">
              Los montos a mano se guardan por quincena — escribe las fechas exactas de una
              quincena para poder llenarlos.
            </p>
          )}

          {/* 🔴 EL PRÉSTAMO, TRAÍDO DEL MÓDULO Y CON APROBACIÓN. Va ACÁ ARRIBA
              y no adentro de la fila de cada persona: es la decisión que hay
              que tomar ANTES de mirar el cuadro, y tomarla treinta veces
              abriendo treinta filas es lo que hacía que se tecleara mal. */}
          <PrestamosPorDescontar
            items={data.prestamos}
            onAprobar={aprobarPrestamo}
            trabajando={aprobandoPrestamo}
          />

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
// EL BLOQUE DE PRÉSTAMOS
//
// ── 🔴 POR QUÉ ESTÁ ACÁ Y NO EN LA PESTAÑA «APROBACIONES» ────────────────────
//
// Aquella pestaña la ve el usuario `bodega` —con el que trabaja Julio Garay—, y
// a propósito NO le llega un solo sueldo: el servidor le recorta la respuesta
// (ver `soloApruebaRoles()` en `roles.ts`). Un descuento de préstamo ES plata
// del sueldo, así que vive donde vive la planilla y lo aprueba quien la arma.
//
// ── ⚠️ LO NO APROBADO NO SE ESCONDE ─────────────────────────────────────────
//
// Las ya aprobadas SIGUEN EN LA LISTA. Una lista de solo pendientes no deja
// retirar nada, y un toque de más no puede ser irreversible. Es la misma forma
// que la pantalla de horas extra.
// ─────────────────────────────────────────────────────────────────────────────

type OnAprobarPrestamo = (
  personas: Array<{ codigo: string; monto: number }>,
  aprobado: boolean,
) => void;

function PrestamosPorDescontar({
  items, onAprobar, trabajando,
}: {
  // 🩸 `undefined` A PROPÓSITO, y no es defensa de más: esta pantalla se
  // rehidrata con la respuesta que SWR dejó guardada, y una respuesta anterior
  // a este cambio no trae el campo. Un `items.length` pelado revienta la
  // planilla ENTERA en el primer render después del deploy — la pantalla con la
  // que se paga, en blanco, por un bloque que es un extra.
  items: SugerenciaPrestamo[] | undefined;
  onAprobar: OnAprobarPrestamo;
  trabajando: boolean;
}) {
  // Sin nada que descontar no hay bloque. Un cartel permanente es un cartel que
  // se deja de leer — misma regla que el resto del módulo.
  if (!items?.length) return null;

  const pendientes = items.filter((s) => !s.aprobado);
  const totalPendiente = pendientes.reduce((a, s) => a + s.sugerido, 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
        <div className="text-sm font-semibold text-gray-800">
          Préstamos por descontar
          <span className="ml-2 font-normal text-gray-500">
            {pendientes.length === 0
              ? `${items.length} ${items.length === 1 ? "aprobado" : "aprobados"}`
              : `${pendientes.length} sin aprobar · $${$(totalPendiente)}`}
          </span>
        </div>
        {pendientes.length > 1 && (
          <button
            type="button"
            disabled={trabajando}
            onClick={() =>
              onAprobar(pendientes.map((s) => ({ codigo: s.codigo, monto: s.sugerido })), true)}
            className="min-h-[44px] rounded-md bg-gray-900 px-3 text-[13px] font-medium text-white disabled:opacity-50"
          >
            Aprobar {pendientes.length}
          </button>
        )}
      </div>

      <ul className="divide-y divide-gray-100">
        {items.map((s) => (
          <li key={s.codigo} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-gray-900">
                {s.etiqueta}
                {/* 🔴 EL NOMBRE DE PRÉSTAMOS VA A LA VISTA cuando NO es el
                    mismo. El amarre lo hizo una migración con una lista
                    explícita, y quien mira tiene que poder verlo: es la única
                    forma de que un amarre equivocado se note. */}
                {s.nombrePrestamos.toUpperCase() !== s.etiqueta.toUpperCase() && (
                  <span className="ml-1.5 font-normal text-gray-400">
                    (en Préstamos: {s.nombrePrestamos})
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500">
                {s.origen === "descontado"
                  // 🔑 Ya lo registró el módulo en esta quincena: no es una
                  // estimación, es lo que de verdad se le descontó.
                  ? <>Ya descontado en Préstamos esta quincena · saldo ${$(s.saldo)}</>
                  : <>Cuota ${$(s.cuota)} · saldo ${$(s.saldo)}</>}
                {s.aprobado && s.por && <> · aprobó {s.por}</>}
              </div>
              {/* 🔴 Aprobado, pero lo que hay ya no es lo que se aprobó. Se dice
                  con los DOS números y no se corrige solo: una plata que se
                  mueve sola es peor que una que se explica. */}
              {s.cambio && (
                <div className="text-xs text-amber-700">
                  Se aprobó ${$(s.montoVisto ?? 0)}; hoy el módulo dice ${$(s.sugerido)} y la
                  casilla dice ${$(s.enCasilla)}.
                </div>
              )}
            </div>
            <div className="tabular-nums text-[13px] font-semibold text-gray-900">
              ${$(s.sugerido)}
            </div>
            <button
              type="button"
              disabled={trabajando}
              onClick={() => onAprobar([{ codigo: s.codigo, monto: s.sugerido }], !s.aprobado)}
              className={`min-h-[44px] rounded-md px-3 text-[13px] font-medium disabled:opacity-50 ${
                s.aprobado
                  ? "border border-gray-300 text-gray-700"
                  : "bg-gray-900 text-white"
              }`}
            >
              {s.aprobado ? "Quitar" : "Aprobar"}
            </button>
          </li>
        ))}
      </ul>

      <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
        Aprobar escribe el monto en la casilla <b>Préstamo</b> del cuadro, y la casilla se
        puede corregir a mano después. El saldo lo lleva el módulo de <b>Préstamos</b>: acá no
        se cambia.
      </p>
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
  /** El monto sobre el que se calcularon los seguros, si no fue el bruto. */
  const sobreQueBase = baseSeguros(d.baseSeguros);
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
        {/* 🔑 Sin esto, los ceros de ausencias, tardanzas y extras se leen como
            un error de cálculo. El chip dice que están en cero A PROPÓSITO. */}
        {l.noMarcaReloj && (
          <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
            {CHIP_NO_MARCA_RELOJ}
          </span>
        )}
        {/* 🔴 SU SUELDO SE PAGA ENTRE DOS EMPRESAS, Y ESTA LÍNEA ES SOLO UNA
            PARTE. Sin el chip, un quincenal de $400 donde la ficha dice $1.000
            se lee como un error de carga. Dice cuánto paga ESTA empresa y si
            acá caen las horas extra, que es lo que explica el resto. */}
        {l.parte && (
          <span
            className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500"
            title={`${l.empresaEtiqueta ?? l.parte.empresa} le paga ${$$(l.parte.salarioMensual)} al mes de un sueldo de ${$$(l.salarioMensual ?? 0)}.`
              + (l.parte.llevaHorasExtra ? " Las horas extra se pagan acá." : " Las horas extra se pagan en la otra empresa.")}
          >
            {CHIP_REPARTIDO}
          </span>
        )}
        {/* 🔴 POR QUÉ SU SEGURO ES DISTINTO. Sin esto, quien mira la línea de
            RODRIGO y ve $17,06 donde esperaba $39,38 no tiene forma de saber de
            dónde sale sin preguntarle a alguien. El sello dice el monto sobre
            el que se calculó, que es todo lo que hace falta para reconstruirlo.
            Sale de `dinero.baseSeguros` —el que DE VERDAD se multiplicó, ya
            repartido si el rango no es una quincena entera—, no de la ficha. */}
        {sobreQueBase !== null && (
          <span
            className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500"
            title={`Los seguros no salen de su total bruto: se calculan sobre ${$$(sobreQueBase)}.`}
          >
            {chipBaseSeguros(sobreQueBase)}
          </span>
        )}
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
  /** El monto sobre el que se calcularon los seguros, si no fue el bruto.
   *  Por el MISMO lector que el escritorio: dos formas de decidir si se muestra
   *  el sello es como una pantalla lo muestra y la otra no. */
  const sobreQueBaseTarjeta = baseSeguros(d.baseSeguros);
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
            {l.noMarcaReloj && ` · ${CHIP_NO_MARCA_RELOJ}`}
            {/* El mismo sello que en el escritorio, con las MISMAS palabras. */}
            {l.parte && ` · ${CHIP_REPARTIDO}`}
            {/* El mismo sello que en el escritorio, y con las MISMAS palabras:
                dos redacciones del mismo hecho es la forma de que se separen. */}
            {sobreQueBaseTarjeta !== null && ` · ${chipBaseSeguros(sobreQueBaseTarjeta)}`}
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
          {linea(`Excedente (${aHoras(h.excedenteMin)} h — no se usa, va al 1.50)`, d.excedente)}
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
            {/* Una línea gris, no un párrafo: dice sobre qué monto salieron los
                dos de arriba cuando NO fue el bruto. */}
            {sobreQueBaseTarjeta !== null && (
              <p className="py-0.5 text-[12px] text-gray-500">
                Los dos se calculan sobre {$$(sobreQueBaseTarjeta)}, no sobre el total bruto.
              </p>
            )}
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
          {/* 🔴 UN MONTO EN «AUSENCIAS» QUE SALE DE UNAS VACACIONES TAMPOCO
              PUEDE QUEDAR SIN EXPLICACIÓN, y acá además hay que decir que NO
              es una ausencia: la persona no faltó, se tomó vacaciones que ya
              había cobrado. */}
          {d.vacacionesYaPagadas > 0 && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[12px] text-amber-900">
              De los <b>${$(d.ausencias)}</b>, <b>${$(d.vacacionesYaPagadas)}</b> son{" "}
              <b>{h.vacacionesYaPagadasDias}</b>{" "}
              {h.vacacionesYaPagadasDias === 1 ? "día" : "días"} de <b>vacaciones ya pagadas</b> —
              no faltó: esos días ya se le habían pagado antes, así que no se le pagan otra vez.
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
