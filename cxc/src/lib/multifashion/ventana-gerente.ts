// ─────────────────────────────────────────────────────────────────────────────
// VENTANA DE DATOS DEL ROL `gerente_acs` (Jennifer) — Multifashion.
//
// Decisión de Daniel (cerrada): Jennifer ve el MES EN CURSO y la comparación
// contra el MISMO MES DEL AÑO PASADO. Nada más — no el historial completo.
//
// Y se impone del lado del SERVIDOR. Esconder selectores en la UI NO es un
// candado: el patrón ya falló antes en Catálogos (un `allowedRoles` decorativo
// mientras cualquiera con el módulo entraba por URL — ver CLAUDE.md, sección
// Catálogos). Cualquiera con la cookie de Jennifer puede llamar
// /api/multifashion/* a mano con los parámetros que quiera; por eso los
// parámetros de fecha se ACOTAN (clamp) acá, en cada ruta, antes de tocar la DB.
//
// Este módulo es PURO: recibe `ahora: Date` explícito, no lee `new Date()` por
// su cuenta y no toca base ni red. Así se testea con fechas FIJAS.
//
// ── ZONA HORARIA ────────────────────────────────────────────────────────────
// Panamá es UTC-5 FIJO, sin horario de verano (verificado fila por fila contra
// la tzdb en las 52.269 facturas: 0 discrepancias — ver CLAUDE.md § Base de
// datos). El "mes en curso" es el mes del calendario PANAMEÑO: el 1 de agosto a
// las 02:00 UTC en Panamá todavía es 31 de julio. Calcularlo en UTC pelado le
// haría perder a Jennifer el último día de cada mes.
// ─────────────────────────────────────────────────────────────────────────────

/** Único rol con la ventana acotada. Si mañana hay otro, se agrega acá. */
export const ROL_VENTANA_ACOTADA = "gerente_acs";

/** Panamá = UTC-5 fijo, todo el año. */
const PANAMA_OFFSET_MS = 5 * 60 * 60 * 1000;

const MS_DIA = 86_400_000;

export interface RangoIso {
  /** YYYY-MM-DD, inclusivo. */
  inicio: string;
  /** YYYY-MM-DD, inclusivo. */
  fin: string;
}

export interface VentanaGerente {
  /** Día de hoy en Panamá (YYYY-MM-DD). */
  hoy: string;
  /** Año calendario en curso en Panamá. */
  anio: number;
  /** Mes en curso en Panamá (1..12). */
  mes: number;
  /** Año anterior — el de la comparación. */
  anioAnterior: number;
  /** Mes en curso: del 1 hasta HOY (no se pide futuro). */
  actual: RangoIso;
  /** Mismo mes del año pasado, mes COMPLETO (ya cerrado). */
  anterior: RangoIso;
}

export function esRolAcotado(role: string | null | undefined): boolean {
  return role === ROL_VENTANA_ACOTADA;
}

/** Fecha de calendario en Panamá (UTC-5 fijo) para un instante dado. */
export function fechaPanama(ahora: Date): string {
  return new Date(ahora.getTime() - PANAMA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Último día del mes (1..31). Aritmética pura en UTC, sin zona horaria local. */
export function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

const dd = (n: number): string => String(n).padStart(2, "0");

const iso = (anio: number, mes: number, dia: number): string =>
  `${anio}-${dd(mes)}-${dd(dia)}`;

/** Los dos meses que Jennifer puede ver, derivados del calendario de Panamá. */
export function ventanaGerente(ahora: Date): VentanaGerente {
  const hoy = fechaPanama(ahora);
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  const anioAnterior = anio - 1;

  return {
    hoy,
    anio,
    mes,
    anioAnterior,
    actual: { inicio: iso(anio, mes, 1), fin: hoy },
    anterior: {
      inicio: iso(anioAnterior, mes, 1),
      fin: iso(anioAnterior, mes, ultimoDiaDelMes(anioAnterior, mes)),
    },
  };
}

/** Los dos únicos años pedibles: el actual y el de la comparación. */
export function aniosPermitidos(v: VentanaGerente): number[] {
  return [v.anioAnterior, v.anio];
}

/** ¿La fecha (YYYY-MM-DD) cae dentro de alguno de los dos meses permitidos? */
export function dentroDeVentana(fecha: string, v: VentanaGerente): boolean {
  return (
    (fecha >= v.actual.inicio && fecha <= v.actual.fin) ||
    (fecha >= v.anterior.inicio && fecha <= v.anterior.fin)
  );
}

// ── Clamps por forma de parámetro ────────────────────────────────────────────
// Todos comparten el mismo contrato: si el rol NO es el acotado, devuelven la
// entrada intacta (`ajustado: false`). Un admin no cambia en NADA.

export interface ClampAnioMes {
  year: number;
  /** `null` solo puede sobrevivir para roles sin acotar. */
  mes: number | null;
  ajustado: boolean;
}

/**
 * Rutas con parámetros `year` + `mes` (overview, detalle-mensual, bonos).
 * Para el rol acotado: el año queda en {actual, anterior} y el mes SIEMPRE es
 * el mes en curso. `mes = null` (que el RPC interpreta como "último mes
 * elegible") también se cierra al mes en curso: si no, es un bypass.
 */
export function clampAnioMes(
  role: string | null | undefined,
  entrada: { year: number; mes: number | null },
  ahora: Date,
): ClampAnioMes {
  if (!esRolAcotado(role)) {
    return { year: entrada.year, mes: entrada.mes, ajustado: false };
  }
  const v = ventanaGerente(ahora);
  const year = entrada.year === v.anio || entrada.year === v.anioAnterior ? entrada.year : v.anio;
  return { year, mes: v.mes, ajustado: year !== entrada.year || entrada.mes !== v.mes };
}

const aDia = (isoDate: string): number =>
  Date.UTC(Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)) - 1, Number(isoDate.slice(8, 10))) / MS_DIA;

/** Días de solape entre dos rangos inclusivos (0 si no se tocan). */
function solapeDias(a: RangoIso, b: RangoIso): number {
  const desde = Math.max(aDia(a.inicio), aDia(b.inicio));
  const hasta = Math.min(aDia(a.fin), aDia(b.fin));
  return Math.max(0, hasta - desde + 1);
}

export interface ClampRango extends RangoIso {
  ajustado: boolean;
}

/**
 * Rutas con rango libre `fecha_inicio` / `fecha_fin` (clientes-wholesale,
 * retail-recurrentes).
 *
 * La ventana permitida son DOS meses DISJUNTOS, así que no se puede acotar a un
 * intervalo continuo: de jul-2025 a jul-2026 dejaría pasar los 11 meses del
 * medio, que es justo lo que no se quiere.
 *
 * Regla (elegida por predecible, no por sofisticada):
 *   · si el rango pedido toca el mes en curso → se intersecta con el mes en curso;
 *   · si no lo toca pero toca el mismo mes del año pasado → se intersecta con ese;
 *   · si no toca ninguno → mes en curso completo.
 * Así "dame todo el histórico" devuelve el mes en curso, y solo un pedido que
 * apunta EXCLUSIVAMENTE al año pasado cae en la ventana de comparación.
 */
export function clampRangoFechas(
  role: string | null | undefined,
  entrada: RangoIso,
  ahora: Date,
): ClampRango {
  if (!esRolAcotado(role)) {
    return { inicio: entrada.inicio, fin: entrada.fin, ajustado: false };
  }
  const v = ventanaGerente(ahora);
  const destino =
    solapeDias(entrada, v.actual) > 0
      ? v.actual
      : solapeDias(entrada, v.anterior) > 0
        ? v.anterior
        : v.actual;

  const inicio = entrada.inicio > destino.inicio ? entrada.inicio : destino.inicio;
  const fin = entrada.fin < destino.fin ? entrada.fin : destino.fin;
  // Si no solapaba con ninguno, la intersección sale invertida → ventana entera.
  if (inicio > fin) {
    return { inicio: destino.inicio, fin: destino.fin, ajustado: true };
  }

  return { inicio, fin, ajustado: inicio !== entrada.inicio || fin !== entrada.fin };
}

export interface ClampDia {
  fecha: string;
  ajustado: boolean;
}

/** Rutas con un día suelto (`fecha=YYYY-MM-DD`): caja. Fuera de ventana → hoy. */
export function clampFechaDia(
  role: string | null | undefined,
  fecha: string,
  ahora: Date,
): ClampDia {
  if (!esRolAcotado(role)) return { fecha, ajustado: false };
  const v = ventanaGerente(ahora);
  if (dentroDeVentana(fecha, v)) return { fecha, ajustado: false };
  return { fecha: v.hoy, ajustado: true };
}

/**
 * Día suelto que se usa sólo como COMPARACIÓN (la tarjeta "HOY": el mismo día
 * de la semana pasada, y ayer). Fuera de la ventana devuelve `null` → la ruta
 * no lo consulta y la pantalla se dibuja sin ese comparativo.
 *
 * 🩸 NO se puede reusar `clampFechaDia` acá: ése empuja el día fuera de rango
 * hacia HOY, y para un comparativo eso sería comparar hoy contra hoy — un
 * "0%" perfectamente falso, que es peor que no mostrar nada. Un comparativo que
 * no se puede ver simplemente NO SE MUESTRA.
 *
 * En la práctica le pega a Jennifer los primeros días de cada mes: el 3 de
 * agosto, "la semana pasada" es el 27 de julio y "ayer" es el 2 de agosto — el
 * primero cae fuera de su ventana y el segundo adentro. Es exactamente lo que
 * significa la ventana que pidió Daniel; el resto del mes los dos entran.
 */
export function clampDiaComparable(
  role: string | null | undefined,
  fecha: string,
  ahora: Date,
): string | null {
  if (!esRolAcotado(role)) return fecha;
  return dentroDeVentana(fecha, ventanaGerente(ahora)) ? fecha : null;
}

export type PeriodoProductos = "mes" | "12m";

export interface ClampProductos {
  periodo: PeriodoProductos;
  year: number;
  mes: number | null;
  ajustado: boolean;
}

/**
 * Ranking de productos: además del mes, acepta una ventana de 12 meses — que
 * cae ENTERA fuera de lo que Jennifer puede ver. Para el rol acotado se fuerza
 * `periodo='mes'` con el mes en curso, exactamente como `clampPeriodoVendedoras`
 * aplasta trimestre/YTD/rolling.
 *
 * 🩸 Sin esto, `?periodo=12m` sería un bypass de UNA palabra: la ruta no mira
 * `year`/`mes` cuando el período es 12m, así que acotar solo esos dos no cierra
 * nada. Es el mismo agujero que tendría esconder la píldora en la UI.
 */
export function clampPeriodoProductos(
  role: string | null | undefined,
  entrada: { periodo: PeriodoProductos; year: number; mes: number | null },
  ahora: Date,
): ClampProductos {
  if (!esRolAcotado(role)) {
    return { ...entrada, ajustado: false };
  }
  const { year, mes } = clampAnioMes(role, { year: entrada.year, mes: entrada.mes }, ahora);
  return {
    periodo: "mes",
    year,
    mes,
    ajustado: entrada.periodo !== "mes" || year !== entrada.year || entrada.mes !== mes,
  };
}

/**
 * Rango de COMPARACIÓN de Productos ("qué cambió contra el año pasado").
 *
 * Es un período NUEVO, y por eso pasa por acá: la ventana de Jennifer se cierra
 * en el servidor rango por rango, no "por ruta". Devuelve `null` cuando el rango
 * no cabe entero dentro de UNO de los dos meses permitidos → la ruta no lo
 * consulta y la pantalla se dibuja sin comparación.
 *
 * En la práctica, para el rol acotado el rango pedido SIEMPRE es el mismo mes
 * del año pasado —que es justo la mitad de su ventana—, así que Jennifer sí ve
 * su comparación. Este guard existe para que eso siga siendo cierto el día que
 * alguien cambie `rangoComparativo`: si el período de comparación se moviera a
 * un mes que ella no puede ver, se apaga solo en vez de convertirse en fuga.
 *
 * 🩸 Se exige que quepa en UN mes, no que sus dos puntas estén "dentro de la
 * ventana": la ventana son dos meses DISJUNTOS, así que un rango que arrancara
 * en el mes de comparación y terminara en el mes en curso tendría las dos
 * puntas válidas y los once meses del medio adentro.
 */
export function clampRangoComparativo(
  role: string | null | undefined,
  rango: RangoIso,
  ahora: Date,
): RangoIso | null {
  if (!esRolAcotado(role)) return rango;
  const v = ventanaGerente(ahora);
  const cabeEn = (w: RangoIso) => rango.inicio >= w.inicio && rango.fin <= w.fin;
  return cabeEn(v.actual) || cabeEn(v.anterior) ? rango : null;
}

export type PeriodoVendedoras = "mes" | "trimestre" | "ytd" | "ultimos";

export interface ClampVendedoras {
  year: number;
  periodo: PeriodoVendedoras;
  mes: number | null;
  trimestre: number | null;
  n: number | null;
  ajustado: boolean;
}

/**
 * Ranking de vendedoras: `periodo` puede abrir un trimestre, el YTD entero o
 * una ventana rolling de 3/6/12 meses — todas fuera de la ventana permitida.
 * Para el rol acotado se fuerza `periodo='mes'` con el mes en curso, y se
 * anulan `trimestre` y `n`.
 */
export function clampPeriodoVendedoras(
  role: string | null | undefined,
  entrada: { year: number; periodo: PeriodoVendedoras; mes: number | null; trimestre: number | null; n: number | null },
  ahora: Date,
): ClampVendedoras {
  if (!esRolAcotado(role)) {
    return { ...entrada, ajustado: false };
  }
  const { year, mes } = clampAnioMes(role, { year: entrada.year, mes: entrada.mes }, ahora);
  return {
    year,
    periodo: "mes",
    mes,
    trimestre: null,
    n: null,
    ajustado:
      year !== entrada.year ||
      entrada.periodo !== "mes" ||
      entrada.mes !== mes ||
      entrada.trimestre != null ||
      entrada.n != null,
  };
}
