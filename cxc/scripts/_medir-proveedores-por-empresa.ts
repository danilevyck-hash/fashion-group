#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────────────────────
// ¿LA LISTA POR EMPRESA DA LOS MISMOS NÚMEROS QUE SWITCH? — solo lectura.
//
// Corre `buildPorEmpresa` (el MISMO código de la ruta) sobre las filas reales de
// `switch_proveedor_estadocuenta` y comprueba tres cosas:
//   · el «Por pagar» de cada empresa y el total del pie,
//   · que los CUATRO tramos sumen lo mismo que los OCHO de Switch,
//   · que «Le debes − Tienes a favor» dé el «Por pagar».
//
//   npx tsx scripts/_medir-proveedores-por-empresa.ts
// ─────────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { buildPorEmpresa, type FilaCxp } from "../src/lib/proveedores/por-empresa";
import { totalDeTramos } from "../src/lib/proveedores/tramos";
import type { AmarreProveedor } from "../src/lib/proveedores/identidad";

const RAIZ = path.resolve(new URL("..", import.meta.url).pathname);
const env = fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8");
const TOKEN = (env.match(/^SUPABASE_ACCESS_TOKEN=(.*)$/m)?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
const PROYECTO = "rspocgqhtpveytgbtler";

async function sql<T>(query: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T[]>;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const filas = await sql<FilaCxp>(
    `select empresa_key, proveedor_switch_id, nombre, saldo_total, aging, ultimo_pago_fecha, ultimo_pago_dias, synced_at from switch_proveedor_estadocuenta`,
  );
  const amarres = await sql<AmarreProveedor>(
    `select empresa_key, proveedor_switch_id, proveedor_canonico, nombre_mostrado from proveedor_amarre where activo`,
  );

  const cartera = buildPorEmpresa(filas, amarres);

  console.log("EMPRESA                  POR PAGAR        0-90D        91-120D      121-365D     +1 AÑO     PROV");
  for (const e of cartera.empresas) {
    console.log(
      e.nombre.padEnd(24),
      money(e.saldo.por_pagar).padStart(14),
      money(e.tramos.t0_90).padStart(13),
      money(e.tramos.t91_120).padStart(13),
      money(e.tramos.t121_365).padStart(13),
      money(e.tramos.tMas365).padStart(13),
      String(e.proveedores.length).padStart(4),
    );
  }
  console.log("TOTAL".padEnd(24), money(cartera.total.saldo.por_pagar).padStart(14));
  console.log("Proveedores DISTINTOS con saldo:", cartera.proveedores_con_saldo);
  console.log("Actualizado:", cartera.synced_at);

  // ── Los tres cuadres ───────────────────────────────────────────────────────
  const sumaEmpresas = cartera.empresas.reduce((s, e) => s + e.saldo.por_pagar, 0);
  const sumaSwitch = filas.reduce((s, f) => s + Number(f.saldo_total), 0);
  console.log("\nCUADRES");
  console.log("  suma de las empresas = total del pie:",
    Math.abs(sumaEmpresas - cartera.total.saldo.por_pagar) < 0.005, money(sumaEmpresas));
  console.log("  total = suma de saldo_total de Switch:",
    Math.abs(sumaSwitch - cartera.total.saldo.por_pagar) < 0.005, money(sumaSwitch));
  console.log("  4 tramos = por pagar, empresa por empresa:",
    cartera.empresas.every((e) => Math.abs(totalDeTramos(e.tramos) - e.saldo.por_pagar) < 0.005));
  console.log("  le debes − a favor = por pagar:",
    cartera.empresas.every((e) => Math.abs(e.saldo.debes - e.saldo.a_favor - e.saldo.por_pagar) < 0.005));

  const fw = cartera.empresas.find((e) => e.empresa_key === "fashion_wear")!;
  console.log("\nFASHION WEAR, desplegada");
  console.log("  Le debes", money(fw.saldo.debes), "· Tienes a favor", money(fw.saldo.a_favor), "· Por pagar", money(fw.saldo.por_pagar));
  for (const p of fw.proveedores) {
    console.log("   ", p.nombre.padEnd(34), money(p.saldo.por_pagar).padStart(14),
      p.tambien_en.length ? `(también en ${p.tambien_en.join(", ")})` : "");
  }
  console.log("   sin saldo:", fw.sin_saldo.map((p) => p.nombre).join(" · "));

}

main().catch((e) => { console.error(e); process.exit(1); });
