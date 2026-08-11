/**
 * Carga a `switch_ingresos_mercancia` los CSV ya bajados a disco.
 *
 * Está SEPARADO de la bajada a propósito: entrar a Switch expulsa a Daniel del
 * panel (login web con `changesession=SI`), así que los CSV se guardan crudos
 * primero y la carga se puede repetir cuantas veces haga falta sin volver a
 * entrar.
 *
 * 🔴 NO CARGA NADA SI EL CUADRE NO DA. El detalle tiene que sumar exactamente
 * las mismas unidades que el resumen, DOCUMENTO POR DOCUMENTO. Un descuadre
 * significa filas perdidas, y cargar filas perdidas es peor que no cargar: el
 * módulo diría "compraste 900" cuando compraste 1.000 y nadie tendría cómo
 * notarlo.
 *
 * Uso (dry-run por defecto; `--confirm` escribe):
 *   DOTENV_CONFIG_PATH=.env.local DIR=<carpeta> \
 *     npx tsx -r dotenv/config scripts/_cargar-ingresos-mercancia.ts [--confirm]
 *
 * Espera en DIR los pares:  <empresa>__detalle.csv  y  <empresa>__resumen.csv
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { supabaseServer } from "../src/lib/supabase-server";
import {
  parseDetalleCsv,
  parseResumenCsv,
  cuadrar,
  hallazgos,
  type LineaIngreso,
} from "../src/lib/switch-api/ingresos-mercancia";

const DIR = process.env.DIR;
const CONFIRM = process.argv.includes("--confirm");
if (!DIR) {
  console.error("Falta DIR=<carpeta con los CSV>");
  process.exit(1);
}

/** Lotes chicos con pausa: la base ya se cayó tres veces por cargas agresivas. */
const LOTE = 500;
/** Documentos por tanda de reemplazo (un DELETE + sus INSERT). */
const LOTE_DOCS = 50;
const PAUSA_MS = 250;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cargarEmpresa(empresa: string): Promise<void> {
  const detalle = parseDetalleCsv(empresa, readFileSync(join(DIR!, `${empresa}__detalle.csv`), "utf8"));
  const resumen = parseResumenCsv(readFileSync(join(DIR!, `${empresa}__resumen.csv`), "utf8"));
  const c = cuadrar(detalle.filas, resumen.documentos);
  const h = hallazgos(detalle.filas);
  const fechas = detalle.filas.map((f) => f.fecha).sort();

  console.log(`\n═══ ${empresa} ═══`);
  console.log(`  líneas ${detalle.filas.length} · unidades ${detalle.unidades} · docs ${detalle.documentos}`);
  console.log(`  rango ${fechas[0] ?? "—"} → ${fechas[fechas.length - 1] ?? "—"}`);
  console.log(`  cuadre: detalle ${c.unidadesDetalle} vs resumen ${c.unidadesResumen} · dif ${c.diferencia} → ${c.ok ? "🟢" : "🔴"}`);
  console.log(`  FOB≠CIF ${h.fobDistintoDeCif} · FOB=CIF ${h.fobIgualACif} · negativas ${h.negativas.length} · repetidos ${h.codigosRepetidosEnDocumento.length}`);
  if (detalle.skips.length) console.log(`  ⚠️ líneas salteadas: ${detalle.skips.length}`);

  if (!c.ok) {
    console.log("  🔴 NO CUADRA — esta empresa NO se carga.");
    if (c.soloEnResumen.length) console.log("     faltan en el detalle:", c.soloEnResumen.slice(0, 10));
    if (c.documentosDescuadrados.length) console.log("     descuadrados:", c.documentosDescuadrados.slice(0, 10));
    return;
  }
  if (!CONFIRM) {
    console.log("  (dry-run: no se escribió nada. Correr con --confirm para cargar.)");
    return;
  }

  // 🔴 SE REEMPLAZA EL DOCUMENTO ENTERO, no se hace upsert renglón por renglón.
  // La llave es (empresa_key, n_interno, linea) y `linea` es un ORDINAL: si
  // Switch devolviera los renglones en otro orden, un upsert dejaría mezclados
  // los nuevos con los viejos. Borrar el documento y volver a insertarlo lo hace
  // idempotente sin depender de que el orden nunca cambie.
  const porDocumento = new Map<string, LineaIngreso[]>();
  for (const f of detalle.filas) {
    const arr = porDocumento.get(f.n_interno);
    if (arr) arr.push(f);
    else porDocumento.set(f.n_interno, [f]);
  }

  let escritas = 0;
  const docs = [...porDocumento.entries()];
  for (let i = 0; i < docs.length; i += LOTE_DOCS) {
    const tanda = docs.slice(i, i + LOTE_DOCS);
    const nInternos = tanda.map(([n]) => n);

    const { error: errDel } = await supabaseServer
      .from("switch_ingresos_mercancia")
      .delete()
      .eq("empresa_key", empresa)
      .in("n_interno", nInternos);
    if (errDel) throw new Error(`${empresa} borrado de ${nInternos.length} docs: ${errDel.message}`);

    const filas = tanda.flatMap(([, fs]) => fs);
    for (let j = 0; j < filas.length; j += LOTE) {
      const { error } = await supabaseServer.from("switch_ingresos_mercancia").insert(filas.slice(j, j + LOTE));
      if (error) throw new Error(`${empresa} inserción: ${error.message}`);
      await dormir(PAUSA_MS);
    }
    escritas += filas.length;
    process.stdout.write(`\r  cargadas ${escritas}/${detalle.filas.length} (${i + tanda.length}/${docs.length} docs)`);
    await dormir(PAUSA_MS);
  }
  console.log(`\n  ✅ ${escritas} filas cargadas en ${docs.length} documentos.`);
}

async function main() {
  const empresas = [
    ...new Set(
      readdirSync(DIR!)
        .filter((f) => f.endsWith("__detalle.csv"))
        .map((f) => f.replace("__detalle.csv", "")),
    ),
  ].sort();
  if (!empresas.length) {
    console.error(`No hay archivos *__detalle.csv en ${DIR}`);
    process.exit(1);
  }
  console.log(`Empresas encontradas: ${empresas.join(", ")}`);
  for (const e of empresas) await cargarEmpresa(e);
}

main().catch((e) => {
  console.error("FALLÓ:", e instanceof Error ? e.message : e);
  process.exit(1);
});
