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
  "CAMISA M/L", "CAMISA M/C", "CAMISA",
  "POLO M/C", "POLO M/L", "POLO",
  "CAMISETA M/C", "CAMISETA M/L", "CAMISETA DAMA",
  "PANTALON CORTO", "PANTALON",
  "SUETER", "SUETER POLO",
  "CHAQUETA",
  "GORRA", "VESTIDO MUJER",
];

const KNOWN_COMPANIES = [
  "VISTANA INTERNACIONAL PANAMA",
  "VISTANA INTERNACIONAL",
  "FASHION WEAR",
  "FASHION SHOES",
  "ACTIVE SHOES",
  "ACTIVE WEAR",
  "JOYSTEP",
  "CONFECCIONES BOSTON",
  "MULTIFASHION",
];

// ── Product‑name normalisation ───────────────────────────────────────

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

  if (sleeve) n = `${n} ${sleeve}`;
  return n;
}

// ── Bulto‑ID extraction ─────────────────────────────────────────────

function extractBultoId(ocpaFull: string): string {
  const digits = ocpaFull.replace(/^OCPA/i, "");
  const last7 = digits.slice(-7);
  return String(parseInt(last7, 10));
}

// ── Line classification helpers ─────────────────────────────────────

/** Style code pattern: mixed letters+digits, 6+ chars, like 40EM125430, MW0MW416570A4, 78JA5737UY */
const STYLE_CODE_RE = /^[A-Za-z0-9]{6,}/;

/** Known product keywords */
const PRODUCT_KEYWORDS = /\b(CAMISA|POLO|PANTALON|CAMISETA|SUETER|CHAQUETA|GORRA|VESTIDO|BERMUDA|SHORT|FALDA|BLUSA|CORBATA|CINTURON)\b/i;

/** Lines to skip */
const SKIP_RE = /^(Bulto|Estilo|Total|Peso|Volumen|Dim|Pag|Departamento|Vendedor|Pais|País|Email|Tel|PACKING|NO\.|American|0{4,}|---)/i;

/** Line is only numbers (size/qty data) */
function isNumberLine(line: string): boolean {
  return /^\d[\d\s]*$/.test(line.trim());
}

/** Extract the last number from a number-only line */
function lastNumber(line: string): number {
  const nums = line.trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
  return nums.length > 0 ? nums[nums.length - 1] : 0;
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
    if (upperText.includes(co)) { empresa = co; break; }
  }

  // 3. Fecha de entrega
  const fechaMatch = text.match(/Fecha de entrega:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const fechaEntrega = fechaMatch ? fechaMatch[1] : "";

  // 4. Split by "Bulto No. OCPA"
  const bultoSections = text.split(/Bulto No\.\s*OCPA/i);
  const rawBultos = bultoSections.slice(1);

  const bultos: PLBulto[] = [];

  for (const section of rawBultos) {
    // Extract OCPA id
    const idMatch = section.match(/^(\S+)/);
    const ocpaId = idMatch ? `OCPA${idMatch[1]}` : "";
    const bultoId = extractBultoId(ocpaId);

    // Total piezas
    const piezasMatch = section.match(/Total piezas:\s*(\d+)/i);
    const totalPiezas = piezasMatch ? parseInt(piezasMatch[1], 10) : 0;

    // Parse lines: style lines have code+color+product, followed by number lines with sizes+qty
    const lines = section.split("\n").map(l => l.trim()).filter(Boolean);
    const itemMap = new Map<string, PLBultoItem>();

    let currentEstilo = "";
    let currentProducto = "";

    for (const line of lines) {
      // Skip headers, footers, page info
      if (SKIP_RE.test(line)) continue;
      if (/^Página:/i.test(line)) continue;
      if (/^L$/.test(line.trim())) continue; // stray "L" from XL/XXL header wrap

      // Check if this is a style line (has a style code + product keyword)
      const firstToken = line.split(/\s{2,}/)[0]?.trim() || "";

      if (STYLE_CODE_RE.test(firstToken) && /[A-Za-z]/.test(firstToken) && /\d/.test(firstToken)) {
        // This looks like a style line
        // Extract product name from the line
        const parts = line.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
        // parts = [estilo, color, producto, ...maybe numbers]

        let producto = "";
        for (const p of parts.slice(1)) {
          if (PRODUCT_KEYWORDS.test(p)) { producto = p; break; }
        }

        if (producto) {
          currentEstilo = firstToken;
          currentProducto = normalizeProductName(producto);

          // Check if the same line also has numbers at the end (sometimes qty is on same line)
          // e.g. "40EM125430  BLUE DESCENT  CAMISA PARA CABALLERO M/L  6  12  5  23"
          // But from our extraction, numbers are usually on the NEXT line
          // Still check: if the last parts are numbers, use the last as qty
          const trailingNums = parts.filter(p => /^\d+$/.test(p));
          if (trailingNums.length > 0) {
            const qty = parseInt(trailingNums[trailingNums.length - 1], 10);
            if (qty > 0) {
              const existing = itemMap.get(currentEstilo);
              if (existing) {
                itemMap.set(currentEstilo, { ...existing, qty: existing.qty + qty });
              } else {
                itemMap.set(currentEstilo, { estilo: currentEstilo, producto: currentProducto, qty });
              }
            }
          }
        }
        continue;
      }

      // Check if this is a number line (sizes + qty following a style line)
      if (isNumberLine(line) && currentEstilo) {
        const qty = lastNumber(line);
        if (qty > 0) {
          const existing = itemMap.get(currentEstilo);
          if (existing) {
            itemMap.set(currentEstilo, { ...existing, qty: existing.qty + qty });
          } else {
            itemMap.set(currentEstilo, { estilo: currentEstilo, producto: currentProducto, qty });
          }
        }
        // Don't reset currentEstilo — same estilo might have multiple number lines
        // (e.g. when color wraps to next line and creates another number row)
        continue;
      }

      // If line starts with text that could be a continuation of color (like "AIR" or "WHITE/OATMEAL")
      // followed by numbers — it's a number line for the current style
      if (currentEstilo && /\d/.test(line)) {
        const nums = line.match(/\d+/g);
        if (nums && nums.length > 0) {
          const qty = parseInt(nums[nums.length - 1], 10);
          if (qty > 0) {
            const existing = itemMap.get(currentEstilo);
            if (existing) {
              itemMap.set(currentEstilo, { ...existing, qty: existing.qty + qty });
            } else {
              itemMap.set(currentEstilo, { estilo: currentEstilo, producto: currentProducto, qty });
            }
          }
        }
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

  return { numeroPL, empresa, fechaEntrega, totalBultos, totalPiezas, bultos };
}

// ── Index builder ────────────────────────────────────────────────────

export function buildIndex(parsed: ParsedPackingList): PLIndexRow[] {
  const bultoMuestra = parsed.bultos.length > 0 ? parsed.bultos[0].id : "";

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
