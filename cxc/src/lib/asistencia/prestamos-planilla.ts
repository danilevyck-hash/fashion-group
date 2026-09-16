/* ─────────────────────────────────────────────────────────────────────────────
 * EL PRÉSTAMO, DESDE EL MÓDULO HASTA LA CASILLA DE LA PLANILLA.
 *
 * Módulo PURO: sin base, sin red y sin `new Date()`.
 *
 * ── 🩸 QUÉ VINO A ARREGLAR ──────────────────────────────────────────────────
 *
 * La casilla «Préstamo» del cuadro quincenal la teclea una persona mirando el
 * módulo de Préstamos en otra pantalla. Medido contra producción en la quincena
 * del **1 al 15 de agosto de 2026**:
 *
 *   · el módulo registró **9 deducciones por $360,00**;
 *   · la casilla decía **7 montos por $265,00**;
 *   · KEVIN LUBO ($50), LUIS PARAJON ($45) y YULICAR CORONA ($50) tenían la
 *     deducción registrada en el módulo y la casilla en CERO;
 *   · LUIS ARROYO tenía $50 en la casilla y NINGÚN pago en el módulo.
 *
 * ── 🔴 ACÁ NO SE VUELVE A CALCULAR EL SALDO. NUNCA ───────────────────────────
 *
 * El módulo de Préstamos ya sabe hacer lo difícil: lleva el saldo firmado
 * (`prestado − pagado` sobre los movimientos aprobados y no borrados), capea la
 * última cuota con `min(cuota, saldo)` y no descuenta dos veces en la misma
 * quincena. Ese saldo llega acá YA CALCULADO, en `FichaPrestamo.saldo`, por la
 * misma cuenta que usa la RPC `prestamos_aplicar_quincena`.
 *
 * Una segunda cuenta del saldo en este archivo sería una segunda verdad, y el
 * día que las dos se separen nadie sabría cuál se le está descontando a la
 * gente. Lo único que hace este módulo es **elegir qué número va en la casilla**.
 *
 * ── 🔑 Y LA ELECCIÓN TIENE DOS CASOS, NO UNO ─────────────────────────────────
 *
 * Tentaba escribir «la casilla = min(cuota, saldo)» y listo. Está mal, y el
 * error se ve en el orden en que la contadora trabaja:
 *
 *   Si ella aprieta «Aplicar quincena» en el módulo ANTES de armar el cuadro,
 *   el pago ya quedó registrado y el saldo YA BAJÓ. `min(cuota, saldo)` daría
 *   entonces la cuota de la quincena SIGUIENTE. El caso real: KEVIN LUBO tenía
 *   saldo $50 y cuota $50; aplicada la quincena su saldo es $0, y la casilla
 *   habría dicho $0 el mismo mes en que se le descontaron los $50.
 *
 * Por eso:
 *
 *   1. **Si el módulo YA registró el descuento de ESTA quincena** (uno o más
 *      movimientos «Pago» DE LA QUINCENA con fecha adentro), la casilla dice
 *      EXACTAMENTE eso. Es un hecho consumado, no una estimación.
 *   2. **Si no**, la casilla dice `min(cuota, saldo)` — la misma fórmula de la
 *      RPC, sobre las fichas activas con cuota y saldo.
 *
 * ── 🔴 EL DESCUENTO ENTRA SOLO. YA NO SE APRUEBA (11-sep-2026) ───────────────
 *
 * Daniel, textual: *«quita lo de aprobación a préstamos, no es necesario»*.
 *
 * 🩸 Hasta el 11-sep-2026 la cuota entraba a la casilla cuando alguien la
 * aprobaba en el bloque «Préstamos por descontar» (la contadora había pedido
 * *«El préstamo si debe ser por aprobarlo»*), y lo no aprobado NO se descontaba.
 * Medido el 11-sep sobre la quincena 1–15 sep: **10 colaboradores con $495 de
 * cuota que la planilla no descontaba** porque nadie había tocado «Aprobar».
 * Un paso que hay que dar cada quincena para que pase lo que siempre pasa es un
 * paso que un día no se da.
 *
 * Ahora la cuota (préstamo y terceros, cada una capeada a SU saldo) entra a la
 * casilla SOLA (`aplicarPrestamoEnLinea`). La casilla sigue siendo editable:
 * **lo escrito a mano manda** (un monto > 0 en `asistencia_planilla_manual`)
 * y **vacía = lo que propone el módulo**. Se avisa SOLO cuando algo no es lo
 * de siempre: la última cuota (cuota mayor que el saldo) y quien debe pero no
 * está en el cuadro (salió, o no cobra en esta planilla).
 *
 * ⚠️ La tabla `asistencia_prestamo_aprobado` NO se dropea (patrón
 * `mayor_lineas`): queda sin lectores ni escritores, y hay candado.
 *
 * ── 🔴 «YA DESCONTADO» ES SOLO LO QUE SALIÓ DE LA QUINCENA (11-sep-2026) ─────
 *
 * 🩸 Medido el 11-sep-2026: CRISTIAM BLANCO canceló su préstamo el 7-sep con
 * $125 de su LIQUIDACIÓN (origen «Liquidación», nota «Cancela prestamo»). El
 * hecho consumado miraba solo el CONCEPTO, así que ese abono contaba como
 * «ya descontado esta quincena» y la casilla proponía $125 — con la cuota
 * automática, la planilla le habría vuelto a quitar del sueldo los $125 que
 * él ya pagó de su bolsillo. `esDescuentoDeQuincena` mira también el ORIGEN:
 * cuenta lo que dice «Quincena» (o no dice nada, que son las filas viejas) y
 * NADA más. Un abono de bolsillo baja el saldo —y por ahí la cuota siguiente ya
 * lo tiene en cuenta—, pero nunca vale como descuento del sueldo.
 *
 * ── 🔴 EL DAÑO DE MERCANCÍA TAMBIÉN ENTRA POR CUOTA (14-sep-2026) ─────────────
 *
 * Daniel, textual: *«Si está en cuota, que se haga automático»*, *«Si alguien
 * tiene uno grande, igual debería ir por cuota, ¿no?»* y, cerrando: *«Tanto el
 * chico como el grande que sea por cuota, ¿no? Agregan el daño como se hace un
 * préstamo, se elige la cuota y listo»*.
 *
 * 🩸 Del 10 al 14-sep-2026 el daño NO proponía cuota (la contadora: *«los daños
 * de mercancía debe permanecer en blanco y que nos permita colocar
 * quincenalmente la cantidad a descontar»*): la casilla «Mercancía» se escribía
 * a mano cada quincena. Medido el 14-sep: 24 cargos de daño en la historia, 9
 * personas, $1.896,02, mediana $19,62 — y uno de $1.261,50, que es el que
 * justifica la cuota. Hoy debe UNA sola persona, STEPHANY MORALES, $254,50, y
 * 0 de 31 fichas tienen cuota de daño cargada: al encender esto NADIE cambia de
 * neto.
 *
 * Ahora la tercera casilla automática es «Mercancía» → cuenta `dano`, con la
 * MISMA regla que terceros (`montoDanoDeFicha`): el hecho consumado le gana a
 * la estimación, la cuota se capea a SU saldo, entra a `dinero.mercancia`, y la
 * casilla tiene tres estados (vacía = la cuota · 0 = esta quincena no · monto =
 * ese monto, migración 20261122120000). Escribir el monto a mano SIGUE siendo
 * posible: es el tercer estado. ⚠️ El cierre NO se tocó: ya leía
 * `dinero.mercancia` y anota «Pago de responsabilidad» sobre lo que haya ahí.
 * ────────────────────────────────────────────────────────────────────────── */

import { centavos } from "./planilla";
import type { DineroLinea, ManualesLinea } from "./planilla";
import { ORIGEN_POR_DEFECTO } from "@/lib/prestamos-conceptos";
import { CASILLAS_AUTOMATICAS, estadoCasilla, type CasillaAutomatica } from "./casilla-sin-descontar";

/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EL INTERRUPTOR: EL PRÉSTAMO DEJA DE DESCONTARSE SOLO (15-sep-2026)
 *
 * Daniel, textual: *«que no se descuente hasta que contabilidad lo haga a mano
 * por ahora, hasta que el módulo esté terminado»*.
 *
 * 🩸 POR QUÉ, MEDIDO EL 15-sep-2026. El Excel de la contadora descontó **$773,01**
 * del 1 al 15 de septiembre en 13 personas (préstamo $624,28 · terceros $130,93 ·
 * mercancía $17,80). El sistema tiene anotados **DOS** movimientos, los que
 * escribió el cierre de Fashion Wear: Luis Parajón $70,00 (correcto) y **Eloyn
 * Mendoza $25,00, que su planilla NO le descontó**. O sea que el automático ya
 * escribió un pago que no fue, y los otros $703,01 no están registrados.
 * Mientras los saldos no cuadren, que el sistema decida el monto es cómo se
 * ensucia la deuda de una persona.
 *
 * ── QUÉ HACE `false` ─────────────────────────────────────────────────────────
 *
 *   · las tres casillas —Préstamo, Terceros y Mercancía— arrancan VACÍAS;
 *   · vale exactamente lo que teclee contabilidad, y el CIERRE anota eso mismo
 *     (es lo que arregla el caso de Eloyn: lo que se registra como pago es lo
 *     que de verdad se descontó);
 *   · la fila sigue MOSTRANDO cuánto debe y cuál sería su cuota, al lado de la
 *     casilla (`prestamoAutomatico.deuda`). Se le quita al sistema la DECISIÓN,
 *     no la INFORMACIÓN.
 *
 * ── QUÉ NO CAMBIA ────────────────────────────────────────────────────────────
 *
 * Los TRES estados de la casilla (`null` = vacía · `0` · monto) siguen iguales,
 * y al volver a poner esto en `true` todo vuelve a como estaba: el automático
 * entero está detrás de UNA sola función (`cuotaPropuesta`).
 * ────────────────────────────────────────────────────────────────────────── */
export const PRESTAMO_AUTOMATICO = false;

/** Los archivos que Daniel tiene que correr. Se le muestran tal cual. */
export const MIGRACION_AMARRE_PRESTAMOS =
  "20260902120000_prestamos_amarre_codigo.sql";

/**
 * 🔴 SIN EL AMARRE CORRIDO, LA CASILLA SIGUE SIENDO LO QUE ES HOY: un número
 * tecleado a mano. No se adivina a quién pertenece cada préstamo — eso es
 * exactamente lo que la columna vino a impedir.
 */
export function avisoMigracionAmarrePrestamos(): string {
  return (
    "La casilla de Préstamo todavía no se llena sola: falta preparar la base. "
    + `Pídele a Daniel que corra el archivo ${MIGRACION_AMARRE_PRESTAMOS} en Supabase. `
    + "Mientras tanto se escribe a mano, como hasta ahora."
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUÉ MOVIMIENTO ES QUÉ — la lista, en el módulo PURO y no en el que lee
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 LOS MOVIMIENTOS QUE SON «EL DESCUENTO DE LA PLANILLA».
 *
 * `Pago` es el que escribe la RPC `prestamos_aplicar_quincena` («Deducción
 * quincenal»). `Pago de responsabilidad` es el mismo hecho sobre una
 * Responsabilidad por daño — medido contra producción: 59 movimientos, 35 con
 * la nota «Deducción quincenal», o sea que también salió del sueldo.
 *
 * ⚠️ `Abono extra` NO ESTÁ ACÁ, y no es un olvido: es plata que la persona pagó
 * por fuera, de su bolsillo. Volver a descontársela del sueldo sería cobrarle
 * dos veces. Sí baja el saldo —está en `CONCEPTOS_PAGO`— y el saldo ya viene
 * con eso adentro, así que la cuota del mes que viene ya lo tiene en cuenta.
 */
export const CONCEPTOS_DESCUENTO = ["Pago", "Pago de responsabilidad"] as const;

/**
 * 🔴 LOS PAGOS QUE BAJAN UNA CUENTA CONCRETA (10-sep-2026). Es
 * `CONCEPTOS_DESCUENTO` más el pago de la tercera cuenta.
 *
 * 🔑 Se usa para preguntar «¿qué se le descontó YA en esta quincena, y de cuál
 * cuenta?». La cuenta sale de `cuentaDeMovimiento`, no del concepto: un «Pago»
 * puede bajar cualquiera de las tres.
 */
export const CONCEPTOS_PAGO_DE_CUENTA = [
  ...CONCEPTOS_DESCUENTO, "Pago de terceros",
] as const;

/** Lo que SUMA a la deuda. */
export const CONCEPTOS_DEUDA = [
  "Préstamo", "Responsabilidad por daño", "Descuento a terceros",
] as const;

/** Todo lo que RESTA de la deuda, incluido el abono de bolsillo. */
export const CONCEPTOS_PAGO = [...CONCEPTOS_PAGO_DE_CUENTA, "Abono extra"] as const;

/**
 * 🔴 ¿ESTE MOVIMIENTO ES UN DESCUENTO QUE SALIÓ DEL SUELDO?
 *
 * Dos condiciones, y las dos: el CONCEPTO es un pago de cuenta, y el ORIGEN es
 * la quincena. Sin origen escrito (las 443 filas anteriores al 5-sep-2026) se
 * asume que sí — es lo conservador: en la duda no se vuelve a descontar.
 *
 * 🩸 Un abono con origen «Liquidación», «Décimo», «Vacaciones» o «Efectivo»
 * NO es un descuento del sueldo, aunque su concepto sea «Pago». Es el caso de
 * CRISTIAM BLANCO (ver el encabezado).
 */
export function esDescuentoDeQuincena(m: {
  concepto: string;
  origen_pago?: string | null;
}): boolean {
  if (!(CONCEPTOS_PAGO_DE_CUENTA as readonly string[]).includes(String(m.concepto))) return false;
  const o = String(m.origen_pago ?? "").trim();
  return o === "" || o === ORIGEN_POR_DEFECTO;
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE ENTRA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una ficha del módulo de Préstamos, tal como llega.
 *
 * 🔑 `saldo` y `yaDescontado` vienen CALCULADOS por la misma cuenta del módulo.
 * Acá no se suman movimientos.
 */
export interface FichaPrestamo {
  /** El id de la ficha en `prestamos_empleados`. Para poder nombrarla. */
  id: string;
  /**
   * 🔴 EL AMARRE. El código del reloj, o `null` si la ficha todavía no está
   * atada a nadie. Una ficha sin código NO produce sugerencia y **se dice**.
   */
  codigo: string | null;
  /** El nombre tal como está escrito en Préstamos (texto libre). */
  nombre: string;
  /** `deduccion_quincenal`: la cuota de la cuenta PRÉSTAMO. */
  cuota: number;
  /**
   * `deduccion_dano`: la cuota de la cuenta DAÑO DE MERCANCÍA (5-sep-2026).
   *
   * 🔴 Desde el 14-sep-2026 la lee `montoDanoDeFicha`: con cuota cargada, el
   * daño entra solo a la casilla «Mercancía», capeado a su saldo. (Del 10 al
   * 14-sep no tenía lectores: el daño se escribía a mano cada quincena.)
   */
  cuotaDano: number;
  /** `prestado − pagado` de las DOS cuentas, ya firmado por el módulo. */
  saldo: number;
  /** Lo que debe de préstamo. */
  saldoPrestamo: number;
  /** Lo que debe de daño de mercancía. */
  saldoDano: number;
  /**
   * 🔴 LA TERCERA CUENTA (10-sep-2026). La contadora: *«los descuentos a
   * terceros debe ser manejado igual como un préstamo permitiendo colocar un
   * monto inicial y un monto a descontar quincenal»*.
   */
  cuotaTerceros: number;
  saldoTerceros: number;
  /** Lo que el módulo YA registró como pago DE QUINCENA de TERCEROS dentro de esta quincena. */
  yaDescontadoTerceros: number;
  /**
   * Lo que el módulo YA registró como pago DE QUINCENA de DAÑO («Pago de
   * responsabilidad» con origen Quincena) dentro de esta quincena (14-sep-2026).
   * Sin esto, cerrar y regenerar propondría la cuota SIGUIENTE — el caso KEVIN
   * LUBO, sobre otra cuenta.
   */
  yaDescontadoDano: number;
  /**
   * Lo que el módulo YA registró como pago DE QUINCENA dentro de esta
   * quincena. Es un hecho consumado: si hay algo acá, la casilla dice esto y no
   * la cuota. ⚠️ Solo lo que pasa `esDescuentoDeQuincena`: un abono de bolsillo
   * no entra.
   */
  yaDescontado: number;
}

/** Lo mínimo que hace falta saber de la persona en el cuadro. */
export interface PersonaEnCuadro {
  codigo: string;
  /** Lo que se muestra. NUNCA vacío. */
  etiqueta: string;
  empresa: string | null;
  empresaEtiqueta: string | null;
  /** Lo que HOY dice la casilla Préstamo de esta quincena (lo escrito a mano). */
  enCasilla: number;
  /** Lo que HOY dice la casilla «Terceros» de esta quincena (lo escrito a mano). */
  enCasillaTerceros: number;
  /** Lo que HOY dice la casilla «Mercancía» de esta quincena (lo escrito a mano). 14-sep-2026. */
  enCasillaDano: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE SALE
// ─────────────────────────────────────────────────────────────────────────────

/** De dónde salió el número que va en la casilla. */
export type OrigenSugerencia =
  /** El módulo ya registró el descuento de esta quincena: es ese monto. */
  | "descontado"
  /** Todavía no se registró: es `min(cuota, saldo)`. */
  | "cuota";

export interface SugerenciaPrestamo {
  codigo: string;
  etiqueta: string;
  empresa: string | null;
  empresaEtiqueta: string | null;
  /** Cómo se llama en Préstamos. Va a la vista: el amarre tiene que ser legible. */
  nombrePrestamos: string;
  cuota: number;
  saldo: number;
  /** El número que va (o fue) a la casilla. Siempre > 0 en alguna de las dos cuentas. */
  sugerido: number;
  origen: OrigenSugerencia;
  /** Lo que HOY dice la casilla, escrito a mano. 0 = nada escrito. */
  enCasilla: number;
  /** 🔴 LA TERCERA CUENTA, con su propia casilla y su propio renglón en el
   *  papel. `min(cuotaTerceros, saldoTerceros)`, o lo ya descontado. */
  cuotaTerceros: number;
  saldoTerceros: number;
  sugeridoTerceros: number;
  enCasillaTerceros: number;
  /** 🔴 EL DAÑO DE MERCANCÍA (14-sep-2026), con la MISMA forma que terceros:
   *  `min(cuotaDano, saldoDano)`, o lo ya descontado. Va a la casilla «Mercancía». */
  cuotaDano: number;
  saldoDano: number;
  sugeridoDano: number;
  enCasillaDano: number;
}

/** Una ficha con saldo que no se le pudo atar a nadie. */
export interface PrestamoSinAtar {
  nombre: string;
  saldo: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA REGLA
// ─────────────────────────────────────────────────────────────────────────────

function num(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Cuánto le toca a UNA ficha en esta quincena.
 *
 * 🔴 Los dos casos, en este orden y no al revés. Ver la nota de arriba: el
 * hecho consumado le gana a la estimación.
 */
export function montoDeFicha(f: FichaPrestamo): { monto: number; origen: OrigenSugerencia } {
  const ya = centavos(Math.max(0, num(f.yaDescontado)));
  if (ya > 0) return { monto: ya, origen: "descontado" };

  // ⚠️ Acá había un `if (!f.activo) return 0`. La bandera `activo` de la ficha
  // se RETIRÓ el 5-sep-2026: nunca significó «trabaja acá» sino «tiene algo
  // abierto», y una ficha marcada archivada por error dejaba a esa persona sin
  // descuento en silencio. El filtro de verdad ya está puesto y es más fuerte:
  // **solo entra quien está en el cuadro de esta quincena**, o sea quien cobra.
  // Ver `sugerirPrestamos`.

  // 🔴 SOLO LA CUENTA «PRÉSTAMO». Cada cuenta tiene su propia casilla y su
  // propio renglón en el comprobante, así que ninguna se mezcla con otra.
  //
  // 🩸 HASTA EL 10-SEP-2026 ACÁ SE SUMABA EL DAÑO DE MERCANCÍA (Daniel:
  // *«juntos»*, una sola casilla para las dos cuotas). Lo cambió la contadora:
  // *«los daños de mercancía debe permanecer en blanco y que nos permita
  // colocar quincenalmente la cantidad a descontar»*. Y desde el 14-sep-2026
  // el daño vuelve a proponer cuota, pero en SU casilla («Mercancía»,
  // `montoDanoDeFicha`): sumarlo acá pondría en «Préstamo» una plata que va en
  // otro renglón. Este cálculo sigue mirando SOLO la cuenta préstamo.
  const saldoP = centavos(num(f.saldoPrestamo));
  const cuotaP = centavos(num(f.cuota));
  const monto = saldoP > 0 && cuotaP > 0 ? Math.min(cuotaP, saldoP) : 0;
  return { monto: centavos(monto), origen: "cuota" };
}

/**
 * Cuánto le toca de la cuenta «Descuento a terceros» en esta quincena.
 *
 * 🔴 LA MISMA REGLA DEL PRÉSTAMO, sobre la otra cuenta: el hecho consumado le
 * gana a la estimación, y la cuota se capea a SU saldo. La contadora lo pidió
 * así — *«igual como un préstamo»*— y por eso es la misma función escrita para
 * otra cuenta, no una regla nueva.
 */
export function montoTercerosDeFicha(f: FichaPrestamo): { monto: number; origen: OrigenSugerencia } {
  const ya = centavos(Math.max(0, num(f.yaDescontadoTerceros)));
  if (ya > 0) return { monto: ya, origen: "descontado" };
  const saldo = centavos(num(f.saldoTerceros));
  const cuota = centavos(num(f.cuotaTerceros));
  const monto = saldo > 0 && cuota > 0 ? Math.min(cuota, saldo) : 0;
  return { monto: centavos(monto), origen: "cuota" };
}

/**
 * Cuánto le toca de la cuenta «Daño de mercancía» en esta quincena (14-sep-2026).
 *
 * 🔴 LA MISMA REGLA DEL PRÉSTAMO Y DE TERCEROS, sobre la tercera cuenta: el
 * hecho consumado le gana a la estimación, y la cuota se capea a SU saldo
 * (`min(cuotaDano, saldoDano)`: nunca más de lo que debe). Daniel: *«Agregan
 * el daño como se hace un préstamo, se elige la cuota y listo»*.
 *
 * 🔑 SIN CUOTA CARGADA NO PROPONE NADA — y eso es la mitad del diseño: con
 * `deduccion_dano` en 0 (hoy, las 31 fichas) esta función devuelve 0 y la
 * casilla «Mercancía» se comporta exactamente como antes: vacía, a mano.
 */
export function montoDanoDeFicha(f: FichaPrestamo): { monto: number; origen: OrigenSugerencia } {
  const ya = centavos(Math.max(0, num(f.yaDescontadoDano)));
  if (ya > 0) return { monto: ya, origen: "descontado" };
  const saldo = centavos(num(f.saldoDano));
  const cuota = centavos(num(f.cuotaDano));
  const monto = saldo > 0 && cuota > 0 ? Math.min(cuota, saldo) : 0;
  return { monto: centavos(monto), origen: "cuota" };
}

export interface OpcionesSugerencia {
  /** Las fichas del módulo de Préstamos, ya con su saldo. */
  fichas: readonly FichaPrestamo[];
  /** La gente del cuadro de esta quincena, por código. */
  personas: readonly PersonaEnCuadro[];
}

/**
 * Lo que el módulo propone: una línea por PERSONA del cuadro que tenga algo
 * que descontar.
 *
 * 🔑 SE AGRUPA POR CÓDIGO, no por ficha. En producción `RAMON MIRANDA` tiene
 * DOS fichas de préstamo atadas al mismo código 21 (una vieja de $3,13 ya
 * pagada y la viva). Una línea por ficha le mostraría dos casillas a la misma
 * persona, y la planilla tiene UNA.
 *
 * ⚠️ Solo entra quien está en el cuadro. Una ficha atada a alguien que esta
 * quincena no cobra (se fue, entró después) no propone nada: la baja ya la
 * decidió la capa de arriba y acá no se vuelve a decidir — pero SE DICE, ver
 * `prestamosDeQuienNoCobra`.
 */
export function sugerirPrestamos(opts: OpcionesSugerencia): SugerenciaPrestamo[] {
  const personaDe = new Map(opts.personas.map((p) => [p.codigo, p]));

  const acumulado = new Map<
    string,
    {
      monto: number; cuota: number; saldo: number; origen: OrigenSugerencia; nombres: string[];
      // 🔴 LA TERCERA CUENTA VIAJA APARTE, con su cuota y su saldo: es otro
      // renglón del comprobante y otra casilla. Mezclarla con el préstamo es
      // exactamente lo que la contadora pidió deshacer.
      montoT: number; cuotaT: number; saldoT: number;
      // 🔴 Y EL DAÑO TAMBIÉN APARTE (14-sep-2026): su casilla es «Mercancía».
      montoD: number; cuotaD: number; saldoD: number;
    }
  >();

  for (const f of opts.fichas) {
    const cod = (f.codigo ?? "").trim();
    if (!cod) continue;             // sin amarre no se sugiere nada. Se avisa aparte.
    if (!personaDe.has(cod)) continue;
    const { monto, origen } = montoDeFicha(f);
    const { monto: montoT, origen: origenT } = montoTercerosDeFicha(f);
    const { monto: montoD, origen: origenD } = montoDanoDeFicha(f);
    // 🔑 Entra quien tenga algo que descontar en CUALQUIERA de las tres cuentas
    // automáticas. Antes bastaba con mirar el préstamo porque era la única.
    if (monto <= 0 && montoT <= 0 && montoD <= 0) continue;
    const consumado = origen === "descontado" || origenT === "descontado" || origenD === "descontado";

    const prev = acumulado.get(cod);
    if (prev) {
      prev.monto = centavos(prev.monto + monto);
      prev.cuota = centavos(prev.cuota + num(f.cuota));
      prev.saldo = centavos(prev.saldo + num(f.saldoPrestamo));
      prev.montoT = centavos(prev.montoT + montoT);
      prev.cuotaT = centavos(prev.cuotaT + num(f.cuotaTerceros));
      prev.saldoT = centavos(prev.saldoT + num(f.saldoTerceros));
      prev.montoD = centavos(prev.montoD + montoD);
      prev.cuotaD = centavos(prev.cuotaD + num(f.cuotaDano));
      prev.saldoD = centavos(prev.saldoD + num(f.saldoDano));
      // Con fichas mezcladas manda «descontado»: hay un hecho consumado adentro.
      if (consumado) prev.origen = "descontado";
      prev.nombres.push(f.nombre);
    } else {
      acumulado.set(cod, {
        monto,
        // 🩸 La cuota y el saldo que se MUESTRAN son los del PRÉSTAMO, no la
        // suma de las cuentas: hasta el 10-sep-2026 acá se sumaba la cuota del
        // daño, y con el daño ya sin cuota esa suma diría un número que no se
        // le va a descontar a nadie.
        cuota: centavos(num(f.cuota)),
        saldo: centavos(num(f.saldoPrestamo)),
        origen: consumado ? "descontado" : origen,
        nombres: [f.nombre],
        montoT,
        cuotaT: centavos(num(f.cuotaTerceros)),
        saldoT: centavos(num(f.saldoTerceros)),
        montoD,
        cuotaD: centavos(num(f.cuotaDano)),
        saldoD: centavos(num(f.saldoDano)),
      });
    }
  }

  const out: SugerenciaPrestamo[] = [];
  for (const [codigo, a] of acumulado) {
    const p = personaDe.get(codigo)!;
    out.push({
      codigo,
      etiqueta: p.etiqueta,
      empresa: p.empresa,
      empresaEtiqueta: p.empresaEtiqueta,
      nombrePrestamos: a.nombres.join(" · "),
      cuota: a.cuota,
      saldo: a.saldo,
      sugerido: a.monto,
      origen: a.origen,
      enCasilla: centavos(num(p.enCasilla)),
      cuotaTerceros: a.cuotaT,
      saldoTerceros: a.saldoT,
      sugeridoTerceros: a.montoT,
      enCasillaTerceros: centavos(num(p.enCasillaTerceros)),
      cuotaDano: a.cuotaD,
      saldoDano: a.saldoD,
      sugeridoDano: a.montoD,
      enCasillaDano: centavos(num(p.enCasillaDano)),
    });
  }

  // Más plata arriba: si alguien mira una sola línea, que sea ésa.
  const total = (s: SugerenciaPrestamo) => num(s.sugerido) + num(s.sugeridoTerceros) + num(s.sugeridoDano);
  return out.sort((x, y) =>
    total(x) !== total(y)
      ? total(y) - total(x)
      : x.etiqueta.localeCompare(y.etiqueta, "es"),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA CUOTA ENTRA SOLA A LA LÍNEA (11-sep-2026)
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que entró SOLO a cada casilla automática. 0 = nada (había algo escrito, o no propone). */
export interface PrestamoAutomatico {
  prestamo: number;
  terceros: number;
  /** La cuota de daño que entró a «Mercancía» (14-sep-2026). */
  mercancia: number;
  /**
   * 🔴 La cuota que se proponía y NO entró porque la casilla tiene un 0 escrito
   * a propósito («no descontar esta quincena»). 0 = no aplica. Lo leen la celda
   * y «Antes de cerrar» (`prestamosSinDescontar`).
   */
  sinDescontar?: { prestamo: number; terceros: number; mercancia: number };
  /**
   * 🔴 Lo que se proponía y NO entró porque el neto no alcanzaba (14-sep-2026,
   * Daniel: *«descuenta lo que alcance y el resto queda debiendo»*). Lo pone
   * `recortarAlNeto` (`neto-no-negativo.ts`) al final de la ruta; `prestamo` /
   * `terceros` / `mercancia` de arriba ya vienen achicados a lo que SÍ entró.
   * Lo leen la celda, «Antes de cerrar» y el cierre.
   */
  recortado?: { prestamo: number; terceros: number; mercancia: number };
  /**
   * 🔴 CUÁNTO DEBE Y CUÁL SERÍA SU CUOTA, cuenta por cuenta (15-sep-2026).
   * Es INFORMACIÓN, no decisión: no mueve un centavo y la casilla sigue vacía.
   *
   * ⚠️ Solo viaja con `PRESTAMO_AUTOMATICO` en `false`. Con el automático
   * prendido la casilla YA muestra la cuota y repetirla al lado sería una
   * palabra de más — la regla de la casa sobre los chips pegados a un dato.
   */
  deuda?: Record<CasillaAutomatica, DeudaCuenta>;
}

/** Lo que se debe de UNA cuenta, y la cuota que tiene cargada. */
export interface DeudaCuenta {
  saldo: number;
  /** 0 = no tiene cuota cargada. */
  cuota: number;
}

/**
 * 🔴 LO ESCRITO A MANO MANDA; VACÍA = LO QUE PROPONE EL MÓDULO; 0 = NADA.
 *
 * `enCasilla` es lo que hay en `asistencia_planilla_manual`: `null` cuando
 * nadie escribió nada (entra la propuesta), un monto > 0 cuando una persona
 * decidió otro número (no se pisa), y **0 cuando decidió que ESTA quincena no
 * se descuenta** (11-sep-2026, Daniel: *«sí»*; migración `20261115120000`).
 * Vale para las TRES casillas automáticas, cada una por separado (la mercancía
 * desde el 14-sep-2026, migración `20261122120000`).
 *
 * ⚠️ Hasta ese día el 0 se leía como «vacío» y no había forma de saltarse una
 * quincena. Los tres estados viven en `casilla-sin-descontar.ts`.
 */
export function casillaAutomatica(
  enCasilla: number | null | undefined,
  sugerido: number,
  automatico: boolean = PRESTAMO_AUTOMATICO,
): number {
  if (estadoCasilla(enCasilla) !== "vacia") return 0;
  return cuotaPropuesta(sugerido, automatico);
}

/**
 * 🔴 EL ÚNICO LUGAR DONDE SE DECIDE SI HAY PROPUESTA, y por eso el interruptor
 * es de verdad uno solo: con el automático apagado el módulo NO PROPONE NADA
 * (15-sep-2026, Daniel: *«que no se descuente hasta que contabilidad lo haga a
 * mano por ahora, hasta que el módulo esté terminado»*). Lo leen la casilla y
 * el «se saltó a propósito», que son las dos formas en que una propuesta podía
 * llegar a la línea.
 *
 * 🔑 `automatico` ENTRA POR PARÁMETRO, con la constante como valor por defecto
 * —el mismo patrón que `vigiaDebeAlertar(fila, ahora, HORAS_PARA_VIGIA)`—: la
 * app nunca lo pasa (usa el interruptor) y los candados pueden probar las DOS
 * direcciones sin tocar el archivo.
 */
function cuotaPropuesta(sugerido: number, automatico: boolean): number {
  if (!automatico) return 0;
  return centavos(Math.max(0, num(sugerido)));
}

/**
 * Mete la cuota en la línea del cuadro: en `dinero.prestamo` / `dinero.terceros`
 * / `dinero.mercancia` (el daño, desde el 14-sep-2026), en el total de
 * deducciones y en el neto. NUNCA en `manuales` — esa es la foto de lo que hay
 * en la tabla, y la pantalla la manda de vuelta entera al guardar cualquier
 * otra casilla (el ISR): si la cuota viviera ahí, editar el ISR congelaría la
 * cuota de hoy como si alguien la hubiera escrito.
 *
 * 🔑 Misma forma que `aplicarAjusteEnLinea`: el monto mueve el total de
 * deducciones y el neto por la MISMA cuenta del motor
 * (`neto = bruto − deducciones + otros servicios`), sin recalcular nada más.
 * Sin `dinero` (servicio profesional, «Tú decides») no se toca nada. Sin nada
 * que meter, vuelve la MISMA referencia.
 */
export function aplicarPrestamoEnLinea<
  L extends { codigo: string; manuales: ManualesLinea; dinero: DineroLinea | null },
>(
  linea: L,
  sugerencia: SugerenciaPrestamo | null | undefined,
  /** 🔑 Solo los candados lo pasan; la app usa el interruptor. */
  automatico: boolean = PRESTAMO_AUTOMATICO,
): L & { prestamoAutomatico?: PrestamoAutomatico } {
  const d = linea.dinero;
  if (!d || !sugerencia) return linea;
  const prestamo = casillaAutomatica(linea.manuales.prestamo, sugerencia.sugerido, automatico);
  const terceros = casillaAutomatica(linea.manuales.terceros, sugerencia.sugeridoTerceros, automatico);
  // 🔴 El daño (14-sep-2026): la MISMA cuenta, sobre `manuales.mercancia`. Sin
  // cuota cargada `sugeridoDano` es 0 y acá no entra nada — la casilla sigue a mano.
  const mercancia = casillaAutomatica(linea.manuales.mercancia, sugerencia.sugeridoDano, automatico);
  // 🔴 Lo que se proponía y se dejó afuera A PROPÓSITO (casilla en 0). No mueve
  // un centavo: se anota para que la celda y «Antes de cerrar» lo digan.
  // 🔑 Pasa por `cuotaPropuesta`: con el automático apagado no había cuota que
  // saltar, así que un 0 en la casilla no dice «me salté $50» — no dice nada.
  const saltado = (escrito: number | null, propuesto: number) =>
    estadoCasilla(escrito) === "sin-descontar" ? cuotaPropuesta(propuesto, automatico) : 0;
  const sinDescontar = {
    prestamo: saltado(linea.manuales.prestamo, sugerencia.sugerido),
    terceros: saltado(linea.manuales.terceros, sugerencia.sugeridoTerceros),
    mercancia: saltado(linea.manuales.mercancia, sugerencia.sugeridoDano),
  };
  const haySaltado = sinDescontar.prestamo > 0 || sinDescontar.terceros > 0 || sinDescontar.mercancia > 0;
  // 🔴 CON EL AUTOMÁTICO APAGADO, LA FILA SIGUE DICIENDO CUÁNTO DEBE
  // (15-sep-2026). No mueve un centavo: viaja al lado de la casilla, que queda
  // vacía. `undefined` con el automático prendido — ahí la casilla ya lo dice.
  const deuda = deudaDeLaSugerencia(sugerencia, automatico);
  if (prestamo <= 0 && terceros <= 0 && mercancia <= 0) {
    if (!haySaltado && !deuda) return linea;
    const auto: PrestamoAutomatico = { prestamo: 0, terceros: 0, mercancia: 0 };
    if (haySaltado) auto.sinDescontar = sinDescontar;
    if (deuda) auto.deuda = deuda;
    return { ...linea, prestamoAutomatico: auto };
  }
  const extra = centavos(prestamo + terceros + mercancia);
  const dinero: DineroLinea = {
    ...d,
    prestamo: centavos(d.prestamo + prestamo),
    terceros: centavos(d.terceros + terceros),
    mercancia: centavos(d.mercancia + mercancia),
    totalDeducciones: centavos(d.totalDeducciones + extra),
    netoPagar: centavos(d.netoPagar - extra),
  };
  const auto: PrestamoAutomatico = { prestamo, terceros, mercancia };
  if (haySaltado) auto.sinDescontar = sinDescontar;
  if (deuda) auto.deuda = deuda;
  return { ...linea, dinero, prestamoAutomatico: auto };
}

/**
 * Lo que la fila MUESTRA cuando el automático está apagado: cuánto debe de cada
 * cuenta y cuál sería su cuota. `null` con el automático prendido (la casilla ya
 * lo dice) y también cuando no debe nada — un «Debe $0.00» es ruido.
 */
function deudaDeLaSugerencia(
  s: SugerenciaPrestamo,
  automatico: boolean,
): Record<CasillaAutomatica, DeudaCuenta> | null {
  if (automatico) return null;
  const deuda: Record<CasillaAutomatica, DeudaCuenta> = {
    prestamo: { saldo: centavos(num(s.saldo)), cuota: centavos(num(s.cuota)) },
    terceros: { saldo: centavos(num(s.saldoTerceros)), cuota: centavos(num(s.cuotaTerceros)) },
    mercancia: { saldo: centavos(num(s.saldoDano)), cuota: centavos(num(s.cuotaDano)) },
  };
  // 🔑 La lista de cuentas es LA MISMA que la de las casillas automáticas
  // (`casilla-sin-descontar.ts`). Escribir acá las tres a mano sería una segunda
  // lista, y el día que nazca una cuarta cuenta se olvidaría una de las dos.
  const algo = CASILLAS_AUTOMATICAS.some((c) => deuda[c].saldo > 0.004);
  return algo ? deuda : null;
}

/**
 * «Debe $254.50 · cuota $50.00» — la pista gris debajo de la casilla.
 * `null` = no hay nada que decir de esa cuenta (no debe, o el automático está
 * prendido y la casilla ya trae el número).
 *
 * 🔑 Sin cuota cargada lo dice, y eso importa: una deuda sin cuota no se
 * descuenta sola ni cuando el automático vuelva a prenderse.
 */
export function textoDeudaCasilla(
  linea: { prestamoAutomatico?: PrestamoAutomatico },
  cuenta: CasillaAutomatica,
): string | null {
  const d = linea.prestamoAutomatico?.deuda?.[cuenta];
  if (!d || d.saldo <= 0.004) return null;
  return d.cuota > 0.004
    ? `Debe ${plata(d.saldo)} · cuota ${plata(d.cuota)}`
    : `Debe ${plata(d.saldo)} · sin cuota`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE SE DICE — solo cuando algo no es lo de siempre
// ─────────────────────────────────────────────────────────────────────────────

function plata(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Un aviso del préstamo en la planilla. */
export type AvisoPrestamo =
  /** La cuota es mayor que el saldo: se descuenta el saldo y con eso termina de pagar. */
  | { tipo: "ultima-cuota"; codigo: string; etiqueta: string; cuenta: "prestamo" | "terceros" | "dano"; cuota: number; saldo: number }
  /** Debe, pero no está en el cuadro de esta quincena: no se le descuenta. */
  | { tipo: "no-cobra"; codigo: string; etiqueta: string; saldo: number };

/**
 * Las últimas cuotas: cuando la cuota es MAYOR que el saldo, la casilla dice el
 * saldo (regla de `montoDeFicha`) y eso se dice, porque el número no es el de
 * todas las quincenas. Solo sobre la propuesta (`origen: "cuota"`): un hecho
 * consumado no es una estimación y no hay nada que explicar.
 */
export function avisosDeUltimaCuota(
  sugerencias: readonly SugerenciaPrestamo[],
  automatico: boolean = PRESTAMO_AUTOMATICO,
): AvisoPrestamo[] {
  // 🔴 Con el automático apagado (15-sep-2026) no entra ninguna cuota, así que
  // «se le descuenta el saldo y no su cuota» describiría algo que no pasa. El
  // aviso de quien debe y NO cobra aquí (`prestamosDeQuienNoCobra`) sigue vivo:
  // ese es cierto pase lo que pase.
  if (!automatico) return [];
  const out: AvisoPrestamo[] = [];
  for (const s of sugerencias) {
    if (s.origen !== "cuota") continue;
    if (num(s.saldo) > 0 && num(s.cuota) > num(s.saldo) + 0.004) {
      out.push({ tipo: "ultima-cuota", codigo: s.codigo, etiqueta: s.etiqueta, cuenta: "prestamo", cuota: centavos(num(s.cuota)), saldo: centavos(num(s.saldo)) });
    }
    if (num(s.saldoTerceros) > 0 && num(s.cuotaTerceros) > num(s.saldoTerceros) + 0.004) {
      out.push({ tipo: "ultima-cuota", codigo: s.codigo, etiqueta: s.etiqueta, cuenta: "terceros", cuota: centavos(num(s.cuotaTerceros)), saldo: centavos(num(s.saldoTerceros)) });
    }
    // El daño, con la misma regla (14-sep-2026).
    if (num(s.saldoDano) > 0 && num(s.cuotaDano) > num(s.saldoDano) + 0.004) {
      out.push({ tipo: "ultima-cuota", codigo: s.codigo, etiqueta: s.etiqueta, cuenta: "dano", cuota: centavos(num(s.cuotaDano)), saldo: centavos(num(s.saldoDano)) });
    }
  }
  return out;
}

/**
 * 🔴 QUIEN DEBE Y NO ESTÁ EN EL CUADRO. Salió (fecha de salida), o su código
 * está ignorado, o no cobra en esta empresa: la planilla no le descuenta nada
 * y hay que decirlo — la deuda no desaparece porque la persona no esté.
 *
 * `fuera` son los códigos que la capa de arriba dejó afuera de esta quincena
 * (bajas + ignorados); `nombreDe` resuelve el código al nombre de Asistencia,
 * y si no lo sabe se usa el de Préstamos.
 */
export function prestamosDeQuienNoCobra(opts: {
  fichas: readonly FichaPrestamo[];
  fuera: ReadonlySet<string>;
  nombreDe: (codigo: string) => string | null | undefined;
}): AvisoPrestamo[] {
  const porCodigo = new Map<string, { etiqueta: string; saldo: number }>();
  for (const f of opts.fichas) {
    const cod = (f.codigo ?? "").trim();
    if (!cod || !opts.fuera.has(cod)) continue;
    const saldo = centavos(num(f.saldo));
    if (saldo <= 0.004) continue;
    const prev = porCodigo.get(cod);
    if (prev) prev.saldo = centavos(prev.saldo + saldo);
    else porCodigo.set(cod, { etiqueta: (opts.nombreDe(cod) ?? "").trim() || f.nombre, saldo });
  }
  return [...porCodigo.entries()]
    .map(([codigo, v]) => ({ tipo: "no-cobra" as const, codigo, etiqueta: v.etiqueta, saldo: v.saldo }))
    .sort((a, b) => b.saldo - a.saldo || a.etiqueta.localeCompare(b.etiqueta, "es"));
}

/**
 * El aviso ámbar de arriba de la planilla. `null` cuando no hay ninguno — un
 * cartel permanente es un cartel que se deja de leer.
 *
 * 🔴 VA CON NOMBRE Y MONTO, persona por persona. Misma regla de Daniel que ya
 * usan las horas extra y las vacaciones ya pagadas: *«lo que un guard rechaza
 * se DICE en pantalla»*.
 */
export function textoAvisoPrestamo(avisos: readonly AvisoPrestamo[]): string | null {
  if (avisos.length === 0) return null;
  const frases = avisos.map((a) => {
    if (a.tipo === "ultima-cuota") {
      const que = a.cuenta === "terceros" ? "de terceros" : a.cuenta === "dano" ? "del daño de mercancía" : "del préstamo";
      return `${a.etiqueta}: se le descuenta ${plata(a.saldo)} y no su cuota ${que} de ${plata(a.cuota)} — con eso termina de pagar.`;
    }
    return `${a.etiqueta} debe ${plata(a.saldo)} y no está en el cuadro de esta quincena (salió, o no cobra aquí): no se le descuenta nada. Si salió, descuéntalo de la liquidación.`;
  });
  return `Préstamos: ${frases.join(" ")}`;
}

/**
 * Las fichas CON SALDO que no están atadas a ninguna persona.
 *
 * 🔴 También se dice. Un préstamo vivo que el sistema no le puede atribuir a
 * nadie es plata que nunca se va a descontar, y callarlo es exactamente cómo se
 * perdieron los $700 de LUIS ADRIAN ARROYO durante 22 días.
 */
export function prestamosSinAtar(
  fichas: readonly FichaPrestamo[],
): PrestamoSinAtar[] {
  return fichas
    .filter((f) => !(f.codigo ?? "").trim() && centavos(num(f.saldo)) > 0)
    .map((f) => ({ nombre: f.nombre, saldo: centavos(num(f.saldo)) }))
    .sort((a, b) => b.saldo - a.saldo);
}

export function textoPrestamoSinAtar(
  items: readonly PrestamoSinAtar[],
): string | null {
  if (items.length === 0) return null;
  const detalle = items.map((s) => `${s.nombre} · ${plata(s.saldo)}`).join(" — ");
  const cabeza =
    items.length === 1
      ? "1 préstamo con saldo no está atado a nadie de la planilla, así que no se le descuenta a ningún colaborador."
      : `${items.length} préstamos con saldo no están atados a nadie de la planilla, así que no se le descuentan a ningún colaborador.`;
  // ⚠️ Esta frase decía lo mismo desde el 2-sep-2026 y la acción NO EXISTÍA: no
  // había forma de poner el código desde ninguna pantalla. Desde el 5-sep-2026
  // sí la hay — se elige a la persona de Asistencia en la ficha del préstamo.
  return `${cabeza} Se atan en Préstamos, eligiendo al colaborador en su ficha. ${detalle}`;
}
