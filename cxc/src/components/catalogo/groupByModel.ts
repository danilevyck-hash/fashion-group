// Agrupación por modelo (marcas con variantes de género por sufijo de SKU —
// hoy Joybees; se activa con MARCA_THEME.features.agrupacionPorModelo).

/** Producto de una marca con agrupación por modelo (esquema joybees_products). */
export interface JoybeesProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  gender: string;
  price: number;
  stock: number;
  /** Saldo físico en Switch (lo escribe el cron de catálogo). Puede faltar
   *  pre-sync → la línea de stock de la card muestra "—". */
  existencia?: number | null;
  /** Vendible (saldo − apartado). Mismo caso que `existencia`. */
  disponibilidad?: number | null;
  image_url: string | null;
  active: boolean;
  popular: boolean;
  is_regalia: boolean;
  created_at: string;
}

/** Gender suffix → Spanish label */
const SUFFIX_LABELS: Record<string, string> = {
  M: "Hombre",
  W: "Mujer",
  KIDS: "Kids",
  JUNIOR: "Junior",
};

/** DB gender field → Spanish label (fallback). Incluye los slugs de Tommy
 *  (men/boys/girls) — su ficha usa el estilo "variantes" con grupos de una
 *  sola variante y muestra este label. */
const GENDER_FIELD_LABELS: Record<string, string> = {
  adults_m: "Hombre",
  women: "Mujer",
  kids: "Kids",
  junior: "Junior",
  men: "Hombre",
  boys: "Niño",
  girls: "Niña",
};

/** Known gender suffixes (longest first so JUNIOR matches before J, etc.) */
const KNOWN_SUFFIXES = ["JUNIOR", "KIDS", "W", "M"];

/**
 * Orden de los botones de talla DENTRO de la card: talla chica primero, y Mujer
 * antes que Hombre (el mismo orden que las secciones del grid, `SECTION_ORDER`).
 *
 * Sin esto el orden es el que trae el catálogo y CAMBIA de tarjeta en tarjeta:
 * medido en producción, `UKVCG.MTC` mostraba KIDS · JUNIOR y `UKVCG.OLM` al lado
 * mostraba JUNIOR · KIDS. Un vendedor que recorre la grilla dando precios no
 * puede tener que leer la etiqueta de cada botón para saber cuál es cuál.
 */
const ORDEN_SUFIJO: Record<string, number> = { KIDS: 0, JUNIOR: 1, W: 2, M: 3 };
const ordenDe = (suffix: string) => ORDEN_SUFIJO[suffix.toUpperCase()] ?? 9;

export interface ProductVariant {
  product: JoybeesProduct;
  genderLabel: string;
  suffix: string;
}

export interface GroupedProduct {
  /** Base SKU (e.g. "UAACG.BLK") */
  baseSku: string;
  /** Shared display name */
  name: string;
  /**
   * Precio de REFERENCIA del grupo = el MENOR de sus variantes.
   *
   * ⚠️ Sirve para ORDENAR la grilla ("precio: menor a mayor") y para el
   * centinela de regalía. **La card NO lo muestra**: muestra el precio de la
   * talla elegida (`variants[i].product.price`), porque un grupo puede tener
   * dos precios (`UKTRK.BLK` = KIDS $13 / JUNIOR $15). Mostrar este número
   * como "el precio del modelo" volvería a esconder uno de los dos.
   */
  price: number;
  /** Shared image */
  image_url: string | null;
  /** Shared flags from first variant */
  category: string;
  popular: boolean;
  is_regalia: boolean;
  /** All gender variants */
  variants: ProductVariant[];
}

function parseSuffix(sku: string): { base: string; suffix: string } | null {
  const upperSku = sku.toUpperCase();
  for (const sfx of KNOWN_SUFFIXES) {
    if (upperSku.endsWith(`-${sfx}`)) {
      const base = sku.slice(0, sku.length - sfx.length - 1);
      return { base, suffix: sfx };
    }
  }
  return null;
}

export function getGenderLabel(suffix: string, genderField: string): string {
  return SUFFIX_LABELS[suffix.toUpperCase()] || GENDER_FIELD_LABELS[genderField] || genderField;
}

/**
 * Agrupa productos por base de SKU + NOMBRE. Cada variante de talla/género del
 * modelo queda como una entrada de `variants` con SU precio y SU stock.
 * Un producto sin sufijo reconocido queda como grupo de una sola variante.
 *
 * 🩸 NINGUNA VARIANTE PUEDE QUEDAR ESCONDIDA — ese es el invariante (27-jul-2026).
 * El bug original: cuando dos artículos compartían el base pero no el
 * `name+price`, el segundo hacía `map.set(key, …)` sobre la MISMA llave,
 * destruía al primero y volvía a hacer `order.push(key)`, así que
 * `order.map(k => map.get(k))` devolvía DOS VECES el mismo grupo. En pantalla:
 * dos tarjetas IDÉNTICAS con el stock del sobreviviente y las unidades del otro
 * INVISIBLES. Medido en producción (25-jul-2026): `UKTRK.BLK-KIDS` $13/95 uds y
 * `UKTRK.BLK-JUNIOR` $15/120 uds salían como dos cards "UKTRK.BLK · $13 · 95";
 * igual `UKTRK.DRO`.
 *
 * **El PRECIO ya no separa grupos (30-jul-2026).** El primer arreglo (#348) los
 * partió en dos tarjetas porque "una card tiene UN precio". Con el SELECTOR DE
 * TALLA de la card agrupada eso dejó de ser cierto: cada botón de talla lleva su
 * propio precio y su propio stock, y el precio de arriba sigue a la talla
 * elegida. Así `UKTRK.BLK` vuelve a ser UN modelo (como es en la vitrina) sin
 * volver a esconder nada. Aprobado por Daniel sobre el mockup de la opción A.
 *
 * **Lo que SÍ sigue separando: un sufijo REPETIDO.** Dos filas `-KIDS` del mismo
 * base no pueden compartir card porque el selector mostraría dos botones con la
 * misma etiqueta y uno de los dos stocks quedaría inalcanzable — exactamente el
 * daño de #348 por otra puerta. Hoy no ocurre en producción (medido: 11 bases
 * con 2 variantes, ningún sufijo repetido), y el guard existe para que el día
 * que Switch mande un duplicado se vea en vez de desaparecer.
 */
export function groupByModel(products: JoybeesProduct[]): GroupedProduct[] {
  const map = new Map<string, GroupedProduct>();
  const order: string[] = [];
  /** Grupos ya abiertos por base — puede haber más de uno (nombre o sufijo repetido). */
  const porBase = new Map<string, GroupedProduct[]>();

  for (const p of products) {
    const parsed = parseSuffix(p.sku);

    if (parsed) {
      const key = parsed.base.toUpperCase();
      const abiertos = porBase.get(key) ?? [];
      const existing = abiertos.find(
        g => g.name === p.name && !g.variants.some(v => v.suffix === parsed.suffix)
      );

      if (existing) {
        // Add variant to existing group
        existing.variants.push({
          product: p,
          genderLabel: getGenderLabel(parsed.suffix, p.gender),
          suffix: parsed.suffix,
        });
        // El precio del grupo es el MENOR de sus variantes (solo ordena la
        // grilla — la card muestra el de la talla elegida).
        if (p.price < existing.price) existing.price = p.price;
        // If group had no image but this variant does, use it
        if (!existing.image_url && p.image_url) {
          existing.image_url = p.image_url;
        }
        continue;
      }

      // Start a new group
      const group: GroupedProduct = {
        baseSku: parsed.base,
        name: p.name,
        price: p.price,
        image_url: p.image_url,
        category: p.category,
        popular: p.popular,
        is_regalia: p.is_regalia,
        variants: [{
          product: p,
          genderLabel: getGenderLabel(parsed.suffix, p.gender),
          suffix: parsed.suffix,
        }],
      };
      abiertos.push(group);
      porBase.set(key, abiertos);
      // Llave ÚNICA: si ya había un grupo con este base (otro nombre, o un
      // sufijo repetido), el nuevo NO lo puede pisar ni repetirse en `order`.
      const llave = abiertos.length === 1 ? key : `${key}#${abiertos.length}`;
      map.set(llave, group);
      order.push(llave);
    } else {
      // No suffix — standalone card, use product id as unique key
      const soloKey = `__solo__${p.id}`;
      const label = GENDER_FIELD_LABELS[p.gender] || p.gender;
      map.set(soloKey, {
        baseSku: p.sku,
        name: p.name,
        price: p.price,
        image_url: p.image_url,
        category: p.category,
        popular: p.popular,
        is_regalia: p.is_regalia,
        variants: [{
          product: p,
          genderLabel: label,
          suffix: "",
        }],
      });
      order.push(soloKey);
    }
  }

  // El SKU que se muestra (píldora de la card, PDF del vendedor) y que sirve de
  // React key: si el grupo terminó con UNA sola variante, el base a secas MIENTE
  // — esconde justo el sufijo que distingue JUNIOR de KIDS, y con dos grupos del
  // mismo base daría además dos React keys iguales. Con 2+ variantes el base es
  // correcto: la card muestra un botón por variante y ahí sí es el modelo.
  for (const g of map.values()) {
    if (g.variants.length === 1 && g.variants[0].suffix) {
      g.baseSku = g.variants[0].product.sku;
    }
    // Orden estable de los botones de talla, igual en todas las tarjetas.
    if (g.variants.length > 1) {
      g.variants.sort((a, b) => ordenDe(a.suffix) - ordenDe(b.suffix));
    }
  }

  return order.map(k => map.get(k)!);
}

/**
 * ¿Las tallas de este modelo tienen PRECIOS DISTINTOS?
 *
 * Cuando es `true` la card escribe el precio dentro de cada botón de talla
 * (`KIDS · $13` / `JUNIOR · $15`): sin eso, el número grande de arriba cambiaría
 * al tocar una talla sin decir por qué. Los precios los manda Switch — acá solo
 * se leen. Caso real: `UKTRK.BLK` y `UKTRK.DRO`.
 */
export function tienePreciosDistintos(group: GroupedProduct): boolean {
  return new Set(group.variants.map(v => v.product.price)).size > 1;
}

export type DisplaySection = "mujer" | "hombre" | "adultos" | "kids" | "accesorios" | "otros";

const SECTION_ORDER: Record<DisplaySection, number> = {
  mujer: 0,
  hombre: 1,
  adultos: 2,
  kids: 3,
  accesorios: 4,
  // 🔴 El cajón neutro va SIEMPRE al final. No tiene chip propio en
  // `genderOptions`, así que se ve en «Todos» y bajo ningún filtro.
  otros: 5,
};

const SECTION_LABELS: Record<DisplaySection, string> = {
  mujer: "Mujer",
  hombre: "Hombre",
  adultos: "Adultos",
  kids: "Kids",
  accesorios: "Accesorios",
  otros: "Sin clasificar",
};

/**
 * La sección en la que se dibuja un modelo agrupado (Joybees), según el género
 * de sus variantes.
 *
 * 🩸 **EL FALLBACK ERA "adultos", Y ERA UN CAJÓN POR DEFECTO CON VALOR DE
 * NEGOCIO** (2-sep-2026). Un modelo cuyo género no se reconoce —el sentinel
 * `sin_clasificar` de un producto nuevo, o un valor que Switch estrene— caía en
 * "Adultos" sin que nadie lo hubiera dicho: exactamente el mismo defecto que el
 * `male` por DEFAULT del sync de Reebok, en la pantalla en vez de en la base.
 * Ahora cae en "Sin clasificar", que no tiene chip: se ve en «Todos» y bajo
 * ningún filtro. La regla es la misma de siempre — **un cajón por defecto nunca
 * puede ser el primero de la lista.**
 *
 * ⚠️ Lo que NO cambió: las combinaciones que el mapa SÍ reconoce siguen dando
 * exactamente la misma sección que antes, incluido el par `adults_m` + `women`
 * (que es cómo Joybees representa un modelo unisex) y el "si hay kids, es kids".
 */
export function getDisplaySection(group: GroupedProduct): DisplaySection {
  const genders = new Set(group.variants.map(v => v.product.gender));

  // If both adults_m and women exist → adultos (unisex grouped pair)
  if (genders.has("adults_m") && genders.has("women")) return "adultos";

  // Single-gender groups
  if (genders.size === 1) {
    const g = [...genders][0];
    if (g === "women") return "mujer";
    if (g === "adults_m") return "hombre";
    if (g === "adults") return "adultos";
    if (g === "kids") return "kids";
    if (g === "accessories") return "accesorios";
  }

  // Mezcla que incluye kids → kids (una talla de niño manda: es la sección
  // donde el comprador la busca). Cualquier otra cosa NO se adivina.
  if (genders.has("kids")) return "kids";
  // Una mezcla de géneros REALES conocidos sigue siendo "adultos", que es lo que
  // significa: dos géneros de adulto en el mismo modelo.
  const reales = [...genders].filter(g => g === "women" || g === "adults_m" || g === "adults" || g === "unisex");
  if (reales.length > 1) return "adultos";
  return "otros";
}

export { SECTION_ORDER, SECTION_LABELS };
