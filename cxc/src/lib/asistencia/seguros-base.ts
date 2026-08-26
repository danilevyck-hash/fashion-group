/* ─────────────────────────────────────────────────────────────────────────────
 * SOBRE QUÉ MONTO SE CALCULAN LOS SEGUROS — la base propia de una persona.
 *
 * Módulo PURO: sin base, sin red. Acá viven el DATO y las palabras; el efecto
 * sobre el dinero lo aplica `calcularDinero` (`planilla.ts`) y el I/O,
 * `config-server.ts`. Es la cuarta hermana de `participacion.ts`, `seguros.ts`
 * y `sueldo-fijo.ts`, y sigue el mismo reparto que las tres.
 *
 * ── 🩸 EL AGUJERO QUE TAPA ───────────────────────────────────────────────────
 *
 * Daniel le preguntó a la contadora de dónde salían los **$17,06** de seguro
 * social de RODRIGO MIRANDA, escritos a mano en su Excel, sin fórmula. Ella
 * contestó, textual:
 *
 *   *«Con respecto a Rodrigo, sí su base para el cálculo del seguro social y
 *   seguro educativo es 175.00. Recuerda que te comenté que él está en una
 *   planilla doméstica y con un menor salario.»*
 *
 * O sea: a Rodrigo los seguros NO se le calculan sobre su bruto. Se le calculan
 * sobre una base FIJA de $175,00, porque está inscrito en la Caja por otra
 * planilla. La aritmética cierra al centavo con los dos montos escritos a mano:
 *
 *     175,00 × 9,75 % = 17,0625 → **$17,06**   (seguro social)
 *     175,00 × 1,25 % =  2,1875 → **$2,19**    (seguro educativo)
 *
 * El módulo, en cambio, se los calculaba sobre el bruto —$403,94 × 9,75 % =
 * $39,38 más $5,05 de educativo—: **$25,18 de más por quincena**, retenidos a
 * una persona de verdad.
 *
 * 🔴 NO SE PUEDE DEDUCIR DE NINGÚN DATO QUE TENGAMOS. En qué planilla está
 * inscrito alguien en la Caja de Seguro Social es un hecho externo al reloj,
 * a la ficha y al sueldo. Por eso es un dato explícito que se carga a mano,
 * igual que la bandera de `seguros.ts`, y no una regla derivada que un día se
 * equivocaría sola.
 *
 * ── 🔴 LA BASE ES **POR QUINCENA**, Y NO ES UN DETALLE ───────────────────────
 *
 * Los $175,00 que dijo la contadora producen $17,06 en **UNA** quincena, y su
 * Excel es quincenal. Se guarda tal cual, en la misma unidad en que ella la
 * dijo, y NO mensual-dividida-por-dos como el salario. Tres razones, en orden:
 *
 *   1. **Reemplaza al bruto, y el bruto ya es quincenal.** Los seguros salen de
 *      `totalBruto`, que es el monto de UNA quincena. La base ocupa ese lugar
 *      exacto: guardarla en otra unidad obligaría a una división que hay que
 *      mantener sincronizada con la del quincenal, y el día que se separen el
 *      número queda mal sin que nadie lo vea.
 *   2. **Es el número que ella dijo.** Guardar 350 para que salga 175 significa
 *      que el «175.00» de su mensaje no aparece en ninguna pantalla, y quien
 *      cotejе contra su Excel en seis meses tiene que dividir para creerle.
 *   3. **El error de tipeo es asimétrico.** Si el campo fuera mensual y alguien
 *      escribe los 175 que dice el mensaje, se le retendría $8,53 en vez de
 *      $17,06: la mitad del seguro, que no se ve en el neto de nadie y se
 *      descubre cuando la Caja pide lo que no se retuvo. Al revés —campo
 *      quincenal, alguien escribe 350— el monto sale al doble y se reclama el
 *      mismo día.
 *
 * 🔑 El nombre de la columna lleva la unidad adentro (`seguros_base_quincena`) y
 * la pantalla muestra los dos montos calculados debajo del campo, para que
 * quien escriba 175 vea $17,06 y $2,19 en el acto y pueda cotejarlos contra el
 * Excel sin hacer una cuenta.
 *
 * ── 🔴 NO ENCIENDE LOS SEGUROS DE NADIE ─────────────────────────────────────
 *
 * `paga_seguros` se pregunta PRIMERO y manda. Quien tiene los seguros apagados
 * sigue con las dos columnas en $0,00 aunque tenga una base cargada: la base no
 * contesta *«¿se le cobran?»* sino *«¿sobre cuánto?»*, y son dos preguntas.
 * El candado está escrito en `calcularDinero` y hay un test que lo exige.
 *
 * ── ⚠️ EL PERÍODO PARCIAL SIGUE EL CRITERIO DEL SUELDO, NO UNO NUEVO ────────
 *
 * Son dos casos distintos y el módulo ya tiene respuesta para los dos:
 *
 *   · **Quien entra o sale a mitad de quincena** no produce un número: el motor
 *     SE ABSTIENE (`decidirAMano`, ver `planilla.ts`) y lo decide una persona.
 *     La base ni llega a aplicarse — misma respuesta que recibe el salario.
 *   · **Un RANGO LIBRE** (del 25-jul al 10-ago, por ejemplo) reparte el sueldo
 *     quincenal con `factorBase`, y la base se reparte con el MISMO factor. Si
 *     no lo hiciera, la base sería el único renglón del cuadro que no se achica
 *     al achicar el rango: media quincena pagaría medio sueldo y el seguro
 *     entero. Una quincena de verdad tiene factor **exactamente 1**, y `× 1` no
 *     mueve un número IEEE-754: en toda planilla real la base es $175,00 clavado.
 *
 * ── 🔴 VACÍA ES EL DEFAULT, Y ESO ES LO QUE HACE QUE NO SE MUEVA UN CENTAVO ──
 *
 * Sin la columna corrida, con la columna en `null`, o con una ficha que nadie
 * tocó, la respuesta es «no tiene base propia» y los seguros salen del bruto,
 * exactamente como salían ayer para las 40 fichas. El día que este código sale
 * a producción la planilla da lo mismo que daba, hasta que alguien escriba un
 * monto a conciencia.
 * ────────────────────────────────────────────────────────────────────────── */

import type { Resultado } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// LAS PALABRAS — en español simple, cortas. Daniel no lee párrafos.
// ─────────────────────────────────────────────────────────────────────────────

/** Cómo se pregunta en la ficha. */
export const PREGUNTA_BASE_SEGUROS = "Base para los seguros";

/**
 * Qué significa, dicho UNA vez y usado en la ficha y en la planilla. Dos
 * redacciones del mismo hecho es la forma de que terminen contradiciéndose.
 */
export const EXPLICACION_BASE_SEGUROS =
  "El monto de UNA quincena sobre el que se calculan el seguro social y el "
  + "educativo, en vez del total bruto. Se usa para quien está inscrito en la "
  + "Caja por otra planilla. Vacío = se calculan sobre el bruto, como siempre.";

/** La línea gris de una sola frase que va debajo del campo. */
export const AYUDA_BASE_SEGUROS = "Se usa en vez del bruto. Es el monto de una quincena.";

/** Lo que se escribe adentro del campo vacío. Dice la unidad sin gastar un renglón. */
export const PLACEHOLDER_BASE_SEGUROS = "Por quincena";

/**
 * El sello chico de la línea de la planilla, para que un seguro de $17,06 donde
 * se esperaba $39,38 se explique solo. Hermano de `CHIP_NO_MARCA_RELOJ`.
 */
export function chipBaseSeguros(monto: number): string {
  return `seguros sobre $${monto.toLocaleString("es-PA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL DATO
// ─────────────────────────────────────────────────────────────────────────────

/** Tope de cordura, el mismo que el CHECK de la base. Nadie cotiza sobre esto. */
export const BASE_SEGUROS_MAX = 100_000;

/**
 * La base propia que viene de la BASE, sea lo que sea. `null` = no tiene.
 *
 * 🩸 POSTGREST DEVUELVE LOS `numeric` COMO TEXTO. No es teoría y ya costó una
 * vez en este mismo módulo: el saldo de vacaciones llegaba como `"12.5"` y un
 * `typeof === "number"` lo tiraba a `null`. Acá el mismo error sería peor —la
 * base desaparecería en silencio y a Rodrigo se le volvería a retener el 9,75 %
 * sobre su bruto—, así que se lee como lo lee `salario_mensual`.
 *
 * ⚠️ EL CERO NO ES UNA BASE, ES UN ERROR. Una base de 0 dejaría los dos seguros
 * en $0,00 por un camino distinto al de `paga_seguros`, o sea dos formas de
 * apagar lo mismo — y una de ellas sin chip, sin aviso y sin que la pantalla
 * diga nada. Se lee como «no tiene base» y el CHECK de la base lo prohíbe.
 * La cadena vacía tampoco es cero: `Number("")` da 0 y ese cero mentiría igual.
 */
export function baseSeguros(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim() !== ""
        ? Number(v.trim().replace(",", "."))
        : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > BASE_SEGUROS_MAX) return null;
  return n;
}

/**
 * Lo que viene en el cuerpo de un PUT. Mismo criterio que `validarSaldoInicial`:
 * llega el TEXTO tal cual del formulario y el validador decide él.
 *
 * Ausente o vacío = `null` (sin base propia, seguros sobre el bruto). No es
 * laxitud: el formulario manda siempre el campo, y para cualquier otro llamador
 * el valor seguro es el que deja el cálculo como está hoy.
 */
export function validarBaseSeguros(body: unknown): Resultado<number | null> {
  const b = (body ?? {}) as Record<string, unknown>;
  const v = b.baseSeguros;
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
    return { ok: true, valor: null };
  }
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  if (!Number.isFinite(n)) {
    return { ok: false, error: "La base para los seguros tiene que ser un número." };
  }
  // 🔴 El cero se rechaza en vez de guardarse: apagar los seguros se hace con el
  // interruptor de al lado, que sí lo dice en pantalla. Ver la nota de arriba.
  if (n <= 0) {
    return {
      ok: false,
      error: "La base para los seguros tiene que ser mayor que 0. Déjala vacía para "
        + "calcularlos sobre el total bruto.",
    };
  }
  if (n > BASE_SEGUROS_MAX) {
    return { ok: false, error: `La base para los seguros no puede pasar de ${BASE_SEGUROS_MAX}.` };
  }
  // A centavos: es plata, y la columna es `numeric(12,2)`. Sin esto un 175,004
  // se guardaría distinto de como se muestra.
  return { ok: true, valor: Math.round(n * 100) / 100 };
}

// ─────────────────────────────────────────────────────────────────────────────
// ¿FALTA CORRER LA MIGRACIÓN?
//
// Mismo criterio que `seguros.ts`, `sueldo-fijo.ts` y `participacion.ts`: en
// este proyecto los DDL los corre Daniel a mano y varios se quedaron pendientes
// semanas. Sin la columna, TODO el módulo sigue funcionando —los seguros salen
// del bruto para todo el mundo, o sea como está hoy— y la pantalla dice qué
// archivo falta en vez de romperse.
// ─────────────────────────────────────────────────────────────────────────────

export const MIGRACION_BASE_SEGUROS = "20260826120000_asistencia_seguros_base_quincena.sql";

/** La columna nueva. Se nombra acá para que el `select` y la detección del
 *  error no se puedan separar.
 *
 *  🔑 LLEVA LA UNIDAD EN EL NOMBRE. Es el único punto ambiguo de todo esto —¿el
 *  monto es del mes o de la quincena?— y el nombre lo contesta antes de que
 *  nadie tenga que abrir un comentario. */
export const COLUMNA_BASE_SEGUROS = "seguros_base_quincena";

interface ErrorPostgrest {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * ¿Este error es "todavía no existe la columna"?
 *
 * Hermano de `esColumnaPagaSegurosFaltante` (`seguros.ts`): `42703` es
 * "undefined_column" de Postgres (lo tira el `select`) y `PGRST204` el de
 * PostgREST cuando la columna no está en su caché de esquema (lo tira el
 * `upsert`).
 *
 * ⚠️ El error tiene que NOMBRAR la columna. Tragarse cualquier error convertiría
 * un problema real —permisos, red, RLS— en una pantalla que miente diciendo
 * "falta la migración".
 */
export function esColumnaBaseSegurosFaltante(err: unknown): boolean {
  if (!err) return false;
  const e = err as ErrorPostgrest;
  const texto = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;
  if (!texto.includes(COLUMNA_BASE_SEGUROS)) return false;

  const code = String(e.code ?? "");
  if (code === "42703" || code === "PGRST204") return true;
  return /does not exist|no existe|schema cache|could not find/i.test(texto);
}

export function avisoMigracionBaseSeguros(): string {
  return (
    "Todavía no se le puede poner una base propia de seguros a nadie: falta "
    + `preparar la base de datos. Pídele a Daniel que corra el archivo ${MIGRACION_BASE_SEGUROS} `
    + "en Supabase. Mientras tanto todo lo demás funciona igual y los seguros se "
    + "calculan sobre el total bruto, como hasta ahora."
  );
}
