/**
 * INVENTARIO VALORIZADO — módulo PURO (no toca base ni red).
 *
 * Es el activo más grande del grupo y hasta hoy no se veía en ninguna pantalla:
 * el dato ya viaja todas las madrugadas a `switch_articulo_info` (existencia,
 * costo y precio de etiqueta por artículo) y nadie lo sumaba nunca.
 *
 * ── 🔴 LAS TRES REGLAS QUE NO SE NEGOCIAN ───────────────────────────────────
 *
 * 1. **EL NÚMERO QUE MANDA ES EL COSTO.** Es la plata que Daniel puso. El valor
 *    a precio de etiqueta es POTENCIAL —mercancía que todavía no se vendió— y
 *    por eso viaja en un campo con otro nombre y la pantalla lo rotula aparte.
 *    Un número al precio de venta presentado como "lo que tengo" sería mentira.
 *
 * 2. **POR EMPRESA.** El total existe (es homogéneo: unidades y dólares de
 *    mercancía, la misma pregunta para todas), pero nunca va solo: al lado va
 *    siempre el desglose. Un montón sin abrir no dice de quién es la plata.
 *
 * 3. **LO QUE NO SE MIDE SE DICE, NO SE PONE EN CERO.** Dos casos, y los dos
 *    son mentiras distintas si se muestran como $0:
 *      · Boston y Multifashion NO sincronizan catálogo (`EMPRESAS_SIN_INVENTARIO`,
 *        decisión de Daniel: el cron cubre sólo las 6 de Fashion Group). Una
 *        empresa en $0 se lee como "no tengo mercancía", que es falso.
 *      · Los artículos con existencia y SIN costo cargado en Switch. Sumarlos
 *        como cero achica el activo en silencio; se cuentan aparte y se dicen.
 *
 * ── Qué cuenta y qué no ─────────────────────────────────────────────────────
 *
 * · Sólo `existencia > 0`. La existencia NEGATIVA es una sobreventa registrada
 *   en Switch, no mercancía que exista: valorizarla RESTARÍA plata del activo
 *   por unidades que no están en ningún estante. Se cuenta aparte (`unidadesNegativas`)
 *   para poder decirlo, nunca dentro del valor.
 * · "Sin costo" es `costo_api` NULL **o** 0. En Switch el costo que falta llega
 *   como 0, no como nulo — medido el 13-ago-2026: 7 artículos, 873 unidades,
 *   0 nulos. Tratar sólo el nulo dejaría el hueco entero sin avisar.
 * · El valor NO cambia por contar los "sin costo" aparte: `existencia × 0 = 0`.
 *   Lo único que cambia es que ahora se puede decir cuánto quedó sin valorizar.
 */

import { EMPRESA_KEY_TO_NAME, ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";

/**
 * Las empresas que NO sincronizan catálogo, y por qué.
 *
 * Se DERIVA de `ALL_EMPRESA_KEYS` menos las que cubre `sync-articulo-info`
 * (= `B2B_EMPRESA_KEYS`, las 6 de Fashion Group). No se escribe a mano: el día
 * que se sume una empresa al cron, esta lista se achica sola. La derivación
 * vive en `empresasSinInventario()` para que el módulo puro no importe el
 * catálogo de capacidades del sync (que arrastra I/O).
 */
export const EMPRESAS_SIN_INVENTARIO_MOTIVO =
  "No sincroniza inventario con Switch, así que de esta empresa no hay dato — no es que no tenga mercancía.";

/**
 * Horas a partir de las cuales la pantalla avisa que el dato está viejo.
 *
 * El cron corre 1×/día (04:30-04:50 UTC = 11:30-11:50 pm Panamá), así que
 * durante toda la jornada el dato tiene entre 5 y 19 horas. 26 h es el mismo
 * umbral que usa el resto del sistema para "una corrida diaria se perdió"
 * (`CRON_STALE_HOURS_DEFAULT`): un umbral de 24 h sonaría todas las madrugadas
 * sin que pase nada.
 */
export const HORAS_INVENTARIO_VIEJO = 26;

/** Fila cruda de `switch_articulo_info`, en lo mínimo que este módulo mira. */
export interface FilaArticuloInfo {
  empresa_key: string;
  existencia: number | string | null;
  costo_api: number | string | null;
  precio_etiqueta: number | string | null;
  synced_at: string | null;
}

/** El inventario de UNA empresa. */
export interface InventarioEmpresa {
  key: string;
  name: string;
  /** Artículos del catálogo de esa empresa (con y sin stock). */
  articulos: number;
  /** Artículos con existencia > 0. */
  conStock: number;
  /** Piezas en bodega (sólo existencia > 0). */
  unidades: number;
  /** 🔴 El número que manda: lo que costó la mercancía que hay. */
  costo: number;
  /** Potencial: lo que valdría si se vendiera todo a precio de etiqueta. */
  precio: number;
  /** Artículos con stock y sin costo cargado en Switch. */
  sinCostoArticulos: number;
  /** Piezas que quedan SIN valorizar por esa razón. */
  sinCostoUnidades: number;
  /** Sobreventa registrada en Switch (negativo). Nunca entra al valor. */
  unidadesNegativas: number;
  /** Cuándo se trajo de Switch (ISO), o `null`. */
  medidoEn: string | null;
}

/** Una empresa que no tiene el dato, con el motivo en palabras. */
export interface EmpresaSinInventario {
  key: string;
  name: string;
  motivo: string;
}

export interface InventarioValorizado {
  /** `false` = la tabla todavía no existe (migración sin correr). */
  disponible: boolean;
  totalUnidades: number;
  /** 🔴 El total AL COSTO. Es "la plata que puse". */
  totalCosto: number;
  /** El total a precio de etiqueta. Es POTENCIAL, no plata que se tenga. */
  totalPrecio: number;
  porEmpresa: InventarioEmpresa[];
  /** Boston y Multifashion mientras no sincronicen catálogo. */
  sinInventario: EmpresaSinInventario[];
  /** Lo que quedó sin valorizar, sumando todas las empresas. */
  sinCosto: { articulos: number; unidades: number };
  /** El sello MÁS VIEJO de todas las empresas: la frescura del conjunto. */
  medidoEn: string | null;
  /** `true` si el dato más viejo pasó de `HORAS_INVENTARIO_VIEJO`. */
  viejo: boolean;
  /** Horas del dato más viejo, o `null` si no hay sello. */
  horas: number | null;
}

/** numeric de PostgREST (número o texto) → number. Nulo/ilegible → `null`. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/**
 * Las empresas del grupo que NO están cubiertas por el sync de catálogo.
 * `cubiertas` son las que sí lo están (hoy, `B2B_EMPRESA_KEYS`).
 */
export function empresasSinInventario(cubiertas: readonly string[]): EmpresaSinInventario[] {
  const set = new Set(cubiertas);
  return ALL_EMPRESA_KEYS.filter((k) => !set.has(k)).map((k) => ({
    key: k as string,
    name: EMPRESA_KEY_TO_NAME[k] ?? k,
    motivo: EMPRESAS_SIN_INVENTARIO_MOTIVO,
  }));
}

/** ¿Un artículo tiene costo cargado? `0` cuenta como NO — así llega de Switch. */
export const tieneCosto = (costo: number | null): boolean => costo !== null && costo !== 0;

/**
 * El agregado de UNA empresa a partir de sus filas. Es la MISMA semántica que
 * ejecuta `inventario_valorizado_v1()` en Postgres — el candado
 * `inventario-valorizado.test.ts` lo prueba con un simulador del SQL.
 */
export function agregarEmpresa(key: string, filas: readonly FilaArticuloInfo[]): InventarioEmpresa {
  const acc: InventarioEmpresa = {
    key,
    name: EMPRESA_KEY_TO_NAME[key] ?? key,
    articulos: 0,
    conStock: 0,
    unidades: 0,
    costo: 0,
    precio: 0,
    sinCostoArticulos: 0,
    sinCostoUnidades: 0,
    unidadesNegativas: 0,
    medidoEn: null,
  };
  for (const f of filas) {
    acc.articulos += 1;
    const e = num(f.existencia);
    const c = num(f.costo_api);
    const p = num(f.precio_etiqueta);
    if (e !== null && e > 0) {
      acc.conStock += 1;
      acc.unidades += e;
      if (tieneCosto(c)) acc.costo += e * (c as number);
      else {
        acc.sinCostoArticulos += 1;
        acc.sinCostoUnidades += e;
      }
      if (p !== null) acc.precio += e * p;
    } else if (e !== null && e < 0) {
      acc.unidadesNegativas += e;
    }
    const s = f.synced_at ? String(f.synced_at) : null;
    // El sello de la EMPRESA es el más VIEJO de sus filas: si una parte del
    // catálogo quedó sin refrescar, la frescura del conjunto es la de esa parte.
    if (s && (acc.medidoEn === null || s < acc.medidoEn)) acc.medidoEn = s;
  }
  return redondearEmpresa(acc);
}

/**
 * Los centavos se cierran UNA vez, al final de cada empresa.
 *
 * `existencia × costo` son floats: 197.173 productos acumulan un residuo
 * binario de fracciones de centavo. Redondear acá deja el total del grupo
 * igual a la suma de lo que la pantalla muestra por empresa — sin esto, las
 * filas suman un centavo distinto que el total y la pantalla se contradice.
 */
function redondearEmpresa(e: InventarioEmpresa): InventarioEmpresa {
  return { ...e, costo: Math.round(e.costo * 100) / 100, precio: Math.round(e.precio * 100) / 100 };
}

/** Filas crudas (todas las empresas) → el agregado completo. PURO. */
export function agregarInventario(
  filas: readonly FilaArticuloInfo[],
  cubiertas: readonly string[],
  ahoraMs: number,
): InventarioValorizado {
  const porKey = new Map<string, FilaArticuloInfo[]>();
  for (const f of filas) {
    const arr = porKey.get(f.empresa_key) ?? [];
    arr.push(f);
    porKey.set(f.empresa_key, arr);
  }
  const empresas = [...porKey.entries()].map(([k, fs]) => agregarEmpresa(k, fs));
  return armarInventario(empresas, cubiertas, ahoraMs);
}

/**
 * Los agregados por empresa (vengan de Postgres o del camino paginado) → el
 * objeto que viaja al navegador. Es el ÚNICO lugar donde se arman los totales,
 * así que los dos caminos no pueden dar números distintos.
 */
export function armarInventario(
  empresas: readonly InventarioEmpresa[],
  cubiertas: readonly string[],
  ahoraMs: number,
): InventarioValorizado {
  // 🔴 Sólo las empresas que el sync cubre. Una fila de una empresa que no
  // sincroniza sería un snapshot congelado hace meses presentándose como el
  // inventario de hoy; se muestra en "sin inventario", no en el total.
  const set = new Set(cubiertas);
  const porEmpresa = empresas
    .filter((e) => set.has(e.key))
    .slice()
    .sort((a, b) => b.costo - a.costo);

  const suma = (f: (e: InventarioEmpresa) => number) => porEmpresa.reduce((s, e) => s + f(e), 0);
  const totalCosto = Math.round(suma((e) => e.costo) * 100) / 100;
  const totalPrecio = Math.round(suma((e) => e.precio) * 100) / 100;

  // La frescura del conjunto es la del sello MÁS VIEJO: decir "al 13 ago" con
  // una empresa parada en el 2 sería mentir sobre esa empresa.
  let medidoEn: string | null = null;
  for (const e of porEmpresa) {
    if (e.medidoEn && (medidoEn === null || e.medidoEn < medidoEn)) medidoEn = e.medidoEn;
  }
  const horas = medidoEn ? (ahoraMs - Date.parse(medidoEn)) / 3_600_000 : null;

  return {
    disponible: true,
    totalUnidades: suma((e) => e.unidades),
    totalCosto,
    totalPrecio,
    porEmpresa,
    sinInventario: empresasSinInventario(cubiertas),
    sinCosto: {
      articulos: suma((e) => e.sinCostoArticulos),
      unidades: suma((e) => e.sinCostoUnidades),
    },
    medidoEn,
    // Sin sello NO se declara viejo: "no pude medir la frescura" y "el dato
    // está viejo" son cosas distintas, y la pantalla ya dice cuando falta.
    viejo: horas !== null && horas > HORAS_INVENTARIO_VIEJO,
    horas: horas === null ? null : Math.round(horas * 10) / 10,
  };
}

/** Lo que se devuelve cuando la tabla todavía no existe: nunca un $0. */
export function inventarioNoDisponible(cubiertas: readonly string[]): InventarioValorizado {
  return {
    disponible: false,
    totalUnidades: 0,
    totalCosto: 0,
    totalPrecio: 0,
    porEmpresa: [],
    sinInventario: empresasSinInventario(cubiertas),
    sinCosto: { articulos: 0, unidades: 0 },
    medidoEn: null,
    viejo: false,
    horas: null,
  };
}
