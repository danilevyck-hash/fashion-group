// Consulta de artículos: las PIEZAS vendidas del modelo MES A MES del año contra
// el mismo mes del año pasado (tarjeta de mantener presionado y la ficha,
// 27-nov-2026). Sale de lo que la pantalla YA trajo: la `serie` mensual (venta
// NETA de `switch_articulo_diario`, notas de crédito restando) y, para el mes en
// curso, `ventasDia` con los MISMOS días del año pasado. El diario llega hasta
// AYER. Sin `ventasDia` (búsqueda de varios códigos) el mes en curso no se
// compara: `previo: null` → «—», nunca un % inventado. Módulo PURO.
import type { MesVenta } from "@/lib/ventas/compras";
import type { DiaVenta } from "@/lib/ventas/referencia-llegadas";
import { unAnioAntes } from "@/lib/ventas/clientes-corte-comparativo";
import { cambioDelMes, type CambioDelMes, type MesDeLaTarjeta } from "@/lib/ventas/mes-a-mes";
import { porcentajeDeLaTabla } from "@/lib/ventas/celular";

const MM = (m: number) => String(m).padStart(2, "0");

/** El día anterior a `hoy` (YYYY-MM-DD). */
export function ayerDe(hoy: string): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface ArticuloMesAMes {
  anio: number;
  /** El último día con datos (ayer). */
  corte: string;
  meses: MesDeLaTarjeta[];
  total: { actual: number; previo: number | null };
}

export function articuloMesAMes(
  serie: readonly MesVenta[],
  /** `null` = alguno de los códigos no trajo el día a día. */
  dias: readonly DiaVenta[] | null,
  hoy: string,
): ArticuloMesAMes {
  const corte = ayerDe(hoy);
  const anio = Number(corte.slice(0, 4));
  const mesCorte = Number(corte.slice(5, 7));
  const finMes = new Date(Date.UTC(anio, mesCorte, 0)).getUTCDate();
  const mesAbierto = Number(corte.slice(8, 10)) < finMes;
  const porMes = new Map(serie.map((s) => [s.mes, s.unidades]));
  const meses: MesDeLaTarjeta[] = [];
  for (let m = 1; m <= mesCorte; m++) {
    const actual = porMes.get(`${anio}-${MM(m)}`) ?? 0;
    let previo: number | null = porMes.get(`${anio - 1}-${MM(m)}`) ?? 0;
    if (m === mesCorte && mesAbierto) {
      const desde = `${anio - 1}-${MM(m)}-01`;
      const hasta = unAnioAntes(corte);
      previo = dias ? dias.filter((d) => d.fecha >= desde && d.fecha <= hasta).reduce((a, d) => a + d.unidades, 0) : null;
    }
    meses.push({ mes: m, actual, previo });
  }
  const conPrevio = meses.every((m) => m.previo != null);
  return {
    anio,
    corte,
    meses,
    total: {
      actual: meses.reduce((a, m) => a + m.actual, 0),
      previo: conPrevio ? meses.reduce((a, m) => a + (m.previo ?? 0), 0) : null,
    },
  };
}

/** Los días de todos los códigos del modelo, o `null` si alguno no los trajo. */
export function diasDelModelo(arts: readonly { ventasDia?: DiaVenta[] }[]): DiaVenta[] | null {
  if (arts.some((a) => !a.ventasDia)) return null;
  return arts.flatMap((a) => a.ventasDia ?? []);
}

/**
 * El % con el texto, color y umbral (±5 %) de las tablas. Son PIEZAS: el piso de
 * $100 de los montos no aplica; cualquier base positiva compara. Sin base
 * conocida (`null`) → «—»; el año pasado sin piezas → «Nuevo».
 */
export function cambioDeArticulo(actual: number, previo: number | null | undefined): CambioDelMes {
  if (previo === null) return { texto: "—", tono: "fl" };
  if (previo == null || previo <= 0) return cambioDelMes(actual, null);
  return porcentajeDeLaTabla((actual - previo) / previo);
}

/** «Hasta ayer (26 nov). Notas de crédito restan.» */
export function notaDeArticulo(corte: string): string {
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `Hasta ayer (${Number(corte.slice(8, 10))} ${MESES[Number(corte.slice(5, 7)) - 1]}). Notas de crédito restan.`;
}
