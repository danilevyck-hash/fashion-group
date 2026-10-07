// ============================================================================
// SOLO LECTURA — arma los ZIP REALES por marca contra PRODUCCIÓN y cuenta, POR
// CARPETA, cuántas facturas y cuántas entregas de mobiliario salen.
//
// Uso:
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_verif-zip-marca-por-carpeta.ts
//
// No escribe NADA: `buildZipDeMarca` solo hace `select` y baja objetos de
// Storage. Nada se entrega, ningún período se marca y los ZIP quedan en
// memoria.
//
// 🩸 PARA QUÉ (7-oct-2026): `vaEnElPapel` descartaba toda factura sin valor
// escrito en `pct_a_la_marca` (`Number(null) === 0`) y el ZIP salía con las 26
// entregas de mueble y CERO facturas. Esta medición es la que lo dice.
//
// ⚠️ La base de Daniel se satura fácil: UNA tanda de lecturas por marca, sin
// barridos en bucle.
// ============================================================================
import JSZip from "jszip";
import XLSX from "xlsx-js-style";

import { MARCAS_BLOQUE } from "@/lib/marketing/bloques";
import { buildZipDeMarca, ErrorZipMarca } from "@/lib/marketing/zip-marca";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface FilasDeCarpeta {
  gastos: number;
  facturas: number;
  entregas: number;
  sinComprobante: number;
  total: number;
}

/**
 * Lee el Excel que quedó DENTRO del ZIP y cuenta, hoja por hoja (una hoja =
 * una carpeta), los renglones de gasto y su tipo. La última columna dice «Ver
 * factura» o «Ver comprobante»; «—» es un gasto sin comprobante adjunto.
 */
async function porCarpeta(buffer: Buffer): Promise<Map<string, FilasDeCarpeta>> {
  const z = await JSZip.loadAsync(buffer);
  const f = z.file("resumen_gastos.xlsx");
  if (!f) throw new Error("el ZIP no trae resumen_gastos.xlsx");
  const wb = XLSX.read(await f.async("nodebuffer"), { type: "buffer" });
  const out = new Map<string, FilasDeCarpeta>();
  for (const hoja of wb.SheetNames) {
    if (hoja === "Resumen") continue;
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], {
      header: 1,
      raw: true,
    });
    const acc: FilasDeCarpeta = {
      gastos: 0,
      facturas: 0,
      entregas: 0,
      sinComprobante: 0,
      total: 0,
    };
    for (const fila of filas) {
      // Un renglón de gasto es el que tiene fecha "YYYY-MM-DD" en la columna 0.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fila[0] ?? ""))) continue;
      const etiqueta = String(fila[fila.length - 1] ?? "");
      const monto = Number(fila[fila.length - 2] ?? 0);
      acc.gastos++;
      acc.total += Number.isFinite(monto) ? monto : 0;
      if (etiqueta === "Ver comprobante") acc.entregas++;
      else if (etiqueta === "Ver factura") acc.facturas++;
      else acc.sinComprobante++;
    }
    acc.total = Math.round(acc.total * 100) / 100;
    out.set(hoja, acc);
  }
  return out;
}

async function mirar(marcaCodigo: string, rotulo: string): Promise<void> {
  let r;
  try {
    r = await buildZipDeMarca({ marcaCodigo, periodoId: null });
  } catch (err) {
    if (err instanceof ErrorZipMarca) {
      console.log(`\n═══ ${rotulo} ═══\n  ⛔ ${err.codigo} — ${err.message}`);
      return;
    }
    throw err;
  }
  console.log(`\n═══ ${rotulo} — ${r.filename} ═══`);
  console.log(
    `  período "${r.periodoNombre}" (${r.periodoEstado}) · montos ${r.fuenteMontos}`,
  );
  console.log(
    `  TOTAL ${money(r.total)} · ${r.gastos} gastos = ${r.facturas} facturas + ${r.entregas} entregas`,
  );
  const carpetas = await porCarpeta(r.buffer);
  if (carpetas.size === 0) {
    console.log("  (sin carpetas con gasto)");
    return;
  }
  for (const [nombre, c] of carpetas) {
    const extra = c.sinComprobante > 0 ? ` · ${c.sinComprobante} sin comprobante` : "";
    console.log(
      `  · ${nombre.padEnd(34)} ${String(c.gastos).padStart(3)} gastos / ${money(c.total).padStart(13)}` +
        `   (${c.facturas} facturas + ${c.entregas} entregas${extra})`,
    );
  }
}

async function main(): Promise<void> {
  for (const m of MARCAS_BLOQUE) await mirar(m.key, `MARCA ${m.key} · período abierto`);
  await mirar("multifashion", "MULTIFASHION (tienda propia, sin período)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
