// SOLO LECTURA. LA PREGUNTA DE DANIEL: si Multi Fashion Holding vuelve a
// aparecer en el ranking de clientes, ¿se mueven las ventas totales?
//
// Se contesta comparando, para CADA fuente que muestra plata, lo que dice hoy
// contra la suma cruda de switch_facturas CON y SIN Multi Fashion Holding.
// Si una fuente ya coincide con la suma CON MFH, entonces MFH ya está adentro y
// mostrarlo en el ranking no mueve ese total ni un centavo.
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
const POS = new Set(["Factura", "Tiquete", "Transacción", "Nota de Débito"]);
const f = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const normMv = (s: string) => (s ?? "").toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
const INTERNOS = ["CONFECCIONES BOSTON", "MULTI FASHION HOLDING", "MULTIFASHION", "BOSTON"];
const GENERICOS = ["CONTADO", "VENTAS", "VENTAS LOCALES", "(Sin nombre)"];

async function main() {
  const anio = new Date().getFullYear();
  const desde = `${anio}-01-01T05:00:00Z`;
  const hasta = `${anio + 1}-01-01T05:00:00Z`;

  // ── Base cruda: todas las facturas B2B del año ─────────────────────────────
  const filas: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("switch_facturas")
      .select("empresa_key, cliente_nombre, tipo_comprobante, total, subtotal_descuento")
      .in("empresa_key", B2B).gte("fecha", desde).lt("fecha", hasta)
      .order("id", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const signo = (r: any) => POS.has(r.tipo_comprobante) ? 1 : (r.tipo_comprobante === "Nota de Crédito" ? -1 : 0);
  const esMfh = (r: any) => normMv(r.cliente_nombre).includes("MULTI FASHION HOLDING")
    || normMv(r.cliente_nombre) === "MULTIFASHION";

  const acum = new Map<string, { conMfh: number; sinMfh: number; mfh: number; mfhTotal: number }>();
  for (const r of filas) {
    const a = acum.get(r.empresa_key) ?? { conMfh: 0, sinMfh: 0, mfh: 0, mfhTotal: 0 };
    const sd = signo(r) * Number(r.subtotal_descuento ?? 0);
    a.conMfh += sd;
    if (esMfh(r)) { a.mfh += sd; a.mfhTotal += signo(r) * Number(r.total ?? 0); }
    else a.sinMfh += sd;
    acum.set(r.empresa_key, a);
  }

  console.log(`═══ Base cruda switch_facturas ${anio}, SIN ITBMS (subtotal_descuento) ═══`);
  console.log("empresa              CON Multi Fashion       SIN            aporte MFH");
  let tConMfh = 0, tSinMfh = 0, tMfh = 0, tMfhConItbms = 0;
  for (const e of B2B) {
    const a = acum.get(e) ?? { conMfh: 0, sinMfh: 0, mfh: 0, mfhTotal: 0 };
    tConMfh += a.conMfh; tSinMfh += a.sinMfh; tMfh += a.mfh; tMfhConItbms += a.mfhTotal;
    console.log(`${e.padEnd(20)} ${f(a.conMfh).padStart(16)} ${f(a.sinMfh).padStart(16)} ${f(a.mfh).padStart(14)}`);
  }
  console.log(`${"GRUPO B2B".padEnd(20)} ${f(tConMfh).padStart(16)} ${f(tSinMfh).padStart(16)} ${f(tMfh).padStart(14)}`);
  console.log(`\nMulti Fashion Holding ${anio}: ${f(tMfh)} sin ITBMS · ${f(tMfhConItbms)} con ITBMS\n`);

  // ── ¿Qué dice cada fuente que muestra plata? ───────────────────────────────
  console.log("═══ Lo que muestra cada pantalla hoy ═══");

  // 1. Tabla mensual / dashboard de /ventas
  const { data: dash, error: dashErr } = await sb.rpc("ventas_dashboard_summary", { p_anio: anio });
  if (dashErr) console.log("ventas_dashboard_summary → ERROR", dashErr.message);
  else {
    const filasDash = (dash ?? []) as any[];
    console.log("ventas_dashboard_summary columnas:", Object.keys(filasDash[0] ?? {}).join(", "));
    const porEmp = new Map<string, number>();
    for (const r of filasDash) {
      const k = r.empresa ?? r.empresa_key ?? "?";
      const v = Number(r.total_subtotal ?? r.subtotal ?? r.ventas ?? 0);
      porEmp.set(k, (porEmp.get(k) ?? 0) + v);
    }
    let sumaB2B = 0;
    for (const e of B2B) sumaB2B += porEmp.get(e) ?? 0;
    console.log(`  suma B2B en pantalla: ${f(sumaB2B)}`);
    console.log(`  ¿coincide con CON-MFH (${f(tConMfh)})? ${Math.abs(sumaB2B - tConMfh) < 1 ? "✅ SÍ → MFH YA está en los totales" : "no"}`);
    console.log(`  ¿coincide con SIN-MFH (${f(tSinMfh)})? ${Math.abs(sumaB2B - tSinMfh) < 1 ? "🔴 SÍ → MFH está ELIMINADO de los totales" : "no"}`);
  }

  // 2. Rollup mensual (la tabla mes a mes)
  const { data: roll, error: rollErr } = await sb.from("ventas_rollup_mensual_mv")
    .select("*").gte("anio", anio).lte("anio", anio).range(0, 999);
  if (rollErr) console.log("\nventas_rollup_mensual_mv → ERROR", rollErr.message);
  else {
    const r0 = (roll ?? [])[0] as any;
    console.log("\nventas_rollup_mensual_mv columnas:", Object.keys(r0 ?? {}).join(", "));
    const campo = ["ventas_netas", "total_subtotal", "subtotal", "ventas", "monto"].find(c => r0 && c in r0);
    let suma = 0;
    for (const r of (roll ?? []) as any[]) {
      if (!B2B.includes(r.empresa ?? r.empresa_key)) continue;
      suma += Number(r[campo!] ?? 0);
    }
    console.log(`  suma B2B ${anio}: ${f(suma)} (campo "${campo}")`);
    console.log(`  ¿coincide con CON-MFH? ${Math.abs(suma - tConMfh) < 1 ? "✅ SÍ → MFH YA está en los totales" : "no"}`);
    console.log(`  ¿coincide con SIN-MFH? ${Math.abs(suma - tSinMfh) < 1 ? "🔴 SÍ → eliminado" : "no"}`);
  }

  // 3. El ranking de clientes (lo único que hoy lo excluye)
  const { data: agg } = await sb.from("clientes_agregado_12m_vw").select("compras_ytd").range(0, 999);
  const sumaRanking = (agg ?? []).reduce((s, r: any) => s + Number(r.compras_ytd ?? 0), 0);
  console.log(`\nclientes_agregado_12m_vw (ranking de clientes): ${f(sumaRanking)}`);
  console.log(`  contra CON-MFH ${f(tConMfh)} → faltan ${f(tConMfh - sumaRanking)}`);

  // 4. ¿Quién más está en la lista negra y cuánto pesa?
  console.log(`\n═══ Los otros excluidos de la MISMA lista, ${anio} sin ITBMS ═══`);
  const porInterno = new Map<string, number>();
  for (const r of filas) {
    const n = normMv(r.cliente_nombre);
    if (INTERNOS.includes(n) || GENERICOS.includes(n)) {
      porInterno.set(n, (porInterno.get(n) ?? 0) + signo(r) * Number(r.subtotal_descuento ?? 0));
    }
  }
  for (const [n, v] of [...porInterno.entries()].sort((a, b) => b[1] - a[1])) {
    const tipo = INTERNOS.includes(n) ? "empresa del grupo" : "genérico (mostrador)";
    console.log(`  ${n.padEnd(24)} ${f(v).padStart(14)}   ${tipo}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
