/* ─────────────────────────────────────────────────────────────────────────────
 * LA PLANILLA QUE SE CIERRA — la REGLA. Módulo PURO: sin base, sin red y sin el
 * reloj del sistema. Lo usan la ruta, el I/O y los tests, así que hay UNA sola
 * definición de qué se congela, de quién puede cerrar y de cuándo dos cuadros se
 * pisan.
 *
 * EL FLUJO, tal como lo aprobó Daniel:
 *
 *     elegir período → [Generar] → BORRADOR → revisar → [Cerrar quincena]
 *                                                   → CERRADA → [Reabrir] (con motivo)
 *
 * 🔑 «GENERAR» NO ES UNA TABLA, Y NO SE INVENTÓ UNA. Generar es pedirle el
 * cuadro a `/api/asistencia/planilla`, que es lo que la pantalla ya hace hoy;
 * BORRADOR es el estado de un período que todavía no tiene una fila cerrada.
 * Guardar además una copia del borrador habría estrenado un segundo lugar donde
 * vive «la planilla», con la garantía de que un día diga algo distinto del
 * cálculo — y ninguna de las decisiones de Daniel lo pide. Lo que se ESCRIBE es
 * el cierre.
 *
 * ── 🔴 QUÉ SIGNIFICA «CERRADA» ──────────────────────────────────────────────
 *
 * Que se escriben LOS NÚMEROS, uno por uno, y que después NADIE los vuelve a
 * calcular. Si mañana alguien corrige una marcación del 4 de agosto —y corregir
 * es un botón que todos los roles de Asistencia tienen desde el 13-ago— el
 * cuadro cerrado del 1 al 15 **no se mueve**: es lo que se pagó.
 *
 * 🩸 La alternativa que parece más limpia —guardar «la quincena quedó cerrada» y
 * recalcularla al abrirla— NO es congelar: es el sistema de hoy con una fecha al
 * lado. **Se guarda el RESULTADO, no la receta.** Es la misma lección que este
 * módulo ya pagó con las marcaciones del reloj: el dato que PRUEBA un pago no se
 * recalcula, se guarda.
 *
 * ── 🔴 VERSIONES, NO EDICIONES ──────────────────────────────────────────────
 *
 * Reabrir NO borra ni edita: la v1 se queda entera, con sus montos y su firma, y
 * el próximo cierre del mismo período nace como v2. Nunca se pierde lo que se
 * pagó.
 *
 * ── 🔴 SE CONGELA TODO, Y ESO INCLUYE LAS HORAS ─────────────────────────────
 *
 * Las 24 cifras de `DineroLinea` y las 20 de `HorasPersona`. Un neto sin sus
 * minutos de tardanza y sus ausencias es un número que nadie puede volver a
 * explicar tres meses después, que es justo cuando se lo van a pedir a la
 * contadora.
 *
 * 🔑 Y LOS DOS MAPAS DE ABAJO SON `Record<keyof …, string>` A PROPÓSITO: el día
 * que alguien agregue una columna a `DineroLinea` y no la agregue acá, **el
 * build se pone rojo**. Una lista suelta de strings se habría quedado vieja en
 * silencio y el campo nuevo no se guardaría — que es la forma exacta en que un
 * congelado deja de ser fiel sin que nadie se entere.
 * ────────────────────────────────────────────────────────────────────────── */

import {
  esFechaDeCalendario,
  fechaCorta,
  grupoDeLinea,
  type DineroLinea,
  type HorasPersona,
  type LineaPlanilla,
} from "./planilla";
import { EMPRESAS_ASISTENCIA } from "./config";
import { asistenciaRoles } from "./roles";
import { extrasNoAprobadas } from "./aprobaciones";
import { prestamosSinAprobar, type SugerenciaPrestamo } from "./prestamos-planilla";

// ─────────────────────────────────────────────────────────────────────────────
// LA MIGRACIÓN QUE FALTA CORRER
//
// Vive acá —en el módulo PURO— y no en el que habla con la base, por la misma
// razón que `TABLA_VACACIONES` vive en `config.ts`: es un TEXTO que la pantalla
// muestra, y hacer que un test tenga que levantar el cliente de Supabase para
// leer el nombre de un archivo es cómo se termina sin candado.
// ─────────────────────────────────────────────────────────────────────────────

/** El archivo que Daniel tiene que correr. Se le muestra tal cual al usuario. */
export const MIGRACION_PLANILLA_GUARDADA = "20260904120000_asistencia_planilla_guardada.sql";

/** El aviso que ve la gente. Sin jerga de base, y CON el nombre del archivo. */
export function avisoMigracionPlanillaGuardada(): string {
  return (
    "Todavía no se puede cerrar la quincena: falta preparar la base de datos. "
    + `Pídele a Daniel que corra el archivo ${MIGRACION_PLANILLA_GUARDADA} en Supabase. `
    + "Mientras tanto la planilla se calcula igual y se puede imprimir, pero el cierre no queda registrado."
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS ESTADOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `cerrando` → `cerrada` → `reabierta`.
 *
 * ⚠️ **NO existe un estado «pagada»** (decisión de Daniel) ni una fila para el
 * BORRADOR: un período sin fila cerrada ES el borrador, y eso lo contesta
 * `estadoDelCuadro`. Un estado que nadie usa es un estado que alguien va a
 * interpretar mal.
 *
 * 🩸 `cerrando` NO es un adorno. La cabecera y los renglones se escriben en DOS
 * viajes (PostgREST no da transacción), y una cabecera `cerrada` cuyos renglones
 * nunca llegaron se lee como **una planilla de $0 que alguien pagó**. Por eso la
 * cabecera nace en `cerrando` —invisible para todo el mundo, no estorba ningún
 * rango— y solo pasa a `cerrada` cuando sus renglones ya están escritos. Un
 * corte de luz en el medio deja basura inerte, no una mentira.
 */
export const ESTADOS_GUARDADO = ["cerrando", "cerrada", "reabierta"] as const;
export type EstadoGuardado = (typeof ESTADOS_GUARDADO)[number];

/** ¿Este cuadro es «lo que se pagó»? Solo uno de los tres estados lo es. */
export function esCerrada(estado: string): boolean {
  return estado === "cerrada";
}

/** Lo que la pantalla muestra de un período: o está cerrado, o es un borrador. */
export type EstadoDelCuadro = "borrador" | "cerrada";

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 QUIÉN PUEDE CERRAR — contabilidad y admin. La secretaria NO.
//
// Daniel: cerrar la quincena es la firma de un pago, y quien arma la planilla es
// la contadora. La secretaria puede generar el cuadro y mirarlo —eso ya lo hace
// hoy y no se le quita— pero no puede cerrarlo ni reabrirlo.
//
// ⚠️ SE DERIVA DE `ASISTENCIA_ROLES`, no se escribe suelta. Una cuarta lista de
// roles que haya que acordarse de tocar es exactamente el bug que `roles.ts`
// vino a matar (*«estaba escrita a mano en cada ruta … agregar un rol obliga a
// acordarse de todas»*). Y hay un test que fija el resultado EXACTO: si mañana
// entra un rol nuevo a Asistencia, el candado se pone rojo y alguien tiene que
// decidir si además cierra planillas — que es justo la decisión que no puede
// pasar en silencio.
// ─────────────────────────────────────────────────────────────────────────────

/** Entra a Asistencia, pero NO cierra la quincena. */
export const MIRAN_PERO_NO_CIERRAN = ["secretaria"] as const;

export function cerrarPlanillaRoles(): string[] {
  const noCierran = new Set<string>(MIRAN_PERO_NO_CIERRAN);
  return asistenciaRoles().filter((r) => !noCierran.has(r));
}

export function puedeCerrar(rol: string): boolean {
  return cerrarPlanillaRoles().includes(rol);
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS COLUMNAS QUE SE CONGELAN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las 24 cifras de dinero → su columna. El tipo `Record<keyof DineroLinea, …>`
 * es el candado: agregar un campo al cálculo y olvidarlo acá NO compila.
 */
export const COLUMNAS_DINERO: Record<keyof DineroLinea, string> = {
  rataHora: "rata_hora",
  valorMinuto: "valor_minuto",
  salarioQuincenal: "salario_quincenal",
  extraDiurno: "extra_diurno",
  extraNocturno: "extra_nocturno",
  excedente: "excedente",
  domingos: "domingos",
  feriados: "feriados",
  ausencias: "ausencias",
  ausenciaPorTardanza: "ausencia_por_tardanza",
  ausenciaDeDiaCompleto: "ausencia_de_dia_completo",
  vacacionesYaPagadas: "vacaciones_ya_pagadas",
  tardanzas: "tardanzas",
  totalBruto: "total_bruto",
  baseSeguros: "base_seguros",
  seguroSocial: "seguro_social",
  seguroEducativo: "seguro_educativo",
  isr: "isr",
  prestamo: "prestamo",
  terceros: "terceros",
  mercancia: "mercancia",
  totalDeducciones: "total_deducciones",
  otrosServicios: "otros_servicios",
  netoPagar: "neto_pagar",
};

/**
 * Las 20 columnas del reloj → su columna. Mismo candado de tipo.
 *
 * ⚠️ `extraNoAprobadaDiurnoMin` / `extraNoAprobadaNocturnoMin` (3-sep-2026) se
 * EXCLUYEN a propósito y por nombre: son el desglose de `extraNoAprobadaMin`
 * —que sí se congela— y existen para VALUAR el aviso ámbar en el momento, no
 * para leerse después. La tabla guardada sigue con sus 20 columnas. Si algún
 * día se quieren congelar, es una migración y dos filas acá, no un `Partial`.
 */
export const COLUMNAS_HORAS: Record<
  Exclude<keyof HorasPersona, "extraNoAprobadaDiurnoMin" | "extraNoAprobadaNocturnoMin">,
  string
> = {
  extraDiurnoMin: "extra_diurno_min",
  extraNocturnoMin: "extra_nocturno_min",
  extraNoAprobadaMin: "extra_no_aprobada_min",
  excedenteMin: "excedente_min",
  domingoMin: "domingo_min",
  feriadoMin: "feriado_min",
  tardanzaMin: "tardanza_min",
  tardanzaGraveMin: "tardanza_grave_min",
  tardanzaGraveDias: "tardanza_grave_dias",
  ausenciaMin: "ausencia_min",
  ausenciaDias: "ausencia_dias",
  ausenciaJustificadaDias: "ausencia_justificada_dias",
  vacacionesYaPagadasMin: "vacaciones_ya_pagadas_min",
  vacacionesYaPagadasDias: "vacaciones_ya_pagadas_dias",
  vacacionesDias: "vacaciones_dias",
  sabadoMin: "sabado_min",
  diasTrabajados: "dias_trabajados",
  diasARevisar: "dias_a_revisar",
  tardanzaDeDiasARevisarMin: "tardanza_de_dias_a_revisar_min",
  jornadaDiariaMin: "jornada_diaria_min",
};

export type FilaLineaGuardada = Record<string, unknown>;

/**
 * Una `LineaPlanilla` → la fila que se escribe. PURA: no mira la base ni el
 * reloj del sistema.
 *
 * 🔴 EL BLOQUE DE DINERO VA EN `null` CUANDO NO HUBO PAGO, nunca en 0. Un 0
 * dice «se le pagó cero»; `null` dice «el sistema se abstuvo». Esa diferencia es
 * media pantalla de este módulo (servicio profesional, «Tú decides», «falta un
 * dato») y perderla al congelar sería tirar la parte que hay que explicar.
 */
export function filaDeLinea(planillaId: string, empresa: string, l: LineaPlanilla): FilaLineaGuardada {
  const fila: FilaLineaGuardada = {
    planilla_id: planillaId,
    empleado_codigo: l.codigo,
    nombre: l.nombre,
    // La empresa de la LÍNEA, no la de la ficha: en un sueldo repartido la parte
    // pertenece a la empresa del cuadro.
    empresa: l.empresa ?? empresa,
    salario_mensual: l.salarioMensual,
    jornada_semanal: l.jornadaSemanal,
    grupo: grupoDeLinea(l),
    falta_configurar: l.faltaConfigurar,
    decidir_a_mano: l.decidirAMano,
    fuera_de_planilla: l.fueraDePlanilla,
    paga_seguros: l.pagaSeguros,
    no_marca_reloj: l.noMarcaReloj,
    quincenal_referencia: l.quincenalReferencia,
    parte_salario_mensual: l.parte ? l.parte.salarioMensual : null,
    parte_paga_horas_extra: l.parte ? l.parte.llevaHorasExtra : null,
    extra_medido_min: l.extraMedido ? l.extraMedido.minutos : null,
    // 🔑 Lo que quedó SIN aprobar ya viaja en `extra_no_aprobada_min` (columna
    // del reloj, abajo). El freno de `frenosParaCerrar` garantiza que un cuadro
    // cerrado no tenga ni un minuto ahí — salvo que se haya cerrado antes del
    // 3-sep-2026, cuando el freno leía el campo equivocado y nunca frenó.
    extra_aprobada: l.extraAprobada,
  };

  for (const [campo, col] of Object.entries(COLUMNAS_HORAS)) {
    fila[col] = l.horas[campo as keyof typeof COLUMNAS_HORAS];
  }
  for (const [campo, col] of Object.entries(COLUMNAS_DINERO)) {
    fila[col] = l.dinero ? l.dinero[campo as keyof DineroLinea] : null;
  }
  return fila;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL TESTIGO DE LA CABECERA
// ─────────────────────────────────────────────────────────────────────────────

export interface TotalesGuardados {
  /** Cuántos renglones se congelaron. TODOS, no solo los que pagaron. */
  personas: number;
  totalBruto: number;
  totalDeducciones: number;
  totalNeto: number;
}

/**
 * Los totales del cuadro, sacados de los MISMOS renglones que se van a escribir.
 *
 * 🔑 No es una segunda cuenta: es un TESTIGO. Sirve para leer un cierre sin
 * traerse los 40 renglones y —sobre todo— para poder DENUNCIAR una deriva:
 * sumar las filas guardadas y no dar este número es una alarma.
 */
export function totalesDe(lineas: readonly LineaPlanilla[]): TotalesGuardados {
  let totalBruto = 0;
  let totalDeducciones = 0;
  let totalNeto = 0;
  for (const l of lineas) {
    if (!l.dinero) continue;
    totalBruto += l.dinero.totalBruto;
    totalDeducciones += l.dinero.totalDeducciones;
    totalNeto += l.dinero.netoPagar;
  }
  const c = (n: number) => Math.round(n * 100) / 100;
  return {
    personas: lineas.length,
    totalBruto: c(totalBruto),
    totalDeducciones: c(totalDeducciones),
    totalNeto: c(totalNeto),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL SOLAPAMIENTO — una persona no puede quedar pagada dos veces por el
//    mismo día
//
// El caso que hay que resolver: alguien cierra «1 al 15» y después «10 al 20».
// Los días 10 a 15 quedarían pagados DOS VECES, en dos cuadros congelados que
// los dos dicen ser «lo que se pagó» — y ninguno de los dos se ve mal por
// separado, así que no hay forma de encontrarlo mirando.
//
// LA DECISIÓN: se RECHAZA el segundo cierre, se dice CUÁL cuadro estorba —con
// sus fechas, quién lo cerró y cuándo— y el camino es reabrir aquel. Las tres
// alternativas se descartaron a propósito:
//
//   · recortar el rango automáticamente → el sistema decide un pago;
//   · fusionar los dos cuadros          → inventa un cuadro que nadie revisó;
//   · cerrar igual y avisar             → el aviso se lee una vez, el doble
//                                         pago se queda para siempre.
//
// Es la MISMA regla que el módulo ya aplica en todos lados: cuando el sistema
// no puede saber, se abstiene y lo decide una persona.
//
// ⚠️ EL ALCANCE ES POR EMPRESA, y eso es deliberado. Dos cuadros de EMPRESAS
// distintas con días en común son correctos: son otras personas y otra planilla
// (las tres empresas comparten un solo reloj, no una planilla). La única persona
// que sale en dos empresas a la vez es la del sueldo REPARTIDO —Julio Garay,
// Vistana + Fashion Wear— y ahí cada empresa paga SU parte: montos disjuntos por
// construcción, no el mismo día cobrado dos veces.
//
// ⚠️ Y solo estorban las `cerrada`. Una `reabierta` ya no es «lo que se pagó»,
// así que dejar de estorbar es exactamente lo que reabrir tiene que hacer.
// ─────────────────────────────────────────────────────────────────────────────

export interface RangoGuardado {
  desde: string;
  hasta: string;
}

/** Dos rangos de días, ambos extremos INCLUIDOS, se pisan. */
export function seSolapan(a: RangoGuardado, b: RangoGuardado): boolean {
  // Comparación de texto: `YYYY-MM-DD` ordena igual como fecha que como string,
  // y así no hay una zona horaria de por medio. Panamá ya costó dos bugs acá.
  return a.desde <= b.hasta && b.desde <= a.hasta;
}

export interface CabeceraGuardada {
  id: string;
  empresa: string;
  desde: string;
  hasta: string;
  quincena: string | null;
  /** La etiqueta que lee una persona: «1 ago 2026 al 15 ago 2026». */
  etiqueta: string;
  version: number;
  estado: EstadoGuardado;
  cerradaPor: string;
  cerradaEn: string;
  reabiertaPor: string | null;
  reabiertaEn: string | null;
  motivoReabrir: string | null;
  personas: number;
  totalBruto: number;
  totalDeducciones: number;
  totalNeto: number;
  factorBase: number;
}

/** La etiqueta de un rango, como la lee una persona. */
export function etiquetaRango(r: RangoGuardado): string {
  return `${fechaCorta(r.desde)} al ${fechaCorta(r.hasta)}`;
}

/**
 * Los cuadros VIVOS de esa empresa que pisan este rango. Vacío = se puede
 * cerrar.
 *
 * 🔴 La empresa se compara acá también, y no solo en la consulta: un llamador
 * que se olvide del `.eq("empresa", …)` no puede convertir esto en «nadie se
 * pisa» ni en «se pisan todos».
 */
export function solapadasDe(
  empresa: string,
  rango: RangoGuardado,
  guardadas: readonly CabeceraGuardada[],
): CabeceraGuardada[] {
  return guardadas.filter(
    (g) => g.empresa === empresa && esCerrada(g.estado) && seSolapan(rango, g),
  );
}

/**
 * El texto que ve la contadora cuando su rango pisa uno ya cerrado.
 *
 * 🔴 NOMBRA la quincena que choca. «Rango inválido» la deja adivinando cuál de
 * los cierres viejos es, y con doce por año eso es una búsqueda a mano.
 */
export function textoSolapamiento(solapadas: readonly CabeceraGuardada[]): string {
  const cuales = solapadas
    .map((s) => `${s.etiqueta || etiquetaRango(s)} (cerrada por ${s.cerradaPor})`)
    .join(" · ");
  const plural = solapadas.length === 1 ? "una quincena ya cerrada" : `${solapadas.length} quincenas ya cerradas`;
  return (
    `Estas fechas se pisan con ${plural}: ${cuales}. `
    + "Una persona no puede quedar pagada dos veces por el mismo día. "
    + "Si hay que rehacerla, primero reabre la que ya está cerrada."
  );
}

/** ¿Este período está cerrado, o es todavía un borrador? */
export function estadoDelCuadro(
  empresa: string,
  rango: RangoGuardado,
  guardadas: readonly CabeceraGuardada[],
): EstadoDelCuadro {
  return solapadasDe(empresa, rango, guardadas).length > 0 ? "cerrada" : "borrador";
}

/**
 * La versión que le toca al próximo cierre de ESE rango exacto.
 *
 * 🔴 Cuenta TODAS las filas del rango, no solo las vivas: la v1 reabierta se
 * queda para siempre y la que nace es la v2. Reusar el número haría que dos
 * cuadros distintos se llamen igual, que es la forma de que alguien mire el
 * viejo creyendo que mira el nuevo.
 */
export function versionSiguiente(
  empresa: string,
  rango: RangoGuardado,
  guardadas: readonly CabeceraGuardada[],
): number {
  let mayor = 0;
  for (const g of guardadas) {
    if (g.empresa !== empresa || g.desde !== rango.desde || g.hasta !== rango.hasta) continue;
    if (g.version > mayor) mayor = g.version;
  }
  return mayor + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LOS FRENOS DEL CIERRE — lo que hoy es un aviso ámbar, al cerrar es un NO
//
// Daniel: si quedan horas extra o préstamos SIN APROBAR, no deja cerrar. No es
// un aviso: es un freno.
//
// 🔑 POR QUÉ CAMBIA DE FUERZA. Mientras el cuadro es un BORRADOR, avisar alcanza
// —la contadora está revisando y puede ir a aprobar—. Al CERRAR, el aviso ya no
// sirve para nada: lo que queda escrito es un pago sin las horas que alguien
// trabajó de verdad, y la persona lo reclama con razón. La única forma de que la
// aprobación signifique algo es que el cierre no pueda pasarle por encima.
//
// ⚠️ NO se «aprueba solo» para destrabar el cierre, y no se ofrece un botón de
// «cerrar igual». Aprobar horas extra es una decisión de una persona (Julio, la
// contadora, Daniel) y el sistema no la toma por nadie.
//
// El texto dice QUÉ pasó · A QUIÉN · Y QUÉ HACER, con la pestaña por su nombre:
// un 409 que diga «hay pendientes» manda a la contadora a buscar dónde.
// ─────────────────────────────────────────────────────────────────────────────

export interface FrenoCierre {
  tipo: "horas-extra" | "prestamo";
  /** Cuántas personas. Es lo que se cuenta en el texto. */
  personas: number;
  /** Los nombres, para que el freno se pueda actuar sin abrir nada. */
  quienes: string[];
  texto: string;
}

const plata = (n: number): string => `$${n.toFixed(2)}`;
const lista = (xs: readonly string[]): string =>
  xs.length <= 4 ? xs.join(", ") : `${xs.slice(0, 4).join(", ")} y ${xs.length - 4} más`;

/**
 * Lo que impide cerrar. Vacío = se puede.
 *
 * Las dos fuentes son las MISMAS funciones que ya arman los avisos ámbar de la
 * pantalla (`extrasNoAprobadas`, `prestamosSinAprobar`): que el freno y el aviso
 * puedan decir cosas distintas del mismo hecho es exactamente lo que este módulo
 * viene evitando desde `minutosTardanzaMostrados`.
 */
export function frenosParaCerrar(
  lineas: readonly LineaPlanilla[],
  prestamos: readonly SugerenciaPrestamo[],
): FrenoCierre[] {
  const frenos: FrenoCierre[] = [];

  const extras = extrasNoAprobadas(lineas);
  if (extras.length > 0) {
    const quienes = extras.map((e) => e.etiqueta);
    frenos.push({
      tipo: "horas-extra",
      personas: extras.length,
      quienes,
      texto:
        `${extras.length === 1 ? "1 persona tiene" : `${extras.length} personas tienen`} horas extra sin aprobar `
        + `(${lista(extras.map((e) => `${e.etiqueta} · ${e.minutos.toFixed(2)} min`))}). `
        + "Ve a la pestaña «Aprobaciones», aprueba o deja sin aprobar esas horas, y vuelve a cerrar. "
        + "Si se cierra así, esas horas no se pagan y no hay forma de arreglarlo después sin reabrir.",
    });
  }

  const pres = prestamosSinAprobar(prestamos);
  if (pres.length > 0) {
    const quienes = pres.map((p) => p.etiqueta);
    frenos.push({
      tipo: "prestamo",
      personas: pres.length,
      quienes,
      texto:
        `${pres.length === 1 ? "1 persona tiene" : `${pres.length} personas tienen`} un descuento de préstamo sin aprobar `
        + `(${lista(pres.map((p) => `${p.etiqueta} · ${plata(p.sugerido)}`))}). `
        + "Apruébalo (o déjalo en cero) en el bloque «Préstamo por descontar» de esta misma pestaña, y vuelve a cerrar.",
    });
  }

  return frenos;
}

/** El mensaje único del 409. */
export function textoFrenos(frenos: readonly FrenoCierre[]): string {
  return `No se puede cerrar la quincena todavía. ${frenos.map((f) => f.texto).join(" ")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDACIÓN DE LO QUE LLEGA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 Tope de días: el MISMO que la ruta que calcula (366). Un rango de diez años
 * es una forma de tumbar la base desde la barra de direcciones, y acá además
 * escribiría miles de filas.
 */
export const MAX_DIAS_GUARDADO = 366;

export type Validacion = { ok: true; empresa: string; desde: string; hasta: string } | { ok: false; error: string };

/** ¿Se puede cerrar esto? Convierte y decide acá, nunca el llamador. */
export function validarGuardado(empresaRaw: unknown, desdeRaw: unknown, hastaRaw: unknown): Validacion {
  const empresa = typeof empresaRaw === "string" ? empresaRaw.trim() : "";
  if (!(EMPRESAS_ASISTENCIA as readonly string[]).includes(empresa)) {
    // 🔴 La empresa NO es opcional. Sin ella el cuadro sería de las tres a la
    // vez —el reloj es uno solo— y ni el solapamiento ni el pago tendrían dueño.
    return { ok: false, error: "Elige una empresa para cerrar la quincena." };
  }
  const desde = typeof desdeRaw === "string" ? desdeRaw.trim() : "";
  const hasta = typeof hastaRaw === "string" ? hastaRaw.trim() : "";
  if (!esFechaDeCalendario(desde) || !esFechaDeCalendario(hasta)) {
    return { ok: false, error: "Las fechas no sirven." };
  }
  if (hasta < desde) {
    return { ok: false, error: "La fecha de fin es anterior a la de inicio." };
  }
  const dias = Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000) + 1;
  if (dias > MAX_DIAS_GUARDADO) {
    return { ok: false, error: `El rango no puede pasar de ${MAX_DIAS_GUARDADO} días.` };
  }
  return { ok: true, empresa, desde, hasta };
}

/**
 * 🔴 EL MOTIVO DE LA REAPERTURA ES OBLIGATORIO, igual que el de una corrección
 * de marcación. Reabrir un cierre es tocar un pago ya firmado: sin el porqué
 * escrito, dentro de un mes nadie puede reconstruir por qué los números de esa
 * quincena cambiaron.
 *
 * ⚠️ `NOT NULL` a secas deja pasar `""` y `"   "`, que es justo lo que teclea
 * quien quiere saltarse el campo. Por eso se valida acá, en la ruta y en el
 * CHECK de la base — las mismas tres capas que el motivo de una corrección.
 */
export function motivoReaperturaValido(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
}
