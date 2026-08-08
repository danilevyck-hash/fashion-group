/**
 * READ-ONLY. ¿Qué le falta de verdad a Guías y a Cheques para atarse por código?
 *
 * NO ESCRIBE NADA. Solo SELECT.
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-guias-cheques-codigo.ts
 */
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";
import { esCodigoDeCliente } from "../src/lib/clientes/mundos";

const N2 = (s: string | null | undefined): string =>
  (s ?? "").trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

async function main() {
  const master = await leerTodoPaginado<{ codigo: string | null; nombre_normalized: string; deleted: boolean }>(
    "clientes_master",
    (c, from, to) =>
      supabaseServer
        .from("clientes_master")
        .select("codigo, nombre_normalized, deleted", c ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(from, to)
  );
  const codigoPorNombre = new Map<string, string>();
  for (const m of master) {
    if (m.deleted || !esCodigoDeCliente(m.codigo)) continue;
    codigoPorNombre.set(m.nombre_normalized, (m.codigo ?? "").trim());
  }

  // ── GUÍAS: el cliente vive en las LÍNEAS, no en el encabezado ────────────
  const items = await leerTodoPaginado<{ guia_id: string; cliente: string | null; cliente_codigo: string | null }>(
    "guia_items",
    (c, from, to) =>
      supabaseServer
        .from("guia_items")
        .select("guia_id, cliente, cliente_codigo", c ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(from, to)
  );
  const guias = await leerTodoPaginado<{ id: string; receptor_nombre: string | null; deleted: boolean }>(
    "guia_transporte",
    (c, from, to) =>
      supabaseServer
        .from("guia_transporte")
        .select("id, receptor_nombre, deleted", c ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(from, to)
  );
  const vivas = new Set(guias.filter((g) => !g.deleted).map((g) => g.id));
  const itemsVivos = items.filter((i) => vivas.has(i.guia_id));

  const conCodigo = itemsVivos.filter((i) => (i.cliente_codigo ?? "").trim());
  const codigoNoDelGrupo = conCodigo.filter((i) => !esCodigoDeCliente(i.cliente_codigo));
  const sinCodigoConTexto = itemsVivos.filter((i) => !(i.cliente_codigo ?? "").trim() && N2(i.cliente));
  const pareables = sinCodigoConTexto.filter((i) => codigoPorNombre.has(N2(i.cliente)));

  console.log("=== GUÍAS — el cliente ya vive en guia_items.cliente_codigo (jun-2026) ===");
  console.log(`líneas de guías vivas    : ${itemsVivos.length}`);
  console.log(`YA atadas por código     : ${conCodigo.length}`);
  console.log(`  · de ellas, con código que NO es del grupo (D-XXX): ${codigoNoDelGrupo.length}`);
  if (codigoNoDelGrupo.length) {
    const muestras = [...new Set(codigoNoDelGrupo.map((i) => `${i.cliente_codigo} "${i.cliente}"`))];
    for (const m of muestras.slice(0, 10)) console.log(`      ⚠ ${m}`);
  }
  console.log(`sin código, con texto    : ${sinCodigoConTexto.length}`);
  console.log(`  · de ellas, PAREABLES inequívocamente ahora: ${pareables.length}`);
  console.log(`  · quedarían SIN atar: ${sinCodigoConTexto.length - pareables.length}`);

  const guiasConAlgo = new Set(conCodigo.map((i) => i.guia_id));
  console.log(`\nguías vivas              : ${vivas.size}`);
  console.log(`con al menos una línea atada: ${guiasConAlgo.size}`);
  console.log(`sin ninguna línea atada     : ${vivas.size - guiasConAlgo.size}`);

  const conReceptor = guias.filter((g) => !g.deleted && N2(g.receptor_nombre));
  const receptorEsCliente = conReceptor.filter((g) => codigoPorNombre.has(N2(g.receptor_nombre)));
  console.log(`\n--- receptor_nombre: ¿es el cliente? ---`);
  console.log(`guías con receptor anotado : ${conReceptor.length}`);
  console.log(`ese texto coincide con el nombre de un cliente: ${receptorEsCliente.length}`);
  console.log(`o sea que NO es el cliente en: ${conReceptor.length - receptorEsCliente.length}`);
  console.log(`muestras de receptor: ${conReceptor.slice(0, 8).map((g) => `"${g.receptor_nombre}"`).join(", ")}`);

  // ── CHEQUES: no tiene columna de código ─────────────────────────────────
  const cheques = await leerTodoPaginado<{ id: string; cliente: string | null; deleted: boolean }>(
    "cheques",
    (c, from, to) =>
      supabaseServer
        .from("cheques")
        .select("id, cliente, deleted", c ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(from, to)
  );
  const chVivos = cheques.filter((c) => !c.deleted);
  const chPareables = chVivos.filter((c) => codigoPorNombre.has(N2(c.cliente)));
  console.log(`\n=== CHEQUES — no tiene columna de código ===`);
  console.log(`cheques         : ${cheques.length}   ·   vivos: ${chVivos.length}`);
  console.log(`PAREABLES inequívocamente: ${chPareables.length}`);
  console.log(`quedarían SIN atar       : ${chVivos.length - chPareables.length}`);
  const sinPar = chVivos.filter((c) => !codigoPorNombre.has(N2(c.cliente)));
  for (const c of sinPar) console.log(`   · "${c.cliente ?? ""}"`);
  const resumen = new Map<string, number>();
  for (const c of chPareables) {
    const k = codigoPorNombre.get(N2(c.cliente))!;
    resumen.set(k, (resumen.get(k) ?? 0) + 1);
  }
  console.log(`   se atarían a: ${[...resumen].map(([k, n]) => `${k}×${n}`).join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
