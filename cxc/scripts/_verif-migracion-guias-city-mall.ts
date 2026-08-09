/**
 * READ-ONLY. Simula la migración `20260809120000_guias_atar_city_mall_y_remapeo_d201.sql`
 * contra producción y compara los conteos contra lo esperado.
 *
 * 🔴 NO ESCRIBE NADA. Ni un UPDATE. El backfill lo corre Daniel a mano en el
 *    SQL Editor; esto solo mide si los números siguen dando antes de que lo haga.
 *
 * ⚠️ Las reglas NO se escriben acá a mano: se LEEN del archivo .sql. Si el SQL
 *    y esta verificación tuvieran cada uno su copia, podrían divergir y este
 *    script daría verde sobre una migración distinta a la que va a correr.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-migracion-guias-city-mall.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";
import { leerReglasDeMigracion, normalizarComoSql, MIGRACION_CITY_MALL } from "../src/lib/guias/reglas-city-mall";

const ESPERADO = { vivas: 441, atadasAntes: 169, porDireccion: 89, porNombre: 61, puntual: 1, remapeo: 13, sinAtarDespues: 121 };

async function main() {
  const sql = readFileSync(join(process.cwd(), MIGRACION_CITY_MALL), "utf8");
  const { porDireccion, porNombre } = leerReglasDeMigracion(sql);
  console.log(`reglas leídas del SQL: ${porDireccion.length} por dirección · ${porNombre.length} por nombre`);

  const items = await leerTodoPaginado<{
    id: string; guia_id: string; cliente: string | null; direccion: string | null;
    cliente_codigo: string | null; deleted: boolean | null;
  }>("guia_items", (c, from, to) =>
    supabaseServer.from("guia_items")
      .select("id, guia_id, cliente, direccion, cliente_codigo, deleted", c ? { count: "exact" } : {})
      .order("id", { ascending: true }).range(from, to));

  const guias = await leerTodoPaginado<{ id: string; numero: number; deleted: boolean }>("guia_transporte",
    (c, from, to) => supabaseServer.from("guia_transporte")
      .select("id, numero, deleted", c ? { count: "exact" } : {})
      .order("id", { ascending: true }).range(from, to));

  const master = await leerTodoPaginado<{ codigo: string | null; deleted: boolean }>("clientes_master",
    (c, from, to) => supabaseServer.from("clientes_master")
      .select("codigo, deleted", c ? { count: "exact" } : {})
      .order("id", { ascending: true }).range(from, to));
  const vivosMaster = new Set(master.filter((m) => !m.deleted && m.codigo).map((m) => m.codigo!.trim()));

  const vivas = new Map(guias.filter((g) => !g.deleted).map((g) => [g.id, g]));
  const filas = items.filter((i) => !i.deleted && vivas.has(i.guia_id));

  // El mismo guard del SQL: el código destino tiene que existir VIVO.
  const destinoOk = (cod: string) => vivosMaster.has(cod);

  const estado = new Map(filas.map((f) => [f.id, (f.cliente_codigo ?? "").trim()]));

  // PASO 2 — por (cliente + dirección), solo cliente_codigo IS NULL
  let n2 = 0;
  for (const f of filas) {
    if (estado.get(f.id)) continue;
    const cn = normalizarComoSql(f.cliente), dn = normalizarComoSql(f.direccion);
    const r = porDireccion.find((x) => x.cliente === cn && x.direccion === dn);
    if (r && destinoOk(r.codigo)) { estado.set(f.id, r.codigo); n2++; }
  }

  // PASO 3 — por nombre exacto, solo cliente_codigo IS NULL
  let n3 = 0;
  for (const f of filas) {
    if (estado.get(f.id)) continue;
    const cn = normalizarComoSql(f.cliente);
    const r = porNombre.find((x) => x.cliente === cn);
    if (r && destinoOk(r.codigo)) { estado.set(f.id, r.codigo); n3++; }
  }

  // PASO 3B — corrección PUNTUAL de UNA fila (GUÍA 36), NO una regla.
  // Acotada por número de guía: en Guabito despachan los duty free y hay 12
  // líneas más con esa dirección que no son City Mall.
  let n3b = 0;
  for (const f of filas) {
    if (estado.get(f.id)) continue;
    if (vivas.get(f.guia_id)?.numero !== 36) continue;
    if (normalizarComoSql(f.cliente) !== "city mall") continue;
    if (normalizarComoSql(f.direccion) !== "guabito") continue;
    if (destinoOk("D-25")) { estado.set(f.id, "D-25"); n3b++; }
  }

  // PASO 4 — la ÚNICA reescritura: D-201 → D-108
  let n4 = 0;
  for (const f of filas) {
    if ((estado.get(f.id) ?? "").toUpperCase() === "D-201" && destinoOk("D-108")) { estado.set(f.id, "D-108"); n4++; }
  }

  const atadasAntes = filas.filter((f) => (f.cliente_codigo ?? "").trim()).length;
  const sinAtarDespues = [...estado.values()].filter((v) => !v).length;
  const atadasDespues = filas.length - sinAtarDespues;

  const filaGuabito = filas.find(
    (f) => normalizarComoSql(f.cliente) === "city mall" && normalizarComoSql(f.direccion) === "guabito",
  );
  // Los duty free que despachan en Guabito: la corrección puntual NO puede
  // alcanzarlos. Son la razón por la que `guabito` no es una regla.
  const otrosGuabito = filas.filter(
    (f) =>
      normalizarComoSql(f.direccion) === "guabito" &&
      normalizarComoSql(f.cliente) !== "city mall" &&
      !(f.cliente_codigo ?? "").trim(),
  );

  const chequeos: [string, unknown, unknown][] = [
    ["líneas vivas", filas.length, ESPERADO.vivas],
    ["atadas ANTES", atadasAntes, ESPERADO.atadasAntes],
    ["PASO 2 · por dirección", n2, ESPERADO.porDireccion],
    ["PASO 3 · por nombre", n3, ESPERADO.porNombre],
    ["PASO 3B · GUÍA 36 (puntual)", n3b, ESPERADO.puntual],
    ["PASO 4 · remapeo D-201→D-108", n4, ESPERADO.remapeo],
    ["sin atar DESPUÉS", sinAtarDespues, ESPERADO.sinAtarDespues],
    ["atadas DESPUÉS", atadasDespues, ESPERADO.vivas - ESPERADO.sinAtarDespues],
    ["quedan en D-201", [...estado.values()].filter((v) => v.toUpperCase() === "D-201").length, 0],
    ["códigos que no son D-XXX", [...estado.values()].filter((v) => v && !/^D-\d+$/i.test(v)).length, 0],
    ["🔴 GUÍA 36 City Mall|Guabito quedó en D-25", filaGuabito ? estado.get(filaGuabito.id) : "no existe la fila", "D-25"],
    ["🔴 los OTROS de Guabito NO se tocaron", otrosGuabito.filter((f) => estado.get(f.id)).length, 0],
  ];

  let malos = 0;
  console.log("");
  for (const [etiqueta, real, esperado] of chequeos) {
    const ok = real === esperado;
    if (!ok) malos++;
    console.log(`   ${ok ? "✅" : "🔴"} ${etiqueta.padEnd(42)} ${String(real).padStart(6)}   (esperado ${esperado})`);
  }

  // El texto escrito NUNCA se toca: la simulación solo escribe `cliente_codigo`.
  console.log(`\n   ✅ el texto de las líneas no se modifica — esta simulación solo asigna cliente_codigo`);

  console.log(malos === 0 ? "\nTODO CUADRA — la migración se puede correr.\n" : `\n🔴 ${malos} chequeo(s) NO cuadran. NO corras la migración sin revisar.\n`);
  if (malos > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
