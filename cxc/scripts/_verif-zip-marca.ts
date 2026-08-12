// ============================================================================
// SOLO LECTURA — arma los ZIP REALES por marca contra PRODUCCIÓN y los mira.
//
// Uso:
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-zip-marca.ts
//
// No escribe NADA: `buildZipDeMarca` solo hace `select` y baja objetos de
// Storage. Los ZIP quedan en memoria salvo que se pase `--guardar`, y ahí van a
// /tmp — nunca a la base.
//
// Lo que se verifica, y es el número que no se puede mover:
//   Tommy + Calvin del período CERRADO "mid 2026" = $62.381,57
//
// ⚠️ La base de Daniel se satura fácil. Este script hace UNA tanda de lecturas
// por marca (7 consultas), no un barrido en bucle.
// ============================================================================
import JSZip from "jszip";
import XLSX from "xlsx-js-style";
import { buildZipDeMarca, ErrorZipMarca } from "@/lib/marketing/zip-marca";
import { MARCAS_BLOQUE } from "@/lib/marketing/bloques";

const GUARDAR = process.argv.includes("--guardar");
const ESPERADO_CERRADO = 62381.57;

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Foto {
  filename: string;
  totalExcel: number;
  totalReportado: number;
  pdfs: number;
  fotos: number;
  carpetas: string[];
  fuenteMontos: string;
  periodo: string;
  estado: string;
  lineasSinMarca: number;
}

/** Lee el GRAN TOTAL de la hoja Resumen del Excel que quedó DENTRO del ZIP. */
async function totalDelExcel(buffer: Buffer): Promise<number> {
  const z = await JSZip.loadAsync(buffer);
  const f = z.file("resumen_gastos.xlsx");
  if (!f) throw new Error("el ZIP no trae resumen_gastos.xlsx");
  const wb = XLSX.read(await f.async("nodebuffer"), { type: "buffer" });
  const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Resumen, {
    header: 1,
    raw: true,
  });
  const total = filas.find((r) => String(r[0] ?? "").startsWith("TOTAL"));
  if (!total) throw new Error("la hoja Resumen no tiene fila TOTAL");
  return Number(total[total.length - 1] ?? 0);
}

async function mirar(marcaCodigo: string, periodoId?: string): Promise<Foto | null> {
  try {
    const r = await buildZipDeMarca({ marcaCodigo, periodoId: periodoId ?? null });
    const z = await JSZip.loadAsync(r.buffer);
    const nombres = Object.keys(z.files).filter((n) => !z.files[n].dir);
    if (GUARDAR) {
      const fs = await import("node:fs/promises");
      await fs.writeFile(`/tmp/${r.filename}`, r.buffer);
    }
    return {
      filename: r.filename,
      totalExcel: await totalDelExcel(r.buffer),
      totalReportado: r.total,
      pdfs: nombres.filter((n) => n.includes("/facturas/")).length,
      fotos: nombres.filter((n) => n.includes("/fotos/")).length,
      carpetas: r.carpetas,
      fuenteMontos: r.fuenteMontos,
      periodo: r.periodoNombre,
      estado: r.periodoEstado,
      lineasSinMarca: r.lineasSinMarca,
    };
  } catch (err) {
    if (err instanceof ErrorZipMarca) {
      console.log(`  ⛔ ${marcaCodigo}: ${err.codigo} — ${err.message}`);
      return null;
    }
    throw err;
  }
}

function imprimir(f: Foto): void {
  console.log(`  📦 ${f.filename}`);
  console.log(
    `     período "${f.periodo}" (${f.estado}) · montos ${f.fuenteMontos}` +
      (f.lineasSinMarca > 0 ? `  ⚠️ ${f.lineasSinMarca} líneas sin marca` : ""),
  );
  console.log(
    `     total del Excel ${money(f.totalExcel)}   (el módulo reportó ${money(f.totalReportado)})`,
  );
  console.log(`     ${f.pdfs} comprobantes · ${f.fotos} fotos`);
  console.log(`     carpetas: ${f.carpetas.join(" | ")}`);
  if (Math.abs(f.totalExcel - f.totalReportado) > 0.005) {
    console.log("     🔴 el Excel y el módulo NO dicen lo mismo");
  }
}

async function main(): Promise<void> {
  // El período CERRADO se pide por id, así que primero hay que saber cuál es.
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { data: periodos } = await supabaseServer
    .from("mk_periodos")
    .select("id, proveedor_key, nombre, estado");
  const cerrados = ((periodos ?? []) as Array<Record<string, string>>).filter(
    (p) => p.estado === "cerrado",
  );

  console.log("═══ PERÍODO ABIERTO de cada marca ═══");
  const abiertos = new Map<string, Foto>();
  for (const m of MARCAS_BLOQUE) {
    const f = await mirar(m.key);
    if (f) {
      abiertos.set(m.key, f);
      imprimir(f);
    }
  }

  let fallo = false;
  for (const per of cerrados) {
    console.log(`\n═══ PERÍODO CERRADO "${per.nombre}" (clave ${per.proveedor_key}) ═══`);
    const porMarca = new Map<string, Foto>();
    for (const m of MARCAS_BLOQUE) {
      const f = await mirar(m.key, per.id);
      if (f) {
        porMarca.set(m.key, f);
        imprimir(f);
      }
    }
    const th = porMarca.get("TH")?.totalExcel ?? 0;
    const ck = porMarca.get("CK")?.totalExcel ?? 0;
    const suma = Math.round((th + ck) * 100) / 100;
    console.log(
      `\n  Tommy ${money(th)} + Calvin ${money(ck)} = ${money(suma)}  (esperado ${money(ESPERADO_CERRADO)})`,
    );
    if (per.nombre === "mid 2026") {
      if (suma === ESPERADO_CERRADO) {
        console.log("  🟢 CUADRA AL CENTAVO");
      } else {
        console.log("  🔴 NO CUADRA — un monto se movió");
        fallo = true;
      }
    }
  }

  console.log("\n═══ Resumen por marca (abierto) ═══");
  for (const m of MARCAS_BLOQUE) {
    const f = abiertos.get(m.key);
    console.log(
      `  ${m.key.padEnd(4)} ${(f?.filename ?? "(sin ZIP: no tiene gasto)").padEnd(38)} ${
        f ? money(f.totalExcel) : "$0.00"
      }`,
    );
  }

  if (fallo) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
