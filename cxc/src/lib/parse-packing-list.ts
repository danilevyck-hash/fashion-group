/* ------------------------------------------------------------------ */
/*  Packing List PDF text parser                                      */
/*  Pure TypeScript — no React, no DOM, no external deps.             */
/* ------------------------------------------------------------------ */

// ── Types ────────────────────────────────────────────────────────────

export interface PLBultoItem {
  estilo: string;
  producto: string;
  qty: number;
}

export interface PLBulto {
  id: string;
  items: PLBultoItem[];
  totalPiezas: number;
}

export interface ParsedPackingList {
  numeroPL: string;
  empresa: string;
  fechaEntrega: string;
  totalBultos: number;
  totalPiezas: number;
  bultos: PLBulto[];
}

export interface PLIndexRow {
  estilo: string;
  producto: string;
  totalPcs: number;
  distribution: Record<string, number>;
  bultoMuestra: string;
}

// ── Constants ────────────────────────────────────────────────────────

export const PRODUCT_ORDER: string[] = [
  "CAMISA M/L",
  "CAMISA M/C",
  "CAMISA",
  "POLO M/C",
  "POLO M/L",
  "POLO",
  "CAMISETA M/C",
  "CAMISETA M/L",
  "CAMISETA DAMA",
  "PANTALON CORTO",
  "PANTALON",
  "SUETER",
  "SUETER POLO",
  "CHAQUETA",
  "GORRA",
  "VESTIDO MUJER",
];

const KNOWN_COMPANIES = [
  "VISTANA INTERNACIONAL PANAMA",
  "VISTANA INTERNACIONAL",
  "VISTANA",
  "FASHION WEAR",
  "FASHION SHOES",
  "ACTIVE SHOES",
  "ACTIVE WEAR",
  "JOYSTEP",
  "CONFECCIONES BOSTON",
  "MULTIFASHION",
];

// ── Product‑name normalisation ───────────────────────────────────────

/**
 * Normalise a product description to a short canonical form.
 *
 * Rules:
 *  - Strip "PARA CABALLERO", "PARA HOMBRE", "PARA DAMA", "PARA MUJER"
 *  - Keep suffixes like M/L, M/C, CORTO, DAMA
 *  - Reorder so suffix comes right after the base noun
 */
export function normalizeProductName(nombre: string): string {
  let n = nombre.toUpperCase().trim();

  // Extract M/L or M/C wherever it appears
  let sleeve: string | null = null;
  const sleeveMatch = n.match(/\bM\/[LC]\b/);
  if (sleeveMatch) {
    sleeve = sleeveMatch[0];
    n = n.replace(/\bM\/[LC]\b/, "").trim();
  }

  // Strip filler phrases
  n = n
    .replace(/\bPARA\s+CABALLERO\b/g, "")
    .replace(/\bPARA\s+HOMBRE\b/g, "")
    .replace(/\bPARA\s+DAMA\b/g, "")
    .replace(/\bPARA\s+MUJER\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Re-attach sleeve suffix
  if (sleeve) {
    n = `${n} ${sleeve}`;
  }

  return n;
}

// ── Style‑row detection ──────────────────────────────────────────────

/** Returns true if the line looks like a style row (starts with alphanumeric code). */
function isStyleRow(line: string): boolean {
  // Style codes start with letter or digit, followed by alphanumeric chars
  // Must have at least 2 "words" (code + something)
  return /^[A-Za-z0-9][A-Za-z0-9]+\s+/.test(line.trim());
}

/** Extract qty (rightmost number) from a style row. */
function extractQty(line: string): number {
  const nums = line.match(/\d+/g);
  if (!nums || nums.length === 0) return 0;
  return parseInt(nums[nums.length - 1], 10);
}

/**
 * Extract estilo (first token) and producto (the Spanish description between
 * colour and size columns).
 */
function parseStyleRow(line: string): { estilo: string; producto: string; qty: number } | null {
  const trimmed = line.trim();
  if (!isStyleRow(trimmed)) return null;

  const tokens = trimmed.split(/\s{2,}/);
  if (tokens.length < 2) return null;

  const estilo = tokens[0].trim();
  const qty = extractQty(trimmed);

  // The product name is typically the third major token (after estilo + color).
  // We search for multi-word Spanish descriptions among the tokens.
  let producto = "";
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i].trim();
    // Product names are multi-word and contain letters (not pure numbers)
    // They typically contain words like CAMISA, POLO, PANTALON, etc.
    if (
      /[A-Za-z]/.test(t) &&
      /\s/.test(t) &&
      /\b(CAMISA|POLO|PANTALON|CAMISETA|SUETER|CHAQUETA|GORRA|VESTIDO|BERMUDA|SHORT|FALDA|BLUSA|CORBATA|CINTURON|CALCETIN|MEDIA|BÓXER|BOXER|TRAJE)\b/i.test(t)
    ) {
      producto = t.trim();
      break;
    }
  }

  // Fallback: if not found with keyword matching, try the longest multi-word
  // token that contains at least one letter
  if (!producto) {
    let bestLen = 0;
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i].trim();
      if (/[A-Za-z]/.test(t) && /\s/.test(t) && t.length > bestLen) {
        // Skip if it looks like the color (usually one or two words before product)
        // Colors don't usually contain keywords; use length heuristic
        if (t.split(/\s+/).length >= 3 || t.length > bestLen) {
          producto = t;
          bestLen = t.length;
        }
      }
    }
  }

  if (!estilo) return null;

  return {
    estilo,
    producto: producto ? normalizeProductName(producto) : "",
    qty,
  };
}

// ── Bulto‑ID extraction ─────────────────────────────────────────────

/**
 * From "OCPA300000001316856" take last 7 digits → parseInt → string.
 * "OCPA300000001316856" → "1316856"
 * "OCPA2000000000547755" → "547755"
 */
function extractBultoId(ocpaFull: string): string {
  // Remove the "OCPA" prefix, take last 7 digits
  const digits = ocpaFull.replace(/^OCPA/i, "");
  const last7 = digits.slice(-7);
  return String(parseInt(last7, 10));
}

// ── Main parser ──────────────────────────────────────────────────────

export function parsePackingListText(text: string): ParsedPackingList {
  // 1. PL number
  const plMatch = text.match(/NO\.\s*(\d+)/);
  const numeroPL = plMatch ? plMatch[1] : "";

  // 2. Empresa
  let empresa = "";
  const upperText = text.toUpperCase();
  for (const co of KNOWN_COMPANIES) {
    if (upperText.includes(co)) {
      empresa = co;
      break;
    }
  }

  // 3. Fecha de entrega
  const fechaMatch = text.match(/Fecha de entrega:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const fechaEntrega = fechaMatch ? fechaMatch[1] : "";

  // 4. Split by "Bulto No. OCPA"
  const bultoSections = text.split(/Bulto No\.\s*OCPA/i);
  // First section is the header, skip it
  const rawBultos = bultoSections.slice(1);

  const bultos: PLBulto[] = [];

  for (const section of rawBultos) {
    // Extract OCPA id (everything up to first whitespace)
    const idMatch = section.match(/^(\S+)/);
    const ocpaId = idMatch ? `OCPA${idMatch[1]}` : "";
    const bultoId = extractBultoId(ocpaId);

    // Total piezas for this bulto
    const piezasMatch = section.match(/Total piezas:\s*(\d+)/i);
    const totalPiezas = piezasMatch ? parseInt(piezasMatch[1], 10) : 0;

    // Parse style rows
    const lines = section.split("\n");
    const itemMap = new Map<string, PLBultoItem>();

    for (const line of lines) {
      const parsed = parseStyleRow(line);
      if (!parsed) continue;

      const key = parsed.estilo;
      const existing = itemMap.get(key);
      if (existing) {
        // Same estilo in same bulto → sum qty, keep first producto
        itemMap.set(key, {
          ...existing,
          qty: existing.qty + parsed.qty,
        });
      } else {
        itemMap.set(key, {
          estilo: parsed.estilo,
          producto: parsed.producto,
          qty: parsed.qty,
        });
      }
    }

    bultos.push({
      id: bultoId,
      items: Array.from(itemMap.values()),
      totalPiezas,
    });
  }

  const totalBultos = bultos.length;
  const totalPiezas = bultos.reduce((sum, b) => sum + b.totalPiezas, 0);

  return {
    numeroPL,
    empresa,
    fechaEntrega,
    totalBultos,
    totalPiezas,
    bultos,
  };
}

// ── Index builder ────────────────────────────────────────────────────

export function buildIndex(parsed: ParsedPackingList): PLIndexRow[] {
  const bultoMuestra = parsed.bultos.length > 0 ? parsed.bultos[0].id : "";

  // Group by (estilo, producto) across ALL bultos
  const groups = new Map<string, { estilo: string; producto: string; totalPcs: number; distribution: Record<string, number> }>();

  for (const bulto of parsed.bultos) {
    for (const item of bulto.items) {
      const key = `${item.estilo}||${item.producto}`;
      const existing = groups.get(key);
      if (existing) {
        existing.totalPcs += item.qty;
        existing.distribution[bulto.id] = (existing.distribution[bulto.id] || 0) + item.qty;
      } else {
        groups.set(key, {
          estilo: item.estilo,
          producto: item.producto,
          totalPcs: item.qty,
          distribution: { [bulto.id]: item.qty },
        });
      }
    }
  }

  const rows: PLIndexRow[] = Array.from(groups.values()).map((g) => ({
    estilo: g.estilo,
    producto: g.producto,
    totalPcs: g.totalPcs,
    distribution: g.distribution,
    bultoMuestra,
  }));

  // Sort by PRODUCT_ORDER priority, then alphabetically by estilo
  rows.sort((a, b) => {
    const idxA = PRODUCT_ORDER.indexOf(a.producto);
    const idxB = PRODUCT_ORDER.indexOf(b.producto);
    const orderA = idxA === -1 ? PRODUCT_ORDER.length : idxA;
    const orderB = idxB === -1 ? PRODUCT_ORDER.length : idxB;
    if (orderA !== orderB) return orderA - orderB;
    return a.estilo.localeCompare(b.estilo);
  });

  return rows;
}
