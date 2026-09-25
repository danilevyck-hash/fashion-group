// ─────────────────────────────────────────────────────────────────────────────
// LA TARJETA DEL MODELO — módulo PURO (25-sep-2026, `REFERENCIA_2026_09`).
//
// 🩸 HOY SOLO HAY TARJETA POR COLOR. Buscar `NB2570` dibuja 26 tarjetas, una
// por color, y el modelo —que es lo que Daniel compra— no tiene ni un número
// propio: para saber cuánto lleva comprado del modelo hay que sumar 26 tarjetas
// a mano. Acá se arma ESA tarjeta: la suma de sus colores.
//
// 🔴 NINGUNA CUENTA ES NUEVA. Compré, Vendí y Stock se SUMAN de lo que cada
// color ya trae (`cuadre` y `existencia`, los mismos de la tarjeta de hoy); el
// % vendido usa la MISMA definición de siempre (`parteVendidaReal` → Vendí ÷
// (Vendí + Stock), nunca sobre lo comprado); el precio promedio y el margen
// pasan por `promedioMensual` + `margenReal`, y el FOB por `fobEstimado()`
// (CIF ÷ 1,10) — las mismas funciones que la tarjeta del color.
//
// 🔴 EL RENGLÓN POR TRIMESTRE ES PLANO: «Ene–Mar N · Abr–Jun N · Jul–Sep N ·
// Oct–Dic N», los CUATRO ÚLTIMOS TRIMESTRES COMPLETOS (doce meses), cada uno
// con sus tres meses de verdad. El módulo NO adivina temporadas: las de compra
// (PS/SP/PF/FA, SS/FW) viven en `temporadas-referencia.ts` y son otra cosa —
// acá solo se dice cuánto se vendió en cada trimestre del calendario.
//
// ✅ MEDIDO (25-sep-2026, vistana, `NB2570`, 26 colores):
//   comprado 5.856 · vendido 4.580 · stock 888 · 84 % vendido · 27 llegadas
//   desde oct-2022 · trimestres Jul–Sep 211 · Oct–Dic 431 · Ene–Mar 245 ·
//   Abr–Jun 112.
// ─────────────────────────────────────────────────────────────────────────────

import type { ArticuloCompras, Compra, MesVenta } from "./compras";
import { sumarSeries } from "./referencia";
import {
  agruparLlegadasPorDia,
  medirLlegadas,
  sumarDias,
  ultimaYVara,
  type DiaVenta,
  type Llegada,
  type LlegadaMedida,
} from "./referencia-llegadas";
import { fobEstimado } from "./referencia-info";
import {
  barrasDeVentana,
  margenReal,
  parteVendidaReal,
  promedioMensual,
  type MargenReal,
} from "./resumen-articulo";

// ─── Trimestres ──────────────────────────────────────────────────────────────

/** Los cuatro trimestres del calendario, en el orden en que se leen. */
export const TRIMESTRES: readonly { etiqueta: string; primerMes: number }[] = [
  { etiqueta: "Ene–Mar", primerMes: 1 },
  { etiqueta: "Abr–Jun", primerMes: 4 },
  { etiqueta: "Jul–Sep", primerMes: 7 },
  { etiqueta: "Oct–Dic", primerMes: 10 },
] as const;

export interface TrimestreVenta {
  /** "Ene–Mar" */
  etiqueta: string;
  /** El año al que pertenece ese trimestre. */
  anio: number;
  unidades: number;
}

const MM = (n: number) => String(n).padStart(2, "0");

/**
 * Los cuatro últimos trimestres COMPLETOS, devueltos en orden de calendario
 * (Ene–Mar, Abr–Jun, Jul–Sep, Oct–Dic) con el año de cada uno.
 *
 * `atras = 1` devuelve los cuatro trimestres anteriores a esos (el «año
 * anterior» que sale dentro de «Más info»).
 *
 * 🔴 El trimestre EN CURSO nunca entra: con `hoyMes` = 2026-09 el último
 * completo es abr–jun 2026. Es la misma regla de `ultimosMesesCompletos`.
 */
export function trimestresDe(
  serie: readonly MesVenta[],
  hoyMes: string,
  atras = 0,
): TrimestreVenta[] {
  const porMes = new Map(serie.map((s) => [s.mes, s.unidades]));
  const anio = Number(hoyMes.slice(0, 4));
  const idxActual = Math.floor((Number(hoyMes.slice(5, 7)) - 1) / 3);
  // Índice global del trimestre en curso; se retrocede desde ahí.
  const global = anio * 4 + idxActual;
  const out: TrimestreVenta[] = [];
  for (let k = 1; k <= 4; k += 1) {
    const g = global - k - atras * 4;
    const y = Math.floor(g / 4);
    const i = ((g % 4) + 4) % 4;
    const primerMes = TRIMESTRES[i].primerMes;
    let unidades = 0;
    for (let m = primerMes; m < primerMes + 3; m += 1) unidades += porMes.get(`${y}-${MM(m)}`) ?? 0;
    out.push({ etiqueta: TRIMESTRES[i].etiqueta, anio: y, unidades });
  }
  return out.sort(
    (a, b) =>
      TRIMESTRES.findIndex((t) => t.etiqueta === a.etiqueta) -
      TRIMESTRES.findIndex((t) => t.etiqueta === b.etiqueta),
  );
}

// ─── La fila de un color ─────────────────────────────────────────────────────

export interface FilaColor {
  art: ArticuloCompras;
  codigo: string;
  /** Los últimos 3 caracteres. `null` = el código ES su propio modelo. */
  color: string | null;
  /** `null` = sin compra registrada: guion, nunca un cero que parecería dato. */
  comprado: number | null;
  vendido: number;
  stock: number | null;
  parteVendida: number | null;
  /** La última llegada medida. `null` = no tiene ninguna registrada. */
  ultima: LlegadaMedida | null;
  /** La última ANTERIOR que sí completó su 80 % — la vara de comparación. */
  vara: LlegadaMedida | null;
}

// ─── La tarjeta ──────────────────────────────────────────────────────────────

export interface TarjetaModelo {
  modelo: string;
  descripcion: string;
  empresa: string;
  /** Cuántos códigos distintos cuelgan del modelo. */
  colores: number;
  comprado: number | null;
  vendido: number;
  stock: number | null;
  parteVendida: number | null;
  /** TODAS las llegadas del modelo, agrupadas por día y medidas. */
  llegadas: LlegadaMedida[];
  ultima: LlegadaMedida | null;
  vara: LlegadaMedida | null;
  /** Mes de la primera llegada registrada (YYYY-MM). `null` = ninguna. */
  primerMesLlegada: string | null;
  serie: MesVenta[];
  /** Venta neta mes a mes de los 12 meses completos (las barras de siempre). */
  margen: MargenReal;
  fob: number | null;
  precioLista: number | null;
  /** Entre cuántos meses se dividió el precio promedio. */
  mesesPromedio: number;
  trimestres: TrimestreVenta[];
  trimestresAnterior: TrimestreVenta[];
  /** Un renglón por color, ordenado por STOCK de mayor a menor. */
  filas: FilaColor[];
  /** Las filas sin mercancía, que se pliegan al final. */
  sinStock: FilaColor[];
  /** `true` = ningún color trajo el detalle (respuesta vieja o modo pedido):
   *  las llegadas y el 80 % no se pueden medir y la pantalla no los dibuja. */
  sinDetalle: boolean;
}

function llegadasDe(art: ArticuloCompras): Llegada[] | null {
  return art.llegadas ?? null;
}

function diasDe(art: ArticuloCompras): DiaVenta[] | null {
  return art.ventasDia ?? null;
}

/** El CIF de la ÚLTIMA llegada del modelo: promedio PONDERADO por piezas de las
 *  compras de ese mismo día. Ponderar es lo que ya hace `agruparCompras` dentro
 *  de un documento; acá se extiende al día, que es el grano de una llegada. */
export function cifDeLaUltimaLlegada(compras: readonly Compra[]): number | null {
  const conCif = compras.filter((c) => c.costos.cif != null);
  if (conCif.length === 0) return null;
  const ultimaFecha = conCif.reduce((a, c) => (c.fecha > a ? c.fecha : a), conCif[0].fecha);
  const delDia = conCif.filter((c) => c.fecha === ultimaFecha);
  let pond = 0;
  let peso = 0;
  for (const c of delDia) {
    const u = c.unidades > 0 ? c.unidades : 1;
    pond += (c.costos.cif ?? 0) * u;
    peso += u;
  }
  return peso > 0 ? pond / peso : null;
}

/** El precio de lista del modelo: el de la última llegada que lo traiga; si
 *  ninguna lo trae, el precio de etiqueta del catálogo. */
function listaDelModelo(compras: readonly Compra[], arts: readonly ArticuloCompras[]): number | null {
  const conLista = compras.filter((c) => c.costos.lista != null).sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (conLista[0]) return conLista[0].costos.lista;
  const etiqueta = arts.map((a) => a.precioEtiqueta).filter((p): p is number => p != null);
  return etiqueta.length ? etiqueta[0] : null;
}

/** Suma que se vuelve `null` solo cuando NINGÚN color aportó un número. */
function sumaOpcional(valores: readonly (number | null)[]): number | null {
  const hay = valores.filter((v): v is number => v != null);
  return hay.length ? hay.reduce((s, v) => s + v, 0) : null;
}

/**
 * Arma la tarjeta de un modelo a partir de los artículos (colores) que la
 * búsqueda devolvió. Sirve igual para UN color solo: la tarjeta de un color es
 * la misma forma con un solo renglón — Daniel: *«con la misma forma»*.
 */
export function armarTarjetaModelo(
  modelo: string,
  arts: readonly ArticuloCompras[],
  hoyMes: string,
): TarjetaModelo {
  const comprado = sumaOpcional(arts.map((a) => (a.sinCompraRegistrada ? null : (a.cuadre?.comprado ?? null))));
  const vendido = arts.reduce((s, a) => s + (a.cuadre?.vendido ?? 0), 0);
  const stock = sumaOpcional(arts.map((a) => a.existencia));

  const serie = sumarSeries(arts.map((a) => a.serie ?? []));
  const barras = barrasDeVentana(serie, hoyMes);
  const promedio = promedioMensual(barras);

  const compras = arts.flatMap((a) => a.compras ?? []);
  const cif = cifDeLaUltimaLlegada(compras);

  const detalles = arts.map((a) => ({ art: a, llegadas: llegadasDe(a), dias: diasDe(a) }));
  const sinDetalle = detalles.every((d) => d.llegadas == null);

  // 🔴 LAS LLEGADAS DEL MODELO SE VUELVEN A JUNTAR POR DÍA. Cada color trae las
  // suyas ya agrupadas por día, pero el 4-ago-2026 llegaron 120 del color 400 y
  // 240 del 902: para el MODELO eso es UNA llegada de 360, no dos. Sin volver a
  // juntar, NB2570 pasaba de 27 llegadas a 52 y la de nov-2025 medía 26 semanas
  // en vez de 21 — los tramos de la fila quedaban partidos.
  const llegadasModelo = sinDetalle
    ? []
    : medirLlegadas(
        agruparLlegadasPorDia(detalles.flatMap((d) => d.llegadas ?? [])),
        sumarDias(detalles.map((d) => d.dias ?? [])),
        stock,
      );
  const { ultima, vara } = ultimaYVara(llegadasModelo);

  const filas: FilaColor[] = arts.map((a) => {
    const medidas =
      a.llegadas == null
        ? []
        : medirLlegadas(a.llegadas, a.ventasDia ?? [], a.existencia);
    const uv = ultimaYVara(medidas);
    const compradoColor = a.sinCompraRegistrada ? null : (a.cuadre?.comprado ?? null);
    const vendidoColor = a.cuadre?.vendido ?? 0;
    return {
      art: a,
      codigo: a.codigo,
      color: a.codigo.length > 3 ? a.codigo.slice(-3) : null,
      comprado: compradoColor,
      vendido: vendidoColor,
      stock: a.existencia,
      parteVendida: parteVendidaReal(vendidoColor, a.existencia, compradoColor),
      ultima: uv.ultima,
      vara: uv.vara,
    };
  });

  // 🔴 EL ORDEN ES EL STOCK, DE MAYOR A MENOR. Es lo que Daniel mira para
  // decidir si repone; el código sirve solo de desempate estable.
  const porStock = (a: FilaColor, b: FilaColor) =>
    (b.stock ?? 0) - (a.stock ?? 0) || a.codigo.localeCompare(b.codigo);
  const conStock = filas.filter((f) => (f.stock ?? 0) > 0).sort(porStock);
  const sinStock = filas.filter((f) => !((f.stock ?? 0) > 0)).sort(porStock);

  return {
    modelo,
    descripcion: arts.find((a) => a.descripcion)?.descripcion ?? "",
    empresa: arts[0]?.empresa ?? "",
    colores: new Set(arts.map((a) => a.codigo)).size,
    comprado,
    vendido,
    stock,
    parteVendida: parteVendidaReal(vendido, stock, comprado),
    llegadas: llegadasModelo,
    ultima,
    vara,
    primerMesLlegada: llegadasModelo[0]?.fecha.slice(0, 7) ?? null,
    serie,
    margen: margenReal(promedio.venta, promedio.unidades, cif),
    fob: fobEstimado(cif),
    precioLista: listaDelModelo(compras, arts),
    mesesPromedio: promedio.meses,
    trimestres: trimestresDe(serie, hoyMes),
    trimestresAnterior: trimestresDe(serie, hoyMes, 1),
    filas: conStock,
    sinStock,
    sinDetalle,
  };
}
