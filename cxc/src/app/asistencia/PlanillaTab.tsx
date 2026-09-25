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
//
// ── 🔴 EL FLUJO, TAL COMO LO APROBÓ DANIEL (4-sep-2026) ──────────────────────
//
//     elegir período → [Generar] → BORRADOR → revisar → [Cerrar quincena]
//                                                   → CERRADA → [Reabrir]
//
// El calendario arranca A LA VISTA —dos meses, como el de Copa: *«que sea user
// friendly como el de copa airlines… su fecha de salida sería la fecha que
// termina la quincena»*— y recién al generar se pliega a la píldora de arriba,
// porque las 18 columnas de plata necesitan el ancho entero.
//
// 🔴 NADA SE RECALCULA POR DEBAJO. Aprobar un préstamo o escribir un monto a
// mano NO vuelve a pedir el cuadro: lo marca VIEJO y aparece «Regenerar». Que
// los números se muevan solos mientras alguien los revisa es exactamente cómo
// se termina cerrando una quincena distinta de la que se miró.
//
// 🔴 Y EL CIERRE ES DEL SERVIDOR, ENTERO. Esta pantalla NO manda un solo monto:
// el POST recibe empresa y fechas, y la ruta vuelve a calcular y congela ESO
// (ver `planilla-guardada.ts`). Acá solo se muestra el estado y se pide.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { esTodas } from "@/lib/asistencia/empresa-para-todo";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ToastSystem";
import { Ayuda } from "@/components/shared/Ayuda";
// 🔴 «Corte del reloj · lee del 14 al 28 sep» — la regla es PURA y vive ahí.
import { lineaCorteDelReloj } from "@/lib/asistencia/corte-del-reloj";
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
  fechaCorta,
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
import { CHIP_TRABAJA_AFUERA } from "@/lib/asistencia/trabaja-afuera";
import { CHIP_REPARTIDO, type RepartoRechazado } from "@/lib/asistencia/reparto";
// 🔑 `baseSeguros` es EL MISMO LECTOR que usan el servidor y el motor. Acá hace
// falta de verdad: una línea armada a mano —hay fixtures de tests que lo hacen,
// y una respuesta vieja del servidor guardada en caché también— llega SIN el
// campo, y un `!== null` pelado dejaría pasar el `undefined` y reventaría la
// pantalla entera al formatearlo. Ante la duda: no hay sello, o sea lo de ayer.
import { baseSeguros, chipBaseSeguros } from "@/lib/asistencia/seguros-base";
import type { AvisoPeriodoAbierto, CodigoSinFicha } from "@/lib/asistencia/periodo";
import Link from "next/link";
import {
  enlaceAprobaciones,
  type ExtraNoAprobada,
} from "@/lib/asistencia/aprobaciones";
import { textoDeudaCasilla } from "@/lib/asistencia/prestamos-planilla";
import type {
  PrestamoSinAtar,
  SugerenciaPrestamo,
} from "@/lib/asistencia/prestamos-planilla";
import { PLANILLA_UNIDA } from "@/lib/asistencia/planilla-unida";
import { PESTANA_FICHAS } from "@/lib/asistencia/persona-en-el-centro";
import { notaAjuste, notaCeldaAjuste } from "@/lib/asistencia/corte-quincena";
import {
  textoDiaLibreCelda,
  TITULO_DIA_LIBRE,
  type DiaLibreEnLinea,
} from "@/lib/asistencia/dia-libre-empresa";
import { ROTULOS_DINERO_PLANILLA, montosDePlanilla } from "@/lib/asistencia/columnas-dinero-planilla";
import { antesDeCerrarDelCuadro } from "@/lib/asistencia/antes-de-cerrar-del-cuadro";
// 🔴 CON «TODAS», EL TABLERO DE CIERRE (19-sep-2026): una línea por empresa,
// con personas · neto · qué falta · Cerrar. Nunca un total del grupo.
import TableroCierre from "./TableroCierre";
import {
  TEXTO_SIN_DESCONTAR,
  TITULO_SIN_DESCONTAR,
  esCasillaAutomatica,
  estadoCasilla,
  prestamosSinDescontar,
  valorTecleado,
} from "@/lib/asistencia/casilla-sin-descontar";
import {
  TITULO_NETO_NEGATIVO,
  TITULO_RECORTE,
  avisoCeldaNeto,
  cuotasRecortadas,
  netosNegativos,
  recorteDeCasilla,
  textoAvisoCeldaNeto,
  textoRecorteCelda,
  type AvisoCeldaNeto,
} from "@/lib/asistencia/neto-no-negativo";
import { enlaceDiasDe, marcasImparesDeLineas } from "@/lib/asistencia/marcas-impares";
import type { OtroServicio } from "@/lib/asistencia/otros-servicios";
import AntesDeCerrar from "./AntesDeCerrar";
// ── 🔴 EL REDISEÑO DEL 24-sep-2026 ────────────────────────────────────────────
// El selector único (‹ 16 – 30 sep 2026 ›, sin calendario: acá solo se pagan
// quincenas), el corte como línea gris con una «×», la tabla dentro de su caja
// con la cabecera pegada, y el nombre de cada fila llevando a su Asistencia.
import SelectorPeriodo, { usePeriodoAsistencia } from "@/components/asistencia/SelectorPeriodo";
import { aparatoDeQuienMira } from "@/lib/aparato";
import {
  ASISTENCIA_PANTALLA_2026_09, VACIAR_EL_CORTE,
  quincenaDelPeriodo, rutaAsistenciaDePersona, VER_SU_ASISTENCIA,
} from "@/lib/asistencia/pantalla-2026-09";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";
// 🔴 Los nombres se MUESTRAN capitalizados; lo guardado sigue en mayúsculas.
import { capitalizarNombre } from "@/lib/nombre-en-pantalla";
import { textoExtraAutomatico } from "@/lib/asistencia/extra-automatico";
import type { VacacionNoPagada } from "@/lib/asistencia/vacaciones";
import { fmtMin } from "@/lib/asistencia/reporte";
// 🔴 QUIÉN CIERRA SALE DEL MISMO MÓDULO QUE EL CANDADO DEL SERVIDOR
// (`cerrarPlanillaRoles()` = Asistencia menos secretaria). Escribir acá
// `["admin","contabilidad"]` habría estrenado la cuarta lista de roles del
// módulo, que es el bug que `roles.ts` vino a matar. Esconder el botón no cierra
// nada —la ruta es el candado—, pero dibujarle a la secretaria un botón que le
// va a contestar 403 es peor que no dibujarlo.
//
// ⚠️ Import de VALOR y no de tipo, así que pesa: son tres funciones puras y el
// resto del módulo (los mapas de columnas, el I/O) se cae solo en el tree-shake.
import {
  etiquetaRango as etiquetaRangoGuardado,
  motivoReaperturaValido,
  puedeCerrar,
  textoSolapamiento,
  type CabeceraGuardada,
  type FrenoCierre,
} from "@/lib/asistencia/planilla-guardada";
import { ConfirmDeleteModal } from "@/components/ui";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
// 🔴 DEL MÓDULO PURO, NUNCA de `CalendarioRango`: ese archivo trae
// `react-day-picker` y un import estático anularía el `dynamic()` del selector.
import { aIso, deIso } from "@/components/ui/rango-fechas-iso";

// 🔴 LA QUINCENA SE ELIGE CON BOTONES Y NADA MÁS (10-sep-2026, mockup aprobado
// por Daniel; el calendario se retiró el 15-sep-2026). Módulo puro.
//
// 🩸 Acá había un `import RangoFechas from "@/components/ui/RangoFechas"`. Se
// fue con «Otro rango ⌄»: el componente sigue vivo y lo usan otras pantallas
// (Asistencia, Aprobaciones), pero la Planilla ya no elige rangos libres.
import { useUrlState } from "@/lib/hooks/useUrlState";
// 🔴 LA QUINCENA Y EL CORTE VIAJAN EN LA DIRECCIÓN (24-sep-2026), para que
// sobrevivan al Atrás y a recargar. La regla vive en el módulo PURO.
import {
  ASISTENCIA_PESTANAS_VIVAS, PARAM_PLANILLA_CORTE, PARAM_PLANILLA_QUINCENA,
  corteALaUrl, corteDeLaUrl, quincenaALaUrl, quincenaDeLaUrl,
} from "@/lib/asistencia/pestanas-vivas";
import {
  corteInicial, esLaQuincena, fechaCortaCorte, fraseCorte, quincenasElegibles, rotuloQuincena,
  textoDelDia31,
} from "@/lib/asistencia/elegir-quincena";
interface Respuesta {
  quincena: Quincena;
  periodo: Periodo;
  empresa: string | null;
  empresaEtiqueta: string | null;
  lineas: LineaPlanilla[];
  totales: TotalesPlanilla;
  reglas: ReglasAsistencia;
  /** 🔴 El corte con el que se midió (día 13/28). `null` = quincena entera. */
  corte?: string | null;
  /** 🔴 El ajuste de la quincena anterior, con nombre y monto. Solo con el
   *  interruptor y cuando la quincena pasada se cerró con corte.
   *  ⚠️ `total` ya está ADENTRO de `totales.netoPagar` (11-sep-2026): el
   *  ajuste entra en las columnas de siempre. Es un testigo, no se resta. */
  ajusteQuincenaAnterior?: {
    total: number;
    personas: { codigo: string; etiqueta: string; monto: number }[];
    dias?: { desde: string; hasta: string } | null;
  };
  /** 🔴 Lo que el módulo de Préstamos propuso esta quincena, persona por
   *  persona. Ya está ADENTRO de cada línea (`prestamoAutomatico`); acá viaja
   *  como testigo. Vacío en un rango libre.
   *
   *  🩸 OPCIONAL A PROPÓSITO: una respuesta guardada por SWR de ANTES de este
   *  cambio no lo trae, y esa respuesta se pinta antes de que llegue la nueva.
   *  Declararlo obligatorio le mentiría al compilador sobre lo que de verdad
   *  puede llegar, y el precio sería la planilla en blanco. */
  prestamos?: SugerenciaPrestamo[];
  /** 🔴 El detalle de «Otros servicios» de la quincena (15-sep-2026). Opcional
   *  por el mismo motivo que `prestamos`: una respuesta guardada por SWR de
   *  ANTES de este cambio no lo trae, y no tiene por qué romper la pantalla. */
  otrosServicios?: OtroServicio[];
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
    /** 🔴 Lo que el préstamo tiene que DECIR esta quincena (11-sep-2026): la
     *  última cuota (se descuenta el saldo, no la cuota) y quien debe pero no
     *  está en el cuadro (no se le descuenta). Solo cuando pasa.
     *  🩸 Hasta el 11-sep-2026 acá venía «lo que NO se descontó por falta de
     *  aprobación»; Daniel: *«quita lo de aprobación a préstamos, no es
     *  necesario»*. Opcional por el mismo motivo que `prestamos`. */
    avisoPrestamo?: string | null;
    /** 🔴 Préstamos CON SALDO que no están atados a nadie de la planilla: no se
     *  le descuentan a ninguna persona. */
    prestamoSinAtar?: PrestamoSinAtar[];
    avisoPrestamoSinAtar?: string | null;
    /** 🔴 El día libre de la empresa: lo que sus horas extra le pagaron a la
     *  deuda y lo que queda (17-sep-2026). Ya redactado por el servidor. */
    avisoDiasLibres?: string | null;
    faltaMigracionDiaLibre?: string | null;
    /** Falta correr el SQL de los días laborables y el horario de afuera
     *  (18-sep-2026): todo se mide lunes a viernes, con un horario. */
    faltaMigracionHorario?: string | null;
    /** Falta correr el SQL del amarre. La casilla se sigue escribiendo a mano,
     *  como hasta hoy — pero se dice. */
    faltaMigracionAmarrePrestamos?: string | null;
  };
}

/** Lo que se PIDIÓ: la planilla que hay en pantalla es de estas tres cosas. */
interface Pedido {
  desde: string;
  hasta: string;
  empresa: string;
  /** 🔴 Hasta qué día se lee el reloj (día 13/28). "" = la quincena entera. */
  corte?: string;
}

/** Lo que la base sabe de este período. `GET /api/asistencia/planilla-guardada`. */
interface Cierre {
  /**
   * La cerrada que coincide EXACTO con el rango pedido.
   *
   * 🔑 El `estado` («borrador» / «cerrada») que la ruta también devuelve NO se
   * guarda: lo que la pantalla pinta se deriva de estos dos campos, y tener
   * además una palabra que diga lo mismo es la forma de que un día digan cosas
   * distintas.
   */
  cerrada: CabeceraGuardada | null;
  /** Las que PISAN el rango sin ser la misma: son las que impiden cerrar. */
  solapadas: CabeceraGuardada[];
  /**
   * 🔴 La REABIERTA de este mismo rango, si la hay. No estorba nada —por eso no
   * sale en `solapadas`— pero es la ÚNICA que se puede borrar, así que sin esto
   * no habría dónde poner el botón.
   */
  reabierta: CabeceraGuardada | null;
  /** `null` = se puede borrar. Con texto, es el porqué, redactado por el servidor. */
  noSePuedeEliminar: string | null;
  /** ⚠️ Falta correr la migración. NO es un error — ver la nota del aviso. */
  aviso: string | null;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** El día de después. `deIso` cae a mediodía, así que no hay salto de huso. */
function diaSiguiente(iso: string): string {
  const d = deIso(iso);
  d.setDate(d.getDate() + 1);
  return aIso(d);
}

/** «3 sep 2026, 4:12 p.m.», en hora de Panamá (UTC−5 fijo, como todo el módulo). */
function cuandoBonito(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t - 5 * 3_600_000);
  const h24 = d.getUTCHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h}:${min} ${h24 < 12 ? "a.m." : "p.m."}`;
}

/**
 * Por qué una casilla de monto a mano está apagada. Son DOS motivos distintos y
 * el texto de cada uno es la mitad del mensaje: uno se arregla eligiendo otras
 * fechas, el otro reabriendo la quincena.
 */
const BLOQUEO_RANGO = {
  placeholder: "por quincena",
  title: "Se escribe por quincena, no por rango de fechas",
};
const BLOQUEO_CERRADA = {
  placeholder: "cerrada",
  title: "La quincena está cerrada. Para corregir un monto hay que reabrirla.",
};
type Bloqueo = typeof BLOQUEO_RANGO | null;

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

export default function PlanillaTab({ empresa: empresaElegidaArriba }: {
  /**
   * 🔴 LA EMPRESA VIENE DEL SELECTOR DE ARRIBA DE LAS PESTAÑAS (10-sep-2026): se
   * unificó con el de todo el módulo. «Todas» no vale acá: la planilla es de UNA
   * empresa, y se pide elegirla. Sin la prop (la pestaña sola), la primera.
   */
  empresa?: string;
} = {}) {
  const { toast } = useToast();
  const empresa = empresaElegidaArriba ?? EMPRESAS_ASISTENCIA[0];
  const sinEmpresa = esTodas(empresa);

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
  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 LA PLANILLA ABRE VACÍA HASTA QUE ALGUIEN ELIJA EL PERÍODO (1-sep-2026)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Daniel, textual: *«la quincena se paga según el rango de fecha
  // seleccionado»*. Ahí está todo: el rango NO es el filtro de una consulta, es
  // **lo que define qué quincena se paga**.
  //
  // 🩸 Y POR ESO ARRANCAR CON UN RANGO PUESTO ERA PELIGROSO. Abría en «del 1 al
  // 15» y mostraba una planilla completa —sueldos, deducciones, neto a pagar—
  // de un período que en esta empresa muchas veces NO es el que se está por
  // pagar: el corte real es variable (a veces del 28 al 10). Plata con cara de
  // definitiva, de una quincena que nadie pidió. Es el mismo error que los
  // cuatro presets retirados, pero peor: el preset había que tocarlo, esto
  // salía solo.
  //
  // ⚠️ ESTO INVIERTE UNA DECISIÓN ANTERIOR, a propósito. Decía «arranca en la
  // quincena en curso: el caso normal sigue siendo abrir y mirar», con el motivo
  // de ahorrar teclear dos fechas. Ese motivo valía cuando el rango se tecleaba;
  // ahora se elige en un calendario con dos toques.
  //
  // 🔴 Y TAMPOCO SE RECUERDA EL ÚLTIMO RANGO (tenía `ultimoRango`, se le quitó).
  // Recordarlo es la misma trampa disfrazada: al abrir la quincena siguiente
  // mostraría la ANTERIOR ya cargada, con su plata, como si fuera la de ahora.
  const quincenaEnCurso = useMemo(() => quincenasHasta(hoy, 1)[0], [hoy]);
  const [desde, setDesde] = useState(quincenaEnCurso.desde);
  const [hasta, setHasta] = useState(quincenaEnCurso.hasta);
  /** `false` hasta que alguien elige un período. Sin esto no se pide nada. */
  const [elegido, setElegido] = useState(false);
  // 🔑 El mismo dato, leíble desde un callback sin volver a crearlo en cada
  // cambio: `elegirCorte` no puede depender de `elegido` o se rearmaría entero.
  const elegidoRef = useRef(false);
  useEffect(() => { elegidoRef.current = elegido; }, [elegido]);
  // 🔴 EL CORTE (día 13/28). "" = la quincena entera, el comportamiento de
  // siempre. Solo se usa con el interruptor. Cambiarlo vuelve viejo el cuadro.
  const [corte, setCorte] = useState("");
  // «Descargar ⌄»: Excel · PDF · Comprobantes en un solo botón (11-sep-2026).
  const [descargaOpen, setDescargaOpen] = useState(false);
  const descargaRef = useRef<HTMLButtonElement>(null);
  /** El campo del corte. El «cambiar» de la línea gris se retiró el 25-sep-2026
   *  —el calendario está al lado—, pero la referencia se conserva: es el campo. */
  const corteRef = useRef<HTMLInputElement>(null);
  /** 🔴 El aparato de quien mira, por el DEDO (`pointer: coarse`). */
  const [celular, setCelular] = useState(false);
  useEffect(() => {
    if (ASISTENCIA_PANTALLA_2026_09) setCelular(aparatoDeQuienMira() === "celular");
  }, []);
  const [data, setData] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  // ── EL FLUJO: elegir → Generar → revisar → Cerrar ───────────────────────────
  /** Lo que se pidió y está en pantalla. `null` = todavía no se generó nada. */
  const [pedido, setPedido] = useState<Pedido | null>(null);
  /** 🔴 Alguien tocó algo que mueve los números. NO se recalcula solo. */
  const [desactualizada, setDesactualizada] = useState(false);
  /** Lo que la base dice de este período: cerrada, borrador, o que se pisa. */
  const [cierre, setCierre] = useState<Cierre | null>(null);
  /** Lo que impidió cerrar la última vez (el 409 de los frenos). */
  const [frenos, setFrenos] = useState<FrenoCierre[]>([]);
  const [modal, setModal] = useState<"cerrar" | "reabrir" | null>(null);
  /** 🔴 Borrar es destructivo: va por su propia ventana, no por la de cerrar. */
  const [borrando, setBorrando] = useState(false);
  const [trabajandoCierre, setTrabajandoCierre] = useState(false);
  /**
   * 🔴 LA QUINCENA SE ELIGE CON BOTONES, Y NADA MÁS (10-sep-2026 · 15-sep-2026).
   *
   * Son CUATRO: las dos del mes anterior y las dos del mes en curso de Panamá,
   * con el último día real del mes. Daniel, 15-sep-2026: *«si la quincena es
   * fija, que no haya opción de rango, solo las opciones»* — el calendario
   * («Otro rango ⌄») se retiró de esta pantalla. El mes anterior está porque la
   * contadora cierra una quincena DESPUÉS de que termina: sin esos dos botones,
   * en octubre no habría forma de abrir la quincena 1–15 de septiembre.
   *
   * 🩸 De «Otro rango» salían los rangos que prorratean el sueldo por
   * `factorBase`, APAGAN los montos escritos a mano y dejan guardadas cabeceras
   * que no son quincenas — y por eso el ajuste de la quincena anterior no se
   * disparaba nunca.
   *
   * ⚠️ LA RUTA SIGUE ACEPTANDO RANGOS LIBRES a propósito: `medirAjusteAnterior`
   * se llama a sí misma con el rango corto de los días sin medir. Lo que se
   * quitó es la opción de la PANTALLA, no la capacidad del servidor.
   *
   * 🔴 LO QUE SE PIDE NO CAMBIA: los botones ponen el mismo `desde`/`hasta`/
   * `corte` de siempre, y `generar` arma el MISMO pedido.
   */
  const quincenasParaElegir = useMemo(() => quincenasElegibles(hoy), [hoy]);
  // ── 🔴 LA QUINCENA Y EL CORTE, EN LA DIRECCIÓN (24-sep-2026) ───────────────
  //
  // 🩸 Vivían SOLO en memoria: al cambiar de pestaña y volver, la quincena
  // quedaba sin elegir y **el corte volvía al propuesto (13/28)**. Si la
  // contadora lo había movido y regeneraba sin darse cuenta, estaba mirando
  // una quincena leída hasta OTRO día, y nada lo avisaba.
  //
  // 🔴 EL CUADRO GENERADO NO SE GUARDA EN NINGÚN LADO, a propósito: plata
  // dibujada desde una copia es un número viejo con cara de nuevo. Al recargar
  // se vuelve a generar, como hoy.
  //
  // 🔑 Son filtros del MISMO nivel → `replace`, y claves propias (`plQuincena`,
  // `plCorte`): `quincena` ya es de Préstamos › Movimientos y `desde`/`hasta`
  // de Asistencia. Una quincena que ya no está entre las elegibles (un enlace
  // viejo) se ignora y la pantalla abre vacía, como al entrar de cero.
  const [quincenaUrl, setQuincenaUrl] = useUrlState(PARAM_PLANILLA_QUINCENA, "");
  const [corteUrl, setCorteUrl] = useUrlState(PARAM_PLANILLA_CORTE, "");
  const elegirQuincena = useCallback((q: (typeof quincenasParaElegir)[number]) => {
    setDesde(q.desde);
    setHasta(q.hasta);
    setElegido(true);
    // El corte viene PROPUESTO (13 o 28) y se cambia o se vacía si hace falta.
    const c = PLANILLA_UNIDA ? corteInicial(q) : "";
    if (PLANILLA_UNIDA) setCorte(c);
    if (ASISTENCIA_PESTANAS_VIVAS) {
      setQuincenaUrl(quincenaALaUrl(q.desde));
      setCorteUrl(corteALaUrl(c));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setQuincenaUrl, setCorteUrl]);
  /** El corte lo elige una persona: se guarda en la dirección al instante. */
  const elegirCorte = useCallback((c: string) => {
    setCorte(c);
    if (ASISTENCIA_PESTANAS_VIVAS && elegidoRef.current) setCorteUrl(corteALaUrl(c));
  }, [setCorteUrl]);

  // 🔴 LA DIRECCIÓN SE LEE UNA SOLA VEZ, AL MONTAR. Después manda la pantalla:
  // releerla en cada render pelearía con el toque de la contadora. Sin
  // `plQuincena` —o con una que ya no se puede elegir— no se toca nada y la
  // Planilla abre vacía, que es la regla de Daniel del 1-sep-2026.
  useEffect(() => {
    if (!ASISTENCIA_PESTANAS_VIVAS || ASISTENCIA_PANTALLA_2026_09) return;
    const q = quincenaDeLaUrl(quincenaUrl, quincenasParaElegir);
    if (!q) return;
    setDesde(q.desde);
    setHasta(q.hasta);
    setElegido(true);
    if (PLANILLA_UNIDA) setCorte(corteUrl ? corteDeLaUrl(corteUrl) : corteInicial(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 🔴 EL PERÍODO ES EL DEL MÓDULO (24-sep-2026) ──────────────────────────
  //
  // La MISMA barra de flechas de Asistencia, Aprobaciones y Movimientos, con la
  // misma clave de la dirección y la misma memoria. 🔴 **Sin calendario**: acá
  // solo se pagan quincenas, y el rango libre está retirado de esta pantalla
  // desde el 15-sep-2026 (Daniel: *«si la quincena es fija, que no haya opción
  // de rango, solo las opciones»*). Un período que no es una quincena se lleva a
  // la quincena que lo contiene, así que lo que se paga no cambia nunca.
  //
  // 🔴 EL CUADRO SIGUE SIN GENERARSE SOLO: elegir la quincena no pide nada; la
  // plata aparece cuando alguien toca «Generar», como siempre.
  const compartido = usePeriodoAsistencia();
  const quincenaDelSelector = useMemo(
    () => quincenaDelPeriodo(compartido.desde),
    [compartido.desde],
  );
  useEffect(() => {
    if (!ASISTENCIA_PANTALLA_2026_09) return;
    const q = quincenaDelSelector;
    setDesde(q.desde);
    setHasta(q.hasta);
    setElegido(true);
    // El corte: el de la dirección si lo hay, y si no el PROPUESTO de esa
    // quincena (13 / 28), exactamente como al tocar un botón de quincena.
    if (PLANILLA_UNIDA) {
      setCorte((antes) => {
        const deLaUrl = corteUrl ? corteDeLaUrl(corteUrl) : "";
        if (deLaUrl && deLaUrl >= q.desde && deLaUrl <= q.hasta) return deLaUrl;
        if (antes && antes >= q.desde && antes <= q.hasta) return antes;
        return corteInicial(q);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quincenaDelSelector.desde]);
  // 🔑 El rol sale de `sessionStorage`, igual que en `AsistenciaClient` y
  // `AppHeader`. Arranca vacío: en el primer render no hay sessionStorage, y
  // dibujar el botón de cerrar para sacarlo un tick después es peor.
  const [rol, setRol] = useState("");
  useEffect(() => { setRol(sessionStorage.getItem("cxc_role") || ""); }, []);

  // ── 🔴 EL INICIO RECOMENDADO: EL DÍA DESPUÉS DE LA ÚLTIMA CERRADA ──────────
  //
  // Daniel, textual: *«después de cerrar la primera quincena, el recomendado de
  // inicio debe de ser el día siguiente que cerró la quincena pasada»*. Es lo
  // que evita las dos formas de equivocarse: un hueco de días que nadie pagó, y
  // un solapamiento que el servidor va a rechazar al cerrar.
  //
  // ⚠️ ES UNA SUGERENCIA, NO UNA IMPOSICIÓN. Se marca el día con un aro en el
  // calendario y se dice en una línea; el primer toque sigue eligiendo el inicio
  // donde la persona quiera. Elegir el período por ella sería el mismo error que
  // los cuatro presets que se retiraron.
  //
  // 🔑 Sale del `historial` que ya devuelve la ruta del cierre — sin endpoint
  // nuevo. Se pide SIN fechas: así contesta el historial de la empresa entera.
  const [sugerido, setSugerido] = useState<{ inicio: string; ultimaHasta: string } | null>(null);
  /**
   * 🔴 HASTA DÓNDE SE LEYÓ EL RELOJ LA ÚLTIMA VEZ QUE SE CERRÓ (25-sep-2026).
   * Es el `corte` de la última planilla CERRADA de esta empresa —y sin corte, su
   * `hasta`—, o sea el último día que ya está leído. El día siguiente es desde
   * dónde se está leyendo ahora, que es lo que Daniel pidió que dijera la línea:
   * *«debería decir desde cuándo lee (la última apertura, día después)»*.
   *
   * 🔑 Sale del MISMO historial que ya devuelve la ruta del cierre, sin endpoint
   * nuevo. `null` = esta empresa nunca cerró una quincena.
   */
  const [ultimoCorteCerrado, setUltimoCorteCerrado] = useState<string | null>(null);
  useEffect(() => {
    if (!PLANILLA_UNIDA || !ASISTENCIA_PANTALLA_2026_09 || sinEmpresa) return;
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch(
          `/api/asistencia/planilla-guardada?empresa=${encodeURIComponent(empresa)}`,
          { cache: "no-store" },
        );
        const j = await r.json();
        if (!r.ok || !vivo) return;
        const historial = Array.isArray(j.historial) ? (j.historial as CabeceraGuardada[]) : [];
        // Solo las CERRADAS: una reabierta no pagó nada, así que su reloj no
        // quedó leído.
        const cerradas = historial.filter((c) => c.estado === "cerrada");
        if (cerradas.length === 0) { setUltimoCorteCerrado(null); return; }
        const ultima = cerradas.reduce((a, b) => (b.hasta > a.hasta ? b : a));
        setUltimoCorteCerrado(ultima.corte ?? ultima.hasta ?? null);
      } catch {
        // 🔴 FALLA ABIERTA: sin esta lectura la línea dice «lee del <inicio de la
        // quincena> al …», que es lo que se puede sostener sin inventar nada.
        if (vivo) setUltimoCorteCerrado(null);
      }
    })();
    return () => { vivo = false; };
  }, [empresa, sinEmpresa]);
  useEffect(() => {
    // Ya se generó algo, o la persona ya eligió: lo que manda es su elección.
    // 🔴 Con el selector único la quincena viene SIEMPRE elegida, así que la
    // condición es solo «todavía no se generó nada»: el aviso sigue diciendo
    // dónde quedó la quincena pasada, que es para lo que existe.
    if (pedido || (!ASISTENCIA_PANTALLA_2026_09 && elegido) || sinEmpresa) return;
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch(
          `/api/asistencia/planilla-guardada?empresa=${encodeURIComponent(empresa)}`,
          { cache: "no-store" },
        );
        const j = await r.json();
        // 🩸 `vivo` no es adorno: si la persona elige mientras esto viaja, el
        // efecto se limpia y la respuesta vieja NO le pisa lo que eligió.
        if (!r.ok || !vivo) return;
        const historial = Array.isArray(j.historial) ? (j.historial as CabeceraGuardada[]) : [];
        // Solo las CERRADAS: una reabierta no pagó nada todavía.
        const cerradas = historial.filter((c) => c.estado === "cerrada");
        if (cerradas.length === 0) { setSugerido(null); return; }
        const ultima = cerradas.reduce((a, b) => (b.hasta > a.hasta ? b : a));
        const inicio = diaSiguiente(ultima.hasta);
        setSugerido({ inicio, ultimaHasta: ultima.hasta });
        // El calendario abre en ese mes. No queda «elegido»: sigue en vacío
        // hasta que alguien toque los dos días.
        // 🔴 Con el selector único NO se toca el período: la quincena la manda
        // la barra de arriba, y pisarla desde una lectura que viaja sería
        // cambiarle la quincena a alguien mientras la mira.
        if (ASISTENCIA_PANTALLA_2026_09) return;
        setDesde(inicio);
        setHasta(inicio);
      } catch { /* la sugerencia es una ayuda, no un requisito */ }
    })();
    return () => { vivo = false; };
  }, [elegido, empresa, pedido]);

  /**
   * Qué hay CERRADO de este período. Va aparte del cuadro a propósito: que la
   * tabla del cierre no se pueda leer —o que falte correr la migración— no
   * puede dejar a nadie sin su planilla.
   */
  const pedirCierre = useCallback(async (p: Pedido) => {
    // 🔴 Se limpia ANTES de preguntar: si la consulta falla, quedarse con el
    // cierre del período anterior diría «esta quincena está cerrada» sobre otra.
    setCierre(null);
    try {
      const q = new URLSearchParams({ empresa: p.empresa, desde: p.desde, hasta: p.hasta });
      const res = await fetch(`/api/asistencia/planilla-guardada?${q}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) return;
      setCierre({
        cerrada: (j.cerrada ?? null) as CabeceraGuardada | null,
        solapadas: Array.isArray(j.solapadas) ? (j.solapadas as CabeceraGuardada[]) : [],
        reabierta: (j.reabierta ?? null) as CabeceraGuardada | null,
        noSePuedeEliminar: typeof j.noSePuedeEliminar === "string" ? j.noSePuedeEliminar : null,
        aviso: typeof j.aviso === "string" ? j.aviso : null,
      });
    } catch { /* el estado del cierre es información, no un requisito */ }
  }, []);

  const cargar = useCallback(async (p: Pedido) => {
    setCargando(true);
    setError(null);
    // Un freno de la corrida anterior no puede sobrevivir a un cuadro nuevo:
    // sería un cartel rojo hablando de una planilla que ya no está en pantalla.
    setFrenos([]);
    try {
      const q = new URLSearchParams({ desde: p.desde, hasta: p.hasta, empresa: p.empresa });
      if (p.corte) q.set("corte", p.corte);
      const res = await fetch(`/api/asistencia/planilla?${q}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "No se pudo cargar");
      setData(j as Respuesta);
      setDesactualizada(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setData(null);
    } finally {
      setCargando(false);
    }
    await pedirCierre(p);
  }, [pedirCierre]);

  // 🔴 Nada se pide solo: se pide lo que alguien GENERÓ. `pedido` es un objeto
  // nuevo en cada toque, así que «Regenerar» con las mismas fechas también
  // vuelve a pedir.
  useEffect(() => { if (pedido) void cargar(pedido); }, [cargar, pedido]);

  /** Generar / Regenerar: pedir el cuadro de lo que está elegido AHORA. */
  const generar = useCallback(() => {
    if (!elegido || sinEmpresa) return;
    setPedido({ desde, hasta, empresa, corte });
  }, [desde, elegido, empresa, hasta, corte, sinEmpresa]);

  // ── LO QUE SE DERIVA DEL ESTADO ────────────────────────────────────────────
  /** ¿El cuadro en pantalla es de lo que está elegido arriba? */
  const coincide = !!pedido && pedido.desde === desde && pedido.hasta === hasta && pedido.empresa === empresa && (pedido.corte ?? "") === corte;
  /** La línea del corte, del módulo puro. `null` si el período todavía no sirve. */
  const lineaCorte = lineaCorteDelReloj({ desde, hasta, corte, ultimoCorteCerrado });
  /** 🔴 Hay números en pantalla que ya no son los de lo que está elegido. */
  const vieja = !!data && (!coincide || desactualizada);
  const cerrada = cierre?.cerrada ?? null;
  const solapadas = cierre?.solapadas ?? [];
  const reabierta = cierre?.reabierta ?? null;
  const noSePuedeEliminar = cierre?.noSePuedeEliminar ?? null;
  /** ⚠️ Falta correr el SQL. La pantalla entera sigue andando; el cierre no. */
  const faltaMigracionCierre = cierre?.aviso ?? null;
  const puedeCerrarla = puedeCerrar(rol);
  /** Se puede cerrar cuando hay un cuadro fresco, sin cerrar y sin pisar nada. */
  const sePuedeCerrar =
    !!data && !vieja && !cerrada && solapadas.length === 0 && !faltaMigracionCierre && !!data.lineas.length;
  /**
   * 🔴 POR QUÉ NO SE PUEDE ESCRIBIR UN MONTO A MANO. Son dos motivos y gana el
   * de la quincena cerrada: escribir un ISR sobre un cuadro congelado no cambia
   * un centavo de lo que se pagó, y quien lo escribe se va creyendo que corrigió
   * el pago.
   */
  /**
   * El día que se marca en el calendario. UNA sola definición para los dos
   * sitios donde vive el control (la píldora y el calendario en línea): dos
   * copias es cómo una se queda marcando después de que la persona eligió.
   */
  const bloqueoManuales: Bloqueo = cerrada
    ? BLOQUEO_CERRADA
    : data?.avisos.rangoLibre
      ? BLOQUEO_RANGO
      : null;

  /** Guarda un monto escrito a mano y refresca los números de esa fila. */
  const guardar = useCallback(
    async (codigo: string, campo: keyof ManualesLinea, valor: string) => {
      if (!data) return;
      const linea = data.lineas.find((l) => l.codigo === codigo);
      if (!linea) return;
      // 🔴 Lo tecleado pasa por `valorTecleado` (módulo puro, 11-sep-2026): en
      // «Préstamo», «Terceros» y «Mercancía» (14-sep-2026) vacío = null (vuelve
      // la cuota) y «0» = 0 (esta quincena no se descuenta); en las otras dos,
      // como siempre. Es la MISMA función que usa el servidor al guardar.
      const limpio = valorTecleado(campo, valor);
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
        // 🔴 NO SE RECARGA SOLO (4-sep-2026). El monto cambia el total de
        // deducciones, el neto y el pie — así que el cuadro queda VIEJO y lo
        // dice, con «Regenerar» al lado. Antes se recargaba entero acá: los
        // números se movían solos debajo de quien estaba revisando, que es cómo
        // se termina cerrando una quincena distinta de la que se miró.
        setDesactualizada(true);
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      }
    },
    [data, toast],
  );

  // ── 🔴 CERRAR LA QUINCENA ──────────────────────────────────────────────────
  //
  // Se manda EMPRESA Y FECHAS, y nada más. Ni un monto: la ruta vuelve a pedirle
  // el cuadro al mismo handler que pinta esta pantalla y congela ESO. Mandar los
  // números desde acá convertiría a cualquiera con el módulo en alguien que
  // puede escribir el sueldo que quiera en el registro de lo que se pagó.
  //
  // Los tres «no» que puede contestar son distintos y se muestran distinto:
  //   · 503 → falta correr la migración. NO es un error: es ámbar y con el
  //           nombre del archivo. Todo lo demás de la pantalla sigue andando.
  //   · 409 con `frenos` → horas extra o préstamos sin aprobar. Rojo, con el
  //           texto que ya nombra la pestaña a la que hay que ir.
  //   · 409 con `solapadas` → hay una cerrada que pisa estas fechas. Rojo, y
  //           NOMBRA cuál, con un botón para ir a verla.
  const cerrarQuincena = useCallback(async () => {
    if (!pedido) return;
    setTrabajandoCierre(true);
    try {
      const res = await fetch("/api/asistencia/planilla-guardada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa: pedido.empresa, desde: pedido.desde, hasta: pedido.hasta, corte: pedido.corte || null }),
      });
      const j = await res.json();
      setModal(null);
      if (res.status === 503) {
        setCierre((c) => ({
          cerrada: c?.cerrada ?? null, solapadas: c?.solapadas ?? [],
          reabierta: c?.reabierta ?? null, noSePuedeEliminar: c?.noSePuedeEliminar ?? null,
          aviso: typeof j.aviso === "string" ? j.aviso : "Falta preparar la base de datos.",
        }));
        toast("Todavía no se puede cerrar: falta preparar la base. Lee el aviso de arriba.", "warning");
        return;
      }
      if (res.status === 409) {
        if (Array.isArray(j.frenos) && j.frenos.length > 0) setFrenos(j.frenos as FrenoCierre[]);
        if (Array.isArray(j.solapadas) && j.solapadas.length > 0) {
          setCierre((c) => ({
            cerrada: c?.cerrada ?? null,
            solapadas: j.solapadas as CabeceraGuardada[],
            reabierta: c?.reabierta ?? null, noSePuedeEliminar: c?.noSePuedeEliminar ?? null,
            aviso: c?.aviso ?? null,
          }));
        }
        // El texto largo va al cartel, no al toast: son tres renglones con
        // nombres adentro y un toast se va antes de que se terminen de leer.
        toast("No se pudo cerrar la quincena. Lee el aviso de arriba.", "error");
        return;
      }
      if (!res.ok || j.ok === false) throw new Error(j.error ?? "No se pudo cerrar la quincena");
      toast("Listo — la quincena quedó cerrada. Los números quedaron congelados.", "success");
      await pedirCierre(pedido);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo cerrar la quincena", "error");
    } finally {
      setTrabajandoCierre(false);
    }
  }, [pedido, pedirCierre, toast]);

  // ── 🔴 REABRIR — con MOTIVO obligatorio ────────────────────────────────────
  //
  // No borra nada: la versión que se cerró queda entera, con sus montos y su
  // firma, y el próximo cierre nace como versión 2. El motivo es lo único que
  // permite reconstruir dentro de un mes por qué los números cambiaron.
  const reabrir = useCallback(async (motivo: string) => {
    if (!cerrada || !pedido) return;
    setTrabajandoCierre(true);
    try {
      const res = await fetch("/api/asistencia/planilla-guardada", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cerrada.id, motivo }),
      });
      const j = await res.json();
      if (!res.ok || j.ok === false) throw new Error(j.error ?? "No se pudo reabrir");
      setModal(null);
      toast("Listo — la quincena quedó abierta otra vez. Lo que se cerró se guardó igual.", "success");
      await pedirCierre(pedido);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo reabrir", "error");
    } finally {
      setTrabajandoCierre(false);
    }
  }, [cerrada, pedido, pedirCierre, toast]);

  // ── 🔴 ELIMINAR — solo una REABIERTA, y solo si no bajó ninguna deuda ──────
  //
  // Daniel, 16-sep-2026: *«quiero que sea sencillo»*. El flujo queda en dos
  // pasos y sin decisiones: cerrada → Reabrir (devuelve la plata, pide el
  // porqué) → Eliminar (se va la fila). Nunca se borra una firma de pago de un
  // clic, y lo que le bajó la deuda a alguien no se borra nunca.
  //
  // ⚠️ El servidor vuelve a comprobar las dos condiciones: este botón no es el
  // candado, es lo que evita ofrecer algo que después se rechaza.
  const eliminar = useCallback(async () => {
    if (!reabierta || !pedido) return;
    setTrabajandoCierre(true);
    try {
      const res = await fetch("/api/asistencia/planilla-guardada", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reabierta.id }),
      });
      const j = await res.json();
      if (!res.ok || j.ok === false) throw new Error(j.error ?? "No se pudo borrar");
      setBorrando(false);
      toast("Listo — esa planilla se borró. El período queda libre.", "success");
      await pedirCierre(pedido);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo borrar", "error");
    } finally {
      setTrabajandoCierre(false);
    }
  }, [reabierta, pedido, pedirCierre, toast]);

  /** Ir a mirar una quincena cerrada que pisa estas fechas: se genera ESA. */
  const irACerrada = useCallback((c: CabeceraGuardada) => {
    setDesde(c.desde);
    setHasta(c.hasta);
    setElegido(true);
    setPedido({ desde: c.desde, hasta: c.hasta, empresa: c.empresa });
  }, []);

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
      // 🔴 Y lo mismo con el préstamo: la última cuota y quien debe pero no
      // cobra aquí van al papel, o el papel decide con menos información que
      // la pantalla.
      avisoPrestamo: data.avisos.avisoPrestamo ?? null,
      avisoPrestamoSinAtar: data.avisos.avisoPrestamoSinAtar ?? null,
      // 🔴 Y el día libre de la empresa: si la pantalla dice por qué la columna
      // del extra quedó en cero y el papel no, el papel decide un pago con
      // menos información que la pantalla.
      avisoDiasLibres: data.avisos.avisoDiasLibres ?? null,
      // 🔴 El detalle de «Otros servicios» viaja al Excel: en el cuadro es UNA
      // casilla con el total, y el porqué de cada monto vive en su hoja. Sin
      // nada, la hoja no nace.
      otrosServicios: data.otrosServicios ?? [],
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

  // ── 🔴 LOS COMPROBANTES DE PAGO — el papel que cada uno firma ─────────────
  //
  // Una hoja por persona, UN SOLO FORMATO para las tres empresas, y todos los
  // renglones dibujados aunque vayan en 0.00 (Daniel: *«si alguien no lo lleva
  // se pone 0 en el de esa persona»*). Reemplaza los 13 formatos distintos que
  // salieron de los 34 comprobantes de julio de 2026.
  //
  // 🔑 LOS MONTOS SON LOS DE ESTA PANTALLA. No se vuelve a pedir el cuadro ni
  // se recalcula nada: `data.lineas` es lo que ya está a la vista. Lo único que
  // se busca aparte son el cargo y la cédula, que la planilla no conoce.
  /** Empresa y fechas DEL CUADRO que está a la vista — lo mismo que leen el Excel y el PDF. */
  function nombreDelCuadro(d: Respuesta): { empresa: string; desde: string; hasta: string } {
    return {
      empresa: d.empresa ?? empresa,
      desde: d.periodo?.desde ?? d.quincena?.desde ?? desde,
      hasta: d.periodo?.hasta ?? d.quincena?.hasta ?? hasta,
    };
  }

  async function bajarComprobantes() {
    if (!data?.lineas.length) return;
    try {
      const [{ armarComprobante, lineasConComprobante }, pdf] = await Promise.all([
        import("@/lib/asistencia/comprobante"),
        import("@/lib/asistencia/comprobante-pdf"),
      ]);

      // El cargo y la cédula. Si la lectura falla, el papel sale igual con un
      // guion en «POSICIÓN DESEMPEÑADA»: quedarse sin comprobantes por un dato
      // que no mueve plata sería peor que imprimirlo incompleto y visible.
      const porCodigo = new Map<string, { posicion: string | null; cedula: string | null }>();
      try {
        const r = await fetch("/api/asistencia/comprobante", { cache: "no-store" });
        const j = (await r.json()) as { personas?: { codigo: string; posicion: string | null; cedula: string | null }[] };
        for (const p of j.personas ?? []) porCodigo.set(p.codigo, { posicion: p.posicion, cedula: p.cedula });
      } catch { /* el papel sale con guion */ }

      const periodo = {
        esQuincena: data.periodo?.esQuincena ?? false,
        anio: data.periodo?.quincena?.anio ?? null,
        mes: data.periodo?.quincena?.mes ?? null,
        n: (data.periodo?.quincena?.n ?? null) as 1 | 2 | null,
        etiqueta: data.periodo?.etiqueta ?? "",
      };

      // 🔴 Los conceptos de «Otros servicios», por CÓDIGO. Salen de los MISMOS
      // datos que el Excel y que la casilla del cuadro: el papel no vuelve a
      // leer la base ni recalcula el total (15-sep-2026).
      const otrosDe = new Map<string, { concepto: string; monto: number }[]>();
      for (const r of data.otrosServicios ?? []) {
        const lista = otrosDe.get(r.codigo) ?? [];
        lista.push({ concepto: r.concepto, monto: r.monto });
        otrosDe.set(r.codigo, lista);
      }

      const hojas = lineasConComprobante(data.lineas).map((l) => {
        const extra = porCodigo.get(l.codigo);
        return armarComprobante(
          {
            linea: l,
            posicion: extra?.posicion ?? null,
            cedula: extra?.cedula ?? null,
            otrosServicios: otrosDe.get(l.codigo) ?? [],
          },
          periodo,
        );
      });
      if (!hojas.length) {
        toast("Todavía no hay a quién hacerle comprobante en este cuadro.", "warning");
        return;
      }
      // 🔴 EL NOMBRE DEL ARCHIVO ES EL DEL CUADRO, no el del selector (11-sep-2026).
      // 🩸 Con el cuadro viejo (aviso ámbar «Los números que ves son de antes»)
      // salían los montos de la quincena generada dentro de un PDF llamado como
      // la otra. El Excel y el PDF ya se nombraban desde `data.periodo`; éste
      // era el único que leía `desde`/`hasta` del selector.
      pdf.construirPdfComprobantes(hojas).save(
        pdf.nombreArchivoComprobante(nombreDelCuadro(data)),
      );
      toast(
        hojas.length === 1
          ? "Comprobante listo — revisa tu carpeta de descargas"
          : `${hojas.length} comprobantes listos — revisa tu carpeta de descargas`,
        "success",
      );
    } catch {
      toast("No se pudieron armar los comprobantes. Intenta de nuevo.", "error");
    }
  }

  // 🔴 CUATRO grupos, no dos, y el reparto lo hace `grupoDeLinea` —la MISMA
  // función que ordena el cuadro, cuenta los totales y arma el Excel y el PDF—.
  // Con la lista partida acá a mano, la pantalla y el papel podían discrepar
  // sobre en qué cajón cae una persona.
  //
  // 🩸 «Falta un dato» y «Tú decides» eran UNA SOLA bolsa ámbar, y por eso
  // RODRIGO MIRANDA (trabajo fuera de la oficina) y ELOYN MENDOZA (vacaciones)
  // salían pidiendo que los arreglaran en Configuración, donde no hay nada que
  // arreglarles. Ámbar dice "arreglame"; esto es una decisión, y va en gris.
  const buenas = data?.lineas.filter((l) => grupoDeLinea(l) === "pagada") ?? [];
  const fueraDePlanilla = data?.lineas.filter((l) => grupoDeLinea(l) === "fuera") ?? [];
  const decidir = data?.lineas.filter((l) => grupoDeLinea(l) === "decidir") ?? [];
  const pendientes = data?.lineas.filter((l) => grupoDeLinea(l) === "falta") ?? [];

  /**
   * 🔴 UN SOLO BOTÓN, y cambia de nombre según lo que va a hacer: «Generar» la
   * primera vez y cuando lo elegido no es lo que está en pantalla; «Regenerar»
   * cuando es el mismo cuadro. UN solo elemento, al lado de la quincena: dos
   * botones que hacen lo mismo en la misma pantalla es cómo se toca el que no
   * era. Negro mientras no haya cuadro, o cuando lo que hay quedó viejo.
   */
  const botonGenerar = (
    <button
      type="button"
      onClick={generar}
      disabled={!elegido || cargando || sinEmpresa}
      className={`min-h-[44px] rounded-md px-4 text-sm font-medium transition active:scale-[0.97] disabled:opacity-40 ${
        data && !vieja
          ? "border border-gray-300 text-gray-700 hover:border-black hover:text-black"
          : "bg-black text-white"
      }`}
    >
      {cargando ? "Generando…" : data && coincide ? "Regenerar" : "Generar"}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* ══════════════════════════════════════════════════════════════════
          🔴 CON «TODAS», EL TABLERO DE CIERRE (19-sep-2026).
          🩸 Hasta hoy acá solo se leía «con «Todas» no se paga nada» y la
          pantalla quedaba en blanco: para saber cómo venía la quincena había
          que entrar empresa por empresa, generar y mirar — cuatro veces, seis
          veces al mes.
          🔴 El tablero muestra ESTADO, nunca un total del grupo, y cada fila
          cierra SU empresa por su propia puerta.
          ══════════════════════════════════════════════════════════════════ */}
      {sinEmpresa && (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-700">
          Así va cada empresa. Para <b>armar y revisar</b> una planilla, elígela arriba:
          con «Todas» no se paga nada.
        </p>
      )}
      {/* ── Elegir qué se va a pagar ── */}
      <div className="flex flex-wrap items-end gap-3">
        {/* 🔴 LA QUINCENA: cuatro botones —las dos del mes anterior y las dos
            del mes en curso—. El botón prendido es el que coincide EXACTO con
            lo elegido.

            🩸 Acá vivía «Otro rango ⌄» con el calendario de siempre. Se retiró
            el 15-sep-2026 (Daniel: *«si la quincena es fija, que no haya opción
            de rango, solo las opciones»*). ⚠️ La RUTA sigue aceptando
            `desde`/`hasta` libres: los usa `medirAjusteAnterior`. */}
        <div className="flex flex-col gap-1">
          {!ASISTENCIA_PANTALLA_2026_09 && <span className="text-xs text-gray-500">Quincena</span>}
          <div className="flex flex-wrap items-center gap-2">
            {/* 🔴 LA MISMA BARRA DE LAS OTRAS PESTAÑAS (24-sep-2026), sin
                calendario: acá solo se pagan quincenas. 🩸 Eran cuatro botones
                con rótulo propio, al lado de otro control con rótulo propio
                («Cortar el reloj el»), y por eso parecían dos períodos. */}
            {ASISTENCIA_PANTALLA_2026_09 ? (
              <SelectorPeriodo
                desde={desde}
                hasta={hasta}
                hoy={compartido.hoy}
                conCalendario={false}
                onElegir={compartido.elegir}
              />
            ) : quincenasParaElegir.map((q) => {
              const prendido = elegido && esLaQuincena(q, desde, hasta);
              return (
                <button key={q.clave} type="button" onClick={() => elegirQuincena(q)}
                  aria-pressed={prendido}
                  className={`min-h-[44px] rounded-md border px-3 text-sm transition active:scale-[0.97] ${
                    prendido ? "border-black font-medium text-gray-900" : "border-gray-300 text-gray-700 hover:border-black"
                  }`}>
                  {rotuloQuincena(q)}
                </button>
              );
            })}
          </div>
          {/* 🔴 EL DÍA 31 NO PAGA SUELDO, PERO SÍ SE MIDE (15-sep-2026). Daniel:
              *«el día 31 no se paga, pero si no viene o llega tarde se
              descuenta»*. Sale SOLO en los meses de 31 días —un aviso que sale
              siempre deja de avisar— y va a la VISTA, no a un `title`: en el
              iPad no hay mouse, y esto es plata. Ver `dia-31.ts`. */}
          {elegido && textoDelDia31(hasta) && (
            <span className="text-[12px] text-gray-500">{textoDelDia31(hasta)}</span>
          )}
        </div>

        {/* 🔴 EL CORTE — hasta qué día se lee el reloj (día 13/28). Se ve DESDE
            EL INICIO, al lado de la quincena, con el corte propuesto ya puesto;
            vacío = quincena entera, como siempre. Cambiarlo vuelve viejo el
            cuadro; se aprieta «Regenerar» para verlo cortado. */}
        {PLANILLA_UNIDA && !ASISTENCIA_PANTALLA_2026_09 && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Cortar el reloj el</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={corte}
                min={elegido ? desde : undefined}
                max={elegido ? hasta : undefined}
                onChange={(e) => elegirCorte(e.target.value)}
                aria-label="Cortar el reloj el"
                className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm"
              />
              {corte && (
                <button type="button" onClick={() => elegirCorte("")}
                  className="min-h-[44px] rounded-md border border-gray-300 px-2 text-xs text-gray-600 transition hover:border-black hover:text-black">
                  Quincena entera
                </button>
              )}
              {corte && (
                <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700">Corte {fechaCortaCorte(corte)}</span>
              )}
              <span className="text-[12px] text-gray-500">
                {corte && elegido
                  ? (fraseCorte(corte, hasta) ?? `Se lee el reloj hasta el ${fechaCortaCorte(corte)}.`)
                  : "Vacío: se lee la quincena entera."}
              </span>
            </div>
          </label>
        )}
        {/* ══════════════════════════════════════════════════════════════════
            🔴 EL CORTE DEL RELOJ, EN UNA LÍNEA GRIS (24-sep-2026)
            🩸 «Quincena» y «Cortar el reloj el» estaban uno al lado del otro,
            con rótulo propio y el mismo peso: parecían DOS períodos. Y al lado
            del campo había un botón «Quincena entera» y un chip «Corte 17 sep»
            que solo repetía el valor del campo — los dos se van.
            🔑 El corte NO cambia lo que se paga: el período queda entero y solo
            se recorta hasta dónde se mira el reloj. Eso no se toca.
            ══════════════════════════════════════════════════════════════════ */}
        {PLANILLA_UNIDA && ASISTENCIA_PANTALLA_2026_09 && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={corteRef}
              type="date"
              value={corte}
              min={elegido ? desde : undefined}
              max={elegido ? hasta : undefined}
              onChange={(e) => elegirCorte(e.target.value)}
              aria-label="Cortar el reloj el"
              className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm"
            />
            {corte && (
              <button type="button" onClick={() => elegirCorte("")}
                aria-label={VACIAR_EL_CORTE}
                title={VACIAR_EL_CORTE}
                className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-300 text-sm text-gray-500 transition hover:border-black hover:text-black active:scale-[0.97]">
                ×
              </button>
            )}
          </div>
        )}

        {botonGenerar}

        {/* 🔴 «Descargar ⌄» (Excel · PDF · Comprobantes) SOLO con la planilla ya
            generada: un botón apagado a la vista es una promesa que todavía no
            se puede cumplir. Un solo botón para las tres salidas (11-sep-2026,
            mockup): dice QUÉ trae, como el resto del sistema. */}
        {!!data?.lineas.length && (
          <div className="relative">
            <button
              ref={descargaRef}
              type="button"
              onClick={() => setDescargaOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={descargaOpen}
              className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]"
            >
              Descargar <span aria-hidden className="text-gray-400">⌄</span>
            </button>
            <DesplegableFlotante abierto={descargaOpen} anclaRef={descargaRef} onCerrar={() => setDescargaOpen(false)} role="menu" marca="planilla-descargar" className="min-w-[180px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              <button role="menuitem" type="button" onClick={() => { setDescargaOpen(false); void bajarExcel(); }} className="block min-h-[44px] w-full px-4 text-left text-sm hover:bg-gray-50">Excel</button>
              <button role="menuitem" type="button" onClick={() => { setDescargaOpen(false); void bajarPdf(); }} className="block min-h-[44px] w-full px-4 text-left text-sm hover:bg-gray-50">PDF</button>
              {/* 🔴 EL PAPEL QUE SE FIRMA: el entregable de la quincena. */}
              {PLANILLA_UNIDA && (
                <button role="menuitem" type="button" onClick={() => { setDescargaOpen(false); void bajarComprobantes(); }} className="block min-h-[44px] w-full px-4 text-left text-sm hover:bg-gray-50">Comprobantes</button>
              )}
            </DesplegableFlotante>
          </div>
        )}

        {/* 🔴 CERRAR QUINCENA, negro y a la derecha (11-sep-2026, mockup). Solo
            a quien la firma; el borrador ya no tiene su propio párrafo: lo dice
            el encabezado de «Antes de cerrar». */}
        {/* 🔴 Y NUNCA sobre un período que no es una quincena (18-sep-2026,
            Daniel: «si frenalo»). El servidor lo rechaza igual
            (`frenoSoloQuincenas`); acá simplemente no se ofrece. */}
        {!!data && !vieja && !cerrada && !!data.lineas.length && puedeCerrarla && !data.avisos.rangoLibre && (
          <button
            type="button"
            onClick={() => setModal("cerrar")}
            disabled={!sePuedeCerrar}
            className="ml-auto min-h-[44px] shrink-0 rounded-md bg-black px-4 text-sm font-medium text-white transition active:scale-[0.97] disabled:opacity-40"
          >
            Cerrar quincena
          </button>
        )}
      </div>

      {/* 🔴 LA LÍNEA GRIS DEL CORTE (24-sep-2026, esc 1d). Dice hasta dónde se
          lee el reloj y, con «cambiar», lleva al campo. Vacío: «hasta el fin de
          la quincena». */}
      {/* ══════════════════════════════════════════════════════════════════
          🔴 «Corte del reloj · lee del 14 al 28 sep» (25-sep-2026)
          Daniel, textual: *«ese mensaje no tiene que decir desde el 28 si ya
          está en el calendario; debería decir desde cuándo lee (la última
          apertura, día después); y algo minimalista que se sepa que es el cierre
          del reloj»*. 🩸 Decía «El reloj se lee hasta el 28 sep · cambiar — Del
          29 al 30 se paga normal y se ajusta en la siguiente»: repetía el 28 que
          el campo de al lado ya dice, no decía DESDE cuándo —el único dato que
          no está en ninguna otra parte— y mandaba a «cambiar» un campo que está
          a dos centímetros. La cola es la MISMA frase de siempre y se fue al ⓘ.
          ══════════════════════════════════════════════════════════════════ */}
      {PLANILLA_UNIDA && ASISTENCIA_PANTALLA_2026_09 && elegido && lineaCorte && (
        <p className="flex flex-wrap items-center gap-x-1 text-[12px] text-gray-500">
          {lineaCorte.texto}
          {lineaCorte.nota && (
            <Ayuda titulo="Los días que quedan" etiqueta="">
              <p>{lineaCorte.nota}</p>
            </Ayuda>
          )}
        </p>
      )}

      {/* 🔴 DÓNDE CONVIENE EMPEZAR. La quincena pasada terminó un día, y la que
          sigue empieza al otro: decirlo evita las dos formas de equivocarse —
          dejar días sin pagar, o pisar una quincena que ya se pagó (que el
          servidor rechaza al cerrar). Se dice y se marca; no se elige solo. */}
      {/* ⚠️ Decía «está marcado en el calendario. Puedes elegir otro día si hace
          falta» — dos frases que dejaron de ser ciertas el 15-sep-2026, cuando
          se retiró «Otro rango»: ya no hay calendario ni días sueltos que
          elegir. Lo que el aviso sigue haciendo es lo único que importaba:
          decir dónde quedó la quincena pasada, para no dejar días sin pagar ni
          pisar una que ya se pagó. */}
      {sugerido && (ASISTENCIA_PANTALLA_2026_09 ? !pedido : !elegido && !pedido) && (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[13px] text-blue-900">
          La última quincena cerrada de <b>{etiquetaEmpresa(empresa)}</b> terminó el{" "}
          <b>{fechaCorta(sugerido.ultimaHasta)}</b>, así que esta empieza el{" "}
          <b>{fechaCorta(sugerido.inicio)}</b> — es la quincena que sigue arriba.
        </p>
      )}

      {/* ═══ EL ESTADO DE ESTA QUINCENA ═════════════════════════════════════ */}

      {/* ⚠️ FALTA CORRER LA MIGRACIÓN. No es un error y no rompe nada: la
          planilla se calcula, se revisa y se imprime igual — lo único que no
          hay todavía es dónde registrar el cierre. Por eso va en ÁMBAR y con el
          nombre del archivo, que es lo que hay que correr. */}
      {faltaMigracionCierre && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {faltaMigracionCierre}
        </p>
      )}

      {/* 🔴 EL CUADRO QUEDÓ VIEJO. Pasa por dos motivos y se dicen los dos: o
          alguien cambió lo elegido arriba, o tocó algo que mueve la plata. En
          ninguno de los dos se recalcula solo: el número se mueve cuando la
          persona lo pide. */}
      {vieja && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
          <p className="text-sm font-medium text-amber-900">
            Los números que ves son de antes
          </p>
          <p className="mt-0.5 text-[13px] text-amber-900">
            {!coincide
              ? "Cambiaste el período o la empresa, así que este cuadro ya no es el de lo que está elegido arriba."
              : "Cambiaste algo que mueve la plata (un monto a mano, un préstamo aprobado) y el cuadro no se rehace solo."}
            {" "}Toca <b>{data && coincide ? "Regenerar" : "Generar"}</b> para verlo con ese cambio.
          </p>
        </div>
      )}

      {/* 🔴 YA ESTÁ CERRADA. Dice quién y cuándo, y lo que quedó congelado. */}
      {cerrada && (
        <div className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">
                Quincena cerrada{cerrada.version > 1 ? ` · versión ${cerrada.version}` : ""}
              </p>
              <p className="mt-0.5 text-[13px] text-gray-600">
                La cerró <b>{cerrada.cerradaPor}</b> el {cuandoBonito(cerrada.cerradaEn)} —{" "}
                {cerrada.personas} {cerrada.personas === 1 ? "colaborador" : "colaboradores"}, neto{" "}
                <b>${$(cerrada.totalNeto)}</b>. Esos números quedaron congelados: aunque después
                alguien corrija una marcación, lo que se pagó no cambia.
              </p>
            </div>
            {puedeCerrarla && (
              <button
                type="button"
                onClick={() => setModal("reabrir")}
                className="min-h-[44px] shrink-0 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]"
              >
                Reabrir
              </button>
            )}
          </div>
          {/* 🔴 LA DERIVA SE DENUNCIA. El cuadro de arriba se acaba de calcular
              con los datos de HOY; el cerrado es de cuando se cerró. Si no dan
              lo mismo, algo cambió después del pago y hay que saberlo — pero lo
              que vale sigue siendo lo cerrado. */}
          {!!data && Math.abs(data.totales.netoPagar - cerrada.totalNeto) > 0.005 && (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[12px] text-amber-900">
              Ojo: el cuadro que ves ahora da <b>${$(data.totales.netoPagar)}</b> y lo que se cerró
              fue <b>${$(cerrada.totalNeto)}</b>. Cambió algo después del cierre. Vale lo cerrado;
              si hay que rehacerlo, hay que reabrir la quincena.
            </p>
          )}
        </div>
      )}

      {/* 🔴 ESTA QUINCENA SE CERRÓ Y SE REABRIÓ. Hasta el 16-sep-2026 esto no se
          veía en ningún lado: una reabierta no estorba ningún cierre, así que la
          pantalla se comportaba como si no existiera. Ahora se dice —con quién
          la cerró, quién la reabrió y por qué— y es el único lugar desde donde
          se puede borrar. */}
      {!cerrada && reabierta && (
        <div className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">
                Esta quincena se cerró y se reabrió
                {reabierta.version > 1 ? ` · versión ${reabierta.version}` : ""}
              </p>
              <p className="mt-0.5 text-[13px] text-gray-600">
                La cerró <b>{reabierta.cerradaPor}</b> y la reabrió{" "}
                <b>{reabierta.reabiertaPor ?? "alguien"}</b>
                {reabierta.reabiertaEn ? ` el ${cuandoBonito(reabierta.reabiertaEn)}` : ""}
                {reabierta.motivoReabrir ? `: «${reabierta.motivoReabrir}»` : "."}
                {" "}No se le está pagando nada: el período está libre para generar y cerrar otra vez.
              </p>
              {/* 🔴 CUANDO NO SE PUEDE BORRAR, SE DICE POR QUÉ. Esconder el botón
                  sin explicar deja a la contadora buscando algo que no existe. */}
              {noSePuedeEliminar && (
                <p className="mt-1.5 text-[12px] text-gray-500">{noSePuedeEliminar}</p>
              )}
            </div>
            {puedeCerrarla && !noSePuedeEliminar && (
              <button
                type="button"
                onClick={() => setBorrando(true)}
                className="min-h-[44px] shrink-0 rounded-md border border-gray-300 px-3 text-sm font-medium text-red-700 transition hover:border-red-500 active:scale-[0.97]"
              >
                Eliminar
              </button>
            )}
          </div>
        </div>
      )}

      {/* 🔴 SE PISA CON UNA CERRADA. Una persona no puede quedar pagada dos
          veces por el mismo día: no se puede cerrar, y se NOMBRA cuál estorba
          con un botón para ir a verla. */}
      {!cerrada && solapadas.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="text-[13px] text-red-800">{textoSolapamiento(solapadas)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {solapadas.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => irACerrada(c)}
                className="min-h-[44px] rounded-md border border-red-300 bg-white px-3 text-[13px] font-medium text-red-800 transition hover:border-red-500 active:scale-[0.97]"
              >
                Ver la del {c.etiqueta || etiquetaRangoGuardado(c)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 🔴 LOS FRENOS. No es un aviso: es un NO. Lo que quedó sin aprobar no se
          paga, y una vez cerrada la quincena el aviso no le devuelve la plata a
          nadie. El texto viene del servidor y ya nombra la pestaña. */}
      {frenos.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="text-sm font-medium text-red-900">No se puede cerrar la quincena todavía</p>
          <ul className="mt-1 space-y-1.5">
            {frenos.map((f) => (
              <li key={f.tipo} className="text-[13px] text-red-800">
                {f.texto}
                {/* 🔴 CADA NOMBRE LLEVA A LA PERSONA (3-sep-2026). Daniel: *«al
                    hacer clic en el mensaje de aprobacion, que te lleve al
                    colaborador para aprobar»*. Mismo nivel → `replace`. Un 409
                    viejo sin `codigos` cae al enlace único de antes. */}
                {f.tipo === "horas-extra" && (
                  f.codigos && f.codigos.length === f.quienes.length ? (
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {f.codigos.map((codigo, i) => (
                        <Link
                          key={codigo}
                          href={enlaceAprobaciones(codigo, pedido ? { desde: pedido.desde, hasta: pedido.hasta } : null)}
                          replace
                          scroll={false}
                          className="inline-flex min-h-[44px] items-center font-medium underline underline-offset-2"
                        >
                          {f.quienes[i]}
                        </Link>
                      ))}
                    </span>
                  ) : (
                    <>
                      {" "}
                      <Link
                        href="/asistencia?tab=aprobaciones"
                        replace
                        scroll={false}
                        className="inline-flex min-h-[44px] items-center font-medium underline underline-offset-2"
                      >
                        Ir a Aprobaciones
                      </Link>
                    </>
                  )
                )}
                {/* 🔴 EL DÍA MAL MARCADO SE ARREGLA EN ASISTENCIA, con «Agregar
                    hora» —o, desde el 18-sep-2026, con «Quitar esta marcación»
                    cuando sobra—. UN solo enlace y no uno por nombre: el
                    texto del freno ya trae a cada persona con sus días, y
                    repetir los nombres como enlaces taparía los datos. */}
                {f.tipo === "marcas-impares" && (
                  <>
                    {" "}
                    <Link
                      href={enlaceDiasDe(
                        f.codigos?.[0] ?? "",
                        pedido ? { desde: pedido.desde, hasta: pedido.hasta } : null,
                      )}
                      replace
                      scroll={false}
                      className="inline-flex min-h-[44px] items-center font-medium underline underline-offset-2"
                    >
                      Ir a Asistencia
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 🔴 «ANTES DE CERRAR» — UNA lista, no siete cajas (11-sep-2026, mockup
          aprobado por Daniel). Arriba lo que hay que ARREGLAR (número en negrita,
          enlace a la derecha); abajo en gris lo informativo (el corte, los que no
          salen). Sin nombres sueltos —están en Aprobaciones, y «ver quiénes» los
          trae—, sin el párrafo del borrador —lo dice el encabezado— y sin la
          caja de préstamos —ya no se aprueba—. Los avisos siguen viajando como
          DATOS en `avisos`: el Excel y el PDF los leen igual. La regla vive en
          `lib/asistencia/antes-de-cerrar.ts`. */}
      {/* 🔴 EL TABLERO: una línea por empresa, con la quincena que se eligió
          arriba. Solo con «Todas»; con una empresa, la pantalla es la de
          siempre y no se pide nada de más. */}
      {sinEmpresa && (
        <TableroCierre
          rol={rol}
          desde={desde}
          hasta={hasta}
          corte={corte}
          elegido={elegido}
          puedeCerrar={puedeCerrarla}
          soloInforma={ASISTENCIA_PANTALLA_2026_09 && celular}
          onCerrada={() => setDesactualizada(true)}
        />
      )}

      {/* 🔴 LA ENTRADA SE ARMA EN UN MÓDULO PURO (19-sep-2026), no acá: el
          TABLERO de cierre de «Todas» necesita lo mismo, y dos copias de quince
          campos son dos verdades sobre qué frena un cierre. La regla sigue
          siendo `armarAntesDeCerrar`. */}
      {!!data && !vieja && !cerrada && !!data.lineas.length && (
        <AntesDeCerrar datos={antesDeCerrarDelCuadro(
          data,
          pedido ? { desde: pedido.desde, hasta: pedido.hasta } : null,
          PLANILLA_UNIDA,
          PESTANA_FICHAS,
        )} />
      )}

      {/* 🔴 EL VACÍO ES EL ESTADO INICIAL, y dice qué hacer. No es un error ni
          un «no hay datos»: es que nadie eligió todavía qué quincena pagar. */}
      {!elegido && !cargando && (
        <div className="rounded-lg border border-dashed border-gray-200 px-4 py-12 text-center">
          <p className="text-sm font-medium text-gray-700">Elige el período que vas a pagar</p>
          <p className="mt-1 text-[13px] text-gray-500">
            Toca la quincena arriba y después <b>Generar</b>.
          </p>
        </div>
      )}
      {/* 🔴 CON EL SELECTOR ÚNICO LA QUINCENA VIENE PUESTA, ASÍ QUE EL VACÍO
          DICE LO QUE FALTA DE VERDAD: generar. 🔑 **La plata sigue sin
          dibujarse sola** — la regla de Daniel del 1-sep-2026 no se toca. */}
      {ASISTENCIA_PANTALLA_2026_09 && elegido && !pedido && !cargando && !sinEmpresa && (
        <div className="rounded-lg border border-dashed border-gray-200 px-4 py-12 text-center">
          <p className="text-sm font-medium text-gray-700">Esta quincena todavía no se generó</p>
          <p className="mt-1 text-[13px] text-gray-500">
            Toca <b>Generar</b> para armar el cuadro de lo que se va a pagar.
          </p>
        </div>
      )}
      {cargando && <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>}
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!cargando && !error && data?.lineas.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-500">
          No hay nadie en esta empresa para estas fechas. Revisa la pestaña <b>{PESTANA_FICHAS}</b>.
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
          {/* ⚠️ Decía «escribe las fechas exactas de una quincena»: desde el
              15-sep-2026 no hay dónde escribirlas, y desde el 18-sep un período
              así tampoco se cierra. Solo puede aparecer si alguien pidió el
              cuadro por fuera de los cuatro botones. */}
          {data.avisos.rangoLibre && (
            <p className="text-[13px] text-gray-500">
              Este período no es una quincena: los montos a mano no se aplican y no se puede
              cerrar. Elige una de las quincenas de arriba y vuelve a generar.
            </p>
          )}

          {/* 🩸 Acá vivía el bloque «Préstamos por descontar» con «Aprobar» por
              persona (2-sep → 11-sep-2026). Se retiró con la aprobación
              quincenal: la cuota del módulo entra sola a la casilla de cada
              fila (`prestamoAutomatico`) y la casilla sigue siendo editable. */}

          {/* ── ESCRITORIO: la tabla de 19 columnas ── */}
          <div className="hidden md:block">
            {/* 🔴 4b — LAS 14 COLUMNAS DENTRO DE SU PROPIA CAJA (24-sep-2026).
                🩸 Medido en la captura de Daniel a 1440 px: la tabla se cortaba
                después de «ISR» y el NETO —el número por el que existe la
                pantalla— quedaba fuera del borde derecho. Ahora la caja se
                desliza sola (de lado y hacia abajo), el nombre queda fijo a la
                izquierda y la cabecera, pegada arriba. **Ninguna columna se
                pliega**: la contadora las ve todas. */}
            <div className={ASISTENCIA_PANTALLA_2026_09
              ? "max-h-[70vh] overflow-auto rounded-lg border border-gray-200 bg-white"
              : "overflow-x-auto rounded-lg border border-gray-200 bg-white"}>
              <table className="w-max min-w-full text-sm">
                <thead className={ASISTENCIA_PANTALLA_2026_09 ? "sticky top-0 z-20 bg-white" : undefined}>
                  <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wide text-gray-400">
                    <th className={`sticky left-0 bg-white px-3 py-2.5 text-left font-medium ${ASISTENCIA_PANTALLA_2026_09 ? "z-30" : "z-10"}`}>Colaborador</th>
                    {/* 🔴 UNA sola lista para el grupo y para Boston
                        (`columnas-dinero-planilla.ts`, 11-sep-2026). */}
                    {ROTULOS_DINERO_PLANILLA.map((h) => (
                      <th key={h} className="whitespace-pre px-2 py-2.5 text-right font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buenas.map((l) => (
                    <Fila
                      key={l.codigo} l={l} onGuardar={guardar}
                      verAsistencia={ASISTENCIA_PANTALLA_2026_09
                        ? rutaAsistenciaDePersona({ codigo: l.codigo, empresa, desde, hasta })
                        : null}
                      // Apagados, no escondidos: su ausencia es parte de lo que
                      // hay que ver. Y el motivo va escrito, porque son DOS y se
                      // arreglan distinto — con otras fechas, o reabriendo.
                      bloqueo={bloqueoManuales}
                    />
                  ))}
                  {/* Fuera de planilla a propósito: en GRIS, no en ámbar. El
                      color es la mitad del mensaje — ámbar dice "arreglame". */}
                  {fueraDePlanilla.map((l) => (
                    <tr key={l.codigo} className="border-b border-gray-100 last:border-0">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2.5 text-gray-500">
                        {capitalizarNombre(l.etiqueta)}
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
                        {capitalizarNombre(l.etiqueta)}
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
                        {capitalizarNombre(l.etiqueta)}
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
                      {data.totales.personas === 1 ? "colaborador" : "colaboradores"}
                    </td>
                    {montosDePlanilla(data.totales).map((v, i) => (
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
                Incluye días en que el colaborador SÍ vino pero llegó más de{" "}
                {MINUTOS_TARDE_QUE_SON_AUSENCIA} minutos tarde. <b>Se descuentan los minutos, igual
                que una tardanza</b> — la columna solo cambia de nombre, el total bruto es el mismo.
                Pasa el cursor por el número para ver cuánto y de cuántos días.
              </p>
            )}
            {/* 🔴 EL AJUSTE DE LA QUINCENA ANTERIOR, DICHO AL PIE (11-sep-2026).
                Ya no es una columna: cada monto entró en la suya —extra en
                extra, tardanza en tardanza— porque «valen diferente»
                (la contadora). El pie dice cuáles columnas lo traen y de qué
                días; la celda lo repite en su `title`. */}
            {notaAjuste(buenas) && (
              <p className="mt-2 px-1 text-[12px] text-gray-600">{notaAjuste(buenas)}</p>
            )}
          </div>

          {/* ── CELULAR: una tarjeta por persona ── */}
          <div className="space-y-2 md:hidden">
            {buenas.map((l) => (
              <Tarjeta
                key={l.codigo} l={l}
                verAsistencia={ASISTENCIA_PANTALLA_2026_09
                  ? rutaAsistenciaDePersona({ codigo: l.codigo, empresa, desde, hasta })
                  : null}
                abierta={abierta === l.codigo}
                onToggle={() => setAbierta(abierta === l.codigo ? null : l.codigo)}
                onGuardar={guardar}
                bloqueo={bloqueoManuales}
              />
            ))}
            {fueraDePlanilla.map((l) => (
              <div key={l.codigo} className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="font-medium text-gray-700">
                  {capitalizarNombre(l.etiqueta)} <span className="text-xs text-gray-400">{l.codigo}</span>
                </p>
                <p className="mt-0.5 text-[13px] text-gray-500">
                  {MOTIVO_FUERA_DE_PLANILLA} · se le mide la asistencia, no se le calcula pago
                </p>
              </div>
            ))}
            {decidir.map((l) => (
              <div key={l.codigo} className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="font-medium text-gray-700">
                  {capitalizarNombre(l.etiqueta)} <span className="text-xs text-gray-400">{l.codigo}</span>
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
                  {capitalizarNombre(l.etiqueta)} <span className="text-xs text-gray-400">{l.codigo}</span>
                </p>
                <p className="mt-0.5 text-[13px] text-amber-800">
                  falta configurar — {l.faltaConfigurar.join(" · ")}
                </p>
              </div>
            ))}
            <div className="rounded-lg border-2 border-gray-300 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Total · {data.totales.personas}{" "}
                {data.totales.personas === 1 ? "colaborador" : "colaboradores"}
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
              {fueraDePlanilla.length === 1 ? "colaborador no va" : "colaboradores no van"} en la planilla
              (servicio profesional). {EXPLICACION_SERVICIO_PROFESIONAL} Se cambia en{" "}
              <b>{PESTANA_FICHAS}</b>.
            </p>
          )}

          {/* 🔴 DOS listas con nombre propio, no una bolsa. «Tú decides» va en
              GRIS y sin mandar a Configuración: ahí no hay nada que arreglar.
              El rótulo se llamó «Decidilo vos» hasta el 1-sep-2026; se renombró
              porque era voseo y este sistema habla tuteo neutro. Es el MISMO
              grupo (`grupoDeLinea === "decidir"`), solo cambió cómo se lee. */}
          {!!decidir.length && (
            <p className="rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
              <b>Tú decides:</b> {decidir.length}{" "}
              {decidir.length === 1 ? "colaborador quedó" : "colaboradores quedaron"} fuera del total porque
              el sistema no puede saber cuánto le toca —está justificada, o entró o salió a mitad
              del período—. <b>No es un error y no hay nada que arreglar</b>: al lado de cada una
              está el motivo y lo que le daría la quincena completa. Para sacar lo suyo, usa{" "}
              <b>Rango de fechas</b> aquí arriba.
            </p>
          )}
          {!!pendientes.length && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              <b>Falta un dato:</b> {pendientes.length}{" "}
              {pendientes.length === 1 ? "colaborador quedó" : "colaboradores quedaron"} fuera del total
              porque falta configurarles algo. <b>No valen $0</b> — se arreglan en la pestaña{" "}
              <b>{PESTANA_FICHAS}</b>.
            </p>
          )}
        </>
      )}

      {/* La fórmula se aprende UNA vez y no cambia ninguna decisión al abrir la
          pantalla: va al ⓘ. Todo lo de arriba —los avisos de plata— se queda
          en pantalla. */}
      {modal && data && (
        <ModalCierre
          modo={modal}
          empresa={data.empresaEtiqueta ?? etiquetaEmpresa(empresa)}
          rango={etiquetaRangoGuardado({ desde, hasta })}
          totales={data.totales}
          cerrada={cerrada}
          trabajando={trabajandoCierre}
          onConfirmar={(motivo) => { void (modal === "cerrar" ? cerrarQuincena() : reabrir(motivo)); }}
          onCerrar={() => { if (!trabajandoCierre) setModal(null); }}
        />
      )}

      {/* 🔴 BORRAR VA POR LA VENTANA ROJA DEL SISTEMA, con su segundo de espera:
          es la misma que usa todo lo destructivo del repo. ⚠️ NO se ofrece
          «Deshacer» de 5 s como en el resto: acá no hay nada que devolver — la
          fila y sus renglones se van de la base. Por eso el freno es ANTES. */}
      <ConfirmDeleteModal
        open={borrando && !!reabierta}
        title="¿Borrar esta planilla?"
        description={
          reabierta
            ? `Se va el cuadro del ${reabierta.etiqueta || etiquetaRangoGuardado(reabierta)}`
              + ` con sus ${reabierta.personas} ${reabierta.personas === 1 ? "renglón" : "renglones"}.`
              + " No se puede deshacer. Nadie deja de cobrar por esto: esa planilla estaba reabierta,"
              + " así que no le estaba pagando a nadie."
            : ""
        }
        loading={trabajandoCierre}
        confirmLabel="Borrar la planilla"
        loadingLabel="Borrando..."
        onConfirm={() => { void eliminar(); }}
        onCancel={() => { if (!trabajandoCierre) setBorrando(false); }}
      />

      <div className="-ml-2">
        <Ayuda titulo="Cómo se calcula el neto" etiqueta="Cómo se calcula el neto">
          <p>{FORMULA_NETO}</p>
          <p className="mt-1.5">
            Los recargos, los porcentajes de seguro y la hora de corte se cambian en{" "}
            <b>{PESTANA_FICHAS}</b>. El ISR y los otros servicios se escriben a mano aquí: no salen
            de ningún sistema. El préstamo, los terceros y la mercancía entran solos con la cuota
            de Préstamos, y también se pueden escribir a mano (0 = esta quincena no se descuenta).
          </p>
        </Ayuda>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LA VENTANA DE CERRAR / REABRIR
//
// 🔴 CONFIRMAR SOLO LO IRREVERSIBLE, y cerrar una quincena lo es: firma un pago
// y después hay que reabrir —con motivo y con nombre— para tocarlo. Generar no
// pregunta nada: no escribe.
//
// 🔴 Y LA CONFIRMACIÓN DICE QUÉ SE VA A CERRAR, con números: empresa, fechas,
// cuánta gente y el neto. Un «¿Estás seguro?» pelado no le da a nadie con qué
// darse cuenta de que tiene la empresa equivocada elegida.
//
// Patrón de la casa para iOS: `createPortal` + `inset-0` + `useBodyScrollLock`,
// y SIN `autoFocus` (en iPhone el teclado salta encima antes de que se lea).
// ─────────────────────────────────────────────────────────────────────────────

// 🔴 SE EXPORTA (19-sep-2026) para que el TABLERO de cierre de «Todas» muestre
// EXACTAMENTE esta ventana antes de cerrar una empresa. Es la pantalla donde se
// ven los números que se van a congelar: dos versiones de ella serían dos
// formas de mirar la misma plata antes de pagarla.
export function ModalCierre({
  modo, empresa, rango, totales, cerrada, trabajando, onConfirmar, onCerrar,
}: {
  modo: "cerrar" | "reabrir";
  empresa: string;
  rango: string;
  totales: TotalesPlanilla;
  /** El ajuste de la quincena anterior, para restarlo del neto que se congela. */
  cerrada: CabeceraGuardada | null;
  trabajando: boolean;
  onConfirmar: (motivo: string) => void;
  onCerrar: () => void;
}) {
  useBodyScrollLock(true);
  const [motivo, setMotivo] = useState("");
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const reabriendo = modo === "reabrir";
  // 🔴 La MISMA regla que la ruta y que el CHECK de la base: en blanco no vale,
  // y «   » tampoco. Tres capas, como el motivo de una corrección de marcación.
  const listo = reabriendo ? motivoReaperturaValido(motivo) !== null : true;

  if (!montado) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-medium text-gray-900">
              {reabriendo ? "Reabrir la quincena" : "Cerrar la quincena"}
            </h2>
            <p className="mt-0.5 text-[13px] text-gray-500">{empresa} · {rango}</p>
          </div>
          <button
            type="button" onClick={onCerrar} aria-label="Cerrar"
            className="-mr-2 -mt-1 min-h-[44px] min-w-[44px] text-2xl leading-none text-gray-400 transition hover:text-black"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {reabriendo ? (
            <>
              <p className="text-[13px] text-gray-600">
                {cerrada && (
                  <>La cerró <b>{cerrada.cerradaPor}</b> el {cuandoBonito(cerrada.cerradaEn)}, con un
                  neto de <b>${$(cerrada.totalNeto)}</b>. </>
                )}
                Reabrir <b>no borra nada</b>: ese cuadro se queda guardado con sus montos y su
                firma, y si se vuelve a cerrar nace una versión nueva.
              </p>
              <label className="block">
                <span className="text-[13px] font-medium text-gray-700">¿Por qué se reabre?</span>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={3}
                  placeholder="Faltó cargar la incapacidad de Briceida"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-base outline-none transition focus:border-black sm:text-sm"
                />
                <span className="mt-1 block text-[12px] text-gray-500">
                  Queda registrado con tu nombre. Es lo único que permite entender dentro de un mes
                  por qué los números de esta quincena cambiaron.
                </span>
              </label>
            </>
          ) : (
            <>
              {/* Los cuatro números, en una línea: es lo que deja darse cuenta
                  de que está elegida la empresa equivocada antes de firmar. */}
              <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] tabular-nums text-gray-700">
                Se congelan <b>{totales.personas} {totales.personas === 1 ? "colaborador" : "colaboradores"}</b>,
                con un <b>neto a pagar de ${$(totales.netoPagar)}</b> — bruto ${$(totales.totalBruto)},
                deducciones ${$(totales.totalDeducciones)}.
              </p>
              <p className="text-[13px] text-gray-600">
                Al cerrarla, <b>estos números quedan congelados</b>: aunque después alguien corrija
                una marcación o cambie un horario, lo que se pagó no cambia. Queda guardado con tu
                nombre y la fecha. Para corregirla hay que <b>reabrirla</b>, y reabrir pide un
                motivo por escrito.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button" onClick={onCerrar} disabled={trabajando}
            className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-40"
          >
            Mejor no
          </button>
          <button
            type="button"
            onClick={() => onConfirmar(motivo.trim())}
            disabled={!listo || trabajando}
            className="min-h-[44px] rounded-md bg-black px-4 text-sm font-medium text-white transition active:scale-[0.97] disabled:opacity-40"
          >
            {trabajando
              ? "Un momento…"
              : reabriendo ? "Reabrir la quincena" : "Cerrar quincena"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type OnGuardar = (codigo: string, campo: keyof ManualesLinea, valor: string) => void;

/**
 * 🔴 LO QUE LA CASILLA MUESTRA (11-sep-2026). «Préstamo», «Terceros» y —desde
 * el 14-sep-2026— «Mercancía» tienen TRES estados (`casilla-sin-descontar.ts`):
 * vacía → la cuota que entró sola (`prestamoAutomatico`, ya adentro de
 * `dinero`) · escrita → lo escrito, que manda · 0 a propósito → «0», y la
 * celda dice que esta quincena no se descuenta. Las otras dos son lo de
 * siempre. `null` = la casilla se ve vacía. Se lee de la LÍNEA, no de una
 * segunda cuenta. La mercancía entró acá sin código nuevo: `esCasillaAutomatica`
 * la reconoce y `prestamoAutomatico.mercancia` trae su cuota.
 */
function valorCasilla(l: LineaPlanilla, campo: keyof ManualesLinea): number | null {
  const escrito = l.manuales[campo];
  if (esCasillaAutomatica(campo)) {
    const estado = estadoCasilla(escrito);
    if (estado === "escrita") return escrito;
    // 🔑 El 0 se MUESTRA solo cuando había una cuota que saltar: un 0 sobre
    // alguien sin préstamo no decide nada, y se ve vacío como siempre.
    if (estado === "sin-descontar") return esSinDescontar(l, campo) ? 0 : null;
    const auto = l.prestamoAutomatico?.[campo] ?? 0;
    return auto > 0 ? auto : null;
  }
  return (escrito ?? 0) > 0 ? escrito : null;
}

/** ¿Este número lo puso el módulo de Préstamos, sin que nadie lo escribiera? */
function esAutomatica(l: LineaPlanilla, campo: keyof ManualesLinea): boolean {
  if (!esCasillaAutomatica(campo)) return false;
  if (estadoCasilla(l.manuales[campo]) !== "vacia") return false;
  return (l.prestamoAutomatico?.[campo] ?? 0) > 0;
}

/** ¿Tiene un 0 escrito a propósito Y había una cuota que saltar? */
function esSinDescontar(l: LineaPlanilla, campo: keyof ManualesLinea): boolean {
  if (!esCasillaAutomatica(campo)) return false;
  if (estadoCasilla(l.manuales[campo]) !== "sin-descontar") return false;
  return (l.prestamoAutomatico?.sinDescontar?.[campo] ?? 0) > 0;
}

/**
 * 🔴 ¿La cuota entró recortada porque el neto no alcanzaba? (14-sep-2026).
 * `null` = no. Se lee de la LÍNEA (`prestamoAutomatico.recortado`), no de una
 * segunda cuenta: la regla vive en `neto-no-negativo.ts`.
 */
function recorteDe(l: LineaPlanilla, campo: keyof ManualesLinea): { propuesto: number; descontado: number } | null {
  if (!esCasillaAutomatica(campo)) return null;
  return recorteDeCasilla(l, campo);
}

/**
 * 🔴 «Debe $254.50 · cuota $50.00» debajo de la casilla (15-sep-2026). Se lee
 * de la LÍNEA, y la línea solo lo trae con `PRESTAMO_AUTOMATICO` en `false`:
 * la decisión de mostrarlo vive en `prestamos-planilla.ts`, no acá.
 */
function deudaDe(l: LineaPlanilla, campo: keyof ManualesLinea): string | null {
  if (!esCasillaAutomatica(campo)) return null;
  return textoDeudaCasilla(l, campo);
}

/** Una celda de dinero que se escribe a mano. Guarda al salir del campo. */
function CeldaManual({
  codigo, campo, valor, onGuardar, ancho = "w-20", bloqueo, automatico = false, sinDescontar = false, recorte = null,
  avisoNeto, deuda = null,
}: {
  codigo: string; campo: keyof ManualesLinea;
  /** `null` = se ve vacía. `0` solo llega con `sinDescontar`. */
  valor: number | null; onGuardar: OnGuardar;
  ancho?: string;
  /** 🔴 Por qué está apagada. `null` = se puede escribir. */
  bloqueo?: Bloqueo;
  /** El número lo puso el módulo de Préstamos: se ve igual, y el `title` lo dice. */
  automatico?: boolean;
  /** 🔴 Hay un 0 escrito a propósito: se ve el 0 y, debajo, «No se descuenta esta quincena». */
  sinDescontar?: boolean;
  /**
   * 🔴 La cuota entró recortada porque el neto no alcanzaba (14-sep-2026): se
   * ve lo que SÍ entró y, debajo, «Se descontó $X de los $Y de cuota; el resto
   * queda debiendo». `null` = no hubo recorte.
   */
  recorte?: { propuesto: number; descontado: number } | null;
  /**
   * 🔴 ¿Lo que se está tecleando deja el neto en negativo? (14-sep-2026). Se
   * pregunta EN CADA TECLA, con el texto del campo, y la respuesta sale de
   * `avisoCeldaNeto` (`neto-no-negativo.ts`), la misma función que alimenta
   * «Antes de cerrar». Es un AVISO: la celda se marca y dice el máximo y lo que
   * quedaría, pero se sigue escribiendo y guardando — lo escrito a mano manda.
   */
  avisoNeto?: (texto: string) => AvisoCeldaNeto | null;
  /**
   * 🔴 «Debe $254.50 · cuota $50.00» — con el préstamo automático APAGADO
   * (15-sep-2026), la casilla arranca vacía y el dato se dice al lado: se le
   * quita al sistema la decisión, no la información. `null` = nada que decir.
   */
  deuda?: string | null;
}) {
  const bloqueada = !!bloqueo;
  // 🔑 Estado local mientras se escribe: si el valor viniera del padre en cada
  // tecla, el recargo de la fila pisaría lo que la persona está tecleando.
  // El 0 se muestra SOLO cuando es una decisión (`sinDescontar`); si no, vacío.
  const mostrar = (v: number | null) => (v === null || (v === 0 && !sinDescontar) ? "" : String(v));
  const [texto, setTexto] = useState(mostrar(valor));
  useEffect(() => { setTexto(mostrar(valor)); }, [valor, sinDescontar]); // eslint-disable-line react-hooks/exhaustive-deps
  // 🔴 Mientras se escribe, no solo al guardar: se calcula del texto vivo.
  const aviso = !bloqueada && avisoNeto ? avisoNeto(texto) : null;

  return (
    <>
      <input
        type="text" inputMode="decimal" value={bloqueada ? "" : texto}
        placeholder={bloqueo ? bloqueo.placeholder : "—"}
        disabled={bloqueada}
        aria-invalid={aviso ? true : undefined}
        title={bloqueo
          ? bloqueo.title
          : aviso
            ? TITULO_NETO_NEGATIVO
            : sinDescontar
            ? TITULO_SIN_DESCONTAR
            : recorte
              ? TITULO_RECORTE
              : automatico
                ? "Es la cuota que propone Préstamos. Escribe otro monto para corregirla en esta quincena, o 0 para no descontar."
                : undefined}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => onGuardar(codigo, campo, texto)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className={`${ancho} min-h-[44px] rounded border ${aviso ? "border-red-400 bg-red-50 focus:border-red-600" : "border-gray-200 bg-white focus:border-black"} px-1.5 text-right text-sm tabular-nums outline-none transition disabled:bg-gray-100 disabled:text-gray-400 disabled:placeholder:text-[10px]`}
      />
      {/* 🔴 EL NETO QUEDARÍA EN NEGATIVO: se dice al escribir, visible y en
          rojo, con el máximo que cabe. NUNCA bloquea (14-sep-2026). */}
      {aviso && (
        <span className="block text-right text-[11px] leading-tight text-red-700" data-testid="neto-negativo">
          {textoAvisoCeldaNeto(aviso)}
        </span>
      )}
      {/* 🔴 Se ve, no solo en el `title`: en el iPad no hay mouse. */}
      {sinDescontar && !bloqueada && (
        <span className="block text-right text-[11px] leading-tight text-gray-500" data-testid="sin-descontar">
          {TEXTO_SIN_DESCONTAR}
        </span>
      )}
      {/* 🔴 El recorte se DICE, visible y en ámbar: es plata que sigue
          debiéndose (14-sep-2026). */}
      {recorte && !bloqueada && (
        <span className="block text-right text-[11px] leading-tight text-amber-700" data-testid="cuota-recortada">
          {textoRecorteCelda(recorte)}
        </span>
      )}
      {/* 🔴 CUÁNTO DEBE Y CUÁL SERÍA SU CUOTA (15-sep-2026). Sale SOLO con el
          automático apagado: con el automático prendido la casilla ya trae la
          cuota y repetirla sería una palabra de más. */}
      {deuda && !bloqueada && (
        <span className="block text-right text-[11px] leading-tight text-gray-500" data-testid="deuda-casilla">
          {deuda}
        </span>
      )}
    </>
  );
}

function Fila({
  l, onGuardar, bloqueo, verAsistencia,
}: {
  l: LineaPlanilla & { diaLibre?: DiaLibreEnLinea };
  onGuardar: OnGuardar;
  bloqueo?: Bloqueo;
  /** 🔴 7a — la dirección de «ver su asistencia», con la MISMA quincena. */
  verAsistencia?: string | null;
}) {
  const d = l.dinero!;
  /** El monto sobre el que se calcularon los seguros, si no fue el bruto. */
  const sobreQueBase = baseSeguros(d.baseSeguros);
  const num = (v: number, extra = "", title?: string | null) => (
    <td className={`px-2 py-1.5 text-right tabular-nums ${extra}`} title={title ?? undefined}>
      {v === 0 ? <span className="text-gray-300">—</span> : $(v)}
    </td>
  );
  // 🔴 La celda que trae ajuste de la quincena anterior lo dice en su `title`
  // (11-sep-2026): «Incluye $5.00 de los días 14–15 sep…». Sin ajuste, nada.
  const conAjuste = (campo: Parameters<typeof notaCeldaAjuste>[0]) => notaCeldaAjuste(campo, l.ajusteDetalle);
  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50" data-fila-planilla={l.codigo}>
      <td className="group sticky left-0 z-10 bg-white px-3 py-1.5 text-gray-900 hover:bg-gray-50">
        {/* ══════════════════════════════════════════════════════════════════
            🔴 7a — EL NOMBRE LLEVA A SU ASISTENCIA (24-sep-2026)
            Daniel: *«al estar en Planilla… me gustaría que al hacer clic al
            colaborador me lleve de una a su Asistencia con la misma quincena
            seleccionada»*. 🩸 Hoy son cuatro toques y buscar entre 43 filas.
            🔑 El camino de vuelta ya existe: las pestañas visitadas quedan
            armadas, así que el Atrás devuelve la Planilla tal cual.
            ══════════════════════════════════════════════════════════════════ */}
        {verAsistencia ? (
          <Link href={verAsistencia} className="underline decoration-dotted underline-offset-2 hover:decoration-solid">
            {capitalizarNombre(l.etiqueta)}
          </Link>
        ) : capitalizarNombre(l.etiqueta)}
        <span className="ml-1.5 text-xs text-gray-400">{l.codigo}</span>
        {verAsistencia && (
          <span aria-hidden className="ml-1.5 hidden text-[11px] text-gray-400 group-hover:inline">
            {VER_SU_ASISTENCIA}
          </span>
        )}
        {/* 🔑 Sin esto, los ceros de ausencias, tardanzas y extras se leen como
            un error de cálculo. El chip dice que están en cero A PROPÓSITO. */}
        {l.noMarcaReloj && (
          <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
            {CHIP_NO_MARCA_RELOJ}
          </span>
        )}
        {/* 🔴 Trabaja afuera (14-sep-2026): un 0,00 de ausencias en alguien
            que casi no marca está en cero A PROPÓSITO. Sale de la ficha. */}
        {l.trabajaAfuera && (
          <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
            {CHIP_TRABAJA_AFUERA}
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
              + (l.parte.llevaHorasExtra ? " Las horas extra se pagan aquí." : " Las horas extra se pagan en la otra empresa.")}
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
        {/* 🔴 LOS MINUTOS DE EXTRA QUE NADIE APROBÓ PORQUE SON EL HORARIO. Sin
            el sello, ver horas extra pagadas sin aprobación se lee como un
            error del sistema — que es el susto que la regla existe para evitar. */}
        {!!l.horas.extraAutoMin && (
          <span
            className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500"
            title="La tienda cierra a las 7 p.m.: estos minutos se pagan sin aprobación. Lo que pasa de ahí sí se aprueba."
          >
            {textoExtraAutomatico(l.horas.extraAutoMin, l.empresaEtiqueta)}
          </span>
        )}
        {/* 🔴 EL PRORRATEO SE DICE AL LADO DEL NOMBRE (10-sep-2026): «entró el 27 de
            julio de 2026: 5 de 12 días hábiles». Sin esto, un quincenal más chico
            que el sueldo ÷ 2 se lee como un error. */}
        {l.prorrateo && (
          <span
            className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-800"
            title="Cobra los días trabajados: cada día hábil vale el sueldo mensual ÷ 26."
          >
            {l.prorrateo}
          </span>
        )}
        {/* 🔴 EL DÍA LIBRE DE LA EMPRESA (17-sep-2026). Sin esto, una columna de
            horas extra en cero —o más chica de lo que la contadora esperaba— se
            lee como un error del cuadro. El sello dice qué pasó: sus horas
            extra pagaron la deuda del día libre, y cuánto le queda. */}
        {l.diaLibre && (
          <span
            className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800"
            title={TITULO_DIA_LIBRE}
            data-testid="dia-libre-celda"
          >
            {textoDiaLibreCelda(l.diaLibre)}
          </span>
        )}
      </td>
      {num(d.salarioQuincenal)}
      {num(d.extraDiurno, "", conAjuste("extraDiurno"))}
      {/* 🔴 EL ASTERISCO NO ES ADORNO. En el escritorio esta celda es todo lo
          que la contadora ve de la ausencia, y desde el 25-ago-2026 puede traer
          minutos de alguien que VINO TODOS LOS DÍAS. Sin la marca, ella lee una
          ausencia donde sabe que la persona trabajó. El `title` da el detalle
          y el pie de la tabla explica qué significa el asterisco. */}
      <td className={`px-2 py-1.5 text-right tabular-nums text-red-700 ${d.ausencias === 0 ? "" : ""}`}>
        {d.ausencias === 0 ? <span className="text-gray-300">—</span> : (
          <span
            title={[
              d.ausenciaPorTardanza > 0
                ? `${$(d.ausenciaPorTardanza)} de estos ${$(d.ausencias)} son de ${l.horas.tardanzaGraveDias} día(s) en que llegó más de ${MINUTOS_TARDE_QUE_SON_AUSENCIA} minutos tarde. Se descuentan los minutos, igual que una tardanza.`
                : null,
              conAjuste("ausencias"),
            ].filter(Boolean).join(" ") || undefined}
          >
            {$(d.ausencias)}
            {d.ausenciaPorTardanza > 0 && <span className="ml-0.5 text-amber-700">*</span>}
          </span>
        )}
      </td>
      {num(d.tardanzas, "text-red-700", conAjuste("tardanzas"))}
      {num(d.salidaTemprana ?? 0, "text-red-700", conAjuste("salidaTemprana"))}
      {num(d.extraNocturno, "", conAjuste("extraNocturno"))}
      {num(d.excedente, "", conAjuste("excedente"))}
      {num(d.domingos, "", conAjuste("domingos"))}
      {num(d.feriados, "", conAjuste("feriados"))}
      {num(d.totalBruto, "font-semibold text-gray-900")}
      {num(d.seguroSocial)}
      {num(d.seguroEducativo)}
      {MANUALES.slice(0, 4).map(([campo]) => (
        <td key={campo} className="px-1 py-1.5 text-right">
          <CeldaManual codigo={l.codigo} campo={campo} valor={valorCasilla(l, campo)}
            onGuardar={onGuardar} bloqueo={bloqueo} automatico={esAutomatica(l, campo)}
            sinDescontar={esSinDescontar(l, campo)} recorte={recorteDe(l, campo)}
            deuda={deudaDe(l, campo)}
            avisoNeto={(t) => avisoCeldaNeto(l, campo, t)} />
        </td>
      ))}
      {num(d.totalDeducciones)}
      <td className="px-1 py-1.5 text-right">
        <CeldaManual codigo={l.codigo} campo="otrosServicios" valor={l.manuales.otrosServicios}
          onGuardar={onGuardar} bloqueo={bloqueo} avisoNeto={(t) => avisoCeldaNeto(l, "otrosServicios", t)} />
      </td>
      {/* 🔴 EL NETO ES `netoPagar` TAL CUAL: el ajuste de la quincena anterior
          ya viene adentro de `dinero` (11-sep-2026), la MISMA cuenta que el
          papel y el cierre. */}
      {num(d.netoPagar, "font-semibold text-gray-900")}
    </tr>
  );
}

function Tarjeta({
  l, abierta, onToggle, onGuardar, bloqueo, verAsistencia,
}: {
  l: LineaPlanilla; abierta: boolean; onToggle: () => void; onGuardar: OnGuardar;
  bloqueo?: Bloqueo;
  /** 🔴 7a — la dirección de su Asistencia, con la MISMA quincena. */
  verAsistencia?: string | null;
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
    <div className="rounded-lg border border-gray-200 bg-white" data-fila-planilla={l.codigo}>
      {/* 🔴 7a EN EL CELULAR: el enlace va DEBAJO del encabezado tocable, no
          adentro — un enlace dentro de un botón no es HTML válido y en iOS se
          pelean los dos toques. */}
      <button
        type="button" onClick={onToggle}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium text-gray-900">{capitalizarNombre(l.etiqueta)}</span>
          <span className="text-xs text-gray-400">
            {l.codigo} · bruto ${$(d.totalBruto)}
            {l.noMarcaReloj && ` · ${CHIP_NO_MARCA_RELOJ}`}
            {l.trabajaAfuera && ` · ${CHIP_TRABAJA_AFUERA}`}
            {/* El mismo sello que en el escritorio, con las MISMAS palabras. */}
            {l.parte && ` · ${CHIP_REPARTIDO}`}
            {/* El mismo sello que en el escritorio, y con las MISMAS palabras:
                dos redacciones del mismo hecho es la forma de que se separen. */}
            {sobreQueBaseTarjeta !== null && ` · ${chipBaseSeguros(sobreQueBaseTarjeta)}`}
            {!!l.horas.extraAutoMin && ` · ${textoExtraAutomatico(l.horas.extraAutoMin, l.empresaEtiqueta)}`}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-lg font-semibold tabular-nums text-gray-900">
            ${$(d.netoPagar)}
          </span>
          <span className="text-[11px] text-gray-400">{abierta ? "cerrar" : "ver detalle"}</span>
        </span>
      </button>

      {verAsistencia && (
        <p className="border-t border-gray-100 px-3 py-2">
          <Link href={verAsistencia} className="text-[13px] text-gray-600 underline decoration-dotted underline-offset-2">
            {VER_SU_ASISTENCIA}
          </Link>
        </p>
      )}
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
          {linea(`Salida temprana (${Math.round(h.salidaTempranaMin ?? 0)} min)`, d.salidaTemprana ?? 0, true)}
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
                  codigo={l.codigo} campo={campo} valor={valorCasilla(l, campo)}
                  onGuardar={onGuardar} ancho="w-full" bloqueo={bloqueo} automatico={esAutomatica(l, campo)}
                  sinDescontar={esSinDescontar(l, campo)} recorte={recorteDe(l, campo)}
                  deuda={deudaDe(l, campo)}
                  avisoNeto={(t) => avisoCeldaNeto(l, campo, t)}
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
          {/* 🔴 EL AJUSTE DE LA QUINCENA ANTERIOR ya está adentro de las líneas
              de arriba (11-sep-2026): extra en extra, tardanza en tardanza.
              Una línea gris dice cuáles y de qué días. Sin ajuste, nada. */}
          {notaAjuste([l]) && (
            <p className="mt-1 text-[12px] text-gray-500">{notaAjuste([l])}</p>
          )}

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
              cuadro, así que esas horas no se pagan aquí.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
