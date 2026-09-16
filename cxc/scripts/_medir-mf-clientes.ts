// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA. Cambiar la llave del monto de NOMBRE a CÓDIGO: qué se mueve.
//
// La RPC viva `multifashion_retail_recurrentes_v2` (migración 20260619000000)
// agrupa por `REGEXP_REPLACE(TRIM(cliente), '\s+', ' ')` — el NOMBRE. La lista
// nueva agrupa por `cliente_switch_id` — el CÓDIGO. Este script mide las dos
// con la MISMA fórmula y dice quién cambia, en cuánto, y si el total cuadra.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
const env = fs.readFileSync("/Users/daniellevy/Code/fashion-group/cxc/.env.local", "utf8");
const get = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

/** La MISMA llave del RPC: TRIM + colapsa espacios. Sensible a mayúsculas. */
const cliKey = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ");
const GENERICOS = new Set(["CONTADO", "CONSUMIDOR FINAL", ""]);
const EXCLUIR = ["multi fashion holding","multifashion","multi fashion","american classic","vistana","fashion wear","fashion shoes","active shoes","active wear","joystep","joy step","confecciones boston","maher"];
const POSITIVOS = new Set(["Factura", "Tiquete", "Transacción", "Nota de Débito"]);
const firmado = (tipo: string, sub: number) =>
  POSITIVOS.has(tipo) ? sub : tipo === "Nota de Crédito" ? -sub : 0;

async function todo<T>(tabla: string, sel: string, filtra: (q: any) => any): Promise<T[]> {
  const out: T[] = []; let esperadas: number | null = null;
  for (let p = 0; p < 200; p++) {
    let q = sb.from(tabla).select(sel, p === 0 ? { count: "exact" } : {});
    q = filtra(q).order("id", { ascending: true }).range(p * 1000, p * 1000 + 999);
    const { data, error, count } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    if (p === 0) esperadas = count ?? null;
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
    if (esperadas != null && out.length >= esperadas) break;
  }
  if (esperadas == null || out.length !== esperadas) throw new Error(`${tabla}: lectura incompleta ${out.length}/${esperadas}`);
  return out;
}
const m = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const fac = await todo<any>("switch_facturas",
    "cliente_switch_id, cliente_nombre, fecha, subtotal_descuento, tipo_comprobante, is_wholesale",
    (q) => q.eq("empresa_key", "american_classic"));
  const cli = await todo<any>("switch_clientes", "cliente_switch_id, nombre",
    (q) => q.eq("empresa_key", "american_classic"));
  const fichaDe = new Map<number, string>(cli.map((c) => [c.cliente_switch_id, String(c.nombre ?? "").trim()]));

  const retail = fac.filter((f) => {
    if (f.is_wholesale !== false) return false;
    const n = String(f.cliente_nombre ?? "");
    if (!n.trim() || GENERICOS.has(n.trim().toUpperCase())) return false;
    return !EXCLUIR.some((p) => n.toLowerCase().includes(p));
  });
  console.log(`switch_facturas ACS: ${fac.length} · retail identificada no-intercompañía: ${retail.length}`);

  const porNombre = new Map<string, { total: number; tickets: number; ids: Set<number> }>();
  const porCodigo = new Map<number, { total: number; tickets: number; claves: Set<string> }>();
  for (const f of retail) {
    const k = cliKey(f.cliente_nombre);
    const v = firmado(f.tipo_comprobante, Number(f.subtotal_descuento ?? 0));
    const a = porNombre.get(k) ?? { total: 0, tickets: 0, ids: new Set<number>() };
    a.total += v; a.tickets += 1; if (f.cliente_switch_id != null) a.ids.add(f.cliente_switch_id);
    porNombre.set(k, a);
    const id = f.cliente_switch_id; if (id == null) continue;
    const b = porCodigo.get(id) ?? { total: 0, tickets: 0, claves: new Set<string>() };
    b.total += v; b.tickets += 1; b.claves.add(k);
    porCodigo.set(id, b);
  }

  const tn = [...porNombre.values()].reduce((s, a) => s + a.total, 0);
  const tc = [...porCodigo.values()].reduce((s, a) => s + a.total, 0);
  console.log("\n— EL TOTAL TIENE QUE CUADRAR —");
  console.log(`  por NOMBRE : $${m(tn)}  en ${porNombre.size} filas`);
  console.log(`  por CÓDIGO : $${m(tc)}  en ${porCodigo.size} filas`);
  console.log(`  diferencia : $${m(tn - tc)}  · retail sin código: ${retail.filter((f) => f.cliente_switch_id == null).length}`);

  console.log("\n— CASO 1: un NOMBRE que hoy suma DOS O MÁS personas —");
  const fus = [...porNombre.entries()].filter(([, a]) => a.ids.size > 1).sort((x, y) => y[1].total - x[1].total);
  console.log(`  ${fus.length} nombres, $${m(fus.reduce((s, [, a]) => s + a.total, 0))} en juego`);
  for (const [n, a] of fus.slice(0, 8)) {
    console.log(`  · "${n}" $${m(a.total)} (${a.tickets} fact.) → ${a.ids.size} códigos: ` +
      [...a.ids].map((id) => `${id}=$${m(porCodigo.get(id)!.total)}`).join(" · "));
  }
  if (fus.length > 8) console.log(`  … y ${fus.length - 8} más, todos bajo $${m(fus[8][1].total)}`);

  console.log("\n— CASO 2: una PERSONA que hoy sale PARTIDA en dos grafías —");
  const par = [...porCodigo.entries()].filter(([, b]) => b.claves.size > 1).sort((x, y) => y[1].total - x[1].total);
  console.log(`  ${par.length} códigos`);
  for (const [id, b] of par) {
    console.log(`  · ${id} (${fichaDe.get(id) ?? "sin ficha"}) $${m(b.total)} · hoy en ${b.claves.size} filas: ` +
      [...b.claves].map((k) => `"${k}"=$${m(porNombre.get(k)!.total)}`).join(" · "));
  }

  console.log("\n— CUÁNTOS CLIENTES CAMBIAN DE NÚMERO —");
  const cambios: { quien: string; hoy: number; nuevo: number }[] = [];
  for (const [id, b] of porCodigo) {
    const claves = [...b.claves];
    const hoy = claves.length === 1 ? porNombre.get(claves[0])! : null;
    const nombre = fichaDe.get(id) || claves[0] || String(id);
    if (!hoy) { cambios.push({ quien: `${nombre} (${id})`, hoy: NaN, nuevo: b.total }); continue; }
    if (hoy.ids.size > 1 || Math.abs(hoy.total - b.total) > 0.005) cambios.push({ quien: `${nombre} (${id})`, hoy: hoy.total, nuevo: b.total });
  }
  cambios.sort((a, b) => Math.abs(b.nuevo - (b.hoy || 0)) - Math.abs(a.nuevo - (a.hoy || 0)));
  console.log(`  ${cambios.length} de ${porCodigo.size} clientes cambian de número (${porCodigo.size - cambios.length} idénticos)`);
  for (const c of cambios.slice(0, 10)) console.log(`  · ${c.quien}: hoy $${Number.isNaN(c.hoy) ? "—" : m(c.hoy)} → $${m(c.nuevo)}`);
  if (cambios.length > 10) console.log(`  … y ${cambios.length - 10} más`);

  console.log("\n— MI FÓRMULA CONTRA LA RPC VIVA (top 500, todo el histórico) —");
  const { data } = await sb.rpc("multifashion_retail_recurrentes_v2", { p_fecha_inicio: "2000-01-01", p_fecha_fin: "2026-12-31", p_limit: 500 });
  const rpc = (data as any)?.clientes ?? [];
  let ok = 0; const malos: string[] = [];
  for (const r of rpc) {
    const a = porNombre.get(cliKey(r.nombre));
    const d = a ? Math.abs(a.total - Number(r.total_ytd)) : Infinity;
    if (d <= 0.01) ok++; else malos.push(`${r.nombre}: RPC $${m(Number(r.total_ytd))} vs mío ${a ? "$" + m(a.total) : "(no está)"}`);
  }
  console.log(`  reproduce ${ok} de ${rpc.length}`);
  for (const x of malos.slice(0, 10)) console.log("  ·", x);

  // ¿Cuántos clientes tienen también mayoreo? (el monto de la ficha es RETAIL)
  const idsMayoreo = new Set(fac.filter((f) => f.is_wholesale === true && f.cliente_switch_id != null).map((f) => f.cliente_switch_id));
  const ambos = [...porCodigo.keys()].filter((id) => idsMayoreo.has(id));
  console.log(`\n— MAYOREO —  códigos con factura de mayoreo: ${idsMayoreo.size} · de esos, también con retail: ${ambos.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
