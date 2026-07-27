// ─────────────────────────────────────────────────────────────────────────────
// Verificación READ-ONLY de los campos derivados de CxP (Comprado YTD, Pagado
// YTD, Último pago). No toca Switch ni escribe nada.
//
//   npx tsx scripts/_verif-prov-ytd.ts
//
// Compara DOS cálculos sobre el MISMO `elements` guardado en
// switch_proveedor_estadocuenta:
//   A) el módulo que usa la app (src/lib/proveedores-derivados.ts)
//   B) un cálculo escrito de cero acá abajo, a propósito, para que un error en
//      el módulo no se copie a su propia verificación
// Si difieren, el script sale con código 1.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import { derivarProveedor } from "../src/lib/proveedores-derivados";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ── Cálculo B: independiente, sin importar nada del módulo ────────────────────
const money = (x: unknown) => { const v = Number(String(x ?? "").replace(/,/g, "")); return Number.isFinite(v) ? v : 0; };
const r2 = (x: number) => Math.round(x * 100) / 100;
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(new Date());
const anio = hoy.slice(0, 4);

function crudo(elements: any[]) {
  let comprado = 0, pagado = 0, nPagos = 0;
  let ult: { f: string; m: number } | null = null;
  for (const e of elements ?? []) {
    const f = String(e.fechaCreacion ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) continue;
    const doc = money(e.total) > 0 ? money(e.total) : money(e.credito) + money(e.debito);
    if (money(e.credito) > 0 && f.startsWith(anio)) comprado += doc;
    if (money(e.debito) > 0 && String(e.abrev ?? "").toUpperCase() === "PP") {
      nPagos++;
      if (f.startsWith(anio)) pagado += doc;
      if (!ult || f > ult.f) ult = { f, m: doc };
    }
  }
  const dias = ult ? Math.max(0, Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${ult.f}T00:00:00Z`)) / 86_400_000)) : null;
  return { comprado_ytd: r2(comprado), pagado_ytd: r2(pagado), num_pagos: nPagos, ultimo_pago_fecha: ult?.f ?? null, ultimo_pago_monto: ult ? r2(ult.m) : null, ultimo_pago_dias: dias };
}

async function main() {
  const { data, error, count } = await sb
    .from("switch_proveedor_estadocuenta")
    .select("empresa_key,nombre,saldo_total,elements", { count: "exact" })
    .order("id");
  if (error) throw new Error(error.message);
  if (count != null && data!.length !== count) throw new Error(`lectura truncada: ${data!.length} de ${count}`);

  let malos = 0, conCompras = 0, conPago = 0;
  console.log(`hoy (Panamá): ${hoy} · filas: ${data!.length}\n`);
  console.log("empresa".padEnd(19) + "proveedor".padEnd(36) + "compradoYTD".padStart(14) + "pagadoYTD".padStart(14) + "  últ. pago");
  for (const row of data!) {
    const a = derivarProveedor((row.elements as any[]) ?? []);
    const b = crudo((row.elements as any[]) ?? []);
    const ok = a.comprado_ytd === b.comprado_ytd && a.pagado_ytd === b.pagado_ytd
      && a.num_pagos === b.num_pagos && a.ultimo_pago_fecha === b.ultimo_pago_fecha
      && a.ultimo_pago_monto === b.ultimo_pago_monto && a.ultimo_pago_dias === b.ultimo_pago_dias;
    if (!ok) { malos++; console.log("  ✗ DIFIERE", row.empresa_key, row.nombre, JSON.stringify({ a, b })); }
    if (a.comprado_ytd !== 0) conCompras++;
    if (a.ultimo_pago_fecha) conPago++;
    if (a.comprado_ytd !== 0 || a.ultimo_pago_fecha) {
      console.log(
        row.empresa_key.padEnd(19) + String(row.nombre).slice(0, 35).padEnd(36) +
        a.comprado_ytd.toFixed(2).padStart(14) + a.pagado_ytd.toFixed(2).padStart(14) +
        (a.ultimo_pago_fecha ? `  ${a.ultimo_pago_fecha} $${a.ultimo_pago_monto} (hace ${a.ultimo_pago_dias}d)` : "  —"));
    }
  }
  console.log(`\nfilas con Comprado YTD: ${conCompras}/${data!.length} · filas con Último pago: ${conPago}/${data!.length}`);
  console.log(malos === 0 ? "✅ los dos cálculos coinciden en las 2 direcciones" : `❌ ${malos} filas difieren`);
  if (malos > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
