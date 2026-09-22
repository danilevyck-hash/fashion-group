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
import { tarjetasDeModelo, type FilaAgrupable } from "@/lib/catalogo/tarjetas";
import { KNOWN_SUFFIXES } from "@/components/catalogo/groupByModel";

/** Las cuatro marcas del hub, en el orden en que se dibujan las tarjetas. */
export const MARCAS_DEL_HUB = ["reebok", "joybees", "tommy", "calvin"] as const;
export type MarcaContada = (typeof MARCAS_DEL_HUB)[number];

/**
 * Los números de una tarjeta del hub.
 *
 * 🔴 SON DOS PREGUNTAS DISTINTAS, Y POR ESO SON CUATRO NÚMEROS (22-sep-2026):
 *
 *   `aLaVenta` / `sinFoto`     — FILAS vendibles. Es la regla de `estaALaVenta`,
 *                                 intacta, con su SQL generado cláusula por
 *                                 cláusula y su candado byte a byte.
 *   `tarjetas` / `tarjetasSinFoto` — lo que el cliente VE al entrar: una tarjeta
 *                                 por modelo. En las tres marcas que no agrupan
 *                                 es el MISMO número; en Joybees son 70 contra
 *                                 81, porque 11 modelos traen dos tallas.
 *
 * 🔑 «A la venta» NO se redefinió: la tarjeta es un dato APARTE, encima de las
 * mismas filas. Cambiar el significado de `aLaVenta` habría partido en dos la
 * regla que este módulo existe para mantener única.
 */
export interface ContadoresMarca {
  /** Filas vendibles (las que pasan `estaALaVenta`). */
  aLaVenta: number;
  /** De esas filas, cuántas no tienen foto. */
  sinFoto: number;
  /** Tarjetas que ve el cliente al entrar al catálogo. Es el número del hub. */
  tarjetas: number;
  /** Tarjetas donde NINGUNA de sus tallas tiene foto. */
  tarjetasSinFoto: number;
}

export type ContadoresDelHub = Partial<Record<MarcaContada, ContadoresMarca>>;

/** Fila mínima para contar: lo que hace falta y nada más. */
export interface FilaContada extends ProductoALaVenta, FilaAgrupable {
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
 * Los cuatro números a partir de las filas — el camino de respaldo del servidor.
 *
 * 🔴 Cuenta con `productosALaVenta`, que ES la regla del catálogo, y agrupa con
 * `groupByModel`, que ES la regla de la vitrina. No hay acá ninguna condición
 * propia: si la hubiera, el respaldo y el camino rápido podrían decir cosas
 * distintas.
 *
 * 🔴 UNA TARJETA ESTÁ «SIN FOTO» CUANDO NINGUNA DE SUS TALLAS TIENE FOTO — es
 * lo que se ve en la vitrina, donde la tarjeta muestra la foto de cualquiera de
 * sus variantes. La misma frase está escrita en el SQL (`bool_and`).
 */
export function contarDeFilas(
  marca: MarcaContada,
  filas: FilaContada[],
  stockPorProducto?: Record<string, number>,
): ContadoresMarca {
  const visibles = productosALaVenta(filas, stockPorProducto);
  // Las marcas que no agrupan: cada fila es su propia tarjeta. No se llama a
  // `groupByModel` porque sus SKU no llevan sufijo de talla y agruparlos sería
  // inventarle a la marca una vitrina que no tiene.
  const tarjetas = FICHAS[marca].agrupaPorModelo
    ? tarjetasDeModelo(visibles)
    : visibles.map((p) => [p]);
  return {
    aLaVenta: visibles.length,
    sinFoto: visibles.filter(sinFoto).length,
    tarjetas: tarjetas.length,
    tarjetasSinFoto: tarjetas.filter((t) => t.every(sinFoto)).length,
  };
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
  /**
   * ¿El catálogo de esta marca junta las tallas de un modelo en UNA tarjeta?
   *
   * 🔴 ESPEJO de `MARCA_THEME[marca].features.agrupacionPorModelo`. No se
   * importa de `marcas-ui.tsx` para no arrastrar 1.800 líneas de tema (y sus
   * logos) a una ruta de API que solo cuenta; el candado
   * `catalogo-contadores-una-regla` compara las dos listas y pone el build ROJO
   * si se separan.
   */
  agrupaPorModelo: boolean;
  /** La tabla de comprobantes de la marca — de ahí sale el pulso de la tarjeta. */
  tablaPedidos: string;
}

const FICHAS: Record<MarcaContada, FichaSql> = {
  reebok: {
    tabla: "public.products",
    columnasDeStock: ["disponibilidad", "existencia"],
    respaldo: { tabla: "public.inventory", llave: "product_id", cantidad: "quantity" },
    tieneRegalia: false,
    agrupaPorModelo: false,
    tablaPedidos: "reebok_orders",
  },
  joybees: {
    tabla: "public.joybees_products",
    columnasDeStock: ["disponibilidad", "existencia", "stock"],
    tieneRegalia: true,
    agrupaPorModelo: true,
    tablaPedidos: "joybees_orders",
  },
  tommy: {
    tabla: "public.tommy_products",
    columnasDeStock: ["disponibilidad", "existencia", "stock"],
    tieneRegalia: false,
    agrupaPorModelo: false,
    tablaPedidos: "tommy_orders",
  },
  calvin: {
    tabla: "public.calvin_products",
    columnasDeStock: ["disponibilidad", "existencia", "stock"],
    tieneRegalia: false,
    agrupaPorModelo: false,
    tablaPedidos: "calvin_orders",
  },
};

/** La tabla de comprobantes de una marca (el pulso de su tarjeta). */
export function tablaDePedidos(marca: MarcaContada): string {
  return FICHAS[marca].tablaPedidos;
}

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
  // Agrupar por modelo se decide con el SUFIJO del SKU y el NOMBRE: sin esas
  // dos columnas el respaldo contaría filas y el hub volvería a decir 81.
  if (f.agrupaPorModelo) cols.push("sku", "name");
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

/**
 * El SUFIJO de talla del SKU, en SQL — el espejo de `parseSuffix`.
 *
 * 🔴 LA LISTA SE IMPORTA DE `groupByModel`, no se vuelve a escribir: es la
 * MISMA constante que usa la vitrina, en el MISMO orden (el más largo primero,
 * para que `-JUNIOR` gane antes que cualquier sufijo que sea su final).
 *
 * TS: `upperSku.endsWith("-" + sfx)` → `right(upper(...), n) = '-SFX'`. Se usa
 * `right(...)` y no `like '%-SFX'` a propósito: un `%` o un `_` dentro del
 * sufijo sería un comodín y `like` compararía otra cosa.
 *
 * ⚠️ El «sin sufijo» de TS (`null`) acá es la cadena vacía: un `null` dentro de
 * la llave del grupo se comería la fila entera al concatenar.
 */
export function clausulaSufijo(col: string, sangria = ""): string {
  const casos = KNOWN_SUFFIXES.map(
    (sfx) => `when right(upper(${col}), ${sfx.length + 1}) = '-${sfx}' then '${sfx}'`,
  );
  return `case ${[...casos, "else '' end"].join(`\n${sangria}     `)}`;
}

/** Las tres piezas del `SELECT` de una marca que NO agrupa: fila = tarjeta. */
function cuerpoPlano(): string {
  return (
    `         count(*)::int as a_la_venta,\n` +
    `         count(*) filter (where ${CLAUSULA_SIN_FOTO})::int as sin_foto,\n` +
    // Sin agrupación, la tarjeta ES la fila. Se repiten los mismos dos conteos
    // en vez de mandar NULL: la pantalla lee siempre las mismas columnas y
    // nadie tiene que acordarse de cuál marca trae cuál.
    `         count(*)::int as tarjetas,\n` +
    `         count(*) filter (where ${CLAUSULA_SIN_FOTO})::int as tarjetas_sin_foto\n`
  );
}

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

  const vendibles =
    `    from ${f.tabla} p${join}\n` +
    `   where p.active is true\n` +
    `     and (\n${donde}\n     )`;

  if (!f.agrupaPorModelo) {
    return `  select '${marca}'::text as marca,\n` + cuerpoPlano() + vendibles;
  }

  // ── La marca que AGRUPA (hoy solo Joybees) ────────────────────────────────
  //
  // 🔴 CUÁNTAS TARJETAS SALEN DE UN GRUPO = EL SUFIJO QUE MÁS SE REPITE.
  // `groupByModel` mete una fila en el primer grupo abierto del mismo
  // (base, nombre) que NO tenga ya ese sufijo, y abre uno nuevo si todos lo
  // tienen. O sea: un grupo aguanta como mucho UNA fila por sufijo, así que
  // hacen falta tantas tarjetas como veces se repita el sufijo más repetido.
  // Con dos `-KIDS` del mismo modelo salen dos tarjetas — que es justo el
  // guard de `groupByModel`: un stock nunca queda escondido detrás de otro.
  // Medido hoy en producción: ningún sufijo se repite, así que cada grupo es
  // UNA tarjeta y 81 filas dan 70 tarjetas.
  //
  // 🔴 «SIN FOTO» A NIVEL TARJETA = NINGUNA DE SUS TALLAS TIENE FOTO
  // (`bool_and`), la misma frase que `contarDeFilas`.
  return (
    `  select '${marca}'::text as marca,\n` +
    `         coalesce(sum(b.filas), 0)::int as a_la_venta,\n` +
    `         coalesce(sum(b.filas_sin_foto), 0)::int as sin_foto,\n` +
    `         coalesce(sum(b.tarjetas), 0)::int as tarjetas,\n` +
    `         coalesce(sum(case when b.todas_sin_foto then b.tarjetas else 0 end), 0)::int as tarjetas_sin_foto\n` +
    `    from (\n` +
    `           select s.llave,\n` +
    `                  sum(s.filas)::int as filas,\n` +
    `                  sum(s.filas_sin_foto)::int as filas_sin_foto,\n` +
    `                  max(s.filas)::int as tarjetas,\n` +
    `                  bool_and(s.todas_sin_foto) as todas_sin_foto\n` +
    `             from (\n` +
    `                   select v.llave,\n` +
    `                          v.sufijo,\n` +
    `                          count(*)::int as filas,\n` +
    `                          count(*) filter (where v.sin_foto)::int as filas_sin_foto,\n` +
    `                          bool_and(v.sin_foto) as todas_sin_foto\n` +
    `                     from (\n` +
    `                           select case when q.sufijo = '' then 'solo:' || q.id::text\n` +
    `                                       else 'base:' || upper(left(q.sku, length(q.sku) - length(q.sufijo) - 1))\n` +
    `                                            || '|' || coalesce(q.name, '') end as llave,\n` +
    `                                  q.sufijo,\n` +
    `                                  q.sin_foto\n` +
    `                             from (\n` +
    `                                   select p.id, p.sku, p.name,\n` +
    `                                          ${CLAUSULA_SIN_FOTO} as sin_foto,\n` +
    `                                          ${clausulaSufijo("p.sku", " ".repeat(42))} as sufijo\n` +
    `                               ${vendibles.replace(/\n/g, "\n                               ")}\n` +
    `                                  ) q\n` +
    `                          ) v\n` +
    `                    group by v.llave, v.sufijo\n` +
    `                  ) s\n` +
    `            group by s.llave\n` +
    `         ) b`
  );
}

/** El cuerpo de la función de la base: las cuatro marcas, una detrás de otra. */
export function sqlContadores(): string {
  return MARCAS_DEL_HUB.map(selectDeMarca).join("\n  union all\n");
}
