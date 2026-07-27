// SOLO LECTURA. ¿Por qué "Multi Fashion Holding" (D-108) no aparece en
// Ventas → Clientes? Mide las 3 hipótesis: lista negra de intercompañía,
// top-N antes de la búsqueda, y huérfano sin código maestro.
import fs from "node:fs";
function cargarEnv() {
  for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
    if (!l.includes("=") || l.trim().startsWith("#")) continue;
    const i = l.indexOf("=");
    process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
  }
}
cargarEnv();
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function todo(tabla: string, sel: string, filtro?: (q: any) => any) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(tabla).select(sel).order("cliente_nombre", { ascending: true }).range(from, from + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function main() {
  // 1. ¿Cómo se llama exactamente en switch_facturas?
  const { data: nombres } = await sb.from("switch_facturas")
    .select("cliente_nombre, empresa_key, fecha")
    .ilike("cliente_nombre", "%multi%fashion%").order("fecha", { ascending: false }).limit(20);
  const distintos = [...new Set((nombres ?? []).map(r => r.cliente_nombre))];
  console.log("1) nombres en switch_facturas:", JSON.stringify(distintos));
  console.log("   ultimas fechas:", (nombres ?? []).slice(0, 6).map(r => `${r.empresa_key} ${String(r.fecha).slice(0, 10)}`));

  // El normalizado que usa la MV: UPPER + quitar . y , + colapsar espacios
  for (const n of distintos) {
    const norm = (n ?? "").toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
    const listaNegra = ["CONFECCIONES BOSTON", "MULTI FASHION HOLDING", "MULTIFASHION", "BOSTON", "CONTADO", "VENTAS", "VENTAS LOCALES", "(Sin nombre)"];
    console.log(`   "${n}" → norm "${norm}" → ${listaNegra.includes(norm) ? "🔴 EN LA LISTA NEGRA" : "pasa el filtro"}`);
  }

  // 2. ¿Está en las vistas que alimentan Ventas → Clientes?
  for (const vista of ["clientes_agregado_12m_vw", "clientes_empresa_12m_vw"]) {
    const { data, error } = await sb.from(vista).select("*").ilike("cliente_nombre", "%FASHION HOLDING%");
    console.log(`2) ${vista}: ${error ? "ERR " + error.message : `${data?.length ?? 0} filas para Multi Fashion Holding`}`);
  }

  // 3. Tamaño real de las vistas + cuántos clientes ve la pantalla (modo "Todas")
  const agg = await todo("clientes_agregado_12m_vw", "cliente_nombre, cliente_id, ultima_compra");
  console.log(`3) clientes_agregado_12m_vw (modo "Todas"): ${agg.length} filas · huérfanos (sin cliente_id): ${agg.filter(r => r.cliente_id == null).length}`);

  // 4. ¿Cuántos clientes de clientes_master NO aparecen en esa vista? (invisibles en Ventas)
  const { data: master } = await sb.from("clientes_master")
    .select("codigo, nombre").eq("deleted", false).range(0, 999);
  const enVista = new Set(agg.map(r => (r.cliente_nombre ?? "").toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim()));
  const invisibles = (master ?? []).filter(c =>
    !enVista.has((c.nombre ?? "").toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim()));
  console.log(`4) clientes_master vivos: ${master?.length} · NO aparecen en la vista de Ventas: ${invisibles.length}`);
  console.log("   ejemplos:", invisibles.slice(0, 12).map(c => `${c.codigo} ${c.nombre}`));

  // 5. ¿Alguno de los invisibles compró en los últimos 12 meses? (o sea: se pierde plata real)
  const B2B = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];
  const desde = new Date(Date.now() - 365 * 864e5).toISOString();
  const conCompras: string[] = [];
  for (const c of invisibles) {
    const { data: pares } = await sb.from("switch_clientes").select("empresa_key, cliente_switch_id").eq("codigo", c.codigo);
    const cids = [...new Set((pares ?? []).map(p => p.cliente_switch_id).filter(Boolean))] as number[];
    if (!cids.length) continue;
    const { count } = await sb.from("switch_facturas").select("id", { count: "exact", head: true })
      .in("cliente_switch_id", cids).in("empresa_key", B2B).gte("fecha", desde);
    if ((count ?? 0) > 0) conCompras.push(`${c.codigo} ${c.nombre} (${count} docs 12m)`);
  }
  console.log(`5) invisibles CON compras en 12 meses: ${conCompras.length}`);
  conCompras.forEach(s => console.log("   ·", s));
}

main().catch(e => { console.error(e); process.exit(1); });
