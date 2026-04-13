import { JoybeesProduct } from "./JoybeesProductCard";

/** Gender suffix → Spanish label */
const SUFFIX_LABELS: Record<string, string> = {
  M: "Hombre",
  W: "Mujer",
  KIDS: "Kids",
  JUNIOR: "Junior",
};

/** DB gender field → Spanish label (fallback) */
const GENDER_FIELD_LABELS: Record<string, string> = {
  adults_m: "Hombre",
  women: "Mujer",
  kids: "Kids",
  junior: "Junior",
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
 */
export function groupByModel(products: JoybeesProduct[]): GroupedProduct[] {
  const map = new Map<string, GroupedProduct>();
  const order: string[] = [];

  for (const p of products) {
    const parsed = parseSuffix(p.sku);

    if (parsed) {
      const key = parsed.base.toUpperCase();
      const existing = map.get(key);

      if (existing && existing.name === p.name && existing.price === p.price) {
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
      map.set(key, group);
      order.push(key);
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
