/**
 * Diagnóstico READ-ONLY del hueco del sync de clientes_master.
 *
 * NO ESCRIBE NADA. Solo SELECT. Consultas acotadas y contadas (la base ya se
 * cayó por auditorías agresivas: acá son 7 lecturas paginadas, nada más).
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-clientes-hueco.ts
 *
 * Responde:
 *   1. ¿Cuántas filas tiene clientes_master y de qué mundo es cada una?
 *   2. ¿Qué códigos del GRUPO (6 empresas) están en switch_clientes y NO en
 *      clientes_master? — los que el sync se saltó.
 *   3. Para cada uno: ¿su nombre_normalized ya lo ocupa OTRA fila del maestro?
 *      Esa es la hipótesis del hueco (UNIQUE parcial sobre nombre_normalized
 *      contra un UPSERT que declara onConflict=codigo).
 *   4. Las 33 fichas de directorio_clientes: cuáles parean y cuáles no.
 *   5. Guías y cheques: cuántos textos libres parean inequívocamente.
 */
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";
import { EMPRESAS_DEL_GRUPO } from "../src/lib/clientes/mundos";

const N2 = (s: string | null | undefined): string =>
  (s ?? "").trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

const GRUPO = new Set<string>(EMPRESAS_DEL_GRUPO);

interface MasterRow {
  id: string;
  codigo: string | null;
  nombre: string;
  nombre_normalized: string;
  deleted: boolean;
}
interface SwitchRow {
  empresa_key: string;
  codigo: string | null;
  nombre: string | null;
}

async function main() {
  // ── 1. clientes_master ────────────────────────────────────────────────────
  const master = await leerTodoPaginado<MasterRow>("clientes_master", (c, from, to) =>
    supabaseServer
      .from("clientes_master")
      .select("id, codigo, nombre, nombre_normalized, deleted", c ? { count: "exact" } : {})
      .order("id", { ascending: true })
      .range(from, to)
  );
  const vivos = master.filter((m) => !m.deleted);
  console.log(`\n=== 1. clientes_master ===`);
  console.log(`filas totales: ${master.length}  ·  vivas (deleted=false): ${vivos.length}`);
  console.log(`con codigo D-XXX: ${vivos.filter((m) => /^D-/i.test(m.codigo ?? "")).length}`);

  // ── 2. switch_clientes ────────────────────────────────────────────────────
  const sw = await leerTodoPaginado<SwitchRow>("switch_clientes", (c, from, to) =>
    supabaseServer
      .from("switch_clientes")
      .select("empresa_key, codigo, nombre", c ? { count: "exact" } : {})
      .order("id", { ascending: true })
      .range(from, to)
  );
  console.log(`\n=== 2. switch_clientes ===`);
  console.log(`filas: ${sw.length}`);

  const porCodigoGrupo = new Map<string, { nombre: string; empresas: Set<string> }>();
  const porCodigoOtros = new Map<string, { nombre: string; empresas: Set<string> }>();
  for (const r of sw) {
    const cod = (r.codigo ?? "").trim();
    if (!cod) continue;
    const dest = GRUPO.has(r.empresa_key) ? porCodigoGrupo : porCodigoOtros;
    const cur = dest.get(cod) ?? { nombre: (r.nombre ?? "").trim(), empresas: new Set<string>() };
    cur.empresas.add(r.empresa_key);
    if (!cur.nombre) cur.nombre = (r.nombre ?? "").trim();
    dest.set(cod, cur);
  }
  console.log(`códigos únicos del GRUPO (6 empresas): ${porCodigoGrupo.size}`);
  console.log(`códigos únicos fuera del grupo: ${porCodigoOtros.size}`);

  // ── 3. el hueco ───────────────────────────────────────────────────────────
  const masterPorCodigo = new Map<string, MasterRow>();
  const masterPorNombre = new Map<string, MasterRow>();
  for (const m of vivos) {
    if (m.codigo) masterPorCodigo.set(m.codigo.trim(), m);
    masterPorNombre.set(m.nombre_normalized, m);
  }

  const faltantes: Array<{ cod: string; nombre: string; empresas: string[]; choque: MasterRow | null }> = [];
  for (const [cod, info] of porCodigoGrupo) {
    if (masterPorCodigo.has(cod)) continue;
    const n2 = N2(info.nombre);
    faltantes.push({
      cod,
      nombre: info.nombre,
      empresas: [...info.empresas].sort(),
      choque: masterPorNombre.get(n2) ?? null,
    });
  }
  console.log(`\n=== 3. EL HUECO — códigos del grupo en Switch que NO están en clientes_master ===`);
  console.log(`total faltantes: ${faltantes.length}`);
  for (const f of faltantes) {
    const ch = f.choque
      ? `  ⛔ CHOQUE nombre_normalized con codigo=${f.choque.codigo ?? "(null)"} "${f.choque.nombre}"`
      : `  (sin choque de nombre — otra causa)`;
    console.log(`  ${f.cod.padEnd(8)} ${f.nombre.padEnd(40)} [${f.empresas.join(", ")}]`);
    console.log(`           ${ch}`);
  }

  // ── 4. directorio_clientes ────────────────────────────────────────────────
  const dir = await leerTodoPaginado<{ id: string; nombre: string; empresa: string | null; telefono: string | null; celular: string | null; whatsapp: string | null; correo: string | null; contacto: string | null; notas: string | null; deleted: boolean }>(
    "directorio_clientes",
    (c, from, to) =>
      supabaseServer
        .from("directorio_clientes")
        .select("id, nombre, empresa, telefono, celular, whatsapp, correo, contacto, notas, deleted", c ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(from, to)
  );
  const dirVivos = dir.filter((d) => !d.deleted);
  console.log(`\n=== 4. directorio_clientes ===`);
  console.log(`filas: ${dir.length}  ·  vivas: ${dirVivos.length}`);
  const sinPar: typeof dirVivos = [];
  for (const d of dirVivos) {
    const m = masterPorNombre.get(N2(d.nombre));
    if (!m || !m.codigo) sinPar.push(d);
  }
  console.log(`parean por nombre con un cliente del maestro (con código): ${dirVivos.length - sinPar.length}`);
  console.log(`NO parean: ${sinPar.length}`);
  for (const d of sinPar) {
    const datos = [
      d.telefono && `tel ${d.telefono}`,
      d.celular && `cel ${d.celular}`,
      d.whatsapp && `wa ${d.whatsapp}`,
      d.correo && `mail ${d.correo}`,
      d.contacto && `contacto ${d.contacto}`,
      d.notas && `notas(${d.notas.length}c)`,
    ].filter(Boolean);
    console.log(`  · "${d.nombre}" [${d.empresa ?? "sin empresa"}]  ${datos.join(" · ") || "(sin datos de contacto)"}`);
  }

  // ── 5. guías y cheques ────────────────────────────────────────────────────
  const guias = await leerTodoPaginado<{ id: string; receptor_nombre: string | null; deleted: boolean }>(
    "guia_transporte",
    (c, from, to) =>
      supabaseServer
        .from("guia_transporte")
        .select("id, receptor_nombre, deleted", c ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(from, to)
  );
  const cheques = await leerTodoPaginado<{ id: string; cliente: string | null; deleted: boolean }>(
    "cheques",
    (c, from, to) =>
      supabaseServer
        .from("cheques")
        .select("id, cliente, deleted", c ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(from, to)
  );

  const pareo = (txt: string | null): string | null => {
    const n2 = N2(txt);
    if (!n2) return null;
    const m = masterPorNombre.get(n2);
    return m?.codigo ?? null;
  };

  const gVivas = guias.filter((g) => !g.deleted);
  const gCon = gVivas.filter((g) => pareo(g.receptor_nombre));
  const gSinTexto = gVivas.filter((g) => !N2(g.receptor_nombre));
  console.log(`\n=== 5. guia_transporte ===`);
  console.log(`filas: ${guias.length}  ·  vivas: ${gVivas.length}`);
  console.log(`parean inequívocamente por nombre: ${gCon.length}`);
  console.log(`sin texto de receptor: ${gSinTexto.length}`);
  console.log(`quedarían SIN atar: ${gVivas.length - gCon.length}`);

  const cVivos = cheques.filter((c) => !c.deleted);
  const cCon = cVivos.filter((c) => pareo(c.cliente));
  console.log(`\n=== 5b. cheques ===`);
  console.log(`filas: ${cheques.length}  ·  vivos: ${cVivos.length}`);
  console.log(`parean inequívocamente por nombre: ${cCon.length}`);
  console.log(`quedarían SIN atar: ${cVivos.length - cCon.length}`);
  for (const c of cVivos) {
    console.log(`  · "${c.cliente ?? ""}" → ${pareo(c.cliente) ?? "SIN PAREO"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
