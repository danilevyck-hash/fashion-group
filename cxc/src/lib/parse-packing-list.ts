/* ------------------------------------------------------------------ */
/*  Packing List PDF text parser                                      */
/*  Pure TypeScript — no React, no DOM, no external deps.             */
/* ------------------------------------------------------------------ */

// ── Raw line types (from PDF extraction with X positions) ───────────

export interface RawLineItem { x: number; str: string; }
export interface RawLine { text: string; items: RawLineItem[]; }

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
  bultoMuestra: string;  // bulto that has M (or 32 if no M), or first bulto as fallback
  isOS: boolean;         // true when muestra was assigned by fallback (no M/32 found)
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
    .replace(/\bDE\s+MUJER\b/g, "")
    .replace(/\bDE\s+VESTIR\b/g, "")
    .replace(/\bPARA\s*$/g, "")  // trailing "PARA" alone
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

function extractBultoId(raw: string): string {
  // Remove OCPA prefix if present, then take last 7 digits as ID
  const digits = raw.replace(/^OCPA/i, "");
  const last7 = digits.slice(-7);
  return String(parseInt(last7, 10));
}

/** Style code: mixed letters+digits, 6+ chars */
const STYLE_CODE_RE = /^[A-Za-z0-9]{6,}/;

/** Product keywords for prioritizing product name extraction */
const PRODUCT_KEYWORDS = /\b(CAMISAS?|POLOS?|PANTALON|CAMISETAS?|SUETER|CHAQUETAS?|GORRAS?|VESTIDOS?|BERMUDAS?|SHORTS?|FALDAS?|BLUSAS?|CORBATAS?|CINTURON|PANTIS?|BOXERS?|BRASSIERES?|MEDIAS?|CALCETINES?|PIJAMAS?|ROPA\s+INTERIOR)\b/i;

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
function parseSizeHeader(headerLine: string): { columns: string[]; mIndex: number; dim32Index: number; hasOS: boolean } {
  // Header looks like: "Estilo  Color  Nombre  Dim  S  M  L  XL  XX  32  34  Qty"
  const parts = headerLine.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
  const dimIdx = parts.findIndex(p => p === "Dim");
  if (dimIdx === -1) return { columns: [], mIndex: -1, dim32Index: -1, hasOS: false };

  const qtyIdx = parts.findIndex((p, i) => i > dimIdx && p === "Qty");
  const end = qtyIdx === -1 ? parts.length : qtyIdx;
  const columns = parts.slice(dimIdx + 1, end);

  const mIndex = columns.indexOf("M");
  const dim32Index = columns.indexOf("32");
  const hasOS = columns.includes("OS");

  return { columns, mIndex, dim32Index, hasOS };
}

/** Find the X position of a column header (e.g. "M" or "32") in a raw line */
function findColumnXPos(rawLine: RawLine | undefined, columnName: string): number {
  if (!rawLine) return -1;
  const item = rawLine.items.find(i => i.str.trim() === columnName);
  return item ? item.x : -1;
}

/** Check if a data raw line has a numeric value > 0 near a target X position */
function hasNumericValueNearX(dataRawLine: RawLine | undefined, targetX: number, tolerance: number = 15): boolean {
  if (!dataRawLine || targetX < 0) return false;
  return dataRawLine.items.some(item => {
    const trimmed = item.str.trim();
    const isNumeric = /^\d+$/.test(trimmed);
    return isNumeric && Math.abs(item.x - targetX) <= tolerance && parseInt(trimmed) > 0;
  });
}


// ── Main parser ──────────────────────────────────────────────────────

export function parsePackingListText(text: string, rawLines?: RawLine[]): ParsedPackingList {
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
  const cleanToRawIndex: number[] = []; // maps cleanLines index → allLines/rawLines index
  const allLines = text.split("\n");
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim();
    if (!line) { cleanLines.push(""); cleanToRawIndex.push(i); continue; }
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
    if (/^(FASHION WEAR|FASHION SHOES|VISTANA|ACTIVE SHOES|ACTIVE WEAR|ACTIVE|JOYSTEP|CONFECCIONES BOSTON|MULTIFASHION|VISTA HERMOSA|MIRIAM)/i.test(line) && !/Bulto/i.test(line) && i > 5) continue;
    // Skip Tel/Email/País/Dept/Vendedor repeats
    if (/^(Tel:|Email:|País:|Departamento:|Vendedor:)/i.test(line) && i > 10) continue;
    // Skip address patterns (generic: PANAMA + postal codes, EDIFICIO, etc.)
    if (/^PANAMA\s+D\.V\./i.test(line)) continue;
    if (/PANAMA\s*0555/i.test(line)) continue;
    if (/\bPANAMA\b.*\b\d{4,}\b/i.test(line) && i > 5) continue;
    if (/^(EDIFICIO|CALLE|AVENIDA|AV\.|BARRIADA|CORREGIMIENTO|APARTADO|ZONA\s+LIBRE)/i.test(line) && i > 5) continue;
    if (/\bR\.?U\.?C\.?\b/i.test(line) && i > 5) continue;
    // Skip standalone "L" (from XL/XXL header wrap)
    if (/^L$/.test(line)) continue;

    cleanLines.push(allLines[i]);
    cleanToRawIndex.push(i);
  }
  // Helper: get rawLine by cleanLines index via direct index mapping
  function getRawLine(cleanLineIdx: number): RawLine | undefined {
    if (!rawLines || cleanLineIdx < 0 || cleanLineIdx >= cleanToRawIndex.length) return undefined;
    const rawIdx = cleanToRawIndex[cleanLineIdx];
    return rawLines[rawIdx];
  }

  // ── Single-pass over cleanLines ──────────────────────────────────────
  // Instead of splitting into sections and matching text to find rawLines,
  // we iterate cleanLines directly and use cleanToRawIndex for direct mapping.

  const bultos: PLBulto[] = [];

  let currentBultoId = "";
  let currentBultoTotalPiezas = 0;
  let currentItemMap = new Map<string, PLBultoItem>();
  let currentSizeInfo = { columns: [] as string[], mIndex: -1, dim32Index: -1, hasOS: false };
  let mXPos = -1;
  let dim32XPos = -1;
  let currentEstilo = "";
  let currentProducto = "";

  function saveBulto() {
    if (currentBultoId) {
      bultos.push({
        id: currentBultoId,
        items: Array.from(currentItemMap.values()),
        totalPiezas: currentBultoTotalPiezas,
        sizeColumns: currentSizeInfo.columns,
      });
    }
  }

  for (let cli = 0; cli < cleanLines.length; cli++) {
    const line = cleanLines[cli].trim();
    if (!line) continue;

    const rawLine = getRawLine(cli);

    // Detect new bulto (OCPA prefix or pure numeric ID)
    if (/Bulto No\.\s*(OCPA|\d)/i.test(line)) {
      // Save previous bulto if any
      saveBulto();
      // Start new bulto — extract the ID after "Bulto No."
      const idMatch = line.match(/Bulto No\.\s*(\S+)/i);
      const rawId = idMatch ? idMatch[1] : "";
      currentBultoId = extractBultoId(rawId);
      // Total piezas is often on the same line as "Bulto No. OCPA..."
      const piezasOnLine = line.match(/Total piezas:\s*(\d+)/i);
      currentBultoTotalPiezas = piezasOnLine ? parseInt(piezasOnLine[1], 10) : 0;
      currentItemMap = new Map<string, PLBultoItem>();
      currentSizeInfo = { columns: [] as string[], mIndex: -1, dim32Index: -1, hasOS: false };
      mXPos = -1;
      dim32XPos = -1;
      currentEstilo = "";
      currentProducto = "";
      continue;
    }

    // Not inside a bulto yet
    if (!currentBultoId) continue;

    // Detect "Total piezas" on a separate line (fallback)
    if (!currentBultoTotalPiezas) {
      const piezasMatch = line.match(/Total piezas:\s*(\d+)/i);
      if (piezasMatch) {
        currentBultoTotalPiezas = parseInt(piezasMatch[1], 10);
        continue;
      }
    }

    // Detect header line
    if (/^Estilo\s+Color\s+Nombre/i.test(line)) {
      currentSizeInfo = parseSizeHeader(line);
      if (rawLine) {
        mXPos = findColumnXPos(rawLine, "M");
        dim32XPos = findColumnXPos(rawLine, "32");
      }
      continue;
    }

    // Skip known non-data lines
    if (SKIP_RE.test(line)) continue;
    if (/^Página:/i.test(line)) continue;
    if (/^L$/.test(line)) continue;

    const firstToken = line.split(/\s{2,}/)[0]?.trim() || "";

    // Style line: first token is alphanumeric code with mixed letters+digits, 6+ chars
    if (STYLE_CODE_RE.test(firstToken) && firstToken.length >= 6 && /[A-Za-z]/.test(firstToken) && /\d/.test(firstToken)) {
      const parts = line.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);

      // Find the part that matches a known product keyword (CAMISA, POLO, etc.)
      // This handles cases where the color has internal double-spaces creating extra parts
      let producto = "";
      for (let pi = 1; pi < parts.length; pi++) {
        if (PRODUCT_KEYWORDS.test(parts[pi])) {
          producto = parts[pi];
          break;
        }
      }
      // Fallback to parts[2] if no keyword match found
      // If parts[2] looks like a number-only or too-short token (e.g. from a double-space color),
      // try subsequent parts to find one that looks like a product name
      if (!producto && parts.length >= 3) {
        for (let fi = 2; fi < parts.length; fi++) {
          const candidate = parts[fi];
          // Skip tokens that are purely numeric or suspiciously short (< 4 chars)
          if (/^\d+$/.test(candidate) || candidate.length < 4) continue;
          producto = candidate;
          break;
        }
        // Last resort: use parts[2] even if short
        if (!producto) producto = parts[2];
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
          // Check if M or 32 is present using X-position coordinates when available
          let hasM: boolean;
          let has32: boolean;

          if (rawLines && (mXPos >= 0 || dim32XPos >= 0)) {
            // Use direct index mapping — no text matching needed!
            hasM = hasNumericValueNearX(rawLine, mXPos);
            has32 = hasNumericValueNearX(rawLine, dim32XPos);
          } else {
            // Fallback: positional index matching (original heuristic)
            const numValues = line.trim().split(/\s+/).filter(t => /^\d+$/.test(t));
            const expectedCols = currentSizeInfo.columns.length;
            if (numValues.length >= expectedCols + 1) {
              hasM = currentSizeInfo.mIndex >= 0 && parseInt(numValues[currentSizeInfo.mIndex]) > 0;
              has32 = currentSizeInfo.dim32Index >= 0 && parseInt(numValues[currentSizeInfo.dim32Index]) > 0;
            } else if (currentSizeInfo.hasOS && numValues.length <= 2) {
              hasM = false;
              has32 = false;
            } else if (numValues.length > 2) {
              hasM = currentSizeInfo.mIndex >= 0 && numValues.length > currentSizeInfo.mIndex;
              has32 = currentSizeInfo.dim32Index >= 0 && numValues.length > currentSizeInfo.dim32Index;
            } else {
              hasM = false;
              has32 = false;
            }
          }

          const existing = currentItemMap.get(currentEstilo);
          if (existing) {
            currentItemMap.set(currentEstilo, {
              ...existing,
              qty: existing.qty + qty,
              hasM: existing.hasM || hasM,
              has32: existing.has32 || has32,
            });
          } else {
            currentItemMap.set(currentEstilo, {
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

  // Save the last bulto
  saveBulto();

  const totalBultos = bultos.length;
  const totalPiezas = bultos.reduce((sum, b) => sum + b.totalPiezas, 0);

  return { numeroPL, empresa, fechaEntrega, totalBultos, totalPiezas, bultos };
}

// ── Validation ──────────────────────────────────────────────────────

export interface PLValidationError {
  bultoId: string;
  pdfTotal: number;
  parserTotal: number;
  diff: number;
}

/** Validate parsed PL by comparing parser totals vs PDF-stated totals per bulto */
export function validateParsedPL(parsed: ParsedPackingList): PLValidationError[] {
  const errors: PLValidationError[] = [];
  for (const b of parsed.bultos) {
    const parserTotal = b.items.reduce((s, i) => s + i.qty, 0);
    if (parserTotal !== b.totalPiezas) {
      errors.push({
        bultoId: b.id,
        pdfTotal: b.totalPiezas,
        parserTotal,
        diff: b.totalPiezas - parserTotal,
      });
    }
  }
  return errors;
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

  const rows: PLIndexRow[] = Array.from(groups.values()).map((g) => {
    const hasMor32 = !!g.muestraBulto;
    return {
      estilo: g.estilo,
      producto: g.producto,
      totalPcs: g.totalPcs,
      distribution: g.distribution,
      bultoMuestra: g.muestraBulto || Object.keys(g.distribution)[0] || "",
      isOS: !hasMor32,
    };
  });

  // Sort by producto ascending (A-Z), then by estilo within each group
  rows.sort((a, b) => {
    const prodCmp = a.producto.localeCompare(b.producto);
    if (prodCmp !== 0) return prodCmp;
    return a.estilo.localeCompare(b.estilo);
  });

  return rows;
}
