// ─────────────────────────────────────────────────────────────────────────────
// Tab "Referencia" de /ventas — módulo PURO (sin Supabase, sin red).
//
// Responde la pregunta de compra de Daniel: "¿cuánto vendió esta referencia?"
// sobre `switch_articulo_diario`. Todas las reglas de cálculo viven acá para
// que el API route y la UI usen LA MISMA matemática y los tests la fijen.
//
// 🔴 LAS NC RESTAN. `tipo='NC'` viene con el monto en POSITIVO (magnitud) —
// el signo se aplica acá y en NINGÚN otro lado. La firma del error histórico
// de este repo es que la diferencia da EXACTO el doble de las NC (se pagó dos
// veces); hay un test que la fija.
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

export const UMBRALES_AGOTADO = {
  /** Meses SIN venta para considerar que se agotó (≥). */
  MESES_SIN_VENTA: 3,
  /** Ritmo mínimo (u/mes) en los últimos meses activos para que "se agotó"
   *  signifique "se agotó" y no "dejó de gustar" (≥). */
  RITMO_MINIMO: 3,
  /** Cuántos de los últimos meses ACTIVOS se promedian para medir el ritmo. */
  VENTANA_RITMO_MESES: 3,
  /** La sugerencia de compra proyecta el ritmo real a esta cantidad de meses. */
  MESES_SUGERENCIA: 6,
} as const;

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

// ─── Estadísticas de una serie ───────────────────────────────────────────────

export interface VentanaStats {
  unidades: number;
  venta: number;
}

export interface ReferenciaStats {
  unidadesNetas: number;
  ventaNeta: number;
  /** Venta neta ÷ unidades netas — al que salió DE VERDAD. null si unidades ≤ 0. */
  precioReal: number | null;
  /** Ventanas calendario que terminan en el mes actual (inclusive). */
  m3: VentanaStats;
  m6: VentanaStats;
  m12: VentanaStats;
  /** Meses con unidades netas > 0 — NO meses calendario. */
  mesesActivos: number;
  /** unidades netas ÷ meses activos. La columna que distingue "no gustó" de
   *  "no había mercancía". null si nunca vendió. */
  uMesReal: number | null;
  primeraVenta: string | null; // YYYY-MM
  ultimaVenta: string | null; // YYYY-MM
  mesesDesdeUltimaVenta: number | null;
  /** Promedio de los últimos ≤3 meses ACTIVOS (el ritmo que traía). */
  ritmoUltimosActivos: number | null;
  /** Última venta hace ≥3 meses Y venía vendiendo ≥3 u/mes. */
  seAgoto: boolean;
  /** ritmo real × 6 — "para 6 meses: ~N unidades". Solo si seAgoto. */
  sugerencia6m: number | null;
}

function statsVentana(serie: MesSerie[], desde: string, hasta: string): VentanaStats {
  let unidades = 0;
  let venta = 0;
  for (const p of serie) {
    // Rango sobre strings YYYY-MM (semiabierto no hace falta: son meses enteros).
    if (p.mes >= desde && p.mes <= hasta) {
      unidades += p.unidades;
      venta += p.venta;
    }
  }
  return { unidades, venta };
}

/**
 * Calcula todas las estadísticas de una serie. `hoyMes` = mes actual en hora
 * PANAMÁ (YYYY-MM) — lo manda el servidor; nunca se calcula con Date en UTC.
 */
export function calcularStats(serie: MesSerie[], hoyMes: string): ReferenciaStats {
  const unidadesNetas = serie.reduce((s, p) => s + p.unidades, 0);
  const ventaNeta = serie.reduce((s, p) => s + p.venta, 0);
  const activos = serie.filter((p) => p.unidades > 0);
  const mesesActivos = activos.length;
  const primeraVenta = activos.length ? activos[0].mes : null;
  const ultimaVenta = activos.length ? activos[activos.length - 1].mes : null;
  const mesesDesdeUltimaVenta = ultimaVenta ? diffMeses(hoyMes, ultimaVenta) : null;

  const ventana = (n: number) => statsVentana(serie, restarMeses(hoyMes, n - 1), hoyMes);

  const uMesReal = mesesActivos > 0 ? unidadesNetas / mesesActivos : null;
  const precioReal = unidadesNetas > 0 ? ventaNeta / unidadesNetas : null;

  const ultimosActivos = activos.slice(-UMBRALES_AGOTADO.VENTANA_RITMO_MESES);
  const ritmoUltimosActivos = ultimosActivos.length
    ? ultimosActivos.reduce((s, p) => s + p.unidades, 0) / ultimosActivos.length
    : null;

  const seAgoto =
    mesesDesdeUltimaVenta != null &&
    ritmoUltimosActivos != null &&
    mesesDesdeUltimaVenta >= UMBRALES_AGOTADO.MESES_SIN_VENTA &&
    ritmoUltimosActivos >= UMBRALES_AGOTADO.RITMO_MINIMO;

  const sugerencia6m =
    seAgoto && uMesReal != null ? Math.round(uMesReal * UMBRALES_AGOTADO.MESES_SUGERENCIA) : null;

  return {
    unidadesNetas,
    ventaNeta,
    precioReal,
    m3: ventana(3),
    m6: ventana(6),
    m12: ventana(12),
    mesesActivos,
    uMesReal,
    primeraVenta,
    ultimaVenta,
    mesesDesdeUltimaVenta,
    ritmoUltimosActivos,
    seAgoto,
    sugerencia6m,
  };
}

/** Serie CONTINUA para el gráfico: desde la primera venta hasta hoy, con los
 *  meses sin movimiento en 0, recortada a los últimos SERIE_GRAFICO_MESES. */
export function serieContinua(serie: MesSerie[], hoyMes: string): MesSerie[] {
  if (!serie.length) return [];
  const porMes = new Map(serie.map((p) => [p.mes, p]));
  const out: MesSerie[] = [];
  let mes = serie[0].mes;
  // Cota dura por si llega un mes futuro corrupto (no debería).
  for (let i = 0; i < 600 && mes <= hoyMes; i += 1) {
    out.push(porMes.get(mes) ?? { mes, unidades: 0, venta: 0 });
    mes = restarMeses(mes, -1);
  }
  return out.slice(-SERIE_GRAFICO_MESES);
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
 *  de línea. Devuelve hasta MAX_CODIGOS_MULTI únicos + cuántos se descartaron. */
export function parsearListaCodigos(texto: string): { codigos: string[]; descartados: number } {
  const todos = texto
    .split(/[\s,;]+/)
    .map((c) => normalizarBusqueda(c))
    .filter((c) => c.length >= 3 && esCodigo(c));
  const unicos = [...new Set(todos)];
  return {
    codigos: unicos.slice(0, MAX_CODIGOS_MULTI),
    descartados: Math.max(0, unicos.length - MAX_CODIGOS_MULTI),
  };
}
