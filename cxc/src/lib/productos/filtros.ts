// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTOS (Daniel, 5-oct-2026): la MISMA pantalla en Ventas y en Multifashion.
//
//   ‹ Oct 2026 › · Rango · Empresa ▾ (o Marca ▾) · Departamento ▾ · Género ▾ ·
//   Descripción ▾ · 🔍 (solo código)
//
// Todo se filtra a nivel de CÓDIGO (un artículo de Switch) y después se agrupa
// por descripción: los totales (unidades, venta, utilidad, margen) son la suma
// de los códigos que quedan. Sin filtro, los números son los de siempre.
//
// De dónde sale cada chip (medido el 5-oct-2026):
//   · Departamento: lo que Switch llama «marca» («TH MENSWEAR»), sin el prefijo
//     de la marca → «Menswear». Ventas: `switch_factura_lineas`; Multifashion:
//     el diccionario `switch_articulo_marca`.
//   · Género: el prefijo de la descripción (Men-/Women-/Boys-…). En Active Shoes
//     el subrubro de Switch (MALE/FEMALE/KIDS). Si menos del 80 % de la venta
//     tiene género, el chip NO se muestra (Active Wear: no es confiable).
//   · Descripción: la de Switch, tal cual.
//
// `PRODUCTOS_FILTROS_2026_10 = false` → las dos pantallas vuelven a como estaban.
// Candado: `src/__tests__/lib/productos-filtros.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

// 🔴 PRENDIDO el 5-oct-2026: Daniel aprobó el mockup («sí») y la migración
// 20261229120000 quedó aplicada (camino rápido). `false` = Productos de antes.
export const PRODUCTOS_FILTROS_2026_10 = true;

/** Un código con su clasificación. Montos ya firmados (las NC restan). */
export interface ArticuloVendido {
  codigo: string;
  descripcion: string;
  unidades: number;
  venta: number;
  costo: number;
  /** Clasificación por campo («departamento», «genero», «descripcion»…). Vacío = sin dato. */
  campos: Record<string, string>;
  /** Existencia en Switch (`switch_articulo_info`). `null` = sin dato; Multifashion no tiene. */
  existencia?: number | null;
  /** ¿Se vendió algo en los últimos 90 días? (para «Sin venta en 90 días»). */
  vendio90?: boolean;
  /** Foto del catálogo, si el código está en uno. */
  foto?: string | null;
}

export interface ChipFiltro {
  campo: string;
  etiqueta: string;
  /** Desplegable largo: lleva buscador arriba («sand» → Women-Sandals). */
  conBuscador?: boolean;
  /** Solo se muestra si al menos esta parte de la venta tiene el campo (0..1). */
  cobertura?: number;
}

export type Elegidos = Record<string, string>;

export interface TotalesFiltro {
  unidades: number;
  venta: number;
  costo: number;
  utilidad: number;
  /** utilidad ÷ venta; `null` si la venta no es positiva (misma regla de siempre). */
  margen: number | null;
}

const norm = (s: string) => s.toLowerCase();

/** Los artículos que pasan el buscador de código y los chips elegidos. */
export function filtrarArticulos(
  articulos: readonly ArticuloVendido[],
  codigo: string,
  elegidos: Elegidos,
): ArticuloVendido[] {
  const q = norm(codigo.trim());
  const activos = Object.entries(elegidos).filter(([, v]) => v);
  return articulos.filter(a =>
    (!q || norm(a.codigo).includes(q)) &&
    activos.every(([campo, v]) => (a.campos[campo] ?? "") === v),
  );
}

export function hayFiltro(codigo: string, elegidos: Elegidos): boolean {
  return !!codigo.trim() || Object.values(elegidos).some(Boolean);
}

/**
 * Las opciones de un chip: los valores que existen con LOS OTROS filtros puestos
 * (no el propio), de mayor a menor venta. Así ningún valor deja la lista vacía.
 */
export function opcionesDe(
  articulos: readonly ArticuloVendido[],
  campo: string,
  codigo: string,
  elegidos: Elegidos,
): string[] {
  const resto = filtrarArticulos(articulos, codigo, { ...elegidos, [campo]: "" });
  const venta = new Map<string, number>();
  for (const a of resto) {
    const v = a.campos[campo];
    if (v) venta.set(v, (venta.get(v) ?? 0) + Math.max(a.venta, 0) + 1e-9);
  }
  return [...venta.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([v]) => v);
}

/** Qué parte de la venta tiene valor en el campo (0..1). Sin venta, 1. */
export function coberturaDe(articulos: readonly ArticuloVendido[], campo: string): number {
  let total = 0, con = 0;
  for (const a of articulos) {
    const v = Math.max(a.venta, 0);
    total += v;
    if (a.campos[campo]) con += v;
  }
  return total > 0 ? con / total : 1;
}

const c2 = (n: number) => Math.round(n * 100) / 100;

export function totalesDe(articulos: readonly ArticuloVendido[]): TotalesFiltro {
  let unidades = 0, venta = 0, costo = 0;
  for (const a of articulos) {
    unidades += a.unidades;
    venta += a.venta;
    costo += a.costo;
  }
  const utilidad = c2(venta - costo);
  return {
    unidades: Math.round(unidades * 10_000) / 10_000,
    venta: c2(venta),
    costo: c2(costo),
    utilidad,
    margen: venta > 0 ? utilidad / venta : null,
  };
}

export interface RenglonDescripcion extends TotalesFiltro {
  descripcion: string;
  articulos: ArticuloVendido[];
  /** Suma de la existencia de sus códigos; `null` si ninguno la tiene. */
  existencia: number | null;
}

/** Agrupa por descripción, de mayor a menor venta (o existencia, si no hay venta). */
export function porDescripcion(articulos: readonly ArticuloVendido[]): RenglonDescripcion[] {
  const grupos = new Map<string, ArticuloVendido[]>();
  for (const a of articulos) {
    const g = grupos.get(a.descripcion);
    if (g) g.push(a);
    else grupos.set(a.descripcion, [a]);
  }
  const out: RenglonDescripcion[] = [];
  for (const [descripcion, arts] of grupos) {
    const ex = arts.filter(a => a.existencia != null);
    out.push({
      descripcion,
      articulos: [...arts].sort((a, b) => b.venta - a.venta || (b.existencia ?? 0) - (a.existencia ?? 0)),
      existencia: ex.length ? ex.reduce((s, a) => s + (a.existencia ?? 0), 0) : null,
      ...totalesDe(arts),
    });
  }
  return out.sort((a, b) => b.venta - a.venta || (b.existencia ?? 0) - (a.existencia ?? 0) || a.descripcion.localeCompare(b.descripcion));
}

/**
 * Días de inventario: la existencia ÷ lo que se vende por día en el período.
 * `null` sin existencia o sin unidades vendidas (no se puede medir).
 */
export function diasDeInventario(existencia: number | null | undefined, unidades: number, diasPeriodo: number): number | null {
  if (existencia == null || existencia <= 0 || unidades <= 0 || diasPeriodo <= 0) return existencia === 0 ? 0 : null;
  return Math.round(existencia / (unidades / diasPeriodo));
}

/** Días de calendario entre dos fechas `YYYY-MM-DD`, ambas incluidas. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;
}

// ── Departamento y género ───────────────────────────────────────────────────

const PREFIJOS_MARCA = new Set(["TH", "CK", "KL", "RBK"]);
const PALABRA_ENTERA = new Set(["&", "-"]);

/** «TH MENSWEAR» → «Menswear» · «TH TOMMY JEANS» → «Tommy Jeans» · «FOOTWEAR» → «Footwear». */
export function departamentoSinMarca(marcaSwitch: string | null | undefined): string {
  const palabras = String(marcaSwitch ?? "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (palabras.length > 1 && PREFIJOS_MARCA.has(palabras[0].toUpperCase())) palabras.shift();
  return palabras
    .map(p => (PALABRA_ENTERA.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join(" ");
}

export type Genero = "Hombre" | "Mujer" | "Niños" | "";

const GENERO_POR_PREFIJO: Record<string, Genero> = {
  men: "Hombre", mens: "Hombre",
  women: "Mujer", womens: "Mujer",
  boys: "Niños", girls: "Niños", kids: "Niños", toddler: "Niños", baby: "Niños", newborn: "Niños", infant: "Niños",
};
const GENERO_SWITCH: Record<string, Genero> = { MALE: "Hombre", MEN: "Hombre", FEMALE: "Mujer", WOMEN: "Mujer", KIDS: "Niños", BOYS: "Niños", GIRLS: "Niños" };

/**
 * El género: el prefijo de la descripción («Men-T-Shirts», «Women Riviera
 * Sandal»). Si no lo dice, el rubro o subrubro de Switch cuando es un género
 * (Active Shoes: MALE/FEMALE). Nunca se adivina: sin dato, vacío.
 */
export function generoDe(descripcion: string, rubro?: string | null, subrubro?: string | null): Genero {
  const prefijo = descripcion.trim().split(/[-\s]/)[0]?.toLowerCase() ?? "";
  const porDescripcion = GENERO_POR_PREFIJO[prefijo];
  if (porDescripcion) return porDescripcion;
  for (const x of [subrubro, rubro]) {
    const g = GENERO_SWITCH[String(x ?? "").trim().toUpperCase()];
    if (g) return g;
  }
  return "";
}

/** El color: los 3 últimos caracteres del código (la misma regla que agrupa por modelo en Consulta de artículos). */
export function partesDelCodigo(codigo: string): { modelo: string; color: string } {
  const limpio = codigo.replace(/[-.\s]+$/, "");
  if (limpio.length <= 5) return { modelo: limpio, color: "" };
  return { modelo: limpio.slice(0, -3).replace(/[-.]$/, ""), color: limpio.slice(-3) };
}
