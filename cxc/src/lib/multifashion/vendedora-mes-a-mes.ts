// Multifashion › Vendedoras: la venta de UNA vendedora MES A MES contra el
// mismo mes del año pasado (tarjeta de mantener presionado, 27-nov-2026).
// La MISMA vista y el MISMO filtro que la Δ de la pantalla
// (`ventasPorVendedora`: sin vacío ni DEFAULT, por `vendedor_canonico` EXACTO
// —el amarre de `multifashion_vendedora_alias` ya junta a quien Switch renombró, p. ej. «Jailine» → «Jailine Quispe»—). El mes en curso compara los MISMOS
// días (`ventanaMesAnioPasado`). Módulo PURO.
import type { CambioDelMes, MesDeLaTarjeta } from "@/lib/ventas/mes-a-mes";
import { variacionPct } from "@/lib/variacion";
import { cifraPorcentaje } from "@/lib/ventas/celular";
import { deltaCorto } from "./celular";
import { ventanaMesAnioPasado, ventasPorVendedora, type FilaVentaAnioPasado } from "./vendedoras-vs-anio";

export interface FilaVendedoraConFecha extends FilaVentaAnioPasado {
  fecha: string;
}

export interface VendedoraMesAMes {
  vendedora: string;
  anio: number;
  corte: string | null;
  meses: MesDeLaTarjeta[];
  total: { actual: number; previo: number };
}

export function vendedoraMesAMes(
  filas: readonly FilaVendedoraConFecha[],
  vendedora: string,
  anio: number,
  ultimoDiaCargado: string | null,
  ahora: Date,
): VendedoraMesAMes {
  const suyas = filas.filter((f) => f.vendedor_canonico === vendedora);
  const sumar = (desde: string, hasta: string) =>
    ventasPorVendedora(suyas.filter((f) => f.fecha >= desde && f.fecha <= hasta))[vendedora] ?? 0;
  const enAnio = ultimoDiaCargado && Number(ultimoDiaCargado.slice(0, 4)) === anio;
  const hasta = enAnio ? Number(ultimoDiaCargado!.slice(5, 7)) : 12;
  const meses: MesDeLaTarjeta[] = [];
  for (let m = 1; m <= hasta; m++) {
    const mm = String(m).padStart(2, "0");
    const fin = String(new Date(Date.UTC(anio, m, 0)).getUTCDate()).padStart(2, "0");
    const v = ventanaMesAnioPasado(anio, m, ultimoDiaCargado, ahora);
    meses.push({ mes: m, actual: sumar(`${anio}-${mm}-01`, `${anio}-${mm}-${fin}`), previo: sumar(v.desde, v.hasta) });
  }
  return {
    vendedora,
    anio,
    corte: enAnio ? ultimoDiaCargado : null,
    meses,
    total: { actual: meses.reduce((a, m) => a + m.actual, 0), previo: meses.reduce((a, m) => a + (m.previo ?? 0), 0) },
  };
}

/**
 * El % de la tarjeta con el MISMO texto y umbral que la fila de la pantalla
 * (`deltaCorto`, ±5 %): «Nueva» si ese mes del año pasado no vendió; «—» si la
 * base es menor de $100 (`variacionPct`).
 */
export function cambioDeVendedora(actual: number, previo: number | null | undefined): CambioDelMes {
  if (previo == null || previo <= 0) return actual !== 0 ? { texto: "Nueva", tono: "fl" } : { texto: "—", tono: "fl" };
  const v = variacionPct(actual, previo);
  const d = deltaCorto(v);
  if (!d || v == null) return { texto: "—", tono: "fl" };
  // Bajo 1 % con un decimal, como toda tarjeta mes a mes (27-nov-2026). La
  // fila de la pantalla sigue en entero: su candado la ata a la computadora.
  const texto = d.texto.replace(/\d+ %$/, `${cifraPorcentaje(v * 100)} %`);
  return { texto, tono: d.tono === "sube" ? "up" : d.tono === "baja" ? "dn" : "fl" };
}
