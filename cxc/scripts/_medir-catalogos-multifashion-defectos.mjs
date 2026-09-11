#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// MEDICIÓN de los arreglos del 11-sep-2026 (Catálogos y Multifashion).
// Solo LECTURA contra producción (Management API). Se corre ANTES y DESPUÉS:
//
//   1. Escondidos a mano por marca (`oculto_manual = true`) y cuántas filas
//      ve el catálogo público (`active = true`). El arreglo del chip
//      «Escondidos» NO puede mover ninguno de los dos números.
//   2. Multifashion › Resumen: el año según la TARJETA (`retail.ytdVentas`,
//      los 12 meses) contra el año según la fila de «Mes a mes» (que sumaba
//      solo los meses con base del año anterior). Después del arreglo la fila
//      tiene que decir lo de la tarjeta.
//
//   node scripts/_medir-catalogos-multifashion-defectos.mjs
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

const fmt = (n) => Number(n).toLocaleString("es-PA", { style: "currency", currency: "USD" });

console.log("\n1 · ESCONDIDOS A MANO Y FILAS DEL CATÁLOGO PÚBLICO, POR MARCA\n");
const MARCAS = [["Reebok", "products"], ["Tommy", "tommy_products"], ["Calvin", "calvin_products"], ["Joybees", "joybees_products"]];
let totEsc = 0;
for (const [marca, tabla] of MARCAS) {
  const [r] = await sql(`
    select count(*) filter (where oculto_manual is true)                        as escondidos,
           count(*) filter (where oculto_manual is true and active is true)     as escondidos_activos,
           count(*) filter (where active is true)                               as publico,
           count(*) filter (where foto_manual is true)                          as fotos_protegidas
      from ${tabla}`);
  totEsc += Number(r.escondidos);
  console.log(`${marca.padEnd(9)} escondidos ${String(r.escondidos).padStart(3)} (activos: ${r.escondidos_activos}) · público ${String(r.publico).padStart(4)} filas · fotos protegidas ${r.fotos_protegidas}`);
}
console.log(`TOTAL escondidos: ${totEsc}`);

console.log("\n2 · MULTIFASHION — EL AÑO SEGÚN LA TARJETA Y SEGÚN LA FILA DE «MES A MES»\n");
for (const [anio, mes] of [[2025, 12], [2026, 9]]) {
  const [row] = await sql(`select multifashion_mensual_v7(${anio}, ${mes}) as j`);
  const j = row.j;
  const meses = j.retail.meses;
  let conBase = 0, filaVieja = 0, filaViejaPrev = 0, conDato = 0;
  for (const m of meses) {
    const tieneData = Number(m.ventas) > 0 || Number(m.tickets) > 0;
    if (!tieneData) continue;
    conDato++;
    const pct = m.vs2025;
    const vPrev = pct == null || 1 + Number(pct) === 0 ? null : Number(m.ventas) / (1 + Number(pct));
    if (vPrev != null && Number.isFinite(vPrev)) { conBase++; filaVieja += Number(m.ventas); filaViejaPrev += vPrev; }
  }
  console.log(`${anio}: tarjeta «Año» = ${fmt(j.retail.ytdVentas)} · fila vieja (solo ${conBase} de ${conDato} meses con base) = ${fmt(filaVieja)} · base ${anio - 1} sobre esos meses = ${fmt(filaViejaPrev)}`);
}
console.log();
