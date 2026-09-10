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
 *      movimientos «Pago» con fecha adentro), la casilla dice EXACTAMENTE eso.
 *      Es un hecho consumado, no una estimación.
 *   2. **Si no**, la casilla dice `min(cuota, saldo)` — la misma fórmula de la
 *      RPC, sobre las fichas activas con cuota y saldo.
 *
 * ⚠️ «Abono extra» NO entra en el caso 1. Un abono es plata que la persona
 * pagó por fuera —en efectivo, de su bolsillo— y descontárselo otra vez del
 * sueldo sería cobrarle dos veces. Sí baja el saldo, y el saldo ya viene con
 * eso adentro, así que el caso 2 lo tiene en cuenta solo.
 *
 * ── 🔴 EL DESCUENTO SE APRUEBA, NO SE APLICA SOLO ────────────────────────────
 *
 * La contadora, textual: *«El préstamo si debe ser por aprobarlo»*. La
 * sugerencia entra a la casilla cuando alguien la aprueba, y **la casilla sigue
 * siendo editable** después.
 *
 * ⚠️ Y esta aprobación NO ESCONDE PLATA — es la lección del #651, donde un
 * freno de $700 dejó un préstamo mostrándose en CERO durante 22 días. Lo que
 * está sin aprobar SE VE, con nombre y monto, en ámbar, arriba del cuadro; y el
 * saldo del módulo no depende de esta aprobación en absoluto.
 * ────────────────────────────────────────────────────────────────────────── */

import { centavos } from "./planilla";

/** Los archivos que Daniel tiene que correr. Se le muestran tal cual. */
export const MIGRACION_AMARRE_PRESTAMOS =
  "20260902120000_prestamos_amarre_codigo.sql";
export const MIGRACION_PRESTAMO_APROBADO =
  "20260902130000_planilla_prestamo_aprobado.sql";
export const TABLA_PRESTAMO_APROBADO = "asistencia_prestamo_aprobado";

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

/** Sin la tabla no se puede aprobar; la planilla da lo mismo de hoy. */
export function avisoMigracionPrestamoAprobado(): string {
  return (
    "Los descuentos de préstamo todavía no se pueden aprobar: falta preparar la base. "
    + `Pídele a Daniel que corra el archivo ${MIGRACION_PRESTAMO_APROBADO} en Supabase. `
    + "Mientras tanto la casilla de Préstamo se escribe a mano, como hasta ahora."
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
   * 🔴 LA PLANILLA PROPONE LA SUMA DE LAS DOS EN UNA SOLA CASILLA. Daniel, al
   * ver el mockup de las dos cuentas: *«juntos»*. La casilla «Préstamo» del
   * cuadro es UNA y así se queda: $30 de préstamo + $10 de daño = $40.
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
  /** Lo que el módulo YA registró como pago de TERCEROS dentro de esta quincena. */
  yaDescontadoTerceros: number;
  /**
   * Lo que el módulo YA registró como «Pago» DENTRO de esta quincena. Es un
   * hecho consumado: si hay algo acá, la casilla dice esto y no la cuota.
   */
  yaDescontado: number;
}

/** Una decisión guardada. */
export interface AprobacionPrestamo {
  codigo: string;
  /** `false` = se desaprobó. La fila NO se borra. */
  aprobado: boolean;
  /** El TESTIGO: cuánto sugería el módulo al aprobar. No es lo que se paga. */
  montoVisto: number;
  por: string | null;
  cuando: string | null;
}

/** Lo mínimo que hace falta saber de la persona en el cuadro. */
export interface PersonaEnCuadro {
  codigo: string;
  /** Lo que se muestra. NUNCA vacío. */
  etiqueta: string;
  empresa: string | null;
  empresaEtiqueta: string | null;
  /** Lo que HOY dice la casilla Préstamo de esta quincena. */
  enCasilla: number;
  /** Lo que HOY dice la casilla «Terceros» de esta quincena. */
  enCasillaTerceros: number;
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
  /** El número que va (o fue) a la casilla. Siempre > 0. */
  sugerido: number;
  origen: OrigenSugerencia;
  aprobado: boolean;
  por: string | null;
  cuando: string | null;
  /** El testigo guardado. `null` si nunca se tocó. */
  montoVisto: number | null;
  /** Lo que HOY dice la casilla. */
  enCasilla: number;
  /** 🔴 LA TERCERA CUENTA, con su propia casilla y su propio renglón en el
   *  papel. `min(cuotaTerceros, saldoTerceros)`, o lo ya descontado. */
  cuotaTerceros: number;
  saldoTerceros: number;
  sugeridoTerceros: number;
  enCasillaTerceros: number;
  /**
   * 🔴 Aprobado, pero lo que hay ya no es lo que se aprobó — porque el módulo
   * cambió (se registró un pago, se tomó otro préstamo) o porque alguien
   * corrigió la casilla a mano. Se DICE con los dos números; no se corrige
   * solo, porque una plata que se mueve sola es peor que una que se explica.
   */
  cambio: boolean;
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
  // colocar quincenalmente la cantidad a descontar»*. El daño ya NO propone
  // cuota — su casilla queda vacía y ella escribe el monto— así que sumarlo acá
  // pondría en «Préstamo» una plata que va en otro renglón.
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

export interface OpcionesSugerencia {
  /** Las fichas del módulo de Préstamos, ya con su saldo. */
  fichas: readonly FichaPrestamo[];
  /** La gente del cuadro de esta quincena, por código. */
  personas: readonly PersonaEnCuadro[];
  /** código → decisión guardada. */
  aprobaciones: ReadonlyMap<string, AprobacionPrestamo>;
}

/**
 * Lo que la pantalla muestra: una línea por PERSONA del cuadro que tenga algo
 * que descontar.
 *
 * 🔑 SE AGRUPA POR CÓDIGO, no por ficha. En producción `RAMON MIRANDA` tiene
 * DOS fichas de préstamo atadas al mismo código 21 (una vieja de $3,13 ya
 * pagada y la viva). Una línea por ficha le mostraría dos casillas a la misma
 * persona, y la planilla tiene UNA.
 *
 * ⚠️ Solo entra quien está en el cuadro. Una ficha atada a alguien que esta
 * quincena no cobra (se fue, entró después) no propone nada: la baja ya la
 * decidió la capa de arriba y acá no se vuelve a decidir.
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
    }
  >();

  for (const f of opts.fichas) {
    const cod = (f.codigo ?? "").trim();
    if (!cod) continue;             // sin amarre no se sugiere nada. Se avisa aparte.
    if (!personaDe.has(cod)) continue;
    const { monto, origen } = montoDeFicha(f);
    const { monto: montoT, origen: origenT } = montoTercerosDeFicha(f);
    // 🔑 Entra quien tenga algo que descontar en CUALQUIERA de las dos cuentas
    // automáticas. Antes bastaba con mirar el préstamo porque era la única.
    if (monto <= 0 && montoT <= 0) continue;

    const prev = acumulado.get(cod);
    if (prev) {
      prev.monto = centavos(prev.monto + monto);
      prev.cuota = centavos(prev.cuota + num(f.cuota));
      prev.saldo = centavos(prev.saldo + num(f.saldoPrestamo));
      prev.montoT = centavos(prev.montoT + montoT);
      prev.cuotaT = centavos(prev.cuotaT + num(f.cuotaTerceros));
      prev.saldoT = centavos(prev.saldoT + num(f.saldoTerceros));
      // Con fichas mezcladas manda «descontado»: hay un hecho consumado adentro.
      if (origen === "descontado" || origenT === "descontado") prev.origen = "descontado";
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
        origen: origen === "descontado" || origenT === "descontado" ? "descontado" : origen,
        nombres: [f.nombre],
        montoT,
        cuotaT: centavos(num(f.cuotaTerceros)),
        saldoT: centavos(num(f.saldoTerceros)),
      });
    }
  }

  const out: SugerenciaPrestamo[] = [];
  for (const [codigo, a] of acumulado) {
    const p = personaDe.get(codigo)!;
    const ap = opts.aprobaciones.get(codigo);
    const aprobado = ap?.aprobado === true;
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
      aprobado,
      por: ap?.por ?? null,
      cuando: ap?.cuando ?? null,
      montoVisto: ap ? ap.montoVisto : null,
      enCasilla: centavos(num(p.enCasilla)),
      cuotaTerceros: a.cuotaT,
      saldoTerceros: a.saldoT,
      sugeridoTerceros: a.montoT,
      enCasillaTerceros: centavos(num(p.enCasillaTerceros)),
      // Solo tiene sentido avisar de un cambio sobre algo que SE aprobó.
      cambio:
        aprobado
        && (centavos(num(ap!.montoVisto)) !== a.monto
          || centavos(num(ap!.montoVisto)) !== centavos(num(p.enCasilla))),
    });
  }

  // Más plata arriba: si alguien mira una sola línea, que sea ésa.
  const total = (s: SugerenciaPrestamo) => num(s.sugerido) + num(s.sugeridoTerceros);
  return out.sort((x, y) =>
    total(x) !== total(y)
      ? total(y) - total(x)
      : x.etiqueta.localeCompare(y.etiqueta, "es"),
  );
}

/** Las que todavía no aprobó nadie. Son las que la planilla NO descontó. */
export function prestamosSinAprobar(
  sugerencias: readonly SugerenciaPrestamo[],
): SugerenciaPrestamo[] {
  // ⚠️ Sin aprobar Y sin monto en NINGUNA de las dos casillas automáticas. Si
  // alguien ya lo escribió a mano, la planilla SÍ lo descontó y decir «no se
  // descontó» sería mentir.
  // ⚠️ `num()` y no `<= 0` a secas: un objeto SIN los campos de terceros —una
  // respuesta guardada de antes del 10-sep-2026, o un fixture— daría
  // `undefined <= 0` = false y APAGARÍA el freno en silencio. El freno del
  // cierre no se puede apagar por un campo que todavía no llegó.
  return sugerencias.filter(
    (s) => !s.aprobado && num(s.enCasilla) <= 0 && num(s.enCasillaTerceros) <= 0,
  );
}

function plata(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * El aviso ámbar de arriba de la planilla. `null` cuando no hay ninguno — un
 * cartel permanente es un cartel que se deja de leer.
 *
 * 🔴 VA CON NOMBRE Y MONTO, persona por persona. Misma regla de Daniel que ya
 * usan las horas extra y las vacaciones ya pagadas: *«lo que un guard rechaza
 * se DICE en pantalla»*. Rechazar sí, esconder no.
 */
export function textoPrestamoSinAprobar(
  items: readonly SugerenciaPrestamo[],
): string | null {
  if (items.length === 0) return null;
  const detalle = items
    .map((s) => {
      // Se nombran las dos cuentas cuando las dos tienen algo: un solo monto
      // escondería la mitad de lo que no se descontó.
      const partes: string[] = [];
      if (num(s.sugerido) > 0) partes.push(plata(num(s.sugerido)));
      if (num(s.sugeridoTerceros) > 0) partes.push(`${plata(num(s.sugeridoTerceros))} a terceros`);
      return `${s.etiqueta} · ${partes.join(" + ") || plata(0)}`;
    })
    .join(" — ");
  const cabeza =
    items.length === 1
      ? "1 persona tiene préstamo por descontar sin aprobar: NO se descontó en este cuadro."
      : `${items.length} personas tienen préstamo por descontar sin aprobar: NO se descontó en este cuadro.`;
  return `${cabeza} Se aprueba aquí arriba, en «Préstamos por descontar». ${detalle}`;
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
      ? "1 préstamo con saldo no está atado a nadie de la planilla, así que no se le descuenta a ninguna persona."
      : `${items.length} préstamos con saldo no están atados a nadie de la planilla, así que no se le descuentan a ninguna persona.`;
  // ⚠️ Esta frase decía lo mismo desde el 2-sep-2026 y la acción NO EXISTÍA: no
  // había forma de poner el código desde ninguna pantalla. Desde el 5-sep-2026
  // sí la hay — se elige a la persona de Asistencia en la ficha del préstamo.
  return `${cabeza} Se atan en Préstamos, eligiendo la persona en su ficha. ${detalle}`;
}

/** Cuántas faltan y cuánto suman. Es el contador del bloque. */
export function resumenPrestamos(sugerencias: readonly SugerenciaPrestamo[]): {
  pendientes: number;
  monto: number;
  /** Los códigos pendientes, para el botón «Aprobar todos». */
  codigos: string[];
} {
  const faltan = sugerencias.filter((s) => !s.aprobado);
  return {
    pendientes: faltan.length,
    monto: centavos(faltan.reduce((a, s) => a + num(s.sugerido) + num(s.sugeridoTerceros), 0)),
    codigos: faltan.map((s) => s.codigo),
  };
}
