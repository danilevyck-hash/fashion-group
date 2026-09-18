/* ─────────────────────────────────────────────────────────────────────────────
 * EL DÍA LIBRE DE LA EMPRESA — se paga completo y se queda debiendo 8 horas.
 *
 * Módulo PURO: sin base, sin red y sin `new Date()`.
 *
 * ── QUÉ ES, EN PALABRAS DE DANIEL (16 y 17-sep-2026) ────────────────────────
 *
 * Textual: *«en las fiestas judías hay días libres, dentro de las jornadas
 * ordinarias, que son libres para el colaborador, pero se pagan con el tiempo
 * de horas extra»* · *«se le paga ese día pero deben las horas laborales (8
 * horas para todos)»* · *«queda debiendo para la próxima quincena hasta
 * cancelar la deuda de horas»* · *«arrastra para siempre hasta que haga horas
 * extra»*.
 *
 * 🔑 ESTO NO SE INVENTÓ ACÁ: YA EXISTE EN EL EXCEL DE LA CONTADORA. Medido el
 * 17-sep-2026 sobre sus tres planillas reales, en la hoja de cada persona:
 *
 *     DESC. POR FIESTA JUDÍA (22 DE MAYO)          18.50
 *     HORAS EXTRAS (1.25)  1.5*1.25*3.02            5.6625
 *     …
 *     HORAS PENDIENTES A DESCONTAR                 12.8375
 *
 * O sea: una deuda EN DÓLARES, las horas extra de la quincena la van pagando y
 * lo que sobra queda pendiente para la siguiente. Andando a mano desde mayo.
 *
 * ── 🔴 POR QUÉ EN DÓLARES Y NO EN HORAS ─────────────────────────────────────
 *
 * Daniel, textual: *«debe de ser el dólares pienso, porque no todas las horas
 * valen igual, 8 horas de trabajo normal no son lo mismo que hora extra»*. Una
 * hora extra diurna vale `1,25 × rata` y una de domingo `1,50 × rata`: una
 * deuda de «8 horas» se cancelaría con 6,4 horas extra diurnas o con 5,33 de
 * domingo, y nadie podría decir cuánto se le debe sin volver a multiplicar.
 * En dólares la cuenta es una resta y se puede cotejar contra el Excel.
 *
 * ── 🔴 EL NOMBRE NO ES «FIESTA JUDÍA» ───────────────────────────────────────
 *
 * Daniel: *«a veces damos un día libre antes de una fiesta panameña para que
 * los colaboradores vayan a su casa, y cuenta como si fuese un día
 * religioso… ¿habría que cambiar el nombre?»*. Se llama **«Día libre de la
 * empresa»** y el motivo vive en `motivos.ts` con los otros seis.
 *
 * ⚠️ NO CONFUNDIRLO CON «COMPENSATORIO», que es LO CONTRARIO: un día libre que
 * la empresa le DEBÍA al colaborador (por un domingo trabajado) y que no le
 * cuesta nada. Acá la empresa REGALA un día y el colaborador queda debiendo las
 * horas. Los dos textos de pantalla están escritos para que no se puedan
 * confundir; si alguien elige el equivocado, eso mueve plata.
 *
 * ── 🔴 LA REGLA, ENTERA ─────────────────────────────────────────────────────
 *
 *   1. El día se paga COMPLETO: no es ausencia, no descuenta sueldo, no genera
 *      tardanza ni salida temprana. Del lado del sueldo se comporta igual que
 *      un compensatorio — es una justificación más, y en esta casa
 *      **justificar significa que se paga**.
 *   2. Nace una deuda de `8 × rata por hora` de ESA persona, en dólares, el día
 *      que se carga. La rata sale de `rata.ts` (`salario ÷ divisor`), la misma
 *      de todo el módulo: acá no se calcula una segunda.
 *   3. La deuda se paga SOLO con horas extra: cada quincena se le resta lo que
 *      valen sus horas extra APROBADAS (las cinco columnas que suman al bruto).
 *   4. Si el extra no alcanza, el resto queda debiendo. Arrastra sin límite y
 *      no caduca.
 *   5. Si alcanza y sobra, la sobra se le paga como hoy.
 *   6. 🔴 NUNCA SALE DEL SUELDO. Quien nunca haga horas extra se queda con la
 *      deuda para siempre: es un beneficio que dio la empresa, no un préstamo.
 *      Por eso el tope de lo que se cobra es el EXTRA de la quincena y no el
 *      neto — y por eso este módulo no se parece a `prestamos-planilla.ts`.
 *   7. 🔴 NO SE DESCUENTA DE LA LIQUIDACIÓN. Daniel dijo «no», explícito.
 *   8. Quien SÍ trabajó ese día cobra normal y no le nace ninguna deuda: a él
 *      no se le cargó el día libre.
 *
 * ── 🔴 CÓMO SE COBRA: SE CONSUMEN LAS HORAS EXTRA, NO SE AGREGA UN DESCUENTO ─
 *
 * En el Excel de la contadora las horas extra de esa quincena simplemente NO se
 * pagan y el resto queda pendiente. Acá es lo mismo: las cinco columnas del
 * extra bajan hasta cubrir lo que se cobró, el bruto baja con ellas y los dos
 * seguros se recalculan sobre el bruto nuevo — exactamente el trato que ya
 * recibe el ajuste de la quincena anterior (`aplicarAjusteEnLinea`, 11-sep-2026,
 * Daniel: *«los seguros, va»*). Un descuento aparte habría dejado el bruto —y
 * por lo tanto el seguro social— calculado sobre plata que la persona no cobró.
 *
 * 🔑 El orden en que se consumen las columnas (diurna → nocturna → excedente →
 * domingo → feriado) NO cambia un centavo del total: lo único que decide es en
 * qué celda se ve la baja. Está escrito para que el reparto sea reproducible.
 * ────────────────────────────────────────────────────────────────────────── */

import { centavos } from "./planilla";
import type { DineroLinea } from "./planilla";
import { diasLaborablesDelRango } from "./horario-configurable";
import { ofreceDiaLibreDeLaEmpresa, TEXTO_DIA_LIBRE_NO_APLICA } from "./motivos";

/**
 * Las horas que se deben por cada día libre. Daniel: *«8 horas para todos»* —
 * no la jornada de la ficha, no el horario del día: OCHO, parejo.
 */
export const HORAS_DEL_DIA_LIBRE = 8;

/**
 * Lo que vale un día libre para esta persona: `8 × rata`, a centavos.
 *
 * `null` cuando no se le puede calcular la rata (sin salario, sin jornada
 * usable). 🔴 Nunca 0: un cero se leería como «no debe nada» y el día libre se
 * habría regalado dos veces —el día y las horas— sin que nadie lo viera.
 */
export function deudaDelDiaLibre(rataHora: number | null | undefined): number | null {
  if (typeof rataHora !== "number" || !Number.isFinite(rataHora) || rataHora <= 0) return null;
  return centavos(HORAS_DEL_DIA_LIBRE * rataHora);
}

/**
 * Los días del rango en los que la empresa de verdad cerró: solo los HÁBILES
 * de ESA persona.
 *
 * 🔑 Un domingo adentro del rango no genera deuda porque ese día no había
 * jornada que perdonar. Es la MISMA definición de «hábil» que usa el motor para
 * las ausencias (`diasLaborablesDelRango` con los días de cada quien; sin
 * lista, lunes a viernes), no una segunda. Quien tenga el sábado como día
 * laborable le debe el sábado que le regalaron.
 *
 * ⚠️ Corta a los 32 días: un rango más largo no es un día libre, es un error de
 * tipeo, y quien llama lo rechaza antes de guardar nada.
 */
export function diasHabilesDelRango(desde: string, hasta: string, dias?: readonly number[] | null): string[] {
  return diasLaborablesDelRango(desde, hasta, dias, 32);
}

/**
 * 🔴 MULTIFASHION NUNCA LLEVA DEUDA DE DÍA LIBRE (18-sep-2026).
 *
 * Daniel, textual, dos veces el mismo día: *«multifashion no se comporta
 * igual, ese día se les regala, igual no van a marcar»* · *«te dije que no hay
 * deuda del día libre a multifashion»*.
 *
 * A ellas el día se les REGALA: no se descuenta y no queda debiendo nada. La
 * regla de quién sí y quién no vive en `motivos.ts`
 * (`ofreceDiaLibreDeLaEmpresa`), porque la pantalla la necesita para NO
 * ofrecer el motivo; acá se pregunta antes de armar una sola deuda, y en la
 * puerta que escribe se vuelve a preguntar. Medido el 18-sep-2026:
 * `asistencia_dia_libre_deuda` tiene CERO filas, así que no hay nada que
 * limpiar — solo cerrar la puerta antes de que pase.
 *
 * `null` = se puede; un texto = por qué no.
 */
export function porQueNoLlevaDeuda(empresa: string | null | undefined): string | null {
  return ofreceDiaLibreDeLaEmpresa(empresa) ? null : TEXTO_DIA_LIBRE_NO_APLICA;
}

/** El tope de días que puede cubrir UN día libre. Daniel: *«son pocas al año»*. */
export const MAX_DIAS_DE_UNA_CARGA = 15;

// ─────────────────────────────────────────────────────────────────────────────
// EL SALDO — lo que nació menos lo que ya se pagó
// ─────────────────────────────────────────────────────────────────────────────

/** Una deuda cargada: un día libre de una persona, con su monto CONGELADO. */
export interface DeudaDiaLibre {
  empleado_codigo: string;
  /** El día que la empresa cerró. YYYY-MM-DD. */
  fecha: string;
  /** `8 × rata` al día que se cargó. 🔴 No se recalcula nunca más. */
  monto: number;
}

/** Lo que una quincena ya le descontó a la deuda. Lo escribe el cierre. */
export interface PagoDiaLibre {
  empleado_codigo: string;
  /** La clave de la quincena que lo pagó («2026-09-1»). */
  quincena: string;
  monto: number;
}

export interface SaldoDiaLibre {
  codigo: string;
  /** Todo lo que nació, sumado. */
  debia: number;
  /** Todo lo que las horas extra ya pagaron. */
  pagado: number;
  /** Lo que queda debiendo hoy. Nunca negativo. */
  queda: number;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * El saldo de cada persona, por código.
 *
 * ⚠️ Recorre TODO lo que se le pase y no filtra por fecha: la deuda arrastra
 * sin límite, así que quien llame tiene que darle la lista completa. Filtrar
 * por quincena devolvería un saldo que se borra solo al cambiar de mes.
 *
 * 🔑 `queda` no baja de cero. Un pago de más —que hoy no puede pasar, porque el
 * cobro está capeado al saldo— sería un regalo, no una deuda al revés.
 */
export function saldosDiaLibre(
  deudas: readonly DeudaDiaLibre[],
  pagos: readonly PagoDiaLibre[],
): Map<string, SaldoDiaLibre> {
  const out = new Map<string, SaldoDiaLibre>();
  const tomar = (codigo: string): SaldoDiaLibre => {
    const cod = String(codigo ?? "").trim();
    let s = out.get(cod);
    if (!s) { s = { codigo: cod, debia: 0, pagado: 0, queda: 0 }; out.set(cod, s); }
    return s;
  };
  for (const d of deudas) tomar(d?.empleado_codigo ?? "").debia += num(d?.monto);
  for (const p of pagos) tomar(p?.empleado_codigo ?? "").pagado += num(p?.monto);
  for (const s of out.values()) {
    s.debia = centavos(s.debia);
    s.pagado = centavos(s.pagado);
    s.queda = centavos(Math.max(0, s.debia - s.pagado));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL COBRO — SOLO CON HORAS EXTRA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 LAS CINCO COLUMNAS QUE SON «HORA EXTRA» para esta regla, y el orden en que
 * se consumen. Son exactamente las cinco que HOY suman al bruto con recargo
 * (`calcularDinero`): si mañana nace una sexta, va acá o la deuda dejaría de
 * cobrarse con ella en silencio.
 */
export const COLUMNAS_DE_EXTRA = [
  "extraDiurno", "extraNocturno", "excedente", "domingos", "feriados",
] as const satisfies readonly (keyof DineroLinea)[];

export type ColumnaDeExtra = (typeof COLUMNAS_DE_EXTRA)[number];

/** Lo que valen las horas extra de esta quincena, sumadas. */
export function extraDeLaQuincena(d: DineroLinea | null | undefined): number {
  if (!d) return 0;
  let total = 0;
  for (const c of COLUMNAS_DE_EXTRA) total += num(d[c]);
  return centavos(total);
}

/** Los porcentajes vigentes, para recalcular los seguros sobre el bruto nuevo. */
export interface PorcentajesSeguros {
  seguroSocialPct: number;
  seguroEducativoPct: number;
}

/** Lo que esta quincena le hizo a la deuda. Viaja en la línea, como testigo. */
export interface DiaLibreEnLinea {
  /** Lo que debía al entrar a esta quincena. */
  saldoAntes: number;
  /** Lo que sus horas extra pagaron acá. */
  pagado: number;
  /** Lo que sigue debiendo después de esta quincena. */
  queda: number;
  /** De qué columna salió cada dólar. Solo para poder decirlo en la celda. */
  consumido: Partial<Record<ColumnaDeExtra, number>>;
}

/**
 * Le cobra a la deuda lo que valgan las horas extra de esta línea.
 *
 * Sin dinero, sin saldo o sin extras devuelve la MISMA referencia: no hay nada
 * que hacer y nada se mueve. Con cobro, las columnas del extra bajan, el bruto
 * baja con ellas, los seguros se recalculan (mismas condiciones que
 * `aplicarAjusteEnLinea`) y `diaLibre` dice cuánto se pagó y cuánto queda.
 *
 * 🔴 EL TOPE ES EL EXTRA, NUNCA EL NETO. Es lo que hace que la deuda no pueda
 * salir del sueldo: si no hubo horas extra, no se cobra ni un centavo, pase lo
 * que pase con el neto.
 */
export function aplicarDiaLibreEnLinea<
  L extends { dinero: DineroLinea | null; pagaSeguros?: boolean },
>(
  linea: L,
  saldo: SaldoDiaLibre | null | undefined,
  seguros: PorcentajesSeguros | null = null,
): L & { diaLibre?: DiaLibreEnLinea } {
  const d = linea.dinero;
  const debe = centavos(Math.max(0, num(saldo?.queda)));
  if (!d || debe <= 0) return linea;

  const extra = extraDeLaQuincena(d);
  if (extra <= 0) {
    // 🔴 No se cobró nada, pero SE DICE: la celda tiene que poder mostrar la
    // deuda viva aunque esta quincena no la haya tocado.
    return { ...linea, diaLibre: { saldoAntes: debe, pagado: 0, queda: debe, consumido: {} } };
  }

  const pagado = centavos(Math.min(debe, extra));
  const dinero: DineroLinea = { ...d };
  const consumido: Partial<Record<ColumnaDeExtra, number>> = {};
  let porCobrar = pagado;
  for (const c of COLUMNAS_DE_EXTRA) {
    if (porCobrar <= 0) break;
    const hay = centavos(Math.max(0, num(d[c])));
    if (hay <= 0) continue;
    const quita = centavos(Math.min(hay, porCobrar));
    consumido[c] = quita;
    dinero[c] = centavos(hay - quita);
    porCobrar = centavos(porCobrar - quita);
  }
  dinero.totalBruto = centavos(d.totalBruto - pagado);
  dinero.netoPagar = centavos(d.netoPagar - pagado);

  // ── LOS SEGUROS, SOBRE EL BRUTO SIN LAS HORAS QUE PAGARON LA DEUDA ────────
  //
  // Mismas tres condiciones que el ajuste de la quincena anterior: con los
  // porcentajes a mano, si la persona paga seguros y NO tiene base propia (con
  // base propia el seguro no sale del bruto y no se mueve).
  if (seguros && linea.pagaSeguros !== false && d.baseSeguros === null
      && (d.seguroSocial > 0 || d.seguroEducativo > 0)) {
    const nuevoSS = centavos(dinero.totalBruto * (num(seguros.seguroSocialPct) / 100));
    const nuevoSE = centavos(dinero.totalBruto * (num(seguros.seguroEducativoPct) / 100));
    const dSS = centavos(nuevoSS - d.seguroSocial);
    const dSE = centavos(nuevoSE - d.seguroEducativo);
    if (dSS !== 0 || dSE !== 0) {
      dinero.seguroSocial = nuevoSS;
      dinero.seguroEducativo = nuevoSE;
      dinero.totalDeducciones = centavos(d.totalDeducciones + dSS + dSE);
      dinero.netoPagar = centavos(dinero.netoPagar - dSS - dSE);
    }
  }

  return {
    ...linea,
    dinero,
    diaLibre: { saldoAntes: debe, pagado, queda: centavos(debe - pagado), consumido },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE LEE
//
// Los textos viven acá y no en la pantalla: los necesitan la planilla, la ficha
// del colaborador, el Excel y el papel, y una segunda redacción es una segunda
// verdad. Mismo criterio que `vacaciones.ts` y `neto-no-negativo.ts`.
// ─────────────────────────────────────────────────────────────────────────────

const plata = (n: number): string => `$${n.toFixed(2)}`;

/** Cómo se nombra el saldo donde sea que se muestre. Corto y sin jerga. */
export const ROTULO_SALDO = "Días libres de la empresa";

/**
 * La línea de la ficha y de la celda de la planilla. `null` cuando no debe
 * nada — un renglón que dice «debe $0.00» es ruido en una pantalla que se lee
 * de un vistazo.
 */
export function textoSaldoDiaLibre(s: SaldoDiaLibre | null | undefined): string | null {
  const queda = centavos(Math.max(0, num(s?.queda)));
  if (queda <= 0) return null;
  return `Debe ${plata(queda)} por días libres de la empresa. Se paga solo con horas extra.`;
}

/**
 * Lo que dice la celda de la planilla, al lado de las horas extra.
 * `null` cuando esta quincena no tocó ninguna deuda.
 */
export function textoDiaLibreCelda(dl: DiaLibreEnLinea | null | undefined): string | null {
  if (!dl) return null;
  if (dl.pagado <= 0) {
    return `Debía ${plata(dl.saldoAntes)} por días libres; esta quincena no hizo horas extra.`;
  }
  const cola = dl.queda > 0
    ? `le quedan debiendo ${plata(dl.queda)}`
    : "queda al día";
  return `Sus horas extra pagaron ${plata(dl.pagado)} de los ${plata(dl.saldoAntes)} que debía; ${cola}.`;
}

/** El `title` de esa celda: por qué la columna del extra bajó. */
export const TITULO_DIA_LIBRE =
  "La empresa le dio un día libre y se le pagó completo; a cambio quedó debiendo 8 horas, "
  + "que se pagan SOLO con horas extra. Nunca sale del sueldo.";

/** Una persona a la que esta quincena le tocó la deuda, para «Antes de cerrar». */
export interface DiaLibreDeCierre {
  codigo: string;
  etiqueta: string;
  pagado: number;
  queda: number;
}

/** Las líneas del cuadro que movieron deuda, en el orden en que salen. */
export function diasLibresDelCuadro(
  lineas: readonly { codigo: string; etiqueta: string; diaLibre?: DiaLibreEnLinea }[],
): DiaLibreDeCierre[] {
  const out: DiaLibreDeCierre[] = [];
  for (const l of lineas) {
    const dl = l.diaLibre;
    if (!dl) continue;
    out.push({ codigo: l.codigo, etiqueta: l.etiqueta, pagado: dl.pagado, queda: dl.queda });
  }
  return out;
}

/**
 * La línea de «Antes de cerrar». `null` sin nadie — un cartel permanente se
 * deja de leer.
 *
 * 🔴 Dice el nombre, lo que se cobró y lo que queda: sin el nombre no se sabe a
 * quién mirar, y sin lo que queda no se entiende por qué la columna del extra
 * está en cero.
 */
export function textoDiasLibres(items: readonly DiaLibreDeCierre[]): string | null {
  if (items.length === 0) return null;
  const detalle = items
    .map((i) => `${i.etiqueta} · pagó ${plata(i.pagado)} · le quedan ${plata(i.queda)}`)
    .join(" — ");
  const cabeza = items.length === 1
    ? "1 colaborador debe horas por un día libre de la empresa"
    : `${items.length} colaboradores deben horas por un día libre de la empresa`;
  return `${cabeza}: sus horas extra pagan la deuda y el resto arrastra a la próxima quincena. ${detalle}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ¿FALTA CORRER LA MIGRACIÓN?
//
// Mismo criterio que `saldo-vacaciones.ts` y `seguros.ts`: en este proyecto los
// DDL los corre Daniel a mano y varios se quedaron pendientes semanas. Sin las
// tablas, TODO el módulo se comporta EXACTAMENTE como hoy —nadie debe nada, no
// se cobra nada, el neto no se mueve— y la pantalla dice qué archivo falta en
// vez de romperse.
// ─────────────────────────────────────────────────────────────────────────────

export const MIGRACION_DIA_LIBRE = "20261203120000_asistencia_dia_libre_empresa.sql";

/** Las dos tablas. Se listan acá para que el `select` y la detección del error
 *  no se puedan separar. */
export const TABLAS_DIA_LIBRE = [
  "asistencia_dia_libre_deuda",
  "asistencia_dia_libre_pago",
] as const;

interface ErrorPostgrest {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * ¿Este error es «todavía no existen las tablas del día libre»?
 *
 * `42P01` es "undefined_table" de Postgres y `PGRST205` el de PostgREST cuando
 * la tabla no está en su caché de esquema.
 *
 * ⚠️ El error tiene que NOMBRAR una de las dos tablas. Tragarse cualquier error
 * convertiría un problema real —permisos, red, RLS— en una pantalla que miente
 * diciendo «falta la migración», y una deuda que desaparece en silencio.
 */
export function esTablaDiaLibreFaltante(err: unknown): boolean {
  if (!err) return false;
  const e = err as ErrorPostgrest;
  const texto = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;
  if (!TABLAS_DIA_LIBRE.some((t) => texto.includes(t))) return false;
  const code = String(e.code ?? "");
  if (code === "42P01" || code === "PGRST205") return true;
  return /does not exist|no existe|schema cache|could not find/i.test(texto);
}

export function avisoMigracionDiaLibre(): string {
  return (
    "Todavía no se pueden cargar días libres de la empresa: falta preparar la base de datos. "
    + `Pídele a Daniel que corra el archivo ${MIGRACION_DIA_LIBRE} en Supabase. `
    + "Mientras tanto todo lo demás funciona igual."
  );
}
