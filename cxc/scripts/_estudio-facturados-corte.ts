// Estudio (SOLO LEE, 26-nov-2026): días entre la factura (switch_facturas.fecha)
// y su PRIMERA guía (guia_transporte.fecha), con el mismo cruce que «Facturados».
// De aquí salió FACTURADOS_DIAS_HABILES.
//   npx tsx scripts/_estudio-facturados-corte.ts
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { numerosDeFacturas } from "../src/lib/guias/atajos-facturas";
import { empresasDelRenglon, EMPRESAS_DEL_GRUPO, entraEnFacturados } from "../src/lib/guias/facturados-sin-guia";
import { claveDeFactura } from "../src/lib/guias/numero-factura";

for (const l of fs.readFileSync(process.env.ENV_FILE ?? ".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function todo<T>(q: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await q(a, a + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
const diaPanama = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3600e3).toISOString().slice(0, 10);
const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
function habiles(a: string, b: string) {
  let n = 0;
  for (let d = new Date(a + "T12:00:00Z"); d.toISOString().slice(0, 10) < b; ) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}
const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)];
const BUCKETS = ["0", "1", "2", "3", "4", "5", "6", "7", "8-14", "15+"];
const bucket = (d: number) => (d <= 7 ? String(d) : d <= 14 ? "8-14" : "15+");
function resumen(nombre: string, xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return console.log(nombre, "sin datos");
  const prom = s.reduce((a, b) => a + b, 0) / s.length;
  const dist: Record<string, number> = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  for (const d of s) dist[bucket(d)]++;
  console.log(`${nombre}: n=${s.length} prom=${prom.toFixed(2)} med=${pct(s, 50)} p80=${pct(s, 80)} p90=${pct(s, 90)} p95=${pct(s, 95)} p99=${pct(s, 99)}`);
  let acum = 0;
  console.log("   " + BUCKETS.map((b) => { acum += dist[b]; return `${b}:${dist[b]}(${((acum / s.length) * 100).toFixed(1)}%)`; }).join(" "));
}

async function main() {
  const desde = process.env.DESDE ?? "2026-05-20";
  const hasta = process.env.HASTA ?? "2026-11-19"; // excluye la última semana: aún no tuvo tiempo de salir
  const guias = await todo<{ id: number; fecha: string; guia_items: Array<{ empresa: string | null; facturas: string | null; deleted: boolean | null }> | null }>((a, b) =>
    sb.from("guia_transporte").select("id, fecha, guia_items(empresa, facturas, deleted)").eq("deleted", false).gte("fecha", "2026-05-01").order("id").range(a, b));
  const fechasGuia = new Map<string, string[]>(); // empresa|clave → fechas de guía
  for (const g of guias) for (const it of g.guia_items ?? []) {
    if (it.deleted) continue;
    for (const n of numerosDeFacturas(it.facturas)) for (const k of empresasDelRenglon(it.empresa)) {
      const key = `${k}|${n}`;
      if (!fechasGuia.has(key)) fechasGuia.set(key, []);
      fechasGuia.get(key)!.push(String(g.fecha).slice(0, 10));
    }
  }
  const facts = await todo<{ empresa_key: string; secuencial: string; fecha: string; cliente_switch_id: number | null }>((a, b) =>
    sb.from("switch_facturas").select("id, empresa_key, secuencial, fecha, cliente_switch_id")
      .in("empresa_key", [...EMPRESAS_DEL_GRUPO]).eq("tipo_comprobante", "Factura")
      .gte("fecha", desde + "T05:00:00Z").lt("fecha", hasta + "T05:00:00Z").order("id").range(a, b));
  const cl = await todo<{ empresa_key: string; cliente_switch_id: number; codigo: string | null }>((a, b) =>
    sb.from("switch_clientes").select("id, empresa_key, cliente_switch_id, codigo").in("empresa_key", [...EMPRESAS_DEL_GRUPO]).order("id").range(a, b));
  const cod = new Map(cl.map((c) => [`${c.empresa_key}:${c.cliente_switch_id}`, c.codigo]));
  const todos: number[] = [], hab: number[] = [];
  const porEmp: Record<string, number[]> = {};
  let total = 0, sinGuia = 0;
  for (const f of facts) {
    const c = f.cliente_switch_id != null ? cod.get(`${f.empresa_key}:${f.cliente_switch_id}`) : null;
    if (c && !entraEnFacturados(c)) continue;
    total++;
    const dia = diaPanama(f.fecha);
    const gs = (fechasGuia.get(`${f.empresa_key}|${claveDeFactura(f.secuencial)}`) ?? []).filter((g) => g >= dia && dias(dia, g) <= 90).sort();
    if (!gs.length) { sinGuia++; continue; }
    todos.push(dias(dia, gs[0]));
    hab.push(habiles(dia, gs[0]));
    (porEmp[f.empresa_key] ??= []).push(dias(dia, gs[0]));
  }
  console.log(`facturas ${desde}..${hasta}: ${total} (sin D-108/TCKCTA); con guía: ${todos.length}; sin guía: ${sinGuia}; guías leídas ${guias.length}`);
  resumen("CALENDARIO", todos);
  resumen("HÁBILES (L-V)", hab);
  for (const [k, xs] of Object.entries(porEmp)) resumen(`  ${k}`, xs);
}
main().catch((e) => { console.error(e); process.exit(1); });
