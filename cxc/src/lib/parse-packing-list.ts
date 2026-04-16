/* ------------------------------------------------------------------ */
/*  Packing List PDF text parser                                      */
/*  Pure TypeScript — no React, no DOM, no external deps.             */
/* ------------------------------------------------------------------ */

// ── Types ────────────────────────────────────────────────────────────

export interface PLBultoItem {
  estilo: string;
  producto: string;
  qty: number;
  hasM: boolean;     // has value in M column
  has32: boolean;    // has value in a 32 column
}

export interface PLBulto {
  id: string;
  items: PLBultoItem[];
  totalPiezas: number;
  sizeColumns: string[];  // e.g. ["S","M","L","XL","XX","32","34"]
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
  bultoMuestra: string;  // bulto that has M (or 32 if no M)
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

  let sleeve: string | null = null;
  const sleeveMatch = n.match(/\bM\/[LC]\b/);
  if (sleeveMatch) {
    sleeve = sleeveMatch[0];
    n = n.replace(/\bM\/[LC]\b/, "").trim();
  }

  n = n
    .replace(/\bPARA\s+CABALLERO\b/g, "")
    .replace(/\bPARA\s+HOMBRE\b/g, "")
    .replace(/\bPARA\s+DAMA\b/g, "")
    .replace(/\bPARA\s+MUJER\b/g, "")
    .replace(/\bDE\s+CABALLERO\b/g, "")
    .replace(/\bDE\s+VESTIR\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Normalize plurals
  n = n.replace(/^CAMISAS\b/, "CAMISA")
    .replace(/^POLOS\b/, "POLO")
    .replace(/^CAMISETAS\b/, "CAMISETA")
    .replace(/^CHAQUETAS\b/, "CHAQUETA")
    .replace(/^GORRAS\b/, "GORRA");

  if (sleeve) n = `${n} ${sleeve}`;
  return n;
}

// ── Helpers ──────────────────────────────────────────────────────────

function extractBultoId(ocpaFull: string): string {
  const digits = ocpaFull.replace(/^OCPA/i, "");
  const last7 = digits.slice(-7);
  return String(parseInt(last7, 10));
}

/** Style code: mixed letters+digits, 6+ chars */
const STYLE_CODE_RE = /^[A-Za-z0-9]{6,}/;

/** Lines to always skip */
const SKIP_RE = /^(Bulto|Estilo|Total|Peso|Volumen|Dim|Pag|Página|Departamento|Vendedor|Pais|País|Email|Tel|PACKING|NO\.|American|0{3,}|---)/i;

/** Check if line is only numbers/spaces */
function isNumberLine(line: string): boolean {
  return /^\d[\d\s]*$/.test(line.trim());
}

function lastNumber(line: string): number {
  const nums = line.trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
  return nums.length > 0 ? nums[nums.length - 1] : 0;
}

/** Parse the size column header to find positions of M and 32 */
function parseSizeHeader(headerLine: string): { columns: string[]; mIndex: number; dim32Index: number } {
  // Header looks like: "Estilo  Color  Nombre  Dim  S  M  L  XL  XX  32  34  Qty"
  const parts = headerLine.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
  // Find index of "Dim" — sizes start after it
  const dimIdx = parts.findIndex(p => p === "Dim");
  if (dimIdx === -1) return { columns: [], mIndex: -1, dim32Index: -1 };

  // Everything between Dim and Qty are size columns
  const qtyIdx = parts.findIndex((p, i) => i > dimIdx && p === "Qty");
  const end = qtyIdx === -1 ? parts.length : qtyIdx;
  const columns = parts.slice(dimIdx + 1, end);

  const mIndex = columns.indexOf("M");
  const dim32Index = columns.indexOf("32");

  return { columns, mIndex, dim32Index };
}

/** Check if a number line has a value at a specific size column position */
function hasValueAtPosition(numberLine: string, position: number, totalColumns: number): boolean {
  if (position < 0) return false;
  const nums = numberLine.trim().split(/\s+/);
  // The number line has values for each size column + Qty at end
  // But not all columns may have values (empty = no stock in that size)
  // We can't reliably map by position since gaps collapse in text extraction
  // So we use a simpler heuristic: if there are enough numbers and position is within range
  return position < nums.length;
}

// ── Main parser ──────────────────────────────────────────────────────

export function parsePackingListText(text: string): ParsedPackingList {
  const plMatch = text.match(/NO\.\s*(\d+)/);
  const numeroPL = plMatch ? plMatch[1] : "";

  let empresa = "";
  const upperText = text.toUpperCase();
  for (const co of KNOWN_COMPANIES) {
    if (upperText.includes(co)) { empresa = co; break; }
  }

  const fechaMatch = text.match(/Fecha de entrega:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  const fechaEntrega = fechaMatch ? `${fechaMatch[3]}-${fechaMatch[2]}-${fechaMatch[1]}` : "";

  // Pre-clean: remove ALL page footers and repeated headers.
  // Each page repeats: company header, address, phone, email, dept, then footer with page number.
  // We identify and remove these by pattern.
  const cleanLines: string[] = [];
  const allLines = text.split("\n");
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim();
    if (!line) { cleanLines.push(""); continue; }
    // Skip page footers: "0080000166 PANAMA PANAMA PA  PACKING LIST" or "0070000008 VISTA..."
    if (/^0{3,}\d+\s/.test(line)) continue;
    // Skip "Página: X / Y"
    if (/^Página:/i.test(line)) continue;
    // Skip repeated "PACKING LIST" (not the first one which is before any bulto)
    if (line === "PACKING LIST" && i > 5) continue;
    // Skip "NO. XXXXX" repeats
    if (/^NO\.\s*\d+$/.test(line) && i > 5) continue;
    // Skip company headers: "American Designer..." / "American Fashion..."
    if (/^American\s+(Designer|Fashion)/i.test(line) && i > 5) continue;
    // Skip phone: "445-7050" or similar standalone phone
    if (/^\d{3}-\d{4}$/.test(line)) continue;
    // Skip address/company lines that repeat on each page
    if (/^(FASHION WEAR|VISTANA|ACTIVE|VISTA HERMOSA|MIRIAM)/i.test(line) && !/Bulto/i.test(line) && i > 5) continue;
    // Skip Tel/Email/País/Dept/Vendedor repeats
    if (/^(Tel:|Email:|País:|Departamento:|Vendedor:)/i.test(line) && i > 10) continue;
    // Skip address patterns
    if (/^PANAMA\s+D\.V\./i.test(line)) continue;
    if (/PANAMA\s*0555/i.test(line)) continue;
    // Skip standalone "L" (from XL/XXL header wrap)
    if (/^L$/.test(line)) continue;

    cleanLines.push(allLines[i]);
  }
  const cleanText = cleanLines.join("\n");

  const bultoSections = cleanText.split(/Bulto No\.\s*OCPA/i);
  const rawBultos = bultoSections.slice(1);

  const bultos: PLBulto[] = [];

  for (const section of rawBultos) {
    const idMatch = section.match(/^(\S+)/);
    const ocpaId = idMatch ? `OCPA${idMatch[1]}` : "";
    const bultoId = extractBultoId(ocpaId);

    const piezasMatch = section.match(/Total piezas:\s*(\d+)/i);
    const totalPiezas = piezasMatch ? parseInt(piezasMatch[1], 10) : 0;

    const lines = section.split("\n").map(l => l.trim()).filter(Boolean);
    let sizeInfo = { columns: [] as string[], mIndex: -1, dim32Index: -1 };

    for (const line of lines) {
      if (/^Estilo\s+Color\s+Nombre/i.test(line)) {
        sizeInfo = parseSizeHeader(line);
        break;
      }
    }

    const itemMap = new Map<string, PLBultoItem>();
    let currentEstilo = "";
    let currentProducto = "";

    for (const line of lines) {
      if (SKIP_RE.test(line)) continue;
      if (/^Página:/i.test(line)) continue;
      if (/^L$/.test(line.trim())) continue;
      if (/^Estilo\s+Color/i.test(line)) continue;

      const firstToken = line.split(/\s{2,}/)[0]?.trim() || "";

      // Style line: first token is alphanumeric code with mixed letters+digits, 6+ chars
      if (STYLE_CODE_RE.test(firstToken) && /[A-Za-z]/.test(firstToken) && /\d/.test(firstToken)) {
        const parts = line.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);

        // Extract product name: find multi-word token with letters
        let producto = "";
        for (let i = 1; i < parts.length; i++) {
          const p = parts[i];
          if (/[A-Za-z]/.test(p) && p.split(/\s+/).length >= 2 && p.length > producto.length) {
            // Skip the color (usually 1-2 words, shorter) — take the longest multi-word token
            producto = p;
          }
        }

        currentEstilo = firstToken;
        currentProducto = producto ? normalizeProductName(producto) : "";
        continue;
      }

      // Number line or continuation line (text + numbers) following a style
      if (currentEstilo) {
        const nums = line.match(/\d+/g);
        if (nums && nums.length > 0) {
          const qty = parseInt(nums[nums.length - 1], 10);
          if (qty > 0 && qty < 10000) {
            // Check if M or 32 is present: M is in the size columns
            // For simplicity, check if the number line has enough values to cover M position
            const numValues = line.trim().split(/\s+/).filter(t => /^\d+$/.test(t));
            const hasM = sizeInfo.mIndex >= 0 && numValues.length > sizeInfo.mIndex && parseInt(numValues[sizeInfo.mIndex]) > 0;
            const has32 = sizeInfo.dim32Index >= 0 && numValues.length > sizeInfo.dim32Index && parseInt(numValues[sizeInfo.dim32Index]) > 0;

            const existing = itemMap.get(currentEstilo);
            if (existing) {
              itemMap.set(currentEstilo, {
                ...existing,
                qty: existing.qty + qty,
                hasM: existing.hasM || hasM,
                has32: existing.has32 || has32,
              });
            } else {
              itemMap.set(currentEstilo, {
                estilo: currentEstilo,
                producto: currentProducto,
                qty,
                hasM,
                has32,
              });
            }
            currentEstilo = "";
            currentProducto = "";
            continue;
          }
        }
      }

      currentEstilo = "";
      currentProducto = "";
    }

    bultos.push({
      id: bultoId,
      items: Array.from(itemMap.values()),
      totalPiezas,
      sizeColumns: sizeInfo.columns,
    });
  }

  const totalBultos = bultos.length;
  const totalPiezas = bultos.reduce((sum, b) => sum + b.totalPiezas, 0);

  return { numeroPL, empresa, fechaEntrega, totalBultos, totalPiezas, bultos };
}

// ── Index builder ────────────────────────────────────────────────────

export function buildIndex(parsed: ParsedPackingList): PLIndexRow[] {
  // For each style, find the first bulto that has M. If no M, find first with 32.
  const groups = new Map<string, {
    estilo: string; producto: string; totalPcs: number;
    distribution: Record<string, number>;
    muestraBulto: string;
  }>();

  for (const bulto of parsed.bultos) {
    for (const item of bulto.items) {
      const key = `${item.estilo}||${item.producto}`;
      const existing = groups.get(key);
      if (existing) {
        existing.totalPcs += item.qty;
        existing.distribution[bulto.id] = (existing.distribution[bulto.id] || 0) + item.qty;
        // Update muestra: first bulto with M wins, then first with 32
        if (!existing.muestraBulto && item.hasM) existing.muestraBulto = bulto.id;
        if (!existing.muestraBulto && item.has32) existing.muestraBulto = bulto.id;
      } else {
        groups.set(key, {
          estilo: item.estilo,
          producto: item.producto,
          totalPcs: item.qty,
          distribution: { [bulto.id]: item.qty },
          muestraBulto: item.hasM ? bulto.id : (item.has32 ? bulto.id : ""),
        });
      }
    }
  }

  const rows: PLIndexRow[] = Array.from(groups.values()).map((g) => ({
    estilo: g.estilo,
    producto: g.producto,
    totalPcs: g.totalPcs,
    distribution: g.distribution,
    // If no muestra found (no M or 32), leave empty
    bultoMuestra: g.muestraBulto || "",
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
