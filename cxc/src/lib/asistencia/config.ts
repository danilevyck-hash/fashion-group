/* ─────────────────────────────────────────────────────────────────────────────
 * CONFIGURACIÓN DE ASISTENCIA — las personas y TODOS los números del cálculo.
 *
 * Módulo PURO: sin base, sin red y sin variables de entorno. Lo usan la pantalla,
 * las rutas del servidor y los tests, así que hay UNA sola definición de qué es un
 * salario válido, qué es un divisor válido y cuánto vale la hora.
 *
 * ── POR QUÉ ESTE MÓDULO EXISTE ───────────────────────────────────────────────
 *
 * 1) EL RELOJ NO SABE NOMBRES NI EMPRESAS. El Hikvision manda códigos numéricos
 *    (1, 5, 6, 7… hasta 53) y el campo `name` viene VACÍO en las 3.287
 *    marcaciones cargadas (37 personas distintas, julio + agosto 2026). O sea
 *    que el aparato no puede decir quién es cada quien ni cuánto gana.
 *
 * 2) BOSTON, VISTANA Y FASHION WEAR COMPARTEN EL MISMO RELOJ ("reloj cboston").
 *    De un solo aparato tienen que salir TRES planillas distintas, y lo único
 *    que las separa es a qué empresa pertenece cada código. Sin este dato no
 *    hay planilla que valga: los minutos de las tres empresas salen sumados.
 *
 * 3) DANIEL LO PIDIÓ TEXTUAL: *"todos los calculos deben de ser configurables
 *    en caso de que algo cambie"*. Las leyes laborales y los porcentajes de
 *    seguro cambian; una constante escrita en el código obliga a un deploy para
 *    corregir una planilla. Por eso las reglas viven en la base y el código
 *    solo trae el valor por defecto (que es el que confirmó la contable).
 *
 * ── LA TRAMPA DE `Number()` AFUERA, que acá NO se repite ─────────────────────
 * La conversión la hace el VALIDADOR, nunca el llamador. Con `Number(body.x)`
 * antes de validar, `null`, `""` y `[]` llegan convertidos en **0** — y un 0 de
 * divisor no da un error, da `Infinity` y una planilla con números absurdos.
 * Es el mismo bug que costó el divisor del depurador (`0.70` guardado como
 * `70`, precios 100× más baratos) y por el que existe `normalizarBultoPzas`.
 * Por eso cada validador de acá recibe `unknown` y decide él.
 * ────────────────────────────────────────────────────────────────────────── */

import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

// ── Empresas que comparten el reloj ──────────────────────────────────────────
// Solo estas tres. ACS/Multifashion usa OTRO reloj y no entra acá; si algún día
// entra, se agrega a esta lista y al CHECK de la migración (los dos, hay test).
export const EMPRESAS_ASISTENCIA = ["confecciones_boston", "vistana", "fashion_wear"] as const;
export type EmpresaAsistencia = (typeof EMPRESAS_ASISTENCIA)[number];

/** El nombre que ve la gente. Sale de `empresa-mapping`, no de una copia. */
export function etiquetaEmpresa(key: string): string {
  return EMPRESA_KEY_TO_NAME[key] ?? key;
}

// ── Jornadas ─────────────────────────────────────────────────────────────────
// Solo dos en el negocio: 40 h/semana (oficina) y 48 h/semana (planta). No es
// un número libre a propósito — cada una tiene SU divisor, y una jornada de 44
// sin divisor propio daría una rata inventada.
export const JORNADAS = [40, 48] as const;
export type Jornada = (typeof JORNADAS)[number];

// ── Las reglas del cálculo ───────────────────────────────────────────────────

export interface ReglasAsistencia {
  /** Minutos de gracia a la entrada antes de contar tardanza. */
  toleranciaTardanzaMin: number;
  /** Menos de esto no se cuenta como hora extra. */
  extraMinimoMin: number;
  /** Recargo de la hora extra hasta la hora de corte. */
  recargoExtraDiurno: number;
  /** Recargo de la hora extra pasada la hora de corte. */
  recargoExtraNocturno: number;
  /**
   * LA FRONTERA DE LA TARDE, Y ES UNA SOLA. Contable, textual: *"1.25 es hasta
   * las 6 de la tarde, de las 6:01 de la tarde en adelante y el excedente, 3
   * horas extras al día"*. O sea que esta misma hora decide TRES cosas:
   *
   *   · hasta las 18:00           → recargo de día (1.25)
   *   · desde las 18:01           → recargo de noche (1.50); eso YA es nocturna
   *   · desde las 18:01 **y** pasadas las horas extra del excedente → 2.625
   *
   * 🩸 POR ESO NO HAY UN SEGUNDO CAMPO "la jornada nocturna empieza a las __".
   * Dos campos para la misma frontera es la forma de que se separen: alguien
   * mueve uno, se olvida del otro, y el 2.625 empieza a aplicarse a una hora
   * distinta del 1.50 sin que nadie lo note hasta el día de pago. Es un campo
   * porque es un dato, no tres porque se use en tres lugares.
   */
  horaCorteNocturno: string;
  /** Recargo de domingos y feriados. */
  recargoDomingoFeriado: number;
  /** Divisor de la rata para 40 h/semana. */
  divisor40: number;
  /** Divisor de la rata para 48 h/semana. */
  divisor48: number;
  /** Seguro social, en por ciento. */
  seguroSocialPct: number;
  /** Seguro educativo, en por ciento. */
  seguroEducativoPct: number;
  /**
   * Horas extra en un día A PARTIR DE LAS CUALES aplica el recargo de excedente.
   * 3 significa "desde la CUARTA hora extra del día" — las tres primeras van al
   * recargo normal (1.25 o 1.50 según la hora).
   */
  excedenteHorasDia: number;
  /**
   * Recargo del excedente = 2.625 (que es 1.5 × 1.75). Confirmado por la
   * contable el 6-ago-2026, textual:
   *   *"eso después de 3 horas extras al día, cuando sea prolongación de la
   *    jornada nocturna o mixta"*.
   *
   * 🩸 SON DOS CONDICIONES A LA VEZ, NO UNA — y acá es donde se implementa mal:
   *   1) que sean MÁS DE 3 horas extra en el día, **Y**
   *   2) que sean PROLONGACIÓN DE JORNADA NOCTURNA O MIXTA.
   * Una jornada diurna con 5 horas extra NO llega a este factor por muchas
   * horas que acumule.
   *
   * ⚠️ Y OJO CON EL EXCEL VIEJO: su columna dice **"Exedente de 9 horas"**, que
   * NO es esta regla. Esa etiqueta habla de un total de horas del día y omite
   * por completo la condición de nocturna/mixta; leerla literal aplicaría el
   * 2.625 a gente que no le toca. La regla buena es la de arriba.
   *
   * ⏳ TODAVÍA NO SE USA PARA CALCULAR NADA. El campo existe y se guarda; el
   * cálculo de la planilla no está construido. Ver el aviso de la pantalla.
   */
  recargoExcedenteNocturnaMixta: number;
}

/**
 * Los valores CONFIRMADOS por la contable (6-ago-2026).
 *
 * 🩸 La tolerancia arranca en **10**, no en 5. El código traía 5 y Daniel lo
 * corrigió con la contable. El cambio no es cosmético: con 5, quien entra 8:06
 * acumula 6 minutos; con 10 no acumula nada. Se cambia acá una vez y el reporte,
 * el Excel y el PDF lo leen del mismo lugar — no puede quedar una pantalla
 * diciendo "5 de tolerancia" mientras el motor usa 10.
 */
export const REGLAS_DEFAULT: ReglasAsistencia = {
  toleranciaTardanzaMin: 10,
  extraMinimoMin: 15,
  recargoExtraDiurno: 1.25,
  recargoExtraNocturno: 1.5,
  horaCorteNocturno: "18:00",
  recargoDomingoFeriado: 1.5,
  divisor40: 173.33,
  divisor48: 208,
  seguroSocialPct: 9.75,
  seguroEducativoPct: 1.25,
  excedenteHorasDia: 3,
  recargoExcedenteNocturnaMixta: 2.625,
};

/* ─────────────────────────────────────────────────────────────────────────────
 * EL ALMUERZO ES SIEMPRE DE 30 MINUTOS — UNA sola fuente, y es ésta.
 *
 * Daniel, textual (13-ago-2026): *"todos 30 minutos de almuerzo (puedes quitar
 * la opcion de elegir tiempo de almuerzo, siempre es fijo 30 mins)"*.
 *
 * 🩸 ANTES HABÍA DOS LUGARES QUE PODÍAN DECIR COSAS DISTINTAS: la columna
 * `asistencia_horarios.almuerzo_minutos` (por persona, con dos botones de 30 y
 * 60 en la pantalla) y la regla `almuerzo_default_min` de `asistencia_reglas`
 * (una casilla más en «Reglas del cálculo»). Dos perillas para el mismo dato es
 * la forma de que se separen: alguien mueve una, se olvida de la otra, y la
 * jornada de una persona empieza a durar media hora distinta según por dónde se
 * la mire — un error que solo se ve el día de pago.
 *
 * Medido en producción el 13-ago-2026: las 33 personas con horario tienen
 * `almuerzo_minutos = 30`, sin UNA sola excepción en toda la historia de la
 * tabla, y `asistencia_reglas.almuerzo_default_min` también vale 30. O sea que
 * fijar el valor acá no mueve un solo minuto de ninguna quincena.
 *
 * ⚠️ LA COLUMNA DE LA BASE NO SE BORRA Y EL CÁLCULO LA SIGUE LEYENDO. Borrar una
 * columna es irreversible y no compra nada: lo que se retira es la POSIBILIDAD
 * DE ELEGIR MAL. La pantalla de Horarios muestra el almuerzo como dato fijo, el
 * PUT escribe siempre este número (mire lo que mire el cuerpo del pedido) y la
 * casilla de «Reglas del cálculo» desapareció.
 * ────────────────────────────────────────────────────────────────────────── */
export const ALMUERZO_FIJO_MIN = 30;

/* ─────────────────────────────────────────────────────────────────────────────
 * CUÁNTOS MINUTOS TARDE DEJAN DE SER UNA TARDANZA Y PASAN A LLAMARSE AUSENCIA
 *
 * Daniel, 25-ago-2026, sobre la columna «Ausencia» que la contadora venía
 * cargando A MANO:
 *
 *     de 1 minuto a 30  → Tardanza
 *     más de 30 minutos → Ausencia
 *
 * 🔴 Y ESTO NO MUEVE UN CENTAVO. Daniel eligió, entre dos opciones, que los
 * minutos se descuenten **exactamente igual que una tardanza**: *"Los 45
 * minutos, igual que una tardanza. La columna «Ausencia» es solo para que lo
 * veas."* O sea que lo único que cambia es EN QUÉ COLUMNA se muestra la misma
 * plata — el bruto y el neto son idénticos a los de ayer, y hay un candado que
 * lo prueba en dólares para las 3 quincenas × 3 empresas.
 *
 * ⚠️ ES OTRA COSA QUE LA AUSENCIA DE DÍA COMPLETO, y las dos conviven. Quien no
 * marcó NI UNA VEZ en todo el día sigue costando `jornada × rata` y se sigue
 * descontando solo, como hasta hoy: ese comportamiento NO se tocó. Éste es el
 * que llegó, trabajó, y llegó muy tarde.
 *
 * ── 🩸 POR QUÉ ES UNA CONSTANTE Y NO UNA CASILLA MÁS EN «REGLAS DEL CÁLCULO» ──
 *
 * Porque no es un número del negocio que se negocie: es el nombre que se le
 * pone a un rango. Bajarlo a 15 no le cobraría a nadie un centavo distinto —
 * solo movería plata de una columna a la otra— así que una perilla acá no
 * compra nada y sí ofrece una forma de dejar el cuadro raro sin que nadie lo
 * note. Es el mismo criterio que `ALMUERZO_FIJO_MIN`. Se declara en la pantalla
 * de Reglas, en «Esto no se cambia desde acá», junto a las otras.
 *
 * 🔑 SE MIDE CONTRA LOS MINUTOS DE TARDANZA YA CONTADOS, o sea DESPUÉS de la
 * tolerancia. Con la tolerancia en 10, quien llega 8:41 tiene 41 minutos de
 * tardanza y cae del lado de la ausencia; quien llega 8:39 tiene 39 y también.
 * La tolerancia perdona, este umbral solo rotula: son dos cosas distintas y por
 * eso no se suman ni se restan entre sí.
 * ────────────────────────────────────────────────────────────────────────── */
export const MINUTOS_TARDE_QUE_SON_AUSENCIA = 30;

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ LO QUE NO ES CONFIGURABLE, A PROPÓSITO — y por qué no debe volverse un campo
//
// Estas cuatro NO son números sueltos: son la FORMA del cálculo. Ponerlas en la
// pantalla sería darle a Daniel una perilla para romper la planilla sin querer,
// y el daño no se vería hasta el día de pago.
//
//   1. LA AUSENCIA SE DESCUENTA COMO `horas × rata`. No es un factor que se
//      elige: es la definición de un día no trabajado.
//   2. LA QUINCENA VA DEL 1 AL 15 Y DEL 16 AL 30. Cambiar los cortes cambia qué
//      días entran en cada pago, no cuánto vale una hora.
//   3. EL DÍA 31 NO SE PAGA, PERO SÍ SE DESCUENTA SI SE FALTA. Es asimétrico a
//      propósito y así lo trabaja la contable; expresarlo como una casilla
//      invitaría a "arreglar" la asimetría, que es justo lo que no hay que hacer.
//   4. EL ALMUERZO ES DE 30 MINUTOS PARA TODO EL MUNDO (`ALMUERZO_FIJO_MIN`).
//      Lo fijó Daniel y es igual en las 33 personas con horario; tener dos
//      perillas para eso solo servía para que dijeran cosas distintas.
//   5. PASADOS 30 MINUTOS TARDE, LA COLUMNA SE LLAMA «AUSENCIA»
//      (`MINUTOS_TARDE_QUE_SON_AUSENCIA`). No cambia cuánto se descuenta —los
//      minutos valen lo mismo de los dos lados—, solo dónde se muestra, así que
//      una casilla acá no compraría nada y sí dejaría el cuadro raro.
//
// Si algún día alguna de las cinco cambia, se cambia EN CÓDIGO y con un test
// que la respalde. Que a nadie se le ocurra "mejorar" esta pantalla agregándolas.
// ─────────────────────────────────────────────────────────────────────────────

// ── Rangos, cada uno con su porqué ───────────────────────────────────────────

/** Tolerancia: 0 es legítimo (sin gracia). Una hora de gracia no lo es. */
export const TOLERANCIA_MAX_MIN = 60;
/** Mínimo de extra y almuerzo: 4 horas es el techo de cualquier cosa sensata. */
export const MINUTOS_MAX = 240;
/**
 * Un recargo NUNCA baja de 1.00 — pagar la hora extra más barata que la normal
 * no es una decisión de negocio, es el 1.25 escrito como 0.25 o como 25.
 * El techo de 5 deja aire sobre el más alto que se usa hoy (2.625, el del
 * excedente en jornada nocturna o mixta).
 */
export const RECARGO_MIN = 1;
export const RECARGO_MAX = 5;
/** Porcentajes de seguro: 9,75 y 1,25. El techo de 50 atrapa el "975". */
export const PORCENTAJE_MAX = 50;
/**
 * Divisor de la rata: 173.33 y 208 son horas al mes.
 * 🔑 EL PISO ES LO QUE IMPORTA: un divisor 0 no da error, da `Infinity`, y una
 * planilla con rata infinita se paga. 744 = horas de un mes de 31 días.
 */
export const DIVISOR_RATA_MIN = 1;
export const DIVISOR_RATA_MAX = 744;
/** Salario mensual. El mínimo de Panamá ronda $326; el techo deja 300× de aire
 *  y atrapa el error de teclear centavos ("300000" por "3.000,00"). */
export const SALARIO_MAX = 100_000;
/** Excedente diario en horas. Nadie hace 12 horas extra en un día. */
export const EXCEDENTE_HORAS_MAX = 12;

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

// ── El validador base ────────────────────────────────────────────────────────

/**
 * Convierte y valida UN número. Recibe `unknown` a propósito: si el llamador
 * hiciera `Number(x)` antes, `null`/`""`/`[]` llegarían como 0 y pasarían
 * cualquier chequeo de "es finito".
 */
function numero(
  v: unknown,
  opts: { min: number; max: number; entero?: boolean; que: string; ayuda: string },
): Resultado<number> {
  // `null`, `undefined`, `""` y todo lo que NO sea número o string se rechaza
  // antes de convertir. `[]` → `Number([])` es 0; `[5]` → 5. Ninguno es un dato.
  if (typeof v !== "number" && typeof v !== "string") {
    return { ok: false, error: `Falta ${opts.que}. ${opts.ayuda}` };
  }
  const texto = typeof v === "string" ? v.trim().replace(",", ".") : String(v);
  if (texto === "") return { ok: false, error: `Falta ${opts.que}. ${opts.ayuda}` };
  const n = Number(texto);
  if (!Number.isFinite(n)) {
    return { ok: false, error: `${opts.que} tiene que ser un número. ${opts.ayuda}` };
  }
  if (opts.entero && !Number.isInteger(n)) {
    return { ok: false, error: `${opts.que} va en números enteros, sin decimales. ${opts.ayuda}` };
  }
  if (n < opts.min) {
    return { ok: false, error: `${opts.que} no puede ser menor que ${opts.min}. ${opts.ayuda}` };
  }
  if (n > opts.max) {
    return { ok: false, error: `${opts.que} no puede ser mayor que ${opts.max}. ${opts.ayuda}` };
  }
  return { ok: true, valor: n };
}

/** Redondea a `d` decimales sin arrastrar la basura del punto flotante. */
function redondear(n: number, d: number): number {
  return Math.round(n * 10 ** d) / 10 ** d;
}

// ── Validadores de PERSONA ───────────────────────────────────────────────────

export const NOMBRE_MAX = 120;

/** El nombre de la persona. Es obligatorio: el reloj manda el código pelado. */
export function validarNombre(v: unknown): Resultado<string> {
  if (typeof v !== "string") return { ok: false, error: "Escribe el nombre de la persona." };
  const s = v.trim().replace(/\s+/g, " ");
  if (!s) return { ok: false, error: "Escribe el nombre de la persona." };
  if (s.length > NOMBRE_MAX) {
    return { ok: false, error: `El nombre es muy largo (máximo ${NOMBRE_MAX} letras).` };
  }
  return { ok: true, valor: s };
}

/**
 * Salario mensual. `null` es un valor válido y significa "todavía no lo sé":
 * se puede asignar la empresa de una persona sin conocerle el sueldo y la
 * pantalla lo marca como pendiente. Lo que NO entra es 0 ni negativo — con 0
 * la rata da 0 y la planilla saldría en cero sin avisar.
 */
export function validarSalario(v: unknown): Resultado<number | null> {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) {
    return { ok: true, valor: null };
  }
  const r = numero(v, {
    min: 0.01,
    max: SALARIO_MAX,
    que: "El salario mensual",
    ayuda: "Escríbelo en dólares al mes, por ejemplo 850.00",
  });
  if (!r.ok) return r;
  return { ok: true, valor: redondear(r.valor, 2) };
}

/** Jornada semanal: 40 o 48, nada más. Cada una tiene SU divisor. */
export function validarJornada(v: unknown): Resultado<Jornada> {
  const r = numero(v, {
    min: 40, max: 48, entero: true,
    que: "La jornada semanal",
    ayuda: "Solo puede ser 40 o 48 horas por semana.",
  });
  if (!r.ok) return r;
  if (!(JORNADAS as readonly number[]).includes(r.valor)) {
    return { ok: false, error: "La jornada semanal solo puede ser 40 o 48 horas por semana." };
  }
  return { ok: true, valor: r.valor as Jornada };
}

/** Empresa. Es lo que separa las tres planillas del mismo reloj. */
export function validarEmpresa(v: unknown): Resultado<EmpresaAsistencia> {
  const s = typeof v === "string" ? v.trim() : "";
  if (!(EMPRESAS_ASISTENCIA as readonly string[]).includes(s)) {
    return {
      ok: false,
      error: `Elige la empresa: ${EMPRESAS_ASISTENCIA.map(etiquetaEmpresa).join(", ")}.`,
    };
  }
  return { ok: true, valor: s as EmpresaAsistencia };
}

export interface PersonaConfig {
  codigo: string;
  nombre: string;
  salarioMensual: number | null;
  jornadaSemanal: Jornada;
  empresa: EmpresaAsistencia;
}

/** Valida el cuerpo entero de "guardar una persona". Devuelve TODOS los errores. */
export function validarPersona(body: unknown): Resultado<PersonaConfig> {
  const b = (body ?? {}) as Record<string, unknown>;
  const codigo = typeof b.codigo === "string" ? b.codigo.trim() : "";
  if (!codigo) return { ok: false, error: "Falta el código de la persona en el reloj." };

  const nombre = validarNombre(b.nombre);
  if (!nombre.ok) return nombre;
  const salario = validarSalario(b.salarioMensual);
  if (!salario.ok) return salario;
  const jornada = validarJornada(b.jornadaSemanal);
  if (!jornada.ok) return jornada;
  const empresa = validarEmpresa(b.empresa);
  if (!empresa.ok) return empresa;

  return {
    ok: true,
    valor: {
      codigo,
      nombre: nombre.valor,
      salarioMensual: salario.valor,
      jornadaSemanal: jornada.valor,
      empresa: empresa.valor,
    },
  };
}

// ── Validadores de REGLAS ────────────────────────────────────────────────────

export function validarTolerancia(v: unknown): Resultado<number> {
  return numero(v, {
    min: 0, max: TOLERANCIA_MAX_MIN, entero: true,
    que: "La tolerancia de tardanza",
    ayuda: "Va en minutos enteros, por ejemplo 10.",
  });
}

export function validarMinutos(v: unknown, que: string, ejemplo: string): Resultado<number> {
  return numero(v, {
    min: 0, max: MINUTOS_MAX, entero: true,
    que, ayuda: `Va en minutos enteros, por ejemplo ${ejemplo}.`,
  });
}

export function validarRecargo(v: unknown, que: string, ejemplo: string): Resultado<number> {
  const r = numero(v, {
    min: RECARGO_MIN, max: RECARGO_MAX, que,
    ayuda: `Se escribe como factor: ${ejemplo}. Nunca menos de 1.00 — eso pagaría la hora más barata que la normal.`,
  });
  if (!r.ok) return r;
  return { ok: true, valor: redondear(r.valor, 4) };
}

export function validarPorcentaje(v: unknown, que: string, ejemplo: string): Resultado<number> {
  const r = numero(v, {
    min: 0, max: PORCENTAJE_MAX, que,
    ayuda: `Se escribe en por ciento, por ejemplo ${ejemplo}.`,
  });
  if (!r.ok) return r;
  return { ok: true, valor: redondear(r.valor, 4) };
}

/**
 * Las horas que se trabajan al mes. La rata es `salario ÷ estas horas`, así que
 * un 0 acá no da un error: da `Infinity` y la planilla se paga con ese número.
 * Por eso el piso es 1 y no 0, y por eso este validador nunca recibe un
 * `Number()` ya hecho.
 *
 * ⚠️ En el código se llama `divisor` —y las columnas son `divisor_40` y
 * `divisor_48`— pero eso NO se le muestra a nadie: la contable revisó el cuadro
 * de reglas, validó todo y se trabó justo en esa palabra (*"no sé a qué se
 * refiere eso de divisores"*). El nombre técnico se deja como está para no pedir
 * otra migración a mano; lo que se ve dice "horas que se trabajan al mes".
 */
export function validarDivisorRata(v: unknown, que: string, ejemplo: string): Resultado<number> {
  const r = numero(v, {
    min: DIVISOR_RATA_MIN, max: DIVISOR_RATA_MAX, que,
    ayuda: `Por ejemplo ${ejemplo}. El salario mensual se divide entre estas horas para sacar la rata por hora, así que no puede ser 0.`,
  });
  if (!r.ok) return r;
  return { ok: true, valor: redondear(r.valor, 4) };
}

export function validarHora(v: unknown, que: string): Resultado<string> {
  const s = typeof v === "string" ? v.trim() : "";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) {
    return { ok: false, error: `${que} tiene que ser una hora como 18:00.` };
  }
  return { ok: true, valor: s };
}

export function validarExcedenteHoras(v: unknown): Resultado<number> {
  const r = numero(v, {
    min: 0, max: EXCEDENTE_HORAS_MAX,
    que: "El excedente de horas al día",
    ayuda: "Va en horas, por ejemplo 3.",
  });
  if (!r.ok) return r;
  return { ok: true, valor: redondear(r.valor, 2) };
}

/**
 * Recargo del excedente (2.625 = 1.5 × 1.75). Se valida como cualquier otro
 * recargo aunque hoy no se use para calcular: guardar un número inválido ahora
 * es dejar una bomba para el día que el cálculo se construya.
 */
export function validarRecargoExcedente(v: unknown): Resultado<number> {
  return validarRecargo(v, "El recargo del excedente en jornada nocturna o mixta", "2.625");
}

/** Valida el cuerpo entero de "guardar las reglas". */
export function validarReglas(body: unknown): Resultado<ReglasAsistencia> {
  const b = (body ?? {}) as Record<string, unknown>;

  const pasos: Array<[keyof ReglasAsistencia, Resultado<number | string | null>]> = [
    ["toleranciaTardanzaMin", validarTolerancia(b.toleranciaTardanzaMin)],
    ["extraMinimoMin", validarMinutos(b.extraMinimoMin, "El mínimo para contar hora extra", "15")],
    // ⛔ El almuerzo NO se valida acá porque ya no es un campo: es fijo en 30
    // minutos (`ALMUERZO_FIJO_MIN`). Si alguien manda `almuerzoDefaultMin` en el
    // cuerpo, se ignora — que es exactamente lo que tiene que pasar.
    ["recargoExtraDiurno", validarRecargo(b.recargoExtraDiurno, "El recargo de hora extra de día", "1.25")],
    ["recargoExtraNocturno", validarRecargo(b.recargoExtraNocturno, "El recargo de hora extra de noche", "1.50")],
    ["horaCorteNocturno", validarHora(b.horaCorteNocturno, "La hora de corte de la noche")],
    ["recargoDomingoFeriado", validarRecargo(b.recargoDomingoFeriado, "El recargo de domingos y feriados", "1.50")],
    // Sin la palabra "divisor": la contable no la usa y es la que lee el error.
    ["divisor40", validarDivisorRata(b.divisor40, "El total de horas al mes de quien trabaja 40 horas por semana", "173.33")],
    ["divisor48", validarDivisorRata(b.divisor48, "El total de horas al mes de quien trabaja 48 horas por semana", "208")],
    ["seguroSocialPct", validarPorcentaje(b.seguroSocialPct, "El seguro social", "9.75")],
    ["seguroEducativoPct", validarPorcentaje(b.seguroEducativoPct, "El seguro educativo", "1.25")],
    ["excedenteHorasDia", validarExcedenteHoras(b.excedenteHorasDia)],
    ["recargoExcedenteNocturnaMixta", validarRecargoExcedente(b.recargoExcedenteNocturnaMixta)],
  ];

  const out = {} as Record<string, unknown>;
  for (const [campo, r] of pasos) {
    if (!r.ok) return { ok: false, error: r.error };
    out[campo] = r.valor;
  }
  return { ok: true, valor: out as unknown as ReglasAsistencia };
}

// ── Ida y vuelta con la base ─────────────────────────────────────────────────

/** Fila de `asistencia_reglas` → objeto del código. Lo que falte usa el default. */
export function reglasDesdeFila(fila: Record<string, unknown> | null | undefined): ReglasAsistencia {
  const f = fila ?? {};
  const num = (k: string, def: number): number => {
    const n = Number(f[k]);
    return f[k] === null || f[k] === undefined || !Number.isFinite(n) ? def : n;
  };

  return {
    toleranciaTardanzaMin: num("tolerancia_tardanza_min", REGLAS_DEFAULT.toleranciaTardanzaMin),
    extraMinimoMin: num("extra_minimo_min", REGLAS_DEFAULT.extraMinimoMin),
    // 🔑 `almuerzo_default_min` SE IGNORA aunque la columna siga en la tabla: el
    // almuerzo vive en `ALMUERZO_FIJO_MIN` y en `asistencia_horarios`. Leerla
    // acá devolvería la segunda perilla por la puerta de atrás.
    recargoExtraDiurno: num("recargo_extra_diurno", REGLAS_DEFAULT.recargoExtraDiurno),
    recargoExtraNocturno: num("recargo_extra_nocturno", REGLAS_DEFAULT.recargoExtraNocturno),
    horaCorteNocturno:
      typeof f.hora_corte_nocturno === "string"
        ? String(f.hora_corte_nocturno).slice(0, 5)
        : REGLAS_DEFAULT.horaCorteNocturno,
    recargoDomingoFeriado: num("recargo_domingo_feriado", REGLAS_DEFAULT.recargoDomingoFeriado),
    divisor40: num("divisor_40", REGLAS_DEFAULT.divisor40),
    divisor48: num("divisor_48", REGLAS_DEFAULT.divisor48),
    seguroSocialPct: num("seguro_social_pct", REGLAS_DEFAULT.seguroSocialPct),
    seguroEducativoPct: num("seguro_educativo_pct", REGLAS_DEFAULT.seguroEducativoPct),
    excedenteHorasDia: num("excedente_horas_dia", REGLAS_DEFAULT.excedenteHorasDia),
    recargoExcedenteNocturnaMixta: num(
      "recargo_excedente_nocturna_mixta",
      REGLAS_DEFAULT.recargoExcedenteNocturnaMixta,
    ),
  };
}

/** Objeto del código → fila de `asistencia_reglas`. */
export function reglasHaciaFila(r: ReglasAsistencia): Record<string, unknown> {
  return {
    id: 1,
    tolerancia_tardanza_min: r.toleranciaTardanzaMin,
    extra_minimo_min: r.extraMinimoMin,
    // `almuerzo_default_min` NO se escribe: la columna queda con el 30 que ya
    // tiene (el upsert solo pisa las columnas que se mandan) y nadie la lee.
    recargo_extra_diurno: r.recargoExtraDiurno,
    recargo_extra_nocturno: r.recargoExtraNocturno,
    hora_corte_nocturno: r.horaCorteNocturno,
    recargo_domingo_feriado: r.recargoDomingoFeriado,
    divisor_40: r.divisor40,
    divisor_48: r.divisor48,
    seguro_social_pct: r.seguroSocialPct,
    seguro_educativo_pct: r.seguroEducativoPct,
    excedente_horas_dia: r.excedenteHorasDia,
    recargo_excedente_nocturna_mixta: r.recargoExcedenteNocturnaMixta,
  };
}

// ── La rata ──────────────────────────────────────────────────────────────────

/** El divisor que le toca a una jornada. `null` si el divisor guardado no sirve. */
export function divisorDe(jornada: number, reglas: ReglasAsistencia): number | null {
  const d = jornada === 40 ? reglas.divisor40 : jornada === 48 ? reglas.divisor48 : NaN;
  // 🔑 El guard que evita `Infinity`. Un divisor 0 o negativo no se usa NUNCA,
  // ni siquiera si alguien lo metió a mano en la base saltándose el CHECK.
  return Number.isFinite(d) && d > 0 ? d : null;
}

/**
 * Rata por hora = salario mensual ÷ divisor de la jornada.
 * `null` cuando no se puede calcular (sin salario, o con un divisor inservible).
 * Nunca devuelve `Infinity` ni `NaN`: un número así se paga igual que uno bueno.
 */
export function rataPorHora(
  salarioMensual: number | null | undefined,
  jornada: number,
  reglas: ReglasAsistencia,
): number | null {
  if (salarioMensual === null || salarioMensual === undefined) return null;
  if (!Number.isFinite(salarioMensual) || salarioMensual <= 0) return null;
  const d = divisorDe(jornada, reglas);
  if (d === null) return null;
  return redondear(salarioMensual / d, 4);
}

/** Valor del minuto = rata ÷ 60. */
export function valorMinuto(
  salarioMensual: number | null | undefined,
  jornada: number,
  reglas: ReglasAsistencia,
): number | null {
  const r = rataPorHora(salarioMensual, jornada, reglas);
  return r === null ? null : redondear(r / 60, 6);
}

// ── ¿Falta correr la migración? ──────────────────────────────────────────────
//
// 🩸 En este proyecto los DDL los corre Daniel a mano, y varios se quedaron
// "PENDIENTES" durante semanas. Si la pantalla se cayera hasta que alguien corra
// el SQL, el síntoma sería "Asistencia está rota" — nadie deduce de un 500 que
// falta un CREATE TABLE. Por eso se DEGRADA con un aviso concreto que nombra el
// archivo. Mismo criterio que `catalogo/cols-opcionales.ts`, un escalón arriba:
// allá falta una columna, acá la tabla entera.
//
// La detección vive acá —es pura y se prueba sin base—; el I/O en
// `config-server.ts`.

/** El archivo que Daniel tiene que correr. Se le muestra tal cual al usuario. */
export const MIGRACION_CONFIGURACION = "20260806160000_asistencia_configuracion.sql";

export const TABLA_PERSONAS = "asistencia_personas";
export const TABLA_REGLAS = "asistencia_reglas";
/**
 * Las VACACIONES. Vive acá —y no en `vacaciones.ts`— porque `esTablaFaltante`
 * la necesita, y ese archivo es puro: no puede saber de tablas ni de Supabase.
 */
export const TABLA_VACACIONES = "asistencia_vacaciones";

interface ErrorPostgrest {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * ¿Este error es "esa tabla todavía no existe"?
 *
 * - `42P01` es el código de Postgres para "undefined_table".
 * - `PGRST205` es el de PostgREST cuando la tabla no está en su caché de esquema
 *   (que es lo que se ve de verdad desde el cliente de la base).
 * - El texto se acepta solo si NOMBRA la tabla: sin eso no se distingue de
 *   cualquier otro fallo.
 */
export function esTablaFaltante(err: unknown, tabla: string): boolean {
  if (!err) return false;
  const e = err as ErrorPostgrest;
  const texto = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;

  // 🔑 El error tiene que NOMBRAR esta tabla. El código solo no alcanza: se
  // consultan dos tablas distintas y un 42P01 de la otra haría creer que falta
  // ésta. Los mensajes de Postgres y de PostgREST siempre traen el nombre.
  if (!texto.includes(tabla)) return false;

  const code = String(e.code ?? "");
  if (code === "42P01" || code === "PGRST205") return true;
  return /does not exist|no existe|schema cache|could not find/i.test(texto);
}

/** El mensaje que ve la gente cuando falta correr el SQL. Sin jerga de base. */
export function avisoMigracion(): string {
  return `Falta preparar la base de datos para esta pantalla. Pídele a Daniel que corra el archivo ${MIGRACION_CONFIGURACION} en Supabase.`;
}
