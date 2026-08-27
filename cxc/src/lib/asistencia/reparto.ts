/* ─────────────────────────────────────────────────────────────────────────────
 * UNA PERSONA, DOS EMPRESAS — leer y validar el reparto de un sueldo.
 *
 * Módulo PURO: sin base, sin red. Acá viven la VALIDACIÓN de lo que llega de la
 * base y las PALABRAS; el efecto sobre el dinero lo aplica `planilla.ts` —donde
 * viven `ParteReparto` y `repartirHoras`, que son la regla— y el I/O,
 * `config-server.ts`.
 *
 * 🔑 Importa de `planilla.ts` y NADIE lo importa de vuelta: mismo arreglo que
 * `rata.ts`, y por el mismo motivo —no hay ciclo, y el redondeo a centavos es
 * UNO SOLO, el que usa el cálculo, no una copia que después se queda vieja.
 *
 * ── 🩸 EL AGUJERO QUE TAPA ───────────────────────────────────────────────────
 *
 * La contadora, textual (27-ago-2026): *«El salario de Julio es 1000 y están
 * divididos en dos empresas. 800 en Vistana, sobre los cuales se aplican seguro
 * social y educativo. Los otros 200 están en Fashion Wear. Aquí es servicios
 * profesionales y es aquí donde se le pagan las horas extras. En ambas empresas
 * su rata por hora es 5.77»*.
 *
 * `asistencia_personas` tiene `PRIMARY KEY (empleado_codigo)` —medido contra
 * producción— y `empresa`, `salario_mensual`, `servicio_profesional` y
 * `paga_seguros` son todos POR PERSONA. Una persona = una fila = UNA empresa.
 * JULIO GARAY (código 11) estaba entero en Vistana con $1.000, y sus horas
 * extra pagaban el 11 % de seguros que en Fashion Wear no les corresponde.
 *
 * ── 🔴 POR QUÉ NO SE TOCA LA LLAVE DE `asistencia_personas` ──────────────────
 *
 * Es LA tabla del módulo: 37 fichas, y el motor entero —el directorio, las
 * justificaciones, las vacaciones, las correcciones, las aprobaciones— asume
 * una ficha por código. Partirla en dos filas para una persona rompería esa
 * suposición en veinte lugares a la vez, y diecinueve de ellos no tienen nada
 * que ver con el sueldo. El reparto CUELGA de la ficha: la ficha sigue siendo
 * una, y lo que se parte es el PAGO.
 * ────────────────────────────────────────────────────────────────────────── */

import {
  EMPRESAS_ASISTENCIA,
  etiquetaEmpresa,
  type Resultado,
} from "./config";
import { centavos, type ParteReparto } from "./planilla";

// ─────────────────────────────────────────────────────────────────────────────
// LAS PALABRAS — en español simple, sin jerga
// ─────────────────────────────────────────────────────────────────────────────

/** El título de la tarjeta en la ficha. Las palabras del mockup que aprobó Daniel. */
export const TITULO_REPARTO = "Se reparte en";

/** El rótulo de la parte que va por planilla normal. */
export const MODO_PLANILLA = "Planilla";
/** El rótulo de la parte que va como servicios profesionales (sin seguros). */
export const MODO_SERVICIOS = "Servicios profesionales";
/** El sello de la parte donde se pagan las horas extra. */
export const SELLO_HORAS_EXTRA = "Horas extra";

/** Lo que se muestra al lado del nombre en el cuadro de la planilla. */
export const CHIP_REPARTIDO = "sueldo repartido";

/**
 * Qué significa, dicho UNA vez y usado en la ficha y en el cuadro. Dos
 * redacciones del mismo hecho es la forma de que terminen contradiciéndose.
 *
 * 🔑 Una línea. Daniel no lee párrafos explicativos y los pidió fuera de la UI.
 */
export const EXPLICACION_REPARTO =
  "Su sueldo se paga entre dos empresas y sale en las dos planillas. La rata por "
  + "hora es la misma en las dos: sale del sueldo completo.";

/** Cómo se llama esta parte, para la ficha y el cuadro. */
export function modoDeParte(p: ParteReparto): string {
  return p.pagaSeguros ? MODO_PLANILLA : MODO_SERVICIOS;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL DATO
// ─────────────────────────────────────────────────────────────────────────────

/** Una fila de `asistencia_reparto_empresa` tal como viene de la base, sin validar. */
export interface FilaReparto {
  empleado_codigo: string;
  empresa: string | null;
  /** ⚠️ `numeric` en la base, y PostgREST lo manda como TEXTO. Ver `numero`. */
  salario_mensual: number | string | null;
  paga_seguros?: boolean | null;
  paga_horas_extra?: boolean | null;
  orden?: number | null;
}

/**
 * 🩸 UN `Number(...)` PELADO NO ALCANZA. La columna es `numeric` y PostgREST la
 * manda como TEXTO — es el mismo modo de fallo que ya costó una vez con el
 * saldo de vacaciones y otra con la base de seguros. Acá un monto perdido en
 * silencio haría que las partes no sumen y el reparto entero se rechace.
 */
const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// LA VALIDACIÓN — el candado que hace que esto no pueda inventar plata
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿Este reparto sirve? Devuelve las partes ordenadas, o el motivo por el que NO.
 *
 * 🔴 ANTE CUALQUIER DUDA SE RECHAZA, Y RECHAZAR ES VOLVER A HOY: quien tenga un
 * reparto inválido cobra su UNA línea de siempre, con su sueldo entero y sus
 * seguros, exactamente como antes de que este archivo existiera. Un reparto a
 * medias sería la única forma de que alguien cobre de menos sin que se vea.
 *
 * 🔴 Y EL MOTIVO SE DEVUELVE PARA DECIRLO EN PANTALLA. Regla firme de Daniel:
 * *lo que un guard rechaza se DICE*, con el nombre y en ámbar. Rechazar sí,
 * esconder no.
 *
 * Sin filas devuelve la lista VACÍA y `ok: true`: no tener reparto no es un
 * error, es lo que le pasa a 36 de las 37 fichas.
 *
 * Las cinco reglas, y cada una tapa una forma distinta de perder plata:
 *
 *  1. **Al menos DOS partes.** Una sola no es un reparto: es la ficha de hoy
 *     escrita dos veces, y la segunda escritura es la que se olvida de
 *     actualizar.
 *  2. **Empresas válidas y sin repetir.** Dos partes en la misma empresa serían
 *     dos líneas en el mismo cuadro para la misma persona: nadie sabría cuál es
 *     cuál y el total del cuadro las sumaría a las dos.
 *  3. **Cada monto > 0.** Una parte en cero es una línea que no paga nada y que
 *     igual aparece en un cuadro pidiendo firma.
 *  4. 🔴 **LOS MONTOS SUMAN EL SALARIO DE LA FICHA, AL CENTAVO.** Es la regla
 *     que sostiene todo lo demás: la rata sale del salario de la ficha, así que
 *     si las partes sumaran otra cosa la persona cobraría un sueldo y se le
 *     valuaría la hora con otro. $800 + $200 = $1.000 ✓.
 *  5. **Exactamente UNA parte paga las horas extra.** Ninguna las perdería en
 *     silencio; dos las pagarían dos veces.
 */
export function validarReparto(
  salarioMensualFicha: number | null | undefined,
  filas: readonly FilaReparto[] | null | undefined,
): Resultado<ParteReparto[]> {
  const crudas = filas ?? [];
  if (crudas.length === 0) return { ok: true, valor: [] };

  const total = numero(salarioMensualFicha);
  if (total === null || total <= 0) {
    return { ok: false, error: "la ficha no tiene salario mensual y sin él no hay nada que repartir" };
  }

  if (crudas.length < 2) {
    return { ok: false, error: "un reparto necesita al menos dos empresas" };
  }

  // El ORDEN define cuál es la parte PRINCIPAL (la primera), que es la que
  // lleva el reloj y los montos escritos a mano. Se desempata por empresa para
  // que dos filas con el mismo `orden` no den un cuadro distinto en cada
  // lectura — una planilla que cambia sola es peor que una que avisa.
  const ordenadas = [...crudas].sort((a, b) => {
    const oa = numero(a.orden) ?? 0;
    const ob = numero(b.orden) ?? 0;
    if (oa !== ob) return oa - ob;
    return String(a.empresa ?? "").localeCompare(String(b.empresa ?? ""));
  });

  const vistas = new Set<string>();
  const partes: ParteReparto[] = [];
  let suma = 0;
  let conExtras = 0;

  for (const f of ordenadas) {
    const empresa = String(f.empresa ?? "").trim();
    if (!(EMPRESAS_ASISTENCIA as readonly string[]).includes(empresa)) {
      return { ok: false, error: `«${empresa || "(vacía)"}» no es una de las empresas del reloj` };
    }
    if (vistas.has(empresa)) {
      return { ok: false, error: `${etiquetaEmpresa(empresa)} está dos veces` };
    }
    vistas.add(empresa);

    const monto = numero(f.salario_mensual);
    if (monto === null || monto <= 0) {
      return { ok: false, error: `falta el monto de ${etiquetaEmpresa(empresa)}` };
    }
    const enCentavos = centavos(monto);
    suma = centavos(suma + enCentavos);

    // 🔑 `!== false`, igual que en `seguros.ts`: sin el dato se le cobran los
    // seguros. Ante la duda se retiene.
    const pagaSeguros = f.paga_seguros !== false;
    // 🔑 `=== true`: sin el dato esta parte NO paga las horas extra. Si nadie
    // la tiene, la regla 5 rechaza el reparto entero y se vuelve a hoy — nunca
    // a una planilla donde las horas extra desaparecieron.
    const llevaHorasExtra = f.paga_horas_extra === true;
    if (llevaHorasExtra) conExtras += 1;

    partes.push({
      empresa,
      salarioMensual: enCentavos,
      pagaSeguros,
      llevaHorasExtra,
      llevaElReloj: partes.length === 0,
    });
  }

  if (suma !== centavos(total)) {
    return {
      ok: false,
      error:
        `las partes suman $${suma.toFixed(2)} y el salario de la ficha es `
        + `$${centavos(total).toFixed(2)}`,
    };
  }

  if (conExtras !== 1) {
    return {
      ok: false,
      error:
        conExtras === 0
          ? "ninguna empresa tiene marcadas las horas extra"
          : "hay más de una empresa con las horas extra marcadas",
    };
  }

  return { ok: true, valor: partes };
}

/**
 * Las partes que de verdad se van a usar. Lista VACÍA = se calcula como hoy, en
 * una sola línea.
 *
 * 🔑 Existe para que quien arma las fichas no tenga que acordarse de mirar el
 * `ok`. El motivo del rechazo lo pide aparte quien tiene que escribirlo en
 * pantalla, con `validarReparto`.
 */
export function partesDe(
  salarioMensualFicha: number | null | undefined,
  filas: readonly FilaReparto[] | null | undefined,
): ParteReparto[] {
  const r = validarReparto(salarioMensualFicha, filas);
  return r.ok ? r.valor : [];
}

/**
 * Las partes ya validadas, de vuelta en la forma de la base.
 *
 * 🩸 EXISTE POR UN CASO CONCRETO: la ficha de Configuración recibe el reparto ya
 * validado y ahí mismo se le puede CAMBIAR EL SALARIO. Con $900 en vez de
 * $1.000 el reparto deja de cuadrar, y la pantalla tiene que decirlo **con las
 * mismas palabras que el servidor** en vez de seguir enseñando dos empresas que
 * ya no se van a pagar. Sin esto, la pantalla necesitaría su propia copia de la
 * regla de la suma — y dos copias es una que se corrige y otra que se queda
 * vieja, justo sobre el número del que sale la rata.
 */
export function comoFilas(
  codigo: string,
  partes: readonly ParteReparto[],
): FilaReparto[] {
  return partes.map((p, i) => ({
    empleado_codigo: codigo,
    empresa: p.empresa,
    salario_mensual: p.salarioMensual,
    paga_seguros: p.pagaSeguros,
    paga_horas_extra: p.llevaHorasExtra,
    orden: i,
  }));
}

/** Las filas de la base agrupadas por código, para armar las fichas. */
export function agruparPorCodigo(
  filas: readonly FilaReparto[] | null | undefined,
): Map<string, FilaReparto[]> {
  const out = new Map<string, FilaReparto[]>();
  for (const f of filas ?? []) {
    const cod = String(f?.empleado_codigo ?? "").trim();
    if (!cod) continue;
    const lista = out.get(cod);
    if (lista) lista.push(f);
    else out.set(cod, [f]);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// ¿FALTA CORRER LA MIGRACIÓN?
//
// Mismo criterio que `seguros.ts`, `sueldo-fijo.ts` y `vigencia.ts`: en este
// proyecto los DDL los corre Daniel a mano y varios se quedaron pendientes
// semanas. Sin la tabla, TODO el módulo sigue funcionando —nadie tiene reparto,
// o sea la planilla de hoy hasta el centavo— y la pantalla dice qué archivo
// falta en vez de romperse.
// ─────────────────────────────────────────────────────────────────────────────

export const MIGRACION_REPARTO = "20260901120000_asistencia_reparto_empresa.sql";
export const TABLA_REPARTO = "asistencia_reparto_empresa";

export function avisoMigracionReparto(): string {
  return (
    "Todavía no se puede repartir el sueldo de nadie entre dos empresas: falta "
    + `preparar la base de datos. Pídele a Daniel que corra el archivo ${MIGRACION_REPARTO} `
    + "en Supabase. Mientras tanto todo lo demás funciona igual y cada persona sale "
    + "en una sola planilla, como hasta ahora."
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE EL GUARD RECHAZÓ — se dice en pantalla, nunca en silencio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un reparto que no se aplicó, con el nombre y el motivo.
 *
 * 🔴 CON NOMBRE Y MOTIVO. Un «hay un reparto inválido» sin decir de quién obliga
 * a abrir otra pantalla para saber qué pasó, y eso es lo que hace que un aviso
 * no se lea.
 */
export interface RepartoRechazado {
  codigo: string;
  etiqueta: string;
  motivo: string;
}

export function textoRepartoRechazado(rechazados: readonly RepartoRechazado[]): string | null {
  if (rechazados.length === 0) return null;
  const detalle = rechazados.map((r) => `${r.etiqueta} (${r.motivo})`).join(" · ");
  const cabeza =
    rechazados.length === 1
      ? "Un sueldo repartido no se aplicó"
      : `${rechazados.length} sueldos repartidos no se aplicaron`;
  return `${cabeza} y se pagó en una sola planilla, como antes: ${detalle}.`;
}
