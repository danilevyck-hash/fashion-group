/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const API_BASE = "https://fashiongr.com";
const CSV_PATH = path.join(process.env.HOME || "~", "Downloads", "PLANTILLA RECLAMOS  COMPAÑIAS(FASHION WEAR).csv");

interface ParsedItem {
  referencia: string;
  descripcion: string;
  talla: string;
  cantidad: number;
  precio_unitario: number;
  motivo: string;
}

interface ParsedReclamo {
  fecha_reclamo: string;
  nro_factura: string;
  notas: string;
  items: ParsedItem[];
}

function parsePrice(s: string): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[^0-9.]/g, "")) || 0;
}

function parseDate(s: string): string {
  if (!s) return "";
  const parts = s.trim().split("/");
  if (parts.length !== 3) return "";
  const [d, m, y] = parts;
  return `${y.padStart(4, "20")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parse(csv: string): ParsedReclamo[] {
  const lines = csv.split("\n").map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
  const reclamos: ParsedReclamo[] = [];
  let currentItems: ParsedItem[] = [];
  let currentFecha = "";
  let currentFactura = "";
  let currentNotas = "";
  let hasTalla = false;

  for (const cols of lines) {
    const first = (cols[0] || "").toUpperCase();

    // Detect header row
    if (first.includes("FECHA") && (first.includes("RECLAMO") || first === "FECHA DE RECLAMO" || first.includes("DE"))) {
      // Save previous block if any
      if (currentItems.length > 0 && currentFactura) {
        reclamos.push({ fecha_reclamo: currentFecha, nro_factura: currentFactura, notas: currentNotas, items: currentItems });
      }
      currentItems = [];
      currentFecha = "";
      currentFactura = "";
      currentNotas = "";
      // Check if this header has TALLA column
      hasTalla = cols.some((c) => c.toUpperCase().includes("TALLA"));
      continue;
    }

    // Skip subtotal/importacion/itbms/total rows
    if (cols.some((c) => {
      const u = (c || "").toUpperCase().trim();
      return u.includes("SUBTOTAL") || u.includes("IMPORTACI") || u.includes("IMPORTANCION") || u.includes("ITBMS") || u.startsWith("TOTAL");
    })) continue;

    // Skip empty rows
    if (cols.every((c) => !c.trim())) continue;

    // Skip summary rows
    if ((cols[0] || "").toUpperCase() === "FECHA" && (cols[1] || "").toUpperCase() === "DETALLE") continue;
    if ((cols[3] || "").toUpperCase().includes("TOTAL EN N/C")) continue;

    // Skip the first summary row (e.g., "3/12/2019,RECLAMO #25...")
    if (cols[1] && cols[1].toUpperCase().includes("RECLAMO #")) continue;

    // Data row
    const fecha = parseDate(cols[0] || "");
    if (!fecha && !currentFactura) continue; // no date and no current block

    if (hasTalla) {
      // FECHA, FACTURA, REF, DESC, TALLA, CANT, PRECIO, MOTIVO, COMENTARIOS
      const factura = (cols[1] || "").trim();
      if (factura && fecha) { currentFecha = fecha; currentFactura = factura; }
      else if (!factura && !fecha) continue;

      const item: ParsedItem = {
        referencia: (cols[2] || "").trim(),
        descripcion: (cols[3] || "").trim(),
        talla: (cols[4] || "").trim(),
        cantidad: parseInt(cols[5] || "0") || 0,
        precio_unitario: parsePrice(cols[6] || "0"),
        motivo: (cols[7] || "").trim(),
      };
      currentNotas = (cols[8] || "").trim() || currentNotas;
      if (item.referencia || item.cantidad > 0) currentItems.push(item);
      if (factura) currentFactura = factura;
    } else {
      // FECHA, FACTURA, REF, DESC, CANT, PRECIO, MOTIVO, COMENTARIOS
      const factura = (cols[1] || "").trim();
      if (factura && fecha) { currentFecha = fecha; currentFactura = factura; }
      else if (!factura && !fecha) continue;

      const item: ParsedItem = {
        referencia: (cols[2] || "").trim(),
        descripcion: (cols[3] || "").trim(),
        talla: "",
        cantidad: parseInt(cols[4] || "0") || 0,
        precio_unitario: parsePrice(cols[5] || "0"),
        motivo: (cols[6] || "").trim(),
      };
      currentNotas = (cols[7] || "").trim() || currentNotas;
      if (item.referencia || item.cantidad > 0) currentItems.push(item);
      if (factura) currentFactura = factura;
    }
  }

  // Don't forget the last block
  if (currentItems.length > 0 && currentFactura) {
    reclamos.push({ fecha_reclamo: currentFecha, nro_factura: currentFactura, notas: currentNotas, items: currentItems });
  }

  // Group by factura (some blocks share the same factura but appear as separate blocks)
  const byFactura = new Map<string, ParsedReclamo>();
  for (const r of reclamos) {
    const key = `${r.nro_factura}-${r.fecha_reclamo}`;
    const existing = byFactura.get(key);
    if (existing) {
      existing.items.push(...r.items);
      if (r.notas && !existing.notas.includes(r.notas)) existing.notas += (existing.notas ? "; " : "") + r.notas;
    } else {
      byFactura.set(key, { ...r });
    }
  }

  return Array.from(byFactura.values());
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const csv = fs.readFileSync(CSV_PATH, "utf-8");
  const reclamos = parse(csv);
  console.log(`Parsed ${reclamos.length} reclamos from CSV\n`);

  let imported = 0;
  let errors = 0;

  for (const rec of reclamos) {
    console.log(`Importando REC factura ${rec.nro_factura} (${rec.items.length} ítems)...`);

    try {
      const res = await fetch(`${API_BASE}/api/reclamos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa: "Fashion Wear",
          proveedor: "American Fashion Wear",
          marca: "Tommy Hilfiger",
          nro_factura: rec.nro_factura,
          nro_orden_compra: "",
          fecha_reclamo: rec.fecha_reclamo,
          notas: rec.notas,
          items: rec.items,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`  ✓ Creado ${data.nro_reclamo}`);
        imported++;
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        console.log(`  ✗ Error: ${err.error || res.statusText}`);
        errors++;
      }
    } catch (e) {
      console.log(`  ✗ Error: ${e}`);
      errors++;
    }
  }

  console.log(`\nTotal: ${imported} importados, ${errors} errores`);
}

main();
