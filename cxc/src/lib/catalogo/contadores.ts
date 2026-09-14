// ─────────────────────────────────────────────────────────────────────────────
// LOS OCHO NÚMEROS DEL HUB DE MARCAS — una sola regla, contada en la BASE.
//
// 🩸 POR QUÉ EXISTE (14-sep-2026). Para escribir «182 productos a la venta · 12
// sin foto» en cuatro tarjetas, el navegador se bajaba el CATÁLOGO ENTERO de las
// cuatro marcas y contaba a mano. Medido: **458 KB** —Tommy 227 KB (477
// productos), Reebok 103 KB (232), Calvin 40 KB, Joybees 38 KB, más ~50 KB del
// inventario por talla de Reebok— para escribir ocho números. Nombre, precio,
// color, descripción y fechas viajaban para tirarse después de contar. Sentry
// medía **24.384 ms de p95** en esa ruta.
//
// Daniel, textual (14-sep-2026): *«5. ok va»*.
//
// 🔴 LA REGLA DE «A LA VENTA» SIGUE VIVIENDO EN UN SOLO LUGAR.
//
// La decide `estaALaVenta` (`lib/catalogo/a-la-venta.ts`), que a su vez se apoya
// en `disponibleVendible` (`lib/catalogos/disponible.ts`). Contar en la base
// pedía escribir esa misma regla en SQL — y dos definiciones de lo mismo es
// exactamente el modo de falla que esta casa evita (fue lo que separó al hub del
// catálogo en primer lugar: 232 contra 182).
//
// La salida NO fue escribir el SQL a mano en una migración: **el SQL se GENERA
// acá**, cláusula por cláusula, pegado a la cláusula de TypeScript que copia, y
// la migración es la SALIDA IMPRESA de este archivo. El candado
// (`catalogo-contadores-una-regla.test.ts`) exige tres cosas a la vez:
//
//   1. que el `.sql` del repo sea **byte a byte** lo que genera este módulo
//      (una migración editada a mano pone el build ROJO);
//   2. que la cantidad de cláusulas del SQL sea la MISMA que la de
//      `estaALaVenta` — agregar un `return true` allá sin su `or` acá también lo
//      pone rojo;
//   3. que el camino de respaldo del servidor cuente con `productosALaVenta`, la
//      función de verdad, y no con una copia.
//
// Y sobre datos REALES: `scripts/_verif-contadores-hub.ts` corre los dos caminos
// contra producción y compara los ocho números uno por uno.
//
// 🔴 FALLA ABIERTA. Mientras la migración no se aplique, la función no existe y
// el servidor cuenta leyendo las filas con `productosALaVenta` — o sea con la
// regla de siempre. El hub no ve la diferencia y el navegador igual recibe menos
// de 1 KB.
// ─────────────────────────────────────────────────────────────────────────────

import { productosALaVenta, type ProductoALaVenta } from "@/lib/catalogo/a-la-venta";

/** Las cuatro marcas del hub, en el orden en que se dibujan las tarjetas. */
export const MARCAS_DEL_HUB = ["reebok", "joybees", "tommy", "calvin"] as const;
export type MarcaContada = (typeof MARCAS_DEL_HUB)[number];

/** Los dos números de una tarjeta. */
export interface ContadoresMarca {
  /** Productos que se ven al entrar al catálogo (los vendibles). */
  aLaVenta: number;
  /** De esos, cuántos no tienen foto. */
  sinFoto: number;
}

export type ContadoresDelHub = Partial<Record<MarcaContada, ContadoresMarca>>;

/** Fila mínima para contar: lo que hace falta y nada más. */
export interface FilaContada extends ProductoALaVenta {
  id?: string;
  image_url?: string | null;
}

// ── «Sin foto» ───────────────────────────────────────────────────────────────
// La regla vivía SUELTA dentro del hub (`!p.image_url || !String(p.image_url)
// .trim()`). Se saca acá para que el conteo de la base pueda copiarla de un
// lugar que exista: una regla escrita dentro de un `.filter()` no se puede
// espejar sin transcribirla.
export function sinFoto(p: { image_url?: string | null }): boolean {
  return !p.image_url || !String(p.image_url).trim();
}

/**
 * Los dos números a partir de las filas — el camino de respaldo del servidor.
 *
 * 🔴 Cuenta con `productosALaVenta`, que ES la regla del catálogo. No hay acá
 * ninguna condición propia: si la hubiera, el respaldo y el camino rápido
 * podrían decir cosas distintas.
 */
export function contarDeFilas(
  filas: FilaContada[],
  stockPorProducto?: Record<string, number>,
): ContadoresMarca {
  const visibles = productosALaVenta(filas, stockPorProducto);
  return { aLaVenta: visibles.length, sinFoto: visibles.filter(sinFoto).length };
}

// ─────────────────────────────────────────────────────────────────────────────
// EL ESPEJO EN SQL
//
// ⚠️ LAS CUATRO TABLAS NO SON IGUALES, y por eso cada una trae su ficha en vez
// de asumir simetría (medido contra producción el 14-sep-2026,
// `information_schema.columns`):
//
//   products         (Reebok)  disponibilidad · existencia ·          badge
//                              SIN `stock` y SIN `is_regalia`; su existencia por
//                              talla vive aparte, en `inventory`.
//   joybees_products           disponibilidad · existencia · stock · badge · is_regalia
//   tommy_products             disponibilidad · existencia · stock · badge
//   calvin_products            disponibilidad · existencia · stock · badge
//
// El orden de las columnas de stock NO es decorativo: es el mismo orden en que
// `disponibleVendible` las prueba, y el primero que no sea nulo gana. Cambiarlo
// cambia el número.
// ─────────────────────────────────────────────────────────────────────────────

interface FichaSql {
  tabla: string;
  /** Columnas de stock EN EL ORDEN de `disponibleVendible`. */
  columnasDeStock: readonly string[];
  /** Reebok: la existencia por talla se suma desde otra tabla. */
  respaldo?: { tabla: string; llave: string; cantidad: string };
  /** ¿Esta tabla tiene la columna `is_regalia`? */
  tieneRegalia: boolean;
}

const FICHAS: Record<MarcaContada, FichaSql> = {
  reebok: {
    tabla: "public.products",
    columnasDeStock: ["disponibilidad", "existencia"],
    respaldo: { tabla: "public.inventory", llave: "product_id", cantidad: "quantity" },
    tieneRegalia: false,
  },
  joybees: {
    tabla: "public.joybees_products",
    columnasDeStock: ["disponibilidad", "existencia", "stock"],
    tieneRegalia: true,
  },
  tommy: {
    tabla: "public.tommy_products",
    columnasDeStock: ["disponibilidad", "existencia", "stock"],
    tieneRegalia: false,
  },
  calvin: {
    tabla: "public.calvin_products",
    columnasDeStock: ["disponibilidad", "existencia", "stock"],
    tieneRegalia: false,
  },
};

/**
 * Las columnas que hace falta LEER para contar, derivadas de la misma ficha.
 *
 * Es lo que pide el camino de respaldo cuando la función de la base todavía no
 * existe. 🔴 Sale de `FICHAS`, nunca de una lista a mano: si una marca ganara
 * una columna de stock y esta lista no la trajera, `disponibleVendible` la
 * leería como `undefined` y caería al siguiente respaldo **en silencio**.
 */
export function columnasParaContar(marca: MarcaContada): string {
  const f = FICHAS[marca];
  const cols = ["id", "image_url", "badge", ...f.columnasDeStock];
  if (f.tieneRegalia) cols.push("is_regalia");
  return cols.join(",");
}

/**
 * Las cláusulas de «está a la venta», en SQL, EN EL MISMO ORDEN que
 * `estaALaVenta`. Cada una lleva al lado la línea de TypeScript que copia.
 */
export function clausulasALaVenta(marca: MarcaContada): string[] {
  const f = FICHAS[marca];
  const fuentes = f.columnasDeStock.map((c) => `p.${c}`);
  // Reebok: `fallback` de `disponibleVendible` = la suma de `inventory`.
  if (f.respaldo) fuentes.push("inv.piezas");

  const clausulas: string[] = [
    // TS: `if (disponibleVendible(p, fallback) > 0) return true;`
    //     · el primero NO nulo gana  → coalesce en el mismo orden
    //     · `Math.max(0, …)`         → greatest(0, …)
    //     · sin ninguno              → 0  → no pasa
    `greatest(0, coalesce(${fuentes.join(", ")}, 0)) > 0`,
  ];
  // TS: `if (p.is_regalia) return true;`  (truthy: null y false NO pasan)
  if (f.tieneRegalia) clausulas.push("p.is_regalia is true");
  // TS: `if (p.badge === "proximamente") return true;`
  clausulas.push("p.badge = 'proximamente'");
  return clausulas;
}

/** TS: `!p.image_url || !String(p.image_url).trim()` — nulo, vacío o solo espacios. */
export const CLAUSULA_SIN_FOTO = "coalesce(btrim(p.image_url), '') = ''";

/** El bloque `SELECT` de UNA marca. */
export function selectDeMarca(marca: MarcaContada): string {
  const f = FICHAS[marca];
  const join = f.respaldo
    ? `\n  left join (select i.${f.respaldo.llave} as llave, sum(i.${f.respaldo.cantidad}) as piezas` +
      `\n               from ${f.respaldo.tabla} i group by i.${f.respaldo.llave}) inv` +
      `\n         on inv.llave = p.id`
    : "";
  const donde = clausulasALaVenta(marca)
    .map((c, i) => `${i === 0 ? "       " : "    or "}${c}`)
    .join("\n");
  return (
    `  select '${marca}'::text as marca,\n` +
    `         count(*)::int as a_la_venta,\n` +
    `         count(*) filter (where ${CLAUSULA_SIN_FOTO})::int as sin_foto\n` +
    `    from ${f.tabla} p${join}\n` +
    `   where p.active is true\n` +
    `     and (\n${donde}\n     )`
  );
}

/** El cuerpo de la función de la base: las cuatro marcas, una detrás de otra. */
export function sqlContadores(): string {
  return MARCAS_DEL_HUB.map(selectDeMarca).join("\n  union all\n");
}
