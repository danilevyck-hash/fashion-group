#!/usr/bin/env node
/**
 * MEDICIÓN DE CAJA MENUDA — antes y después del rediseño (7-sep-2026).
 *
 * 🔴 Lo que este script tiene que dar IGUAL antes y después: los 77 gastos
 * vivos suman $563.28 y los 3 períodos conservan su saldo. Este rediseño
 * reordena la pantalla y quita caminos muertos; NO mueve un centavo.
 *
 * Además mide, con el módulo REAL, a cuántos de los 77 les sonaría el aviso de
 * «gasto repetido» — el criterio no se elige de memoria, se mide.
 *
 * Uso:  node scripts/_medir-caja-rediseno.mjs
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(new URL("..", import.meta.url).pathname);
const env = fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8");
const TOKEN = /^SUPABASE_ACCESS_TOKEN=(.*)$/m.exec(env)?.[1]?.trim();
const PROYECTO = "rspocgqhtpveytgbtler";

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (!Array.isArray(json)) throw new Error(JSON.stringify(json));
  return json;
}

// ── Los módulos reales, no una copia de la regla ─────────────────────────────
const { centavos, saldoDelPeriodo, reposicionDelPeriodo } = await import("../src/lib/caja/dinero.ts");
const { buscarGastoRepetido, mensajeGastoRepetido } = await import("../src/lib/caja/gasto-repetido.ts");
const { fechaFueraDelPeriodo } = await import("../src/lib/caja/fecha-en-periodo.ts");

const gastos = await sql(`
  select id, periodo_id, fecha, proveedor, nro_factura, total, categoria, responsable, responsable_id,
         empresa, factura, ruc, dv, created_at
  from caja_gastos where coalesce(deleted,false) = false order by created_at
`);
const periodos = await sql(`
  select id, numero, fecha_apertura, fecha_cierre, fondo_inicial, estado, saldo_cierre
  from caja_periodos where coalesce(deleted,false) = false order by numero
`);

console.log("\n══ LA PLATA (tiene que dar igual antes y después) ══");
console.log(`Gastos vivos:            ${gastos.length}`);
const total = centavos(gastos.reduce((s, g) => s + centavos(g.total), 0));
console.log(`Total gastado:           $${total.toFixed(2)}`);

console.log("\nPeríodo │ Recibos │   Fondo │  Gastado │    Saldo │ A reponer");
for (const p of periodos) {
  const suyos = gastos.filter((g) => g.periodo_id === p.id);
  const gastado = centavos(suyos.reduce((s, g) => s + centavos(g.total), 0));
  const saldo = saldoDelPeriodo(p.fondo_inicial, suyos);
  const rep = reposicionDelPeriodo(p.fondo_inicial, suyos);
  console.log(
    `   Nº ${String(p.numero).padEnd(3)} │ ${String(suyos.length).padStart(7)} │ ` +
    `${("$" + centavos(p.fondo_inicial).toFixed(2)).padStart(7)} │ ${("$" + gastado.toFixed(2)).padStart(8)} │ ` +
    `${("$" + saldo.toFixed(2)).padStart(8)} │ ${("$" + rep.toFixed(2)).padStart(9)}`,
  );
}

// 🩸 El defecto del punto flotante, medido tal cual salía en pantalla.
console.log("\n══ EL SALDO EN ROJO POR NADA (defecto del punto flotante) ══");
// El orden importa: la pantalla suma en el orden en que dibuja (fecha, luego
// created_at), que es el que devuelve la ruta del período.
const porPantalla = (a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.created_at).localeCompare(String(b.created_at));
for (const p of periodos) {
  const suyos = gastos.filter((g) => g.periodo_id === p.id).sort(porPantalla);
  const crudo = suyos.reduce((s, g) => s + Number(g.total), 0);
  const saldoCrudo = Number(p.fondo_inicial) - crudo;
  const saldoBueno = saldoDelPeriodo(p.fondo_inicial, suyos);
  const rojoAntes = saldoCrudo < 0;
  const rojoAhora = saldoBueno < 0;
  console.log(
    `Nº ${p.numero}: suma cruda ${crudo} · saldo crudo ${saldoCrudo} → ` +
    `${rojoAntes ? "ROJO" : "ok"} antes / ${rojoAhora ? "ROJO" : "ok"} ahora`,
  );
}

console.log("\n══ AVISO DE GASTO REPETIDO (criterio medido, no supuesto) ══");
let avisos = 0;
for (let i = 0; i < gastos.length; i++) {
  const anteriores = gastos.slice(0, i).filter((g) => g.periodo_id === gastos[i].periodo_id);
  const repetido = buscarGastoRepetido(gastos[i], anteriores);
  if (repetido) {
    avisos++;
    console.log(`  ⚠ ${mensajeGastoRepetido(repetido)}`);
  }
}
console.log(`Total de avisos sobre los ${gastos.length} recibos: ${avisos}`);
const marketFresh = gastos.filter((g) => (g.proveedor || "").toLowerCase().startsWith("market fres") && g.fecha === "2026-07-09");
console.log(`CONTROL — Market Fresh 9-jul (${marketFresh.length} recibos reales de $5 y $2.78): ` +
  `${marketFresh.filter((g, i) => buscarGastoRepetido(g, marketFresh.slice(0, i))).length} avisos (tiene que ser 0)`);

console.log("\n══ RECIBOS CON FECHA FUERA DE SU PERÍODO ══");
for (const p of periodos) {
  const suyos = gastos.filter((g) => g.periodo_id === p.id);
  const fuera = suyos.filter((g) => fechaFueraDelPeriodo(g.fecha, p));
  console.log(`Nº ${p.numero}: ${fuera.length} de ${suyos.length} fuera (más viejo: ${suyos.map((g) => g.fecha).sort()[0]})`);
}

console.log("\n══ LO QUE SE RETIRA (medido) ══");
const cuenta = (f) => gastos.filter(f).length;
console.log(`empresa con dato:        ${cuenta((g) => (g.empresa || "").trim())} de ${gastos.length}`);
console.log(`factura (vieja):         ${cuenta((g) => (g.factura || "").trim())} de ${gastos.length}`);
console.log(`ruc:                     ${cuenta((g) => (g.ruc || "").trim())} de ${gastos.length}`);
console.log(`dv:                      ${cuenta((g) => (g.dv || "").trim())} de ${gastos.length}`);
const formas = [...new Set(gastos.map((g) => g.responsable))];
console.log(`escrituras del nombre:   ${formas.length} → ${formas.map((f) => `«${f}»`).join(" · ")}`);
console.log(`identificadores usados:  ${[...new Set(gastos.map((g) => g.responsable_id))].length}`);
console.log(`sin nro_factura:         ${cuenta((g) => !(g.nro_factura || "").trim())} de ${gastos.length}`);

console.log("\n══ CATEGORÍAS ══");
const porCat = {};
for (const g of gastos) porCat[g.categoria || "—"] = (porCat[g.categoria || "—"] || 0) + 1;
for (const [c, n] of Object.entries(porCat).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.padEnd(16)} ${String(n).padStart(3)}  ${((n / gastos.length) * 100).toFixed(0)}%`);
}
console.log("");
