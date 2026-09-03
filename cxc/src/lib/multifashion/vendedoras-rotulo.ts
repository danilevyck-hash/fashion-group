// ─────────────────────────────────────────────────────────────────────────────
// Multifashion › Vendedoras — CONTRA QUÉ compara la columna Δ, dicho en el rótulo.
//
// 🩸 La columna decía «Δ vs año pasado» en los seis chips, pero en los dos de
// MES (`multifashion_vendedoras_v3`, `p_periodo = 'mes'`) la RPC compara contra
// el MES ANTERIOR (`p_mes − 1`, recortado a los mismos días si el mes está en
// curso): medido el 3-sep-2026, agosto decía «+30,1% vs año pasado» y era +30,1%
// contra JULIO. Daniel decidió arreglar el RÓTULO y dejar la comparación,
// textual: *«el rótulo (que diga "vs mes anterior", que es lo que hace)»*.
//
// Y que no quede ambiguo: el chip «Agosto (cerrado)» no dice «vs mes anterior»
// a secas —¿anterior a hoy o anterior a agosto?— sino «vs julio 2026». Se
// nombra el mes.
//
// Los otros chips SÍ comparan contra el año pasado (YTD contra el mismo tramo
// del año anterior; «Últimos N meses» contra la misma ventana un año antes,
// `multifashion_vendedoras_range`) y conservan su rótulo.
// ─────────────────────────────────────────────────────────────────────────────

export type ChipVendedoras = "en_curso" | "mes_anterior" | "ytd" | "ultimos_3" | "ultimos_6" | "ultimos_12";

const MES_MINUSCULA = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** El mes contra el que la RPC compara un chip de mes: el anterior (dic → año − 1). */
export function mesComparadoVendedoras(mes: number, year: number): { mes: number; year: number } {
  return mes > 1 ? { mes: mes - 1, year } : { mes: 12, year: year - 1 };
}

export interface RotuloDelta {
  /** Encabezado de la columna en la tabla: «Δ vs julio 2026» · «Δ vs año pasado». */
  columna: string;
  /** Pegado al número en la tarjeta de celular: «vs julio 2026» · «vs año pasado». */
  corto: string;
}

/**
 * @param chip  el chip activo
 * @param mes   el mes que pide ese chip (solo importa en `en_curso` / `mes_anterior`)
 * @param year  el año del selector
 */
export function rotuloDeltaVendedoras(chip: ChipVendedoras, mes: number, year: number): RotuloDelta {
  if (chip === "en_curso" || chip === "mes_anterior") {
    const c = mesComparadoVendedoras(mes, year);
    const corto = `vs ${MES_MINUSCULA[c.mes - 1]} ${c.year}`;
    return { columna: `Δ ${corto}`, corto };
  }
  return { columna: "Δ vs año pasado", corto: "vs año pasado" };
}

/**
 * La frase bajo el subtítulo cuando el chip es de mes: dice contra qué mes se
 * compara y, si el mes está en curso, que son los mismos días.
 * `diaCortePrev` = `dia_corte_periodo_anterior` de la RPC (YYYY-MM-DD) o null.
 */
export function notaComparacionVendedoras(
  chip: ChipVendedoras,
  mes: number,
  year: number,
  parcial: boolean,
  diaCortePrev: string | null,
): string | null {
  if (chip !== "en_curso" && chip !== "mes_anterior") return null;
  const c = mesComparadoVendedoras(mes, year);
  const nombre = `${MES_MINUSCULA[c.mes - 1]} ${c.year}`;
  if (parcial && diaCortePrev) {
    const dia = Number(diaCortePrev.slice(8, 10));
    return `La Δ compara contra ${nombre}, los mismos días (del 1 al ${dia}).`;
  }
  return `La Δ compara contra ${nombre} completo.`;
}
