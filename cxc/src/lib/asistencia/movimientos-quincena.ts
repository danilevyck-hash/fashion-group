// ─────────────────────────────────────────────────────────────────────────────
// LOS MOVIMIENTOS DE PRÉSTAMOS DE UNA QUINCENA. Módulo PURO.
//
// Daniel, textual (17-sep-2026): *«quisiera que en préstamo tener como que un
// botón para ver el historial de las quincenas. Ya que para ver movimiento
// tengo que meterme a cada perfil. Pero para ver los movimientos de x
// quincena?»*
//
// 🩸 QUÉ PASABA HASTA HOY. La pestaña Préstamos lista **quién debe plata HOY**.
// Para saber **qué pasó en una quincena** —qué se descontó y qué se prestó—
// había que abrir las 31 fichas vivas, una por una.
//
// 🔴 ESTO NO ESCRIBE NADA Y NO CAMBIA NINGÚN CÁLCULO. Es una pantalla de
// LECTURA sobre `prestamos_movimientos`, que ya existen. No toca el saldo, ni la
// casilla de la planilla, ni el cierre. Un centavo distinto acá sería un error
// de esta pantalla, nunca un cambio de lo que se le paga a alguien.
//
// ── 🔴 POR QUINCENA, NO POR RANGO LIBRE — y está medido ──────────────────────
//
// Daniel preguntó: *«¿por quincena? igual a todos se le descuenta casi el mismo
// día no?»*. Tiene razón en los pagos, y por eso igual va por quincena. Medido
// el 17-sep-2026 sobre los 441 movimientos vivos de toda la historia:
//
//     PAGOS                       CARGOS
//       día 15 → 152                ningún día pasa de 8
//       día 30 → 153                repartidos por todo el mes
//
// **Los descuentos caen el 15 y el 30. Los préstamos se dan cualquier día.**
// Agrupar por quincena es lo único que pone las dos cosas en la misma pantalla:
// un rango libre invita a mirar media quincena, y ahí los totales no significan
// nada.
//
// ── 🔴 NINGÚN MOVIMIENTO QUEDA ENTRE DOS QUINCENAS ───────────────────────────
//
// La quincena PAGA hasta el 30 (`ultimoDiaQueSePaga`: el 31 no se paga nunca),
// pero un préstamo se puede dar el 31. Medido: **2 movimientos el 31-mar-2026**
// —un préstamo de $180 y un pago de $500—. Leyendo hasta `q.hasta` esa plata no
// saldría en NINGUNA quincena y desaparecería de la pantalla sin decir nada.
// La ventana de lectura termina en `finDeLaMedicion(q.hasta)`, que es la MISMA
// función con la que el motor de la planilla mide el 31 (`dia-31.ts`). Una
// segunda definición del último día sería un agujero por el que se cae plata.
// ─────────────────────────────────────────────────────────────────────────────

import { finDeLaMedicion } from "./dia-31";
import type { Quincena } from "./planilla";
import { esDescuentoDeQuincena } from "./prestamos-planilla";
import { etiquetaConcepto } from "@/lib/prestamos-conceptos";
import { CONCEPTOS_RESTAN, CONCEPTOS_SUMAN } from "@/lib/prestamos-saldo";

/**
 * Los DOS bloques de la pantalla.
 *
 * 🔑 SE DERIVAN DE LA MISMA LISTA QUE SUMA EL SALDO (`prestamos-saldo.ts`), no
 * se escriben acá: `descuento` es lo que RESTA de la deuda y `deuda` lo que la
 * SUMA. Escribir una segunda lista de conceptos sería tener dos respuestas a
 * «¿esto bajó o subió la deuda?», y el día que se separen la pantalla diría una
 * cosa y el saldo otra.
 */
export type Bloque = "descuento" | "deuda";

const RESTAN = new Set<string>(CONCEPTOS_RESTAN);
const SUMAN = new Set<string>(CONCEPTOS_SUMAN);

/** Cómo se llama cada bloque en pantalla. Un solo lugar. */
export const NOMBRE_BLOQUE: Readonly<Record<Bloque, string>> = {
  descuento: "Descuentos",
  deuda: "Deudas nuevas",
};

/**
 * 🔑 UN CONCEPTO QUE NO SE RECONOCE **NO SE CUENTA**, igual que en el saldo.
 * No se asume que suma ni que resta: se deja fuera de los dos bloques y se
 * DICE cuántos quedaron afuera (`resumen.sinClasificar`). Un movimiento
 * contado por descarte es un total que miente sin avisar.
 */
export function bloqueDeMovimiento(concepto: string): Bloque | null {
  const c = String(concepto ?? "");
  if (RESTAN.has(c)) return "descuento";
  if (SUMAN.has(c)) return "deuda";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA COLUMNA «ORIGEN» ES LA RAZÓN DE SER DE ESTA PANTALLA
//
// Dice si el movimiento lo anotó **el cierre de la quincena** o lo escribió
// **alguien a mano**.
//
// 🩸 Es lo que le habría dejado ver a Daniel de una que el domingo 13-sep-2026
// se cerraron seis planillas que nadie pidió y se anotaron dos pagos —uno de
// ellos, $25,00 a ELOYN MENDOZA, que su planilla nunca descontó—.
//
// La escalera tiene cuatro peldaños y el orden importa:
//
//   1. **El amarre manda.** `asistencia_planilla_prestamo` ata una planilla
//      cerrada con el movimiento que escribió: si está ahí y no se revirtió,
//      es del cierre y no hay nada que interpretar.
//   2. **Un CARGO nunca es del cierre.** El cierre descuenta; no presta plata,
//      no carga un daño y no abre un descuento a terceros. Eso lo escribe una
//      persona, siempre. ⚠️ Hoy este peldaño es un CINTURÓN: el de abajo
//      (`esDescuentoDeQuincena`) ya solo reconoce los tres conceptos de PAGO,
//      así que sacarlo no cambiaría ni una fila. Se deja escrito porque la
//      regla es de ESTA pantalla y no de aquella función: el día que allá se
//      amplíe la lista, acá un préstamo seguiría diciendo «a mano».
//   3. **Un PAGO que salió de la quincena** (`esDescuentoDeQuincena`, la MISMA
//      función que usa la casilla de la planilla para no cobrar dos veces):
//      `origen_pago` = «Quincena», o vacío, que son las filas viejas. Medido el
//      17-sep-2026: **440 de 441 movimientos vivos tienen `origen_pago` en
//      NULL** —el campo nació el 8-sep-2026—, así que sin este peldaño la
//      pantalla diría «a mano» de toda la historia.
//   4. **Todo lo demás es a mano.** ⚠️ Y dice SOLO «a mano»: el 17-sep-2026 la
//      celda agregaba de dónde salió («a mano · Liquidación») y Daniel lo mandó
//      sacar el mismo día —*«Es información de más, quítala»*—. El
//      `origen_pago` se sigue guardando y leyendo; lo que se quitó es mostrarlo.
// ─────────────────────────────────────────────────────────────────────────────

export type OrigenMovimiento = "cierre" | "mano";

/** Cómo se lee cada origen. DOS palabras y ninguna más (ver `etiquetaDeOrigen`). */
export const ETIQUETA_ORIGEN: Readonly<Record<OrigenMovimiento, string>> = {
  cierre: "del cierre",
  mano: "a mano",
};

/** Lo mínimo de un movimiento para poder decir de dónde salió. */
export interface MovimientoParaOrigen {
  id: string;
  concepto: string;
  origen_pago?: string | null;
}

/**
 * De dónde salió un movimiento.
 *
 * @param amarrados los `movimiento_id` que una planilla cerrada reclama como
 *        suyos (`asistencia_planilla_prestamo`, sin revertir).
 */
export function origenDelMovimiento(
  m: MovimientoParaOrigen,
  amarrados?: ReadonlySet<string> | null,
): OrigenMovimiento {
  if (amarrados?.has(String(m.id))) return "cierre";
  if (bloqueDeMovimiento(m.concepto) === "deuda") return "mano";
  if (esDescuentoDeQuincena(m)) return "cierre";
  return "mano";
}

/**
 * 🔴 DOS ETIQUETAS Y NINGUNA MÁS: «del cierre» o «a mano».
 *
 * 🩸 Nació diciendo además de dónde salió el pago de bolsillo —«a mano ·
 * Liquidación»— y Daniel lo mandó sacar el mismo día (17-sep-2026), textual:
 * *«Es información de más, quítala»*. La pregunta de esta columna es UNA
 * —¿lo anotó el cierre o lo escribió alguien?— y contestarla con dos datos
 * pegados la vuelve dos preguntas.
 *
 * ⚠️ **El dato NO se borró: se dejó de MOSTRAR.** `prestamos_movimientos
 * .origen_pago` sigue guardándose igual, lo sigue leyendo `esDescuentoDeQuincena`
 * (el peldaño 3 de la escalera de arriba) y la ficha de la persona lo sigue
 * enseñando. Lo que se retiró es este renglón de esta celda.
 */
export function etiquetaDeOrigen(origen: OrigenMovimiento): string {
  return ETIQUETA_ORIGEN[origen];
}

// ─────────────────────────────────────────────────────────────────────────────
// LA VENTANA DE LA QUINCENA
// ─────────────────────────────────────────────────────────────────────────────

export interface Ventana { desde: string; hasta: string }

/**
 * 🔴 DE CUÁNDO A CUÁNDO SE LEE. Del primer día de la quincena al último día que
 * se MIDE — el 31 incluido (ver la nota de arriba). Nunca `q.hasta` pelado.
 */
export function ventanaDeLaQuincena(q: Pick<Quincena, "desde" | "hasta">): Ventana {
  return { desde: q.desde, hasta: finDeLaMedicion(q.hasta) };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS FILAS
// ─────────────────────────────────────────────────────────────────────────────

/** Un movimiento tal como llega de `prestamos_movimientos`. */
export interface MovimientoCrudo extends MovimientoParaOrigen {
  empleado_id: string | null;
  fecha: string;
  monto: number | string;
}

/** Una fila de la pantalla. Ya trae todo resuelto: no se calcula nada al pintar. */
export interface FilaMovimiento {
  id: string;
  /** El nombre tal como está escrito en Préstamos. Se capitaliza al mostrarlo. */
  nombre: string;
  /** El código del reloj, o `null` si la ficha no está atada a nadie. */
  codigo: string | null;
  /** La empresa de la persona atada: por ella filtra el selector de arriba. */
  empresa: string | null;
  /** Cómo se guarda en la base. */
  concepto: string;
  /** Cómo se lee («Responsabilidad por daño» → «Daño de mercancía»). */
  etiqueta: string;
  monto: number;
  /** `YYYY-MM-DD`. */
  fecha: string;
  /** El día del mes, que es lo único que cambia dentro de una quincena. */
  dia: number;
  origen: OrigenMovimiento;
  origenEtiqueta: string;
  /** `null` = concepto desconocido: no entra a ningún bloque ni a ningún total. */
  bloque: Bloque | null;
}

export interface DatosDeLaFicha {
  nombre: string;
  codigo: string | null;
  empresa: string | null;
}

/**
 * Un movimiento crudo → una fila.
 *
 * 🔑 Una ficha que no aparece en el mapa NO se descarta: se muestra con el
 * nombre en blanco y el movimiento sigue contando. Esconder plata porque falta
 * un nombre es exactamente lo que esta pantalla vino a evitar.
 */
export function filaDeMovimiento(
  m: MovimientoCrudo,
  fichas: ReadonlyMap<string, DatosDeLaFicha>,
  amarrados?: ReadonlySet<string> | null,
): FilaMovimiento {
  const ficha = fichas.get(String(m.empleado_id ?? ""));
  const origen = origenDelMovimiento(m, amarrados);
  const fecha = String(m.fecha ?? "").slice(0, 10);
  return {
    id: String(m.id),
    nombre: ficha?.nombre ?? "",
    codigo: ficha?.codigo ?? null,
    empresa: ficha?.empresa ?? null,
    concepto: String(m.concepto ?? ""),
    etiqueta: etiquetaConcepto(String(m.concepto ?? "")),
    monto: Number(m.monto) || 0,
    fecha,
    dia: Number(fecha.slice(8, 10)) || 0,
    origen,
    origenEtiqueta: etiquetaDeOrigen(origen),
    bloque: bloqueDeMovimiento(String(m.concepto ?? "")),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS DOS BLOQUES Y EL PIE
// ─────────────────────────────────────────────────────────────────────────────

export interface TotalBloque { cuantos: number; total: number }

export interface ResumenQuincena {
  descuentos: TotalBloque;
  deudas: TotalBloque;
  /**
   * 🔴 LA LÍNEA QUE HOY NO EXISTE EN NINGUNA PANTALLA: cuánto creció (positivo)
   * o bajó (negativo) la deuda del grupo en la quincena. Es `deudas − descuentos`.
   */
  variacion: number;
  /** Movimientos con un concepto que el sistema no sabe leer. Se DICEN. */
  sinClasificar: number;
}

export interface MovimientosAgrupados {
  descuentos: FilaMovimiento[];
  deudas: FilaMovimiento[];
  resumen: ResumenQuincena;
}

const cent = (n: number) => Math.round(n * 100) / 100;

/**
 * 🔴 EL ORDEN ES EL MISMO EN LOS DOS BLOQUES Y ES ESTABLE: de mayor a menor
 * monto —lo grande es lo que hay que mirar—, y el empate se rompe por fecha,
 * nombre e id. Nunca el orden en que llegó el array: dos cargas de la misma
 * quincena tienen que dar la misma hoja.
 */
function ordenar(filas: FilaMovimiento[]): FilaMovimiento[] {
  return [...filas].sort((a, b) =>
    b.monto - a.monto
    || a.fecha.localeCompare(b.fecha)
    || a.nombre.localeCompare(b.nombre)
    || a.id.localeCompare(b.id));
}

/**
 * Los dos bloques con su conteo, su total y el pie.
 *
 * 🔴 EL TOTAL SIGUE AL FILTRO: se suma sobre las filas que se le pasan, que son
 * las que se VEN (ya recortadas por el selector de empresa). Un pie que no
 * corresponde a las filas de arriba hace dudar de cuál de los dos manda — es la
 * misma regla que el total de «Quiénes deben».
 */
export function agruparMovimientos(filas: readonly FilaMovimiento[]): MovimientosAgrupados {
  const descuentos: FilaMovimiento[] = [];
  const deudas: FilaMovimiento[] = [];
  let sinClasificar = 0;
  for (const f of filas ?? []) {
    if (f.bloque === "descuento") descuentos.push(f);
    else if (f.bloque === "deuda") deudas.push(f);
    else sinClasificar += 1;
  }
  const sumar = (l: readonly FilaMovimiento[]) => cent(l.reduce((a, f) => a + f.monto, 0));
  const totalDescuentos = sumar(descuentos);
  const totalDeudas = sumar(deudas);
  return {
    descuentos: ordenar(descuentos),
    deudas: ordenar(deudas),
    resumen: {
      descuentos: { cuantos: descuentos.length, total: totalDescuentos },
      deudas: { cuantos: deudas.length, total: totalDeudas },
      variacion: cent(totalDeudas - totalDescuentos),
      sinClasificar,
    },
  };
}

/**
 * «La deuda creció» · «La deuda bajó» · «La deuda quedó igual».
 *
 * 🔑 EL SIGNO SE DICE CON PALABRAS y el monto va siempre en positivo: un
 * «−$657,28» al lado de «creció» es la clase de renglón que se lee al revés.
 * Medio centavo no es un cambio: por debajo de eso se dice «quedó igual».
 */
export function rotuloDeLaVariacion(variacion: number): string {
  if (Math.abs(variacion) < 0.005) return "La deuda quedó igual";
  return variacion > 0 ? "La deuda creció" : "La deuda bajó";
}

/** El rótulo + el monto, en positivo. «La deuda creció $657.28». */
export function fraseDeLaVariacion(variacion: number, plata: (n: number) => string): string {
  const rotulo = rotuloDeLaVariacion(variacion);
  if (rotulo === "La deuda quedó igual") return rotulo;
  return `${rotulo} ${plata(Math.abs(variacion))}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS DOS VISTAS DE LA PESTAÑA PRÉSTAMOS
//
// 🔴 «Quiénes deben» SIGUE SIENDO LA QUE ABRE. Lo que se hace todos los días es
// mirar quién debe y anotar un abono; «Movimientos» es la pregunta de cierre de
// quincena. Una clave rara en la URL cae en la primera, nunca en blanco — la
// misma regla que las pestañas del módulo (`pestanaQueSeAbre`).
//
// ⚠️ NO ES UNA PESTAÑA MÁS DE ASISTENCIA. Es una vista ADENTRO de Préstamos:
// comparte su selector de empresa, sus roles y su puerta. Subirla a pestaña
// sería una octava pestaña para algo que se mira dos veces al mes.
// ─────────────────────────────────────────────────────────────────────────────

/** El parámetro de la URL. Mismo nivel → `replace`: el Atrás no cicla por vistas. */
export const PARAM_VISTA = "sub";

export const VISTA_DEUDA = "deuda";
export const VISTA_MOVIMIENTOS = "movimientos";

export type VistaPrestamos = typeof VISTA_DEUDA | typeof VISTA_MOVIMIENTOS;

/** Las dos, en el orden en que se dibujan. */
export const VISTAS_PRESTAMOS: readonly (readonly [VistaPrestamos, string])[] = [
  [VISTA_DEUDA, "Quiénes deben"],
  [VISTA_MOVIMIENTOS, "Movimientos"],
] as const;

export function vistaDePrestamos(clave: string | null | undefined): VistaPrestamos {
  return String(clave ?? "").trim() === VISTA_MOVIMIENTOS ? VISTA_MOVIMIENTOS : VISTA_DEUDA;
}
