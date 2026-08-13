/**
 * Parser de EGRESOS VARIOS de Switch (Caja y Bancos → Reportes → Egresos
 * Varios → "Descargar").
 *
 * Es el registro de lo que SALE de caja y banco, y —a diferencia del mayor— se
 * lleva al día. Medido el 13-ago-2026 sobre Vistana, 1-ene → 13-ago-2026:
 * **378 renglones por $243.342,48 repartidos en los 7 meses**, contra las 44
 * líneas de enero (y solo enero) que trae el mayor.
 *
 * El archivo es un CSV con separador `;`, una fila por EGRESO:
 *
 *   FECHA;N.INTERNO; CUENTA  CONTABLE ;SUCURSAL;PROVEEDOR;REFERENCIA;TOTAL
 *
 * ── GOTCHAS medidos contra el archivo real de Vistana ────────────────────────
 *
 *  1. 🔴 LA FECHA VIENE `YYYY-MM-DD`, **NO** `DD-MM-YYYY` como en el mayor.
 *     `2026-03-22`, no `22-03-2026`. Copiar el parser de fechas del mayor es
 *     exactamente el bug que ya se pagó una vez en este repo: `sync-proveedores`
 *     exigía DD-MM-YYYY contra un endpoint que manda YYYY-MM-DD y devolvió
 *     `null` **821 de 821 veces**, dejando tres columnas de plata en cero en las
 *     7 empresas. Acá se aceptan las DOS formas (la posición del año de 4
 *     dígitos las distingue sin ambigüedad) para que un cambio de formato de
 *     Switch no vuelva a vaciar el módulo en silencio.
 *
 *  2. DOBLES ESPACIOS por todos lados, igual que en el mayor: `" CUENTA
 *     CONTABLE "`, `" VISTANA  INTERNACIONAL  PANAMA "`. Todo texto se
 *     normaliza colapsando espacios y recortando.
 *
 *  3. 🔴 **NO ES SOLO EL GRUPO 6.** Medido sobre los 378 renglones reales:
 *     grupo 6 (gastos) 233 · grupo 2 (pasivos, p. ej. planilla por pagar) 101 ·
 *     grupo 1 (activos, transferencias entre cuentas) 40 · grupo 3 (patrimonio)
 *     2 · grupo 5 (costos) 2. Todo eso es plata que SALIÓ, pero **solo el grupo
 *     6 es GASTO**. Por eso el parser guarda TODO y la separación la hace
 *     `reglas.ts` — pintar los $243.342,48 como "gastos" sería contar como
 *     gasto un préstamo devuelto y una transferencia entre cuentas propias.
 *
 *  4. La columna PROVEEDOR viene VACÍA en los 378 renglones; el dato humano
 *     está en REFERENCIA (`"DANIEL LEVY"`, `"MUNICIOIO DE PANAMA"`). Las dos se
 *     guardan igual: la primera puede llenarse mañana y no cuesta nada.
 *
 *  5. `N.INTERNO` (`120-000001276`) es la identidad del documento. Medido: los
 *     378 son distintos entre sí. NO se usa como llave única de la tabla —ver
 *     `sync-egresos-varios.ts`, la idempotencia va por reemplazo de mes— pero sí
 *     se guarda, porque es lo único con lo que se puede auditar un renglón
 *     contra el panel de Switch.
 *
 * Todo el dinero se maneja en CENTAVOS ENTEROS. `montoACentavos` y
 * `normalizarTexto` se REUSAN del parser del mayor: dos parsers de plata en el
 * mismo repo son dos redondeos posibles para el mismo número.
 */

import { montoACentavos, normalizarTexto, CUENTA_RE } from "@/lib/mayor/parser";

/** Un egreso ya parseado. Monto en centavos enteros. */
export interface EgresoLinea {
  /** Fecha ISO `YYYY-MM-DD`. */
  fecha: string;
  /** Bucket mensual `YYYY-MM`. */
  mes: string;
  /** Nº interno del documento tal cual viene ("120-000001276"). */
  nInterno: string;
  /** Código completo de 5 segmentos ("6.03.98.00.00"). */
  cuenta: string;
  /** Sucursal tal como la trae el archivo ("PRINCIPAL"). */
  sucursal: string;
  /** Proveedor. Viene vacío en el archivo real; se guarda igual. */
  proveedor: string;
  /** Referencia: el texto que dice de qué se trata el egreso. */
  referencia: string;
  /** Lo que salió, en centavos. Positivo en el archivo real. */
  totalCent: number;
  /** Posición 1-based dentro del archivo (sin contar el encabezado). */
  linea: number;
}

export interface EgresoParseError {
  /** Nº de línea del archivo (1-based, contando el encabezado). */
  linea: number;
  motivo: string;
  crudo: string;
}

export interface EgresoParseResult {
  lineas: EgresoLinea[];
  errores: EgresoParseError[];
  /** Rango de fechas OBSERVADO en el archivo (no el pedido). */
  rangoObservado: { desde: string; hasta: string } | null;
  /** Meses distintos presentes, ordenados. */
  meses: string[];
}

/**
 * Fecha del reporte → ISO `YYYY-MM-DD`.
 *
 * Acepta `YYYY-MM-DD` (lo que manda hoy) y `DD-MM-YYYY` (lo que manda el mayor).
 * No hay ambigüedad: el año de 4 dígitos solo puede estar en un extremo.
 * Se rechaza lo que no sea una fecha real del calendario (31-02 no pasa).
 */
export function fechaEgresoAIso(raw: string): string | null {
  const s = normalizarTexto(raw).replace(/\s.*$/, ""); // por si algún día trae hora
  let y: number;
  let mo: number;
  let d: number;

  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  if (iso) {
    y = Number(iso[1]);
    mo = Number(iso[2]);
    d = Number(iso[3]);
  } else if (dmy) {
    d = Number(dmy[1]);
    mo = Number(dmy[2]);
    y = Number(dmy[3]);
  } else {
    return null;
  }

  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parte una fila por `;` respetando comillas dobles. */
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

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Encabezado ya normalizado (espacios colapsados, sin acentos, minúscula). */
export function normalizarEncabezado(h: string): string {
  return sinAcentos(normalizarTexto(h)).toLowerCase();
}

/**
 * Columnas OBLIGATORIAS. `proveedor` NO está: el panel la omite fuera de Panamá
 * (`codigoPais != 'PA'`, ver el JS público del reporte), y una columna que puede
 * no venir no puede ser la que decide si el archivo es válido.
 */
const COLUMNAS = ["fecha", "n.interno", "cuenta contable", "total"] as const;

/**
 * ¿Esto que volvió es el CSV de egresos varios y no un HTML de error?
 *
 * Switch responde HTTP 200 con su HTML de excepción para toda ruta inexistente,
 * así que el código de estado NO alcanza para distinguir — la misma lección que
 * dejó `pareceCsvDelMayor`. Lo único confiable es mirar el contenido.
 */
export function pareceCsvDeEgresos(texto: string): boolean {
  const primera = texto.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/)[0] ?? "";
  if (primera.includes("<") || /<!DOCTYPE|<html/i.test(texto.slice(0, 400))) return false;
  const cols = primera.split(";").map(normalizarEncabezado);
  return COLUMNAS.every((c) => cols.includes(c));
}

/**
 * Parsea el CSV completo de egresos varios.
 *
 * NO filtra por grupo de cuenta: devuelve TODOS los renglones. El grupo 6 es el
 * gasto, pero los otros grupos son plata que también salió del banco y hay que
 * poder verla — ver `reglas.ts`.
 */
export function parsearEgresosCsv(texto: string): EgresoParseResult {
  const limpio = texto.replace(/^\uFEFF/, "");
  const filas = limpio.split(/\r\n|\n|\r/);

  const lineas: EgresoLinea[] = [];
  const errores: EgresoParseError[] = [];

  let iCabecera = -1;
  for (let i = 0; i < filas.length; i++) {
    if (normalizarTexto(filas[i]) === "") continue;
    iCabecera = i;
    break;
  }
  if (iCabecera === -1) {
    return {
      lineas: [],
      errores: [{ linea: 0, motivo: "El archivo está vacío.", crudo: "" }],
      rangoObservado: null,
      meses: [],
    };
  }

  const cabecera = partirFila(filas[iCabecera]).map(normalizarEncabezado);
  const faltan = COLUMNAS.filter((c) => !cabecera.includes(c));
  if (faltan.length > 0) {
    return {
      lineas: [],
      errores: [
        {
          linea: iCabecera + 1,
          motivo: `No parece el archivo de egresos varios: faltan las columnas ${faltan.join(", ")}.`,
          crudo: normalizarTexto(filas[iCabecera]).slice(0, 200),
        },
      ],
      rangoObservado: null,
      meses: [],
    };
  }
  const col = (nombre: string) => cabecera.indexOf(nombre);
  const iFecha = col("fecha");
  const iNum = col("n.interno");
  const iCuenta = col("cuenta contable");
  const iTotal = col("total");
  const iSucursal = col("sucursal");
  const iProv = col("proveedor");
  const iRef = col("referencia");

  let nLinea = 0;
  for (let i = iCabecera + 1; i < filas.length; i++) {
    const cruda = filas[i];
    if (normalizarTexto(cruda) === "") continue;
    nLinea++;

    const campos = partirFila(cruda);
    const err = (motivo: string) =>
      errores.push({ linea: i + 1, motivo, crudo: normalizarTexto(cruda).slice(0, 200) });
    const campo = (idx: number) => (idx >= 0 ? normalizarTexto(campos[idx] ?? "") : "");

    // Se compara contra la última columna OBLIGATORIA, no contra el largo del
    // encabezado: una columna opcional ausente no puede invalidar la fila.
    const maxIdx = Math.max(iFecha, iNum, iCuenta, iTotal);
    if (campos.length <= maxIdx) {
      err(`La fila tiene ${campos.length} columnas y no alcanzan para leerla.`);
      continue;
    }

    const cuenta = campo(iCuenta);
    if (!CUENTA_RE.test(cuenta)) {
      err(`Código de cuenta inválido: "${cuenta}".`);
      continue;
    }

    const fecha = fechaEgresoAIso(campos[iFecha]);
    if (!fecha) {
      err(`Fecha inválida: "${campo(iFecha)}".`);
      continue;
    }

    const totalCent = montoACentavos(campos[iTotal]);
    if (totalCent === null) {
      err(`Monto ilegible: "${campo(iTotal)}".`);
      continue;
    }

    const nInterno = campo(iNum);
    if (nInterno === "") {
      err("El renglón no trae N. INTERNO.");
      continue;
    }

    lineas.push({
      fecha,
      mes: fecha.slice(0, 7),
      nInterno,
      cuenta,
      sucursal: campo(iSucursal),
      proveedor: campo(iProv),
      referencia: campo(iRef),
      totalCent,
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
