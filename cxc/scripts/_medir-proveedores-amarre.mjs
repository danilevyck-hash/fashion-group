#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ¿CUÁNTO CAMBIA LA LISTA DE PROVEEDORES AL AMARRAR? — antes vs después.
//
// Lee producción de SOLO LECTURA (Management API) y compara la agrupación de
// HOY (por nombre normalizado) contra la que deja `proveedor_amarre` con los
// CUATRO grupos que Daniel confirmó. Lo que tiene que salir:
//   · la lista encoge,
//   · el TOTAL no se mueve ni un centavo,
//   · Confecciones Boston queda en UNA fila con sus 5 empresas.
//
//   node scripts/_medir-proveedores-amarre.mjs
// ─────────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(new URL("..", import.meta.url).pathname);
const env = fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8");
const TOKEN = (env.match(/^SUPABASE_ACCESS_TOKEN=(.*)$/m)?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
if (!TOKEN) throw new Error("falta SUPABASE_ACCESS_TOKEN en .env.local");
const PROYECTO = "rspocgqhtpveytgbtler";

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const norm = (s) => (s ?? "").trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
const money = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Los CUATRO grupos de la migración 20261009120000, misma llave (empresa#id).
const AMARRE = new Map(Object.entries({
  "american_classic#11": "ACTIVE WEAR SA",
  "active_shoes#9": "ACTIVE WEAR SA",
  "active_shoes#8": "GRUPO J NAVARRO",
  "vistana#10": "GRUPO J NAVARRO",
  "joystep#3": "CONFECCIONES BOSTON",
  "vistana#9": "CONFECCIONES BOSTON",
  "fashion_wear#13": "CONFECCIONES BOSTON",
  "american_classic#21": "CONFECCIONES BOSTON",
  "active_shoes#4": "CONFECCIONES BOSTON",
  "active_shoes#2": "LATIN FITNESS GROUP",
  "active_wear#3": "LATIN FITNESS GROUP",
  "vistana#5": "LATIN FITNESS GROUP",
  "american_classic#10": "LATIN FITNESS GROUP",
}));

function agrupar(filas, conAmarre) {
  const m = new Map();
  for (const f of filas) {
    const clave = (conAmarre && AMARRE.get(`${f.empresa_key}#${f.proveedor_switch_id}`)) || norm(f.nombre);
    if (!m.has(clave)) m.set(clave, { saldo: 0, empresas: new Set(), filas: 0 });
    const g = m.get(clave);
    g.saldo = Math.round((g.saldo + Number(f.saldo_total)) * 100) / 100;
    g.empresas.add(f.empresa_key);
    g.filas += 1;
  }
  return m;
}

const filas = await sql(
  "select empresa_key, proveedor_switch_id, codigo, nombre, identificacion, saldo_total from switch_proveedor_estadocuenta"
);

const antes = agrupar(filas, false);
const despues = agrupar(filas, true);
const total = (m) => Math.round([...m.values()].reduce((s, g) => s + g.saldo, 0) * 100) / 100;
const conSaldo = (m) => [...m.values()].filter((g) => Math.abs(g.saldo) >= 0.005).length;

console.log("── LA LISTA ────────────────────────────────────────────────────");
console.log(`filas de la tabla        ${filas.length}`);
console.log(`filas de la lista ANTES  ${antes.size}   (con saldo ${conSaldo(antes)})`);
console.log(`filas de la lista DESPUÉS ${despues.size}   (con saldo ${conSaldo(despues)})`);
console.log("");
console.log("── EL TOTAL (no se puede mover) ────────────────────────────────");
console.log(`antes    ${money(total(antes))}`);
console.log(`después  ${money(total(despues))}`);
console.log(total(antes) === total(despues) ? "✅ intacto" : "🔴 SE MOVIÓ — parar todo");
console.log("");
console.log("── LOS CUATRO GRUPOS ───────────────────────────────────────────");
for (const clave of ["ACTIVE WEAR SA", "GRUPO J NAVARRO", "CONFECCIONES BOSTON", "LATIN FITNESS GROUP"]) {
  const partes = [...antes.entries()].filter(([k]) => k.startsWith(clave.split(" ").slice(0, 2).join(" ")));
  const d = despues.get(clave);
  console.log(
    `${clave.padEnd(22)} antes ${String(partes.length).padStart(2)} fila(s) → después 1 · ` +
    `${money(d.saldo).padStart(14)} · ${d.empresas.size} empresa(s) · ${d.filas} fila(s) de Switch`
  );
}
console.log("");
console.log("── LO QUE **NO** SE JUNTÓ, aunque comparte cédula ──────────────");
const porCedula = new Map();
for (const f of filas) {
  const c = (f.identificacion ?? "").trim();
  if (!c) continue;
  if (!porCedula.has(c)) porCedula.set(c, new Set());
  porCedula.get(c).add(norm(f.nombre));
}
for (const [c, nombres] of porCedula) {
  if (nombres.size > 1) console.log(`${c.padEnd(20)} ${[...nombres].join(" | ")}`);
}
