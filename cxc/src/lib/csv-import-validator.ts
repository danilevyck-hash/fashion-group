// ── CSV Import Validator ─────────────────────────────────────────────────────
// Shared validation for catalog CSV imports (Reebok & Joybees)

export interface CsvImportRow {
  sku: string;
  name: string;
  price: number;
  quantity: number;
  gender: string;
  badge: string;
}

export interface CsvValidationResult {
  rows: CsvImportRow[];
  errors: string[];
  warnings: string[];
  summary: { update: number; create: number; zero: number } | null;
  duplicateErrors: { sku: string; lines: number[]; quantities: number[] }[];
}

const EXPECTED_HEADERS = ["SKU", "Nombre", "Precio", "Cantidad", "Genero", "Estado"];

const VALID_GENDERS = ["male", "female", "kids", "unisex", "adults", "adults_m", "women", "junior"];
const VALID_BADGES = ["nuevo", "oferta", ""];

// ── CSV Parser with BOM + delimiter auto-detect ─────────────────────────────

export function parseCSVRobust(text: string): { headers: string[]; rawRows: Record<string, string>[]; lineTexts: string[] } {
  // Strip BOM
  let clean = text;
  if (clean.charCodeAt(0) === 0xFEFF) {
    clean = clean.slice(1);
  }

  const lines = clean.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rawRows: [], lineTexts: [] };

  // Auto-detect delimiter: semicolon vs comma
  const headerLine = lines[0];
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ";" : ",";

  function splitLine(line: string): string[] {
    const vals: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        vals.push(current.trim().replace(/^"(.*)"$/, "$1"));
        current = "";
      } else {
        current += ch;
      }
    }
    vals.push(current.trim().replace(/^"(.*)"$/, "$1"));
    return vals;
  }

  const headers = splitLine(lines[0]);
  const rawRows: Record<string, string>[] = [];
  const lineTexts: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = splitLine(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = vals[idx] || ""; });
    rawRows.push(obj);
    lineTexts.push(lines[i]);
  }

  return { headers, rawRows, lineTexts };
}

// ── Validate ────────────────────────────────────────────────────────────────

export function validateCsvImport(
  text: string,
  existingSkus: Set<string>,
): CsvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { headers, rawRows } = parseCSVRobust(text);

  // 1. Empty file (no headers at all)
  if (headers.length === 0 || rawRows.length === 0) {
    errors.push("El archivo esta vacio");
    return { rows: [], errors, warnings, summary: null, duplicateErrors: [] };
  }

  // 2. Wrong columns — check that expected headers are present
  const normalizedHeaders = headers.map(h => h.trim().toLowerCase().replace(/^"(.*)"$/, "$1"));
  const expectedNormalized = EXPECTED_HEADERS.map(h => h.toLowerCase());
  const hasAllHeaders = expectedNormalized.every(eh => normalizedHeaders.includes(eh));

  if (!hasAllHeaders) {
    errors.push(`Formato incorrecto. Se esperan las columnas: ${EXPECTED_HEADERS.join(", ")}`);
    return { rows: [], errors, warnings, summary: null, duplicateErrors: [] };
  }

  // Parse rows with validation
  const parsedRows: CsvImportRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const lineNum = i + 2; // 1-based + header

    // Get raw values (case-insensitive header access)
    const rawSku = String(row["SKU"] || row["sku"] || "").trim();
    const rawName = String(row["Nombre"] || row["nombre"] || row["Name"] || "").trim();
    const rawPrice = String(row["Precio"] || row["precio"] || row["Price"] || "").trim();
    const rawQuantity = String(row["Cantidad"] || row["cantidad"] || row["Qty"] || row["Stock"] || row["stock"] || "").trim();
    const rawGender = String(row["Genero"] || row["genero"] || row["Gender"] || "").trim();
    const rawEstado = String(row["Estado"] || row["estado"] || "").trim();

    // 4. SKU vacio
    if (!rawSku) {
      errors.push(`Fila ${lineNum}: SKU vacio`);
      continue; // skip row entirely
    }

    // 5. Nombre vacio
    if (!rawName) {
      errors.push(`Fila ${lineNum} (SKU ${rawSku}): nombre vacio`);
    }

    // 6. Precio validation
    let price = 0;
    if (!rawPrice) {
      errors.push(`Fila ${lineNum} (SKU ${rawSku}): precio invalido '${rawPrice}'`);
    } else {
      const parsed = parseFloat(rawPrice);
      if (isNaN(parsed)) {
        errors.push(`Fila ${lineNum} (SKU ${rawSku}): precio invalido '${rawPrice}'`);
      } else if (parsed < 0) {
        errors.push(`Fila ${lineNum} (SKU ${rawSku}): precio invalido '${rawPrice}'`);
      } else {
        price = parsed;
        // 11. Precio = 0 warning
        if (price === 0) {
          warnings.push(`Fila ${lineNum} (SKU ${rawSku}): precio es $0 — ¿es correcto?`);
        }
        // 13. Precio muy alto
        if (price > 1000) {
          warnings.push(`Fila ${lineNum} (SKU ${rawSku}): precio $${price} — ¿es correcto?`);
        }
      }
    }

    // 7 & 8. Cantidad validation
    let quantity = 0;
    if (rawQuantity === "") {
      // Empty quantity defaults to 0
      quantity = 0;
    } else {
      const parsedQty = parseInt(rawQuantity);
      if (isNaN(parsedQty)) {
        errors.push(`Fila ${lineNum} (SKU ${rawSku}): cantidad invalida '${rawQuantity}'`);
      } else if (parsedQty < 0) {
        errors.push(`Fila ${lineNum} (SKU ${rawSku}): cantidad negativa`);
      } else {
        quantity = parsedQty;
        // 12. Cantidad muy alta
        if (quantity > 10000) {
          warnings.push(`Fila ${lineNum} (SKU ${rawSku}): cantidad ${quantity} — ¿es correcto?`);
        }
      }
    }

    // Normalize gender & badge
    const gender = rawGender.toLowerCase();
    const estadoLower = rawEstado.toLowerCase();
    const badge = estadoLower === "nuevo" ? "nuevo" : estadoLower === "oferta" ? "oferta" : "";

    // 9. Genero no reconocido
    if (gender && !VALID_GENDERS.includes(gender)) {
      warnings.push(`Fila ${lineNum} (SKU ${rawSku}): genero '${rawGender}' no reconocido. Valores validos: ${VALID_GENDERS.join(", ")}`);
    }

    // 10. Estado no reconocido
    if (rawEstado && !VALID_BADGES.includes(estadoLower)) {
      warnings.push(`Fila ${lineNum} (SKU ${rawSku}): estado '${rawEstado}' no reconocido. Valores validos: Nuevo, Oferta, o vacio`);
    }

    parsedRows.push({
      sku: rawSku,
      name: rawName || rawSku,
      price,
      quantity,
      gender: gender || "",
      badge,
    });
  }

  // 3. Duplicate SKU detection
  const skuOccurrences = new Map<string, { lines: number[]; quantities: number[] }>();
  parsedRows.forEach((r, idx) => {
    const entry = skuOccurrences.get(r.sku);
    if (entry) {
      entry.lines.push(idx + 2);
      entry.quantities.push(r.quantity);
    } else {
      skuOccurrences.set(r.sku, { lines: [idx + 2], quantities: [r.quantity] });
    }
  });

  const duplicateErrors: { sku: string; lines: number[]; quantities: number[] }[] = [];
  for (const [sku, info] of skuOccurrences) {
    if (info.lines.length > 1) {
      const allSame = info.quantities.every(q => q === info.quantities[0]);
      if (!allSame) {
        duplicateErrors.push({ sku, lines: info.lines, quantities: info.quantities });
        errors.push(
          `SKU ${sku} aparece ${info.lines.length} veces con cantidades diferentes (lineas ${info.lines.join(", ")} — cantidades: ${info.quantities.join(", ")})`
        );
      }
    }
  }

  // Deduplicate rows
  const seen = new Set<string>();
  const deduped: CsvImportRow[] = [];
  for (const r of parsedRows) {
    if (!seen.has(r.sku)) {
      seen.add(r.sku);
      deduped.push(r);
    }
  }

  // Summary calculation (only if no critical errors)
  let summary: { update: number; create: number; zero: number } | null = null;
  if (errors.length === 0) {
    const incomingSkus = new Set(deduped.map(r => r.sku));
    let update = 0;
    let create = 0;
    let zero = 0;

    for (const r of deduped) {
      if (existingSkus.has(r.sku)) update++;
      else create++;
    }
    for (const sku of existingSkus) {
      if (sku && !incomingSkus.has(sku)) zero++;
    }

    summary = { update, create, zero };
  }

  return { rows: deduped, errors, warnings, summary, duplicateErrors };
}
