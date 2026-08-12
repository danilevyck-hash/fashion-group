/**
 * SOLO LECTURA — verifica contra PRODUCCIÓN el Excel de un período (el del
 * botón "Excel" de la tarjeta, `buildExcelDeMarca`) y el ZIP de Multifashion:
 *
 *   1. TH · mid 2026 → hoja Resumen + hojas por cliente (+ General si hay
 *      gastos sin cliente), SIN columnas de marca, TOTAL $94.104,43 al centavo.
 *   2. CK · mid 2026 → TOTAL $46.462,14.
 *   3. Hyperlinks vivos: 3 al azar responden 200 con contenido real (>5 KB).
 *   4. Multifashion → ZIP con sus facturas / $8.061,63 y sus carpetas.
 *
 * No escribe nada: selects + createSignedUrls (lectura) + HEAD/GET a los links.
 *
 * Uso: npx tsx scripts/_verif-marketing-excel-periodo.ts
 */
import fs from "fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
import XLSX from "xlsx-js-style";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";

const ESPERADO = {
  TH: 94104.43,
  CK: 46462.14,
  MULTIFASHION: 8061.63,
};

let fallos = 0;
function check(etiqueta: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`  ${ok ? "✅" : "❌"} ${etiqueta}${detalle ? ` — ${detalle}` : ""}`);
}

function hoja(buf: Buffer, nombre: string): string[][] {
  const wb = XLSX.read(buf, { type: "buffer" });
  return XLSX.utils.sheet_to_json<string[]>(wb.Sheets[nombre], { header: 1, raw: true });
}

function linksDe(buf: Buffer): string[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const out: string[] = [];
  for (const nombre of wb.SheetNames) {
    const ws = wb.Sheets[nombre] as Record<string, { l?: { Target?: string } }>;
    for (const k of Object.keys(ws)) {
      if (k.startsWith("!")) continue;
      const t = ws[k].l?.Target;
      if (t) out.push(t);
    }
  }
  return out;
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { buildExcelDeMarca, buildZipMultifashion } = await import(
    "../src/lib/marketing/zip-marca"
  );

  const { data: periodos, error } = await sb
    .from("mk_periodos")
    .select("id, proveedor_key, nombre, estado, cerrado_en")
    .eq("estado", "cerrado");
  if (error) throw new Error(error.message);
  const mid = (periodos ?? []).find((p) => String(p.nombre).trim() === "mid 2026");
  if (!mid) throw new Error("no encontré el período cerrado 'mid 2026'");
  console.log(
    `Período: ${mid.nombre} (${mid.id}) · clave ${mid.proveedor_key} · cerrado_en ${mid.cerrado_en}`,
  );

  // ── 1/2. El Excel de TH y de CK ────────────────────────────────────────────
  for (const marca of ["TH", "CK"] as const) {
    console.log(`\n═══ Excel de ${marca} · mid 2026 ═══`);
    const r = await buildExcelDeMarca({ marcaCodigo: marca, periodoId: String(mid.id) });
    const wb = XLSX.read(r.buffer, { type: "buffer" });
    console.log(`  hojas: ${wb.SheetNames.join(" | ")}`);
    check("la primera hoja es Resumen", wb.SheetNames[0] === "Resumen");
    check("hay hojas por cliente", wb.SheetNames.length > 1, String(wb.SheetNames.length - 1));

    const filas = hoja(r.buffer, "Resumen");
    check(
      "título con la marca",
      String(filas[0]?.[0] ?? "").includes("FASHION GROUP"),
      String(filas[0]?.[0]),
    );
    check(
      "subtítulo declara el cálculo en vivo o el cierre",
      /mid 2026/.test(String(filas[1]?.[0] ?? "")),
      String(filas[1]?.[0]),
    );
    const head = filas.find((f) => String(f[0] ?? "") === "Cliente") ?? [];
    check(
      "encabezado SIN columnas de marca",
      JSON.stringify(head) === JSON.stringify(["Cliente", "# Gastos", "# Fotos", "Total"]),
      JSON.stringify(head),
    );
    const totalRow = filas.find((f) => String(f[0] ?? "") === "TOTAL");
    const total = Number(totalRow?.[totalRow.length - 1] ?? NaN);
    check(
      `TOTAL al centavo = ${ESPERADO[marca]}`,
      Math.abs(total - ESPERADO[marca]) < 0.005,
      `hoja ${total} · result.total ${r.total} · fuente ${r.fuenteMontos}`,
    );
    check("result.total coincide con la hoja", Math.abs(r.total - total) < 0.005);
    fs.writeFileSync(`/tmp/marketing-${marca}-mid-2026.xlsx`, r.buffer);
    console.log(`  guardado: /tmp/marketing-${marca}-mid-2026.xlsx`);

    if (marca === "TH") {
      // ── 3. Hyperlinks vivos: 3 al azar ────────────────────────────────────
      const links = linksDe(r.buffer);
      console.log(`\n═══ Links del Excel de TH (${links.length}) ═══`);
      check("hay links", links.length > 0);
      // GET (no HEAD): los links de la app (galería, PDF combinado) generan el
      // contenido al vuelo y HEAD responde 200 sin cuerpo — daría falso rojo.
      const muestra = [...links].sort(() => Math.random() - 0.5).slice(0, 3);
      for (const url of muestra) {
        const res = await fetch(url).catch(() => null);
        const largo = res ? (await res.arrayBuffer()).byteLength : 0;
        check(
          `link vivo (${res?.status}) ${url.slice(0, 90)}…`,
          !!res && res.ok && largo > 5 * 1024,
          `${largo} bytes · ${res?.headers.get("content-type")}`,
        );
      }
    }
  }

  // ── 4. Multifashion ────────────────────────────────────────────────────────
  console.log("\n═══ ZIP de Multifashion ═══");
  const mf = await buildZipMultifashion();
  console.log(
    `  ${mf.filename} · gastos ${mf.gastos} (facturas ${mf.facturas}, entregas ${mf.entregas}) · total ${mf.total} · fotos ${mf.fotosIncluidas} · pdfs ${mf.pdfsIncluidos}`,
  );
  check(
    `total Multifashion = ${ESPERADO.MULTIFASHION}`,
    Math.abs(mf.total - ESPERADO.MULTIFASHION) < 0.005,
    String(mf.total),
  );
  check("sin período (tienda propia)", mf.periodoEstado === "sin_periodo");
  const zip = await JSZip.loadAsync(mf.buffer);
  const rutas = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
  console.log(`  carpetas: ${mf.carpetas.join(" | ")}`);
  for (const rta of rutas) console.log(`    ${rta}`);
  check("trae el Excel", rutas.includes("resumen_gastos.xlsx"));
  const xl = await zip.file("resumen_gastos.xlsx")!.async("nodebuffer");
  const filasMf = hoja(xl, "Resumen");
  const totalMfRow = filasMf.find((f) => String(f[0] ?? "") === "TOTAL");
  check(
    "el Excel del ZIP dice el mismo total",
    Math.abs(Number(totalMfRow?.[totalMfRow.length - 1]) - ESPERADO.MULTIFASHION) < 0.005,
  );
  fs.writeFileSync("/tmp/multifashion.zip", mf.buffer);
  console.log("  guardado: /tmp/multifashion.zip");

  console.log(`\n${fallos === 0 ? "🟢 TODO CUADRA — 0 diferencias" : `🔴 ${fallos} FALLOS`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
