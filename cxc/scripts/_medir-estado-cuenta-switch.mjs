// ─────────────────────────────────────────────────────────────────────────────
// EL ESTADO DE CUENTA CONTRA EL PAPEL DE SWITCH — medición, no opinión.
//
//   node scripts/_medir-estado-cuenta-switch.mjs [D-25] [fashion_wear]
//
// Lee producción (solo lectura), arma el papel con las MISMAS reglas del
// sistema y lo compara renglón por renglón contra
// `_paraclaude/ESTADO DE CUENTA City Mall Paso Canoa.pdf`, que es el papel que
// bajó Daniel de Switch el 8-sep-2026.
//
// Deja la muestra en `_paraclaude/cxc/` para que Daniel la ponga al lado del
// original.
// ─────────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const CODIGO = process.argv[2] || "D-25";
const EMPRESA = process.argv[3] || "fashion_wear";
const PROYECTO = "rspocgqhtpveytgbtler";
const RAIZ = process.cwd();

const TOKEN = fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8")
  .split("\n").find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN="))?.slice("SUPABASE_ACCESS_TOKEN=".length).trim();
if (!TOKEN) throw new Error("Falta SUPABASE_ACCESS_TOKEN en .env.local");

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const money = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── 1. Lo que el sistema tiene ───────────────────────────────────────────────
const docs = await sql(`
  select to_char(fecha_creacion,'DD-MM-YYYY') fecha, tipo_comprobante tipo, secuencial n,
         debito::numeric debito, credito::numeric credito, dias, plazo_credito::numeric plazo
  from switch_estadocuenta
  where cliente_codigo = '${CODIGO}' and empresa_key = '${EMPRESA}' and saldo <> 0
  order by fecha_creacion, ccte_id`);

let corrido = 0;
const filas = docs.map((d) => {
  corrido = Math.round((corrido + Number(d.debito) - Number(d.credito)) * 100) / 100;
  return { ...d, saldo: corrido };
});
const total = corrido;

// Los TRES tramos de la pantalla (0-90 / 91-120 / 121+), por `dias`.
const tramos = { current: 0, watch: 0, overdue: 0 };
for (const d of docs) {
  const v = Number(d.debito) - Number(d.credito);
  const k = (d.dias ?? 0) <= 90 ? "current" : (d.dias ?? 0) <= 120 ? "watch" : "overdue";
  tramos[k] += v;
}

// ── 2. Lo que dice el papel de Switch ────────────────────────────────────────
const PAPEL = path.join(RAIZ, "_paraclaude", "ESTADO DE CUENTA City Mall Paso Canoa.pdf");
let switchTexto = "";
try {
  switchTexto = execFileSync("pdftotext", ["-layout", PAPEL, "-"], { encoding: "utf8", maxBuffer: 32 << 20 });
} catch {
  console.log("⚠️  No pude leer el papel de Switch (¿está pdftotext?). Sigo con lo medido en la base.\n");
}
const totalSwitch = /Total General:\s*([\d,.]+)/.exec(switchTexto)?.[1] ?? null;
const tramosSwitch = /0-30 Dias[\s\S]*?\n\s*([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)/.exec(switchTexto);

// ── 3. El cuadre que Switch manda y se tiraba ────────────────────────────────
let saldoSwitchGuardado = null;
try {
  const r = await sql(`select saldo_total from switch_estadocuenta_saldo
                       where cliente_codigo='${CODIGO}' and empresa_key='${EMPRESA}'`);
  saldoSwitchGuardado = r?.[0]?.saldo_total ?? null;
} catch {
  saldoSwitchGuardado = "(la migración 20261023120000 todavía no corre)";
}

// ── 4. Reporte ───────────────────────────────────────────────────────────────
console.log(`\n══ ESTADO DE CUENTA ${CODIGO} · ${EMPRESA} ══\n`);
console.log("Fecha        Comprobante       N. Interno      Débitos      Créditos     Saldo         Vence        Plazo Días");
const vence = (f, p) => {
  if (!p || Number(p) <= 0) return "";
  const [dd, mm, yy] = f.split("-").map(Number);
  const d = new Date(Date.UTC(yy, mm - 1, dd));
  d.setUTCDate(d.getUTCDate() + Math.round(Number(p)));
  return `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
};
for (const f of filas) {
  console.log(
    `${f.fecha}   ${String(f.tipo).padEnd(17)} ${String(f.n).padEnd(15)} ` +
    `${money(f.debito).padStart(11)}  ${money(f.credito).padStart(11)}  ${money(f.saldo).padStart(12)}  ` +
    `${vence(f.fecha, f.plazo).padEnd(12)} ${String(Math.round(Number(f.plazo || 0))).padStart(4)} ${String(f.dias).padStart(4)}`,
  );
}
console.log(`\nDocumentos abiertos ................ ${filas.length}`);
console.log(`Tramos (los TRES de la pantalla)`);
console.log(`  0 a 90 días ...................... ${money(tramos.current)}`);
console.log(`  91 a 120 días .................... ${money(tramos.watch)}`);
console.log(`  121 días y más ................... ${money(tramos.overdue)}`);
console.log(`\nTotal General del sistema .......... ${money(total)}`);
console.log(`Total General del papel de Switch .. ${totalSwitch ?? "—"}`);
if (tramosSwitch) {
  console.log(`Los OCHO tramos de Switch .......... 0-30 ${tramosSwitch[1]} · 31-60 ${tramosSwitch[2]} · 61-90 ${tramosSwitch[3]} · 91-120 ${tramosSwitch[4]}`);
  const suma = [1, 2, 3, 4].reduce((s, i) => s + Number(tramosSwitch[i].replace(/,/g, "")), 0);
  console.log(`  (los tres primeros suman ......... ${money(suma)} = el tramo 0 a 90 días)`);
}
console.log(`Cuadre que manda Switch ............ ${saldoSwitchGuardado ?? "—"}`);

const cuadra = totalSwitch != null && Math.abs(Number(totalSwitch.replace(/,/g, "")) - total) <= 0.01;
console.log(`\n${cuadra ? "✅ CUADRA" : "❌ NO CUADRA"} contra el papel de Switch.\n`);
