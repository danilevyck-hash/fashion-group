// ─────────────────────────────────────────────────────────────────────────────
// UN SOLO CONTROL DE TIEMPO PARA TODO MULTIFASHION (6-sep-2026).
//
// 🩸 Hasta hoy había TRES a la vez, y ninguno decía que los otros existían:
//   1. el **año**, un desplegable arriba a la derecha, en el encabezado;
//   2. el **mes**, con flechas ‹ › y su propio desplegable, más abajo;
//   3. **píldoras propias** en Vendedoras (seis: mes en curso · mes cerrado ·
//      YTD · últimos 3/6/12) y en Clientes (cuatro: Mes · 3m · 6m · 12m).
// En el teléfono las seis de Vendedoras ocupaban TRES filas, y la de Clientes
// decía el LARGO de la ventana pero nunca el mes en el que termina — un dato
// gobernado por un control que en esa pestaña ni siquiera se dibujaba.
//
// Queda UN desplegable con la MISMA forma que Comisiones y Ventas:
//
//     Septiembre 2026 ⌄
//
// que ofrece los meses (con su año adentro, así el selector de año desaparece),
// el año completo, y los rangos de últimos 3, 6 y 12 meses. Daniel, textual:
// *«que me ofrezca los períodos de últimos 3m, 6m, 12, así veo por rango»*.
//
// 🔴 CADA PESTAÑA MUESTRA LAS OPCIONES QUE LE SIRVEN, y esto NO es cosmético:
// el Resumen es el detalle de UN mes (día por día, mejor/peor día, comparativo
// contra el mismo mes del año pasado) y no sabe dibujar un rango; Productos
// consulta con `periodo=mes|12m` y no tiene otra ventana. Ofrecer una opción que
// la pestaña no puede servir es la forma más fácil de mirar un período creyendo
// que se mira otro — la advertencia que ya estaba escrita en `MultifashionView`.
// Por eso `ajustarPeriodo` existe: al cambiar de pestaña, un período que la
// nueva no sirve cae a SU MES, nunca a una pantalla vacía ni a un número que no
// corresponde.
//
// ⚠️ LO QUE NO CAMBIA: el borde de mes sigue siendo Panamá (UTC−5, `hoyPanama`),
// las comparaciones siguen siendo contra los MISMOS DÍAS cargados, y en los
// chips de mes de Vendedoras la Δ sigue comparando contra el MES ANTERIOR con el
// rótulo diciéndolo (`vendedoras-rotulo.ts`). Este módulo elige el período; no
// toca ni una fórmula.
// ─────────────────────────────────────────────────────────────────────────────

import type { TabMultifashion } from "@/lib/multifashion/pestanas";

export type VentanaN = 3 | 6 | 12;

export type Periodo =
  /** Un mes de calendario concreto. El año viaja adentro. */
  | { tipo: "mes"; anio: number; mes: number }
  /** El año entero (en el año en curso, lo que va del año). */
  | { tipo: "anio"; anio: number }
  /** Ventana rodante de N meses que TERMINA en el mes de corte. */
  | { tipo: "ultimos"; n: VentanaN };

/** El mes más nuevo al que se puede llegar: hoy en Panamá, o el último cargado. */
export interface CortePeriodo {
  anio: number;
  mes: number;
}

const MES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Qué tipos de período sabe servir cada pestaña. Ver la nota de arriba. */
export const TIPOS_POR_TAB: Record<TabMultifashion, { mes: boolean; anio: boolean; ventanas: VentanaN[] }> = {
  // Detalle de UN mes: día por día, mejor/peor día, mismo mes del año anterior.
  resumen:    { mes: true, anio: false, ventanas: [] },
  // Reemplaza las SEIS píldoras: los meses cubren «en curso» y «cerrado», «Todo
  // el año» es el YTD de siempre, y las tres ventanas son las mismas de antes.
  vendedoras: { mes: true, anio: true,  ventanas: [3, 6, 12] },
  // La ruta acepta `periodo=mes|12m` y nada más. No se inventan ventanas.
  productos:  { mes: true, anio: false, ventanas: [12] },
  // Reemplaza sus cuatro píldoras (Mes · 3m · 6m · 12m) y suma el año completo.
  clientes:   { mes: true, anio: true,  ventanas: [3, 6, 12] },
};

/** ¿Esta pestaña sabe servir este período? */
export function periodoSirve(tab: TabMultifashion, p: Periodo): boolean {
  const t = TIPOS_POR_TAB[tab];
  if (p.tipo === "mes") return t.mes;
  if (p.tipo === "anio") return t.anio;
  return t.ventanas.includes(p.n);
}

/** El mes que representa un período: el suyo, o el de corte. */
export function mesDelPeriodo(p: Periodo, corte: CortePeriodo): CortePeriodo {
  if (p.tipo === "mes") return { anio: p.anio, mes: p.mes };
  if (p.tipo === "anio") return { anio: p.anio, mes: p.anio === corte.anio ? corte.mes : 12 };
  return { anio: corte.anio, mes: corte.mes };
}

/** El AÑO de un período — la clave con la que se pide el resumen anual. */
export function anioDelPeriodo(p: Periodo, corte: CortePeriodo): number {
  return mesDelPeriodo(p, corte).anio;
}

/**
 * Al cambiar de pestaña, un período que la nueva no sabe servir cae a SU MES.
 * Nunca a una pantalla vacía y nunca a otro período en silencio.
 */
export function ajustarPeriodo(p: Periodo, tab: TabMultifashion, corte: CortePeriodo): Periodo {
  if (periodoSirve(tab, p)) return p;
  const m = mesDelPeriodo(p, corte);
  return { tipo: "mes", anio: m.anio, mes: m.mes };
}

// ── URL ──────────────────────────────────────────────────────────────────────
// UN solo parámetro: `?mfPeriodo=`. `2026-09` · `2026` · `u3` · `u6` · `u12`.
// Es un filtro del MISMO nivel, así que va con `replace` (no cicla el back).

export function periodoAUrl(p: Periodo): string {
  if (p.tipo === "mes") return `${p.anio}-${String(p.mes).padStart(2, "0")}`;
  if (p.tipo === "anio") return String(p.anio);
  return `u${p.n}`;
}

/**
 * Lee el parámetro. Basura → `null` (el llamador cae al default), nunca una
 * pantalla en blanco ni un mes 13.
 */
export function periodoDesdeUrl(raw: string | null | undefined): Periodo | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const ventana = /^u(3|6|12)$/.exec(v);
  if (ventana) return { tipo: "ultimos", n: Number(ventana[1]) as VentanaN };
  const mes = /^(\d{4})-(\d{2})$/.exec(v);
  if (mes) {
    const anio = Number(mes[1]);
    const m = Number(mes[2]);
    if (anio < 2000 || anio > 2100 || m < 1 || m > 12) return null;
    return { tipo: "mes", anio, mes: m };
  }
  const anio = /^(\d{4})$/.exec(v);
  if (anio) {
    const a = Number(anio[1]);
    if (a < 2000 || a > 2100) return null;
    return { tipo: "anio", anio: a };
  }
  return null;
}

// ── Rótulos ──────────────────────────────────────────────────────────────────

/** Lo que dice el botón del desplegable: «Septiembre 2026», «Últimos 3 meses». */
export function etiquetaPeriodo(p: Periodo): string {
  if (p.tipo === "mes") return `${MES_LARGO[p.mes - 1]} ${p.anio}`;
  if (p.tipo === "anio") return `Todo el año ${p.anio}`;
  return `Últimos ${p.n} meses`;
}

export interface OpcionPeriodo {
  /** El mismo texto que va y viene por la URL. */
  valor: string;
  label: string;
  /** Encabezado del grupo en el desplegable («Rangos», «2026», «2025»…). */
  grupo: string;
}

export interface ArgsOpciones {
  tab: TabMultifashion;
  /** Años con datos, de más nuevo a más viejo. */
  anios: number[];
  corte: CortePeriodo;
  /** Meses con dato de los años que se conocen (el del período, típicamente). */
  mesesConDato?: Record<number, number[]>;
}

/**
 * Las opciones del desplegable, en el orden en que se muestran: primero los
 * rangos (lo que se mira seguido), después el año completo, después los meses
 * agrupados por año del más nuevo al más viejo.
 *
 * ⚠️ El año en curso se corta en el mes de corte: **no se navega al futuro**,
 * la misma regla que tenían las flechas ‹ ›.
 */
export function opcionesPeriodo({ tab, anios, corte, mesesConDato }: ArgsOpciones): OpcionPeriodo[] {
  const t = TIPOS_POR_TAB[tab];
  const out: OpcionPeriodo[] = [];

  for (const n of t.ventanas) {
    out.push({ valor: `u${n}`, label: `Últimos ${n} meses`, grupo: "Rangos" });
  }

  const listaAnios = [...new Set(anios.length > 0 ? anios : [corte.anio])].sort((a, b) => b - a);

  if (t.anio) {
    for (const a of listaAnios) {
      out.push({ valor: String(a), label: `Todo el año ${a}`, grupo: "Rangos" });
    }
  }

  if (t.mes) {
    for (const a of listaAnios) {
      const tope = a === corte.anio ? corte.mes : 12;
      const conocidos = mesesConDato?.[a];
      for (let m = 1; m <= tope; m++) {
        if (conocidos && !conocidos.includes(m)) continue;
        out.push({
          valor: `${a}-${String(m).padStart(2, "0")}`,
          label: `${MES_LARGO[m - 1]} ${a}`,
          grupo: String(a),
        });
      }
    }
  }

  return out;
}

/** El período con el que abre el módulo: el mes de corte. */
export function periodoPorDefecto(corte: CortePeriodo): Periodo {
  return { tipo: "mes", anio: corte.anio, mes: corte.mes };
}
