/**
 * READ-ONLY. Corre el motor de sugerencias REAL sobre los textos que hoy están
 * sin atar en `guia_items`, contra el directorio REAL de clientes del grupo.
 *
 * 🔴 NO ESCRIBE NADA. Es la calibración: sirve para ver, con datos de
 *    producción, qué se le va a ofrecer a Daniel y qué va a salir como "no hay
 *    ningún cliente parecido".
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-sugerencias-guias.ts
 */
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";
import { sugerirClientes, TEXTO_AVISO } from "../src/lib/clientes/sugerencias";
import { esParejaSegura } from "../src/lib/clientes/nombre-normalizado";

interface Item { id: string; guia_id: string; cliente: string | null; cliente_codigo: string | null; deleted: boolean | null }
interface Guia { id: string; deleted: boolean | null }
interface Cli { codigo: string | null; nombre: string | null; razon_social: string | null }

async function main() {
  const items = await leerTodoPaginado<Item>("guia_items", (c, from, to) =>
    supabaseServer.from("guia_items")
      .select("id, guia_id, cliente, cliente_codigo, deleted", c ? { count: "exact" } : {})
      .order("id", { ascending: true }).range(from, to));
  const guias = await leerTodoPaginado<Guia>("guia_transporte", (c, from, to) =>
    supabaseServer.from("guia_transporte")
      .select("id, deleted", c ? { count: "exact" } : {})
      .order("id", { ascending: true }).range(from, to));
  const clientesRaw = await leerTodoPaginado<Cli>("clientes_master", (c, from, to) =>
    supabaseServer.from("clientes_master")
      .select("codigo, nombre, razon_social", c ? { count: "exact" } : {})
      .eq("deleted", false).order("id", { ascending: true }).range(from, to));

  const vivasGuia = new Set(guias.filter(g => g.deleted !== true).map(g => g.id));
  const sinAtar = items.filter(i => i.deleted !== true && vivasGuia.has(i.guia_id) && !i.cliente_codigo);

  const clientes = clientesRaw
    .filter(c => /^D-\d+$/i.test((c.codigo ?? "").trim()))
    .map(c => ({ codigo: (c.codigo ?? "").trim(), nombre: c.nombre ?? "", razon_social: c.razon_social }));

  const textos = new Map<string, { texto: string; n: number }>();
  for (const i of sinAtar) {
    const k = (i.cliente ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const e = textos.get(k) ?? { texto: (i.cliente ?? "").trim(), n: 0 };
    e.n++;
    textos.set(k, e);
  }

  let conSug = 0, sinSug = 0, lineasConSug = 0, lineasSinSug = 0;
  const huerfanos: string[] = [];
  console.log(`clientes D-XXX vivos: ${clientes.length} · textos sin atar: ${textos.size}\n`);

  for (const [, v] of [...textos.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))) {
    const sug = sugerirClientes(v.texto, clientes);
    // ⚠️ Chequeo cruzado: ningún texto sin atar debería seguir siendo una
    // "pareja segura" con algún cliente (esos los ata la migración del grupo A).
    const seguros = clientes.filter(c => esParejaSegura(v.texto, c.nombre) || esParejaSegura(v.texto, c.razon_social));
    if (sug.length) { conSug++; lineasConSug += v.n; } else { sinSug++; lineasSinSug += v.n; huerfanos.push(`${v.texto} (${v.n})`); }
    const marca = seguros.length ? `  🟢 EXACTO → ${seguros.map(s => s.codigo).join(", ")}` : "";
    console.log(`${String(v.n).padStart(3)}  ${JSON.stringify(v.texto)}${marca}`);
    if (!sug.length) console.log(`       → SIN PARECIDOS (hay que darlo de alta en Switch)`);
    for (const s of sug) {
      const av = s.avisos.map(a => TEXTO_AVISO[a]).join(" ");
      const aka = s.tambienConocidoComo ? `  [factura como: ${s.tambienConocidoComo}]` : "";
      console.log(`       → ${s.codigo.padEnd(7)} ${s.nombre}${aka}  (${s.puntaje.toFixed(2)})${av ? `   ⚠️ ${av}` : ""}`);
    }
  }

  console.log(`\n── RESUMEN ─────────────────────────────────────────────`);
  console.log(`textos con sugerencia : ${conSug}  (${lineasConSug} líneas)`);
  console.log(`textos SIN sugerencia : ${sinSug}  (${lineasSinSug} líneas)`);
  console.log(`\nHay que dar de alta en Switch:\n  ${huerfanos.join("\n  ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
