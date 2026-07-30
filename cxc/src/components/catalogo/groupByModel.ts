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
  /** Shared price */
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
 * Groups products by base SKU when they share name & price.
 * Products without a recognized gender suffix stay as single-variant groups.
 *
 * 🩸 DOS SKU CON EL MISMO BASE PERO DISTINTO PRECIO SON DOS PRODUCTOS (27-jul-2026).
 * Antes, cuando dos artículos compartían el base pero NO el name+price, el
 * segundo hacía `map.set(key, …)` sobre la MISMA llave: destruía al primero y
 * además volvía a hacer `order.push(key)`, así que `order.map(k => map.get(k))`
 * devolvía DOS VECES el mismo grupo. En pantalla: dos tarjetas IDÉNTICAS, las
 * dos con el SKU base (sin sufijo) y las dos con la existencia del sobreviviente
 * — la del otro artículo DESAPARECÍA. Medido en producción (25-jul-2026):
 * `UKTRK.BLK-KIDS` $13/95 uds y `UKTRK.BLK-JUNIOR` $15/120 uds mostraban dos
 * cards "UKTRK.BLK · $13 · 95", o sea 120 unidades invisibles; igual
 * `UKTRK.DRO-KIDS` $13/99 vs `UKTRK.DRO-JUNIOR` $15/100. El precio lo manda
 * Switch y una card tiene UN precio, así que agruparlos es imposible: cada uno
 * necesita su propia tarjeta con SU stock.
 *
 * La AGRUPACIÓN NO CAMBIA para los pares que sí comparten name+price (W/M y
 * KIDS/JUNIOR del mismo precio siguen en una sola card con sus dos botones).
 * Lo único que cambia es el caso que hoy está roto.
 */
export function groupByModel(products: JoybeesProduct[]): GroupedProduct[] {
  const map = new Map<string, GroupedProduct>();
  const order: string[] = [];
  /** Grupos ya abiertos por base — puede haber más de uno si el precio difiere. */
  const porBase = new Map<string, GroupedProduct[]>();

  for (const p of products) {
    const parsed = parseSuffix(p.sku);

    if (parsed) {
      const key = parsed.base.toUpperCase();
      const abiertos = porBase.get(key) ?? [];
      const existing = abiertos.find(g => g.name === p.name && g.price === p.price);

      if (existing) {
        // Add variant to existing group
        existing.variants.push({
          product: p,
          genderLabel: getGenderLabel(parsed.suffix, p.gender),
          suffix: parsed.suffix,
        });
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
      // Llave ÚNICA: si ya había un grupo con este base (precio distinto), el
      // nuevo NO lo puede pisar ni repetirse en `order`.
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
  }

  return order.map(k => map.get(k)!);
}

export type DisplaySection = "mujer" | "hombre" | "adultos" | "kids" | "accesorios";

const SECTION_ORDER: Record<DisplaySection, number> = {
  mujer: 0,
  hombre: 1,
  adultos: 2,
  kids: 3,
  accesorios: 4,
};

const SECTION_LABELS: Record<DisplaySection, string> = {
  mujer: "Mujer",
  hombre: "Hombre",
  adultos: "Adultos",
  kids: "Kids",
  accesorios: "Accesorios",
};

/**
 * Determines the display section for a grouped product based on the
 * gender field of its variants.
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

  // Fallback: if mixed kids/junior → kids, otherwise adultos
  if (genders.has("kids")) return "kids";
  return "adultos";
}

export { SECTION_ORDER, SECTION_LABELS };
