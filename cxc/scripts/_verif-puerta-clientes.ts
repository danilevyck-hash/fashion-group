/**
 * READ-ONLY. Antes/después de mandar los selectores por la puerta única.
 *
 * Reproduce, contra datos de producción, LAS DOS consultas: la que había
 * (propia, sin paginar, sin filtro de mundo) y la que hay (puerta única), y
 * dice exactamente qué cambia en pantalla. No escribe nada.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-puerta-clientes.ts
 */
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";
import { mundosDeClientes, soloClientesDelGrupo } from "../src/lib/clientes/mundos";

const norm = (s: string | null | undefined): string =>
  (s ?? "").toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

const TOP_N = 12;

async function main() {
  // ── ANTES: la consulta propia que tenía cheques/frecuencias ──────────────
  const { data: antesRaw } = await supabaseServer
    .from("clientes_master")
    .select("codigo, nombre, provincia")
    .eq("deleted", false);
  const antes = (antesRaw ?? []) as Array<{ codigo: string | null; nombre: string; provincia: string | null }>;

  // ── DESPUÉS: la puerta única ────────────────────────────────────────────
  const todos = await leerTodoPaginado<{ codigo: string | null; nombre: string | null; provincia: string | null }>(
    "clientes_master",
    (c, from, to) =>
      supabaseServer
        .from("clientes_master")
        .select("codigo, nombre, provincia", c ? { count: "exact" } : {})
        .eq("deleted", false)
        .order("id", { ascending: true })
        .range(from, to)
  );
  const despues = soloClientesDelGrupo(todos, await mundosDeClientes());

  console.log("=== universo del selector ===");
  console.log(`ANTES   : ${antes.length} filas (truncadas de ${todos.length}), sin filtro de mundo`);
  console.log(`DESPUÉS : ${despues.length} filas (todas), solo el grupo`);

  // ── chips de Cheques ────────────────────────────────────────────────────
  const cheques = await leerTodoPaginado<{ cliente: string | null; created_at: string | null; deleted: boolean }>(
    "cheques",
    (c, from, to) =>
      supabaseServer
        .from("cheques")
        .select("cliente, created_at, deleted", c ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(from, to)
  );
  const cuenta = new Map<string, { n: number; ultimo: string }>();
  for (const r of cheques.filter((c) => !c.deleted)) {
    const clave = norm(r.cliente);
    if (!clave) continue;
    const prev = cuenta.get(clave);
    const ultimo = r.created_at ?? "";
    if (prev) { prev.n++; if (ultimo > prev.ultimo) prev.ultimo = ultimo; }
    else cuenta.set(clave, { n: 1, ultimo });
  }
  const top = [...cuenta.entries()]
    .sort((a, b) => b[1].n - a[1].n || (a[1].ultimo < b[1].ultimo ? 1 : -1))
    .slice(0, TOP_N);

  const idx = (filas: Array<{ codigo: string | null; nombre: string | null }>) => {
    const m = new Map<string, string>();
    for (const c of filas) { const k = norm(c.nombre); if (k && c.codigo && !m.has(k)) m.set(k, c.codigo); }
    return m;
  };
  const iA = idx(antes), iD = idx(despues);

  console.log(`\n=== chips "más usados" de Cheques (top ${TOP_N} por frecuencia) ===`);
  console.log("uso  nombre                          ANTES      DESPUÉS");
  let gana = 0;
  for (const [clave, v] of top) {
    const a = iA.get(clave) ?? "—";
    const d = iD.get(clave) ?? "—";
    if (a === "—" && d !== "—") gana++;
    const marca = a !== d ? "   ← CAMBIA" : "";
    console.log(`${String(v.n).padStart(3)}  ${clave.padEnd(30)}  ${a.padEnd(10)} ${d.padEnd(10)}${marca}`);
  }
  console.log(`\nchips que ANTES no podían aparecer y ahora sí: ${gana}`);

  // ── provincias del desplegable ──────────────────────────────────────────
  const provA = [...new Set(antes.map((c) => (c.provincia ?? "").trim()).filter(Boolean))].sort();
  const provD = [...new Set(despues.map((c) => (c.provincia ?? "").trim()).filter(Boolean))].sort();
  console.log(`\n=== provincias del desplegable de /clientes ===`);
  console.log(`ANTES  : ${provA.length} → ${provA.join(", ")}`);
  console.log(`DESPUÉS: ${provD.length} → ${provD.join(", ")}`);
  const sobran = provA.filter((p) => !provD.includes(p));
  const faltan = provD.filter((p) => !provA.includes(p));
  console.log(`ofrecían lista VACÍA (ningún cliente visible): ${sobran.length ? sobran.join(", ") : "ninguna"}`);
  console.log(`clientes visibles cuya provincia NO se ofrecía: ${faltan.length ? faltan.join(", ") : "ninguna"}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
