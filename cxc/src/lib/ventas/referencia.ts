// ─────────────────────────────────────────────────────────────────────────────
// Tab "Referencia" de /ventas — módulo PURO (sin Supabase, sin red).
//
// Piezas compartidas del tab: signo de los comprobantes, aritmética de meses,
// modelo/color y parseo de la búsqueda. La medición de una COMPRA (cuánto
// llegó, en cuánto tiempo se vendió, qué queda) vive en `compras.ts`.
//
// 🔴 LAS NC RESTAN. `tipo='NC'` viene con el monto en POSITIVO (magnitud) —
// el signo se aplica acá y en NINGÚN otro lado. La firma del error histórico
// de este repo es que la diferencia da EXACTO el doble de las NC (se pagó dos
// veces); hay un test que la fija.
//
// 🩸 ACÁ NO SE CALCULA NINGÚN VEREDICTO, Y ES A PROPÓSITO. Este archivo tenía
// "se agotó", "descontinuado" y `sugerencia6m` ("compra ~138 unidades"), más
// ventanas de 3/6/12 meses que METÍAN EL MES EN CURSO adentro del promedio —
// medido el 10-ago: los "últimos 3 meses" de `40HM265001` daban 18,3 u/mes
// contando 10 días de agosto contra 34,3 con meses completos, el DOBLE. Daniel
// rechazó dos diseños por recomendarle qué comprar: *"quiero la data clara y
// simple"*. Todo eso se fue. Lo que queda acá es aritmética de meses, el signo
// de los comprobantes y la búsqueda; las COMPRAS viven en `compras.ts`.
//
// 🔴 EMPRESAS: SOLO las 6 de Fashion Group. `confecciones_boston` y
// `american_classic` (Multifashion/ACS) quedan FUERA por decisión explícita
// de Daniel. La lista se DERIVA de `B2B_EMPRESA_KEYS` (fuente única, son
// exactamente esas 6) — no se escribe a mano una segunda copia.
// ─────────────────────────────────────────────────────────────────────────────

import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

/** Las 6 empresas del grupo cuyo `switch_articulo_diario` alimenta este tab. */
export const REFERENCIA_EMPRESA_KEYS: readonly string[] = B2B_EMPRESA_KEYS;

// ─── Umbrales con nombre — nada de números mágicos regados ───────────────────

/** Tope de filas que una búsqueda puede leer de PostgREST (20 páginas).
 *  Protege a Supabase de un término demasiado amplio — el usuario afina. */
export const MAX_FILAS_BUSQUEDA = 20_000;

/** Máximo de códigos en la vista múltiple (como el banco de imágenes). */
export const MAX_CODIGOS_MULTI = 50;

/** El gráfico mes a mes muestra hasta esta cantidad de meses (los últimos). */
export const SERIE_GRAFICO_MESES = 18;

/** Largo del sufijo de color: los últimos 3 dígitos del código. */
export const LARGO_COLOR = 3;

// ─── Signo por tipo de comprobante ───────────────────────────────────────────

/** FA/CNF suman; NC resta. El monto guardado es SIEMPRE magnitud positiva. */
export function signoTipo(tipo: string): 1 | -1 {
  return tipo === "NC" ? -1 : 1;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Fila cruda de `switch_articulo_diario` (lo mínimo que este módulo usa). */
export interface FilaDiario {
  empresa_key: string;
  fecha: string; // date pelado YYYY-MM-DD (la tabla agrega por día de negocio)
  codigo: string | null;
  descripcion: string | null;
  tipo: string;
  cantidad_total: number | string;
  venta_total: number | string;
}

/** Un mes de la serie NETA (NC ya restadas) de una referencia. */
export interface MesSerie {
  mes: string; // YYYY-MM
  unidades: number;
  venta: number;
}

/** Serie mensual neta de UNA referencia en SU empresa. */
export interface ReferenciaSerie {
  codigo: string;
  empresa: string;
  descripcion: string;
  serie: MesSerie[]; // ordenada por mes ascendente
  /** Datos de catálogo (switch_articulo_info): nombre comercial, existencia,
   *  precio de etiqueta y su frescura. null = ese código no está en el
   *  catálogo sincronizado; ausente = la tabla todavía no existe. */
  info?: import("./referencia-info").InfoCliente | null;
}

// ─── Contrato del API (/api/ventas/referencia) ───────────────────────────────
// Vive acá (módulo puro) para que la vista lo importe sin arrastrar el route,
// que trae imports de servidor.

export interface CoincidenciaDescripcion {
  modelo: string;
  descripcion: string;
  empresa: string;
  colores: number;
}

export interface ReferenciaApiResp {
  modo: "referencias" | "coincidencias";
  /** Mes actual en hora Panamá (YYYY-MM) — el corte de TODOS los cálculos. */
  hoyMes: string;
  referencias?: ReferenciaSerie[];
  coincidencias?: CoincidenciaDescripcion[];
  noEncontrados?: string[];
  /** false = switch_articulo_info todavía no existe (migración pendiente):
   *  la pantalla ofrece el botón de actualizar pero no promete existencias. */
  infoDisponible?: boolean;
}

// ─── Aritmética de meses (strings YYYY-MM — sin Date, sin zonas) ─────────────

export function mesDeFecha(fecha: string): string {
  return fecha.slice(0, 7);
}

/** Resta n meses a un YYYY-MM. */
export function restarMeses(mes: string, n: number): string {
  const [y, m] = mes.split("-").map(Number);
  const total = y * 12 + (m - 1) - n;
  const y2 = Math.floor(total / 12);
  const m2 = (total % 12) + 1;
  return `${y2}-${String(m2).padStart(2, "0")}`;
}

/** Meses de distancia (a - b), con a ≥ b. "2026-08" - "2025-07" = 13. */
export function diffMeses(a: string, b: string): number {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return ya * 12 + ma - (yb * 12 + mb);
}

// ─── Agregación filas → series por referencia ────────────────────────────────

/**
 * Agrupa filas diarias en series mensuales NETAS por código.
 *
 * Una referencia vive en UNA sola empresa: si (por un dato sucio) el mismo
 * código apareciera en dos, se queda con la empresa de MÁS unidades netas y
 * se descartan las otras — nunca se mezclan empresas en una serie.
 */
export function agruparReferencias(filas: FilaDiario[]): ReferenciaSerie[] {
  // codigo → empresa → { descripcion, meses }
  const porCodigo = new Map<
    string,
    Map<string, { descripcion: string; meses: Map<string, { unidades: number; venta: number }>; unidadesNetas: number }>
  >();

  for (const f of filas) {
    if (!f.codigo) continue;
    const s = signoTipo(f.tipo);
    const mes = mesDeFecha(f.fecha);
    const porEmpresa = porCodigo.get(f.codigo) ?? new Map();
    porCodigo.set(f.codigo, porEmpresa);
    const emp = porEmpresa.get(f.empresa_key) ?? {
      descripcion: f.descripcion ?? "",
      meses: new Map<string, { unidades: number; venta: number }>(),
      unidadesNetas: 0,
    };
    porEmpresa.set(f.empresa_key, emp);
    if (!emp.descripcion && f.descripcion) emp.descripcion = f.descripcion;
    const m = emp.meses.get(mes) ?? { unidades: 0, venta: 0 };
    m.unidades += s * Number(f.cantidad_total);
    m.venta += s * Number(f.venta_total);
    emp.meses.set(mes, m);
    emp.unidadesNetas += s * Number(f.cantidad_total);
  }

  const out: ReferenciaSerie[] = [];
  for (const [codigo, porEmpresa] of porCodigo) {
    // Empresa dominante = más unidades netas (desempate: orden alfabético,
    // para que el resultado sea determinista).
    const ganadora = [...porEmpresa.entries()].sort(
      (a, b) => b[1].unidadesNetas - a[1].unidadesNetas || a[0].localeCompare(b[0]),
    )[0];
    const serie = [...ganadora[1].meses.entries()]
      .map(([mes, v]) => ({ mes, unidades: v.unidades, venta: v.venta }))
      .sort((a, b) => a.mes.localeCompare(b.mes));
    out.push({ codigo, empresa: ganadora[0], descripcion: ganadora[1].descripcion, serie });
  }
  return out.sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/** Suma varias series (los colores de un modelo) en una sola, mes a mes. */
export function sumarSeries(series: MesSerie[][]): MesSerie[] {
  const meses = new Map<string, { unidades: number; venta: number }>();
  for (const serie of series) {
    for (const p of serie) {
      const m = meses.get(p.mes) ?? { unidades: 0, venta: 0 };
      m.unidades += p.unidades;
      m.venta += p.venta;
      meses.set(p.mes, m);
    }
  }
  return [...meses.entries()]
    .map(([mes, v]) => ({ mes, unidades: v.unidades, venta: v.venta }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

// ─── Modelo y color ──────────────────────────────────────────────────────────

/** Los últimos 3 dígitos del código son el color. `31KAE22003001` → modelo
 *  `31KAE22003`, color `001`. Si el sufijo no son 3 dígitos, el código es su
 *  propio modelo (no se adivina). */
export function modeloDe(codigo: string): string {
  if (codigo.length > LARGO_COLOR && /^\d{3}$/.test(codigo.slice(-LARGO_COLOR))) {
    return codigo.slice(0, -LARGO_COLOR);
  }
  return codigo;
}

export function colorDe(codigo: string): string | null {
  return modeloDe(codigo) === codigo ? null : codigo.slice(-LARGO_COLOR);
}

// ─── Búsqueda ────────────────────────────────────────────────────────────────

/** Sin acentos, sin mayúsculas/minúsculas, espacios colapsados. */
export function normalizarBusqueda(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿Parece un código/modelo? (sin espacios, alfanumérico con - / . #) */
export function esCodigo(q: string): boolean {
  return /^[A-Z0-9][A-Z0-9\-/.#]{2,}$/.test(q);
}

/** Escapa los comodines de LIKE/ILIKE de PostgREST. */
export function escapeLike(q: string): string {
  return q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Pega la lista de la vista múltiple: separada por espacios, comas o saltos
 *  de línea. Devuelve hasta MAX_CODIGOS_MULTI únicos + cuántos se descartaron.
 *
 *  🔴 EL GUIÓN FINAL SE QUITA (`4D5077G-` → `4D5077G`), y no es una adivinanza:
 *  medido el 12-ago-2026 contra producción (`scripts/_diag-referencia-guiones.ts`),
 *  NO EXISTE ni un código que termine en guión en ninguna de las tres fuentes
 *  (`switch_articulo_info`, `switch_articulo_diario`, `switch_ingresos_mercancia`
 *  → 0 · 0 · 0 filas `LIKE '%-'`). Es un artefacto del Excel del que Daniel
 *  copia. Los guiones INTERIORES (`KACKS26-0046`, `T1A8-32600`) no se tocan.
 *
 *  Los duplicados se deduplican EN SILENCIO (la lista real de Daniel trae
 *  `4D5077G` y `4D5077G-` juntos: son el mismo pedido) y el orden que queda es
 *  el de la PRIMERA aparición — de ahí sale el orden de la tabla. */
export function parsearListaCodigos(texto: string): { codigos: string[]; descartados: number } {
  const todos = texto
    .split(/[\s,;]+/)
    .map((c) => normalizarBusqueda(c).replace(/-+$/, ""))
    .filter((c) => c.length >= 3 && esCodigo(c));
  const unicos = [...new Set(todos)];
  return {
    codigos: unicos.slice(0, MAX_CODIGOS_MULTI),
    descartados: Math.max(0, unicos.length - MAX_CODIGOS_MULTI),
  };
}

/**
 * ¿A cuál código pegado pertenece este artículo? Por PREFIJO: lo pegado suele
 * ser el MODELO y el código real lleva el color al final (`4D5029G` trae
 * `4D5029G002`); un código con color pegado tal cual también matchea (es
 * prefijo de sí mismo). Gana la PRIMERA aparición en la lista. −1 = ninguno.
 *
 * Es LA MISMA semántica con la que el route busca (LIKE 'pegado%'): si acá se
 * pareara distinto, la tabla ordenaría con otra verdad que la búsqueda.
 */
export function posicionEnPegado(codigo: string, codigos: readonly string[]): number {
  const c = codigo.toUpperCase();
  return codigos.findIndex((p) => c.startsWith(p.toUpperCase()));
}

/** Los códigos pegados que NO trajeron ni un artículo (por prefijo) — los
 *  genuinamente inexistentes. Es el único criterio del "no encontré". */
export function pedidosNoEncontrados(
  pedidos: readonly string[],
  codigosHallados: readonly string[],
): string[] {
  const hallados = codigosHallados.map((c) => c.toUpperCase());
  return pedidos.filter((p) => {
    const pref = p.toUpperCase();
    return !hallados.some((c) => c.startsWith(pref));
  });
}

/**
 * Ordena los artículos EN EL ORDEN EN QUE SE PEGARON los códigos (modo pedido):
 * Daniel lee la tabla con su Excel al lado y el orden de su lista es el mapa.
 *
 * El pareo es POR PREFIJO (`posicionEnPegado`): pegar el modelo `4D5029G`
 * trae `4D5029G002`, y esa fila ordena en el lugar del modelo. Los colores de
 * un mismo modelo quedan juntos, por código; un artículo que no matchea ningún
 * pegado va al final — nunca se pierde. El Excel recibe esta misma lista.
 */
export function ordenarComoPegado<T extends { codigo: string; empresa: string }>(
  articulos: readonly T[],
  codigos: readonly string[],
): T[] {
  const pos = new Map(
    articulos.map((a) => {
      const i = posicionEnPegado(a.codigo, codigos);
      return [a, i === -1 ? codigos.length : i] as const;
    }),
  );
  return [...articulos].sort((a, b) => {
    return (
      (pos.get(a) ?? codigos.length) - (pos.get(b) ?? codigos.length) ||
      a.codigo.localeCompare(b.codigo) ||
      a.empresa.localeCompare(b.empresa)
    );
  });
}
