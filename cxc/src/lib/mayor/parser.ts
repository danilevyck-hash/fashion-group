/**
 * Parser del MAYOR CONTABLE de Switch (Contabilidad → Listado de Asientos →
 * "Descargar").
 *
 * El archivo es un CSV con separador `;`, UTF-8, fecha `DD-MM-YYYY`, y una fila
 * por LÍNEA de asiento:
 *
 *   ASIENTO;DESCRIPCION;FECHA; NOMBRE  CUENTA ;CUENTA;DEBITO;CREDITO
 *
 * ⚠️ GOTCHAS medidos contra el archivo real de Vistana (10-ago-2026):
 *
 *  1. DOBLES ESPACIOS por todos lados, en los encabezados y en los valores:
 *     `" NOMBRE  CUENTA "`, `" ASIENTO  VENTA  2026-01 "`. Todo texto se
 *     normaliza colapsando espacios y recortando los extremos.
 *
 *  2. El código de cuenta tiene 5 SEGMENTOS (`6.03.07.00.00`) y se guarda
 *     COMPLETO. Es la llave contra la contabilidad; aplanarlo a `6.03` perdería
 *     la subcuenta y ya no se podría cuadrar con la contadora.
 *
 *  3. Un MISMO asiento repite la MISMA cuenta en más de una línea: en el asiento
 *     `02-012026` la cuenta `6.03.41` aparece dos veces, una por débito (1695.86)
 *     y otra por crédito (1823.64). Por eso `(asiento, cuenta)` NO identifica una
 *     línea — hace falta la posición dentro del archivo (`linea`).
 *
 *  4. 🔴 SIGNOS. El gasto de una cuenta es `débito − crédito`, y el resultado
 *     PUEDE SER NEGATIVO (reversos y ajustes). En enero de Vistana, `6.03.41` da
 *     −127.78 y `6.03.42` da −69.30, y las dos son correctas. NUNCA tomar valor
 *     absoluto ni ignorar la columna crédito: es el error clásico de este
 *     negocio, y su firma es que la diferencia da EXACTAMENTE el doble.
 *
 * Todo el dinero se maneja en CENTAVOS ENTEROS para que las sumas cuadren al
 * centavo sin arrastre de coma flotante. Los dólares se derivan al final.
 */

/** Una línea de asiento ya parseada. Montos en centavos enteros. */
export interface MayorLinea {
  /** Nº de asiento tal cual viene ("012026318", "04-012026"). */
  asiento: string;
  /** Descripción normalizada ("ASIENTO VENTA 2026-01"). */
  descripcion: string;
  /** Fecha ISO `YYYY-MM-DD`. */
  fecha: string;
  /** Bucket mensual `YYYY-MM`. */
  mes: string;
  /** Código completo de 5 segmentos ("6.03.07.00.00"). */
  cuenta: string;
  /** Nombre de la cuenta tal como lo trae ESA empresa, normalizado. */
  cuentaNombre: string;
  debitoCent: number;
  creditoCent: number;
  /** débito − crédito. Puede ser negativo, y eso es correcto. */
  netoCent: number;
  /** Posición 1-based dentro del archivo (sin contar el encabezado). */
  linea: number;
}

export interface MayorParseError {
  /** Nº de línea del archivo (1-based, contando el encabezado). */
  linea: number;
  motivo: string;
  /** El texto crudo, recortado, para poder verlo en el reporte. */
  crudo: string;
}

export interface MayorParseResult {
  lineas: MayorLinea[];
  errores: MayorParseError[];
  /** Rango de fechas OBSERVADO en el archivo (no el pedido). `null` si vacío. */
  rangoObservado: { desde: string; hasta: string } | null;
  /** Meses distintos presentes, ordenados. */
  meses: string[];
}

/** Colapsa espacios repetidos y recorta. `" ASIENTO  VENTA "` → `"ASIENTO VENTA"`. */
export function normalizarTexto(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Un código de cuenta válido de Switch: 5 segmentos numéricos. */
export const CUENTA_RE = /^\d+(?:\.\d+){4}$/;

/**
 * Convierte un monto del CSV a CENTAVOS enteros.
 *
 * Acepta `"1695.86"`, `"1,695.86"` (miles con coma), `"(69.30)"` (paréntesis =
 * negativo, convención contable) y vacío = 0. Devuelve `null` si no lo entiende
 * — y entonces la línea se REPORTA como error en vez de contarse como 0, que
 * sería un gasto perdido en silencio.
 */
export function montoACentavos(raw: string): number | null {
  let s = normalizarTexto(raw);
  if (s === "" || s === "-") return 0;

  let negativo = false;
  const paren = s.match(/^\((.*)\)$/);
  if (paren) {
    negativo = true;
    s = paren[1].trim();
  }
  if (s.startsWith("-")) {
    negativo = !negativo;
    s = s.slice(1).trim();
  }
  s = s.replace(/^\$/, "").trim();

  // Miles con coma y decimales con punto: 1,695.86 / 12,345,678.90
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  // Una sola coma decimal (por si alguna empresa exporta en formato europeo).
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  // Cualquier otra coma es ambigua → no adivinar.
  else if (s.includes(",")) return null;

  if (!/^\d+(\.\d+)?$/.test(s)) return null;

  // A centavos SIN pasar por float: parte entera y decimales por separado.
  const [ent, dec = ""] = s.split(".");
  const centStr = (dec + "00").slice(0, 2);
  const cent = Number(ent) * 100 + Number(centStr);
  if (!Number.isSafeInteger(cent)) return null;
  return negativo ? -cent : cent;
}

/** `DD-MM-YYYY` → `YYYY-MM-DD`. `null` si no es una fecha real. */
export function fechaAIso(raw: string): string | null {
  const m = normalizarTexto(raw).match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Rechaza 31-02: se compara contra el calendario real.
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parte una fila por `;` respetando comillas dobles (por si Switch las usa). */
function partirFila(fila: string): string[] {
  const out: string[] = [];
  let campo = "";
  let enComillas = false;
  for (let i = 0; i < fila.length; i++) {
    const c = fila[i];
    if (enComillas) {
      if (c === '"') {
        if (fila[i + 1] === '"') {
          campo += '"';
          i++;
        } else enComillas = false;
      } else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ";") {
      out.push(campo);
      campo = "";
    } else campo += c;
  }
  out.push(campo);
  return out;
}

/** Encabezados esperados, ya normalizados y en minúscula. */
const COLUMNAS = ["asiento", "descripcion", "fecha", "nombre cuenta", "cuenta", "debito", "credito"];

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Parsea el CSV completo del mayor.
 *
 * NO filtra por grupo de cuenta: devuelve TODAS las líneas. Distinguir "el mes
 * no tiene contabilidad" de "el mes no tuvo gastos" exige ver los asientos que
 * no son del grupo 6 — en el archivo real, febrero solo tiene un asiento de
 * préstamo sin una sola cuenta de gasto, y si guardáramos únicamente el grupo 6
 * ese mes sería indistinguible de un mes nunca cerrado.
 */
export function parsearMayorCsv(texto: string): MayorParseResult {
  const limpio = texto.replace(/^\uFEFF/, "");
  const filas = limpio.split(/\r\n|\n|\r/);

  const lineas: MayorLinea[] = [];
  const errores: MayorParseError[] = [];

  // ── Encabezado ──
  let iCabecera = -1;
  for (let i = 0; i < filas.length; i++) {
    if (normalizarTexto(filas[i]) === "") continue;
    iCabecera = i;
    break;
  }
  if (iCabecera === -1) {
    return { lineas: [], errores: [{ linea: 0, motivo: "El archivo está vacío.", crudo: "" }], rangoObservado: null, meses: [] };
  }

  const cabecera = partirFila(filas[iCabecera]).map((h) => sinAcentos(normalizarTexto(h)).toLowerCase());
  const faltan = COLUMNAS.filter((c) => !cabecera.includes(c));
  if (faltan.length > 0) {
    return {
      lineas: [],
      errores: [
        {
          linea: iCabecera + 1,
          motivo: `No parece el archivo del mayor: faltan las columnas ${faltan.join(", ")}.`,
          crudo: normalizarTexto(filas[iCabecera]).slice(0, 200),
        },
      ],
      rangoObservado: null,
      meses: [],
    };
  }
  const idx = Object.fromEntries(COLUMNAS.map((c) => [c, cabecera.indexOf(c)])) as Record<string, number>;

  // ── Filas de datos ──
  let nLinea = 0;
  for (let i = iCabecera + 1; i < filas.length; i++) {
    const cruda = filas[i];
    if (normalizarTexto(cruda) === "") continue;
    nLinea++;

    const campos = partirFila(cruda);
    const err = (motivo: string) =>
      errores.push({ linea: i + 1, motivo, crudo: normalizarTexto(cruda).slice(0, 200) });

    if (campos.length < COLUMNAS.length) {
      err(`La fila tiene ${campos.length} columnas y se esperaban ${COLUMNAS.length}.`);
      continue;
    }

    const cuenta = normalizarTexto(campos[idx["cuenta"]]);
    if (!CUENTA_RE.test(cuenta)) {
      err(`Código de cuenta inválido: "${cuenta}".`);
      continue;
    }

    const fecha = fechaAIso(campos[idx["fecha"]]);
    if (!fecha) {
      err(`Fecha inválida: "${normalizarTexto(campos[idx["fecha"]])}".`);
      continue;
    }

    const debitoCent = montoACentavos(campos[idx["debito"]]);
    const creditoCent = montoACentavos(campos[idx["credito"]]);
    if (debitoCent === null || creditoCent === null) {
      err(
        `Monto ilegible (débito "${normalizarTexto(campos[idx["debito"]])}", crédito "${normalizarTexto(campos[idx["credito"]])}").`,
      );
      continue;
    }

    lineas.push({
      asiento: normalizarTexto(campos[idx["asiento"]]),
      descripcion: normalizarTexto(campos[idx["descripcion"]]),
      fecha,
      mes: fecha.slice(0, 7),
      cuenta,
      cuentaNombre: normalizarTexto(campos[idx["nombre cuenta"]]),
      debitoCent,
      creditoCent,
      // débito − crédito. Puede quedar negativo: es un reverso, no un bug.
      netoCent: debitoCent - creditoCent,
      linea: nLinea,
    });
  }

  const fechas = lineas.map((l) => l.fecha).sort();
  const meses = [...new Set(lineas.map((l) => l.mes))].sort();

  return {
    lineas,
    errores,
    rangoObservado: fechas.length > 0 ? { desde: fechas[0], hasta: fechas[fechas.length - 1] } : null,
    meses,
  };
}
