// SOLO LECTURA. ¿Cuántos clientes con compras reales NO se pueden encontrar en
// Ventas → Clientes, y por qué? Join por CÓDIGO (no por nombre) para no
// confundir un desalineamiento de nombres con una exclusión real.
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

const B2B = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];
const LISTA_NEGRA = ["CONFECCIONES BOSTON", "MULTI FASHION HOLDING", "MULTIFASHION", "BOSTON",
  "CONTADO", "VENTAS", "VENTAS LOCALES", "(Sin nombre)"];
const normMv = (s: string) => (s ?? "").toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
const f = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const POS = new Set(["Factura", "Tiquete", "Transacción", "Nota de Débito"]);

async function main() {
  const anio = new Date().getFullYear();
  const desde12m = new Date(Date.now() - 365 * 864e5).toISOString();

  // Universo que ve la pantalla en modo "Todas"
  const { data: agg } = await sb.from("clientes_agregado_12m_vw")
    .select("cliente_nombre, cliente_codigo, cliente_id, compras_ytd").range(0, 999);
  // La MV llega a una fila por CÓDIGO (puente switch_clientes) o por NOMBRE
  // (fallback contra clientes_master). Comparar solo por código marca como
  // ausentes filas que sí están en pantalla → hay que mirar las dos llaves.
  const codigosVisibles = new Set((agg ?? []).map(r => r.cliente_codigo).filter(c => c && c !== "—"));
  const nombresVisibles = new Set((agg ?? []).map(r => normMv(r.cliente_nombre)));
  // Buscables de verdad = las que NO caen en "Otros clientes": el buscador de la
  // pantalla filtra `!c.isOrphan` (ClientesView.tsx:259), o sea que las filas sin
  // cliente_id son inalcanzables aunque el dato exista.
  const nombresBuscables = new Set((agg ?? []).filter(r => r.cliente_id != null).map(r => normMv(r.cliente_nombre)));
  const codigosBuscables = new Set((agg ?? []).filter(r => r.cliente_id != null).map(r => r.cliente_codigo).filter(c => c && c !== "—"));
  console.log(`pantalla (modo Todas): ${agg?.length} filas · ${codigosVisibles.size} con código · ${nombresBuscables.size} alcanzables por el buscador`);

  // Todas las facturas B2B de los últimos 12 meses, agrupadas por (empresa, switch_id)
  const filas: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("switch_facturas")
      .select("empresa_key, cliente_switch_id, cliente_nombre, tipo_comprobante, total, subtotal_descuento, fecha")
      .in("empresa_key", B2B).gte("fecha", desde12m)
      .order("id", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  console.log(`switch_facturas B2B últimos 12m: ${filas.length} documentos`);

  // Puente id → codigo
  const { data: sc } = await sb.from("switch_clientes").select("empresa_key, cliente_switch_id, codigo").range(0, 4999);
  const puente = new Map((sc ?? []).map(r => [`${r.empresa_key}|${r.cliente_switch_id}`, r.codigo]));

  type Acc = { nombre: string; total: number; sd: number; n: number; codigo: string | null };
  const porCliente = new Map<string, Acc>();
  for (const r of filas) {
    const codigo = puente.get(`${r.empresa_key}|${r.cliente_switch_id}`) ?? null;
    const key = codigo ?? `~${normMv(r.cliente_nombre)}`;
    const a = porCliente.get(key) ?? { nombre: r.cliente_nombre, total: 0, sd: 0, n: 0, codigo };
    const s = POS.has(r.tipo_comprobante) ? 1 : (r.tipo_comprobante === "Nota de Crédito" ? -1 : 0);
    a.total += s * Number(r.total ?? 0);
    a.sd += s * Number(r.subtotal_descuento ?? 0);
    a.n++;
    porCliente.set(key, a);
  }
  console.log(`clientes con compras B2B en 12m: ${porCliente.size}`);

  const enPantalla = (v: Acc) =>
    !!((v.codigo && codigosVisibles.has(v.codigo)) || nombresVisibles.has(normMv(v.nombre)));
  const buscable = (v: Acc) =>
    !!((v.codigo && codigosBuscables.has(v.codigo)) || nombresBuscables.has(normMv(v.nombre)));

  const ausentes = [...porCliente.values()].filter(v => !enPantalla(v)).sort((a, b) => b.sd - a.sd);
  const noBuscables = [...porCliente.values()].filter(v => enPantalla(v) && !buscable(v)).sort((a, b) => b.sd - a.sd);

  console.log(`\n🔴 A) NO están en el dato de la pantalla: ${ausentes.length}`);
  console.log("codigo   cliente                              netas 12m      docs   motivo");
  for (const v of ausentes) {
    const motivo = LISTA_NEGRA.includes(normMv(v.nombre)) ? "LISTA NEGRA (intercompañía)" : "otro";
    console.log(`${(v.codigo ?? "—").padEnd(8)} ${normMv(v.nombre).slice(0, 34).padEnd(36)} ${f(v.sd).padStart(12)} ${String(v.n).padStart(6)}   ${motivo}`);
  }

  console.log(`\n🟠 B) están en el dato pero el BUSCADOR no los alcanza ("Otros clientes"): ${noBuscables.length}`);
  for (const v of noBuscables) {
    console.log(`${(v.codigo ?? "—").padEnd(8)} ${normMv(v.nombre).slice(0, 34).padEnd(36)} ${f(v.sd).padStart(12)} ${String(v.n).padStart(6)}`);
  }

  const invisibles = [...ausentes, ...noBuscables].map(v => [null, v] as const);
  const perdido = invisibles.reduce((s, [, v]) => s + v.sd, 0);
  const totalTodos = [...porCliente.values()].reduce((s, v) => s + v.sd, 0);
  console.log(`\nplata que no se ve: ${f(perdido)} de ${f(totalTodos)} (${(100 * perdido / totalTodos).toFixed(1)}%) en 12 meses`);

  // Frescura de la MV
  const { data: hb } = await sb.from("cron_heartbeats").select("cron_name, last_success_at")
    .in("cron_name", ["refresh-clientes-views"]);
  console.log("\nheartbeat refresh-clientes-views:", JSON.stringify(hb));
  const { data: mvMax } = await sb.from("clientes_empresa_12m_vw").select("ultima_compra")
    .order("ultima_compra", { ascending: false }).limit(1);
  const { data: sfMax } = await sb.from("switch_facturas").select("fecha")
    .in("empresa_key", B2B).order("fecha", { ascending: false }).limit(1);
  console.log(`MV ultima_compra máx: ${mvMax?.[0]?.ultima_compra} · switch_facturas máx: ${String(sfMax?.[0]?.fecha).slice(0, 10)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
