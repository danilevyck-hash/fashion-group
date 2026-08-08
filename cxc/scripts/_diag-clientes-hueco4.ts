/**
 * READ-ONLY. Cuarta pasada: el truncado de `db-max-rows` en los selectores.
 *
 * `api/cheques/frecuencias` lee `clientes_master` SIN paginar y SIN `.order()`,
 * con un comentario que dice "son 149 filas vivas". Son 5.062. PostgREST corta
 * en 1.000 EN SILENCIO.
 *
 * NO ESCRIBE NADA. Solo SELECT.
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-clientes-hueco4.ts
 */
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";

const N2 = (s: string | null | undefined): string =>
  (s ?? "").trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

async function main() {
  // ── exactamente la consulta que hace cheques/frecuencias hoy ─────────────
  const { data: crudo, error } = await supabaseServer
    .from("clientes_master")
    .select("codigo, nombre")
    .eq("deleted", false);
  if (error) throw new Error(error.message);
  const truncado = (crudo ?? []) as Array<{ codigo: string | null; nombre: string }>;

  const completo = await leerTodoPaginado<{ codigo: string | null; nombre: string }>(
    "clientes_master",
    (c, from, to) =>
      supabaseServer
        .from("clientes_master")
        .select("codigo, nombre", c ? { count: "exact" } : {})
        .eq("deleted", false)
        .order("id", { ascending: true })
        .range(from, to)
  );

  console.log("=== truncado de db-max-rows en api/cheques/frecuencias ===");
  console.log(`la consulta SIN paginar devuelve: ${truncado.length} filas`);
  console.log(`la tabla realmente tiene:          ${completo.length} filas vivas`);
  console.log(`INVISIBLES para ese selector:      ${completo.length - truncado.length}`);

  const conCodigoTrunc = truncado.filter((c) => /^D-/i.test(c.codigo ?? "")).length;
  const conCodigoFull = completo.filter((c) => /^D-/i.test(c.codigo ?? "")).length;
  console.log(`\nclientes con D-XXX visibles en el truncado: ${conCodigoTrunc} de ${conCodigoFull}`);
  console.log(`→ el selector de Cheques NO puede ofrecer ${conCodigoFull - conCodigoTrunc} clientes del grupo`);

  // ¿los cheques reales se salvan?
  const cheques = await leerTodoPaginado<{ cliente: string | null; deleted: boolean }>(
    "cheques",
    (c, from, to) =>
      supabaseServer
        .from("cheques")
        .select("cliente, deleted", c ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(from, to)
  );
  const nombresTrunc = new Set(truncado.map((c) => N2(c.nombre)));
  const nombresFull = new Set(completo.map((c) => N2(c.nombre)));
  const usados = [...new Set(cheques.filter((c) => !c.deleted).map((c) => N2(c.cliente)))].filter(Boolean);
  console.log(`\nnombres distintos usados en cheques vivos: ${usados.length}`);
  for (const u of usados) {
    const t = nombresTrunc.has(u);
    const f = nombresFull.has(u);
    console.log(`   ${t ? "✓" : "✗"} truncado | ${f ? "✓" : "✗"} completo   "${u}"`);
  }

  // guia_items — mismo riesgo
  const gi = await leerTodoPaginado<{ cliente_codigo: string | null }>(
    "guia_items",
    (c, from, to) =>
      supabaseServer
        .from("guia_items")
        .select("cliente_codigo", c ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(from, to)
  );
  const { data: giTrunc } = await supabaseServer.from("guia_items").select("cliente_codigo, empresa");
  console.log(`\n=== guia_items (api/guias/frecuencias, también sin paginar) ===`);
  console.log(`sin paginar: ${(giTrunc ?? []).length}   ·   real: ${gi.length}`);
  console.log(`con cliente_codigo: ${gi.filter((g) => (g.cliente_codigo ?? "").trim()).length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
