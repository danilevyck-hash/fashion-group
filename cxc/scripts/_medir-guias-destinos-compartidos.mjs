#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// LA LISTA DE DESTINOS COMPARTIDA — la medición que la sostiene (7-sep-2026).
//
// Lee producción de SOLO LECTURA (Management API) y contesta tres cosas:
//
//   A. 🔴 LO QUE SE GUARDA EN UNA GUÍA NO CAMBIA. Guías vivas · renglones ·
//      bultos. Este cambio toca lo que la pantalla OFRECE, jamás lo guardado:
//      los tres números tienen que dar igual antes y después.
//
//   B. LA SEMILLA de `guias_destino_lista`: los destinos que de verdad se usan,
//      agrupados por `claveDestino` (regla exacta, jamás por parecido), con la
//      grafía MÁS USADA — salvo cuando Daniel ya definió esa grafía en
//      `guias_destino_cliente`, donde manda la suya. Entran los de 3+ usos.
//      🔴 De acá sale la semilla, NUNCA del `localStorage` de nadie: por eso
//      «hola» (el destino de prueba que quedó vivo en un navegador) no aparece.
//
//   C. Cuánto cubre esa semilla: qué porcentaje de los renglones vivos usa uno
//      de los destinos sembrados.
//
//   node scripts/_medir-guias-destinos-compartidos.mjs
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

/** Espejo EXACTO de `claveDestino` (src/lib/guias/destinos-clientes.ts). */
function claveDestino(s) {
  const crudo = String(s ?? "").trim();
  const letras = crudo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "")
    .replace(/s$/, "");
  const digitos = (crudo.match(/\d+/g) ?? []).map((d) => String(Number(d))).join("|");
  return `${letras}#${digitos}`;
}

/** Cuántas veces hay que haber usado un destino para que entre a la lista. */
const MINIMO_USOS = 3;

const VIVOS = `
  FROM guia_items gi
  JOIN guia_transporte g ON g.id = gi.guia_id
  WHERE gi.deleted IS NOT TRUE AND g.deleted IS NOT TRUE`;

// ── A · lo que se guarda en una guía ────────────────────────────────────────
const [totales] = await sql(`
  SELECT
    (SELECT count(*) FROM guia_transporte WHERE deleted IS NOT TRUE)   AS guias_vivas,
    (SELECT count(*) ${VIVOS})                                          AS renglones,
    (SELECT coalesce(sum(gi.bultos), 0) ${VIVOS})                       AS bultos
`);
console.log("── A · LO QUE SE GUARDA EN UNA GUÍA (tiene que dar IGUAL después) ──");
console.log(`   guías vivas: ${totales.guias_vivas}`);
console.log(`   renglones:   ${totales.renglones}`);
console.log(`   bultos:      ${totales.bultos}`);
console.log("");

// ── B · la semilla ──────────────────────────────────────────────────────────
const formas = await sql(`
  SELECT btrim(gi.direccion) AS destino, count(*)::int AS n, max(g.fecha)::text AS ultima
  ${VIVOS} AND btrim(coalesce(gi.direccion, '')) <> ''
  GROUP BY 1 ORDER BY n DESC, destino`);

// Las grafías que Daniel ya definió por cliente: ganan sobre el histórico.
const definidos = await sql(
  `SELECT DISTINCT destino FROM guias_destino_cliente WHERE activo`,
).catch(() => []);
const grafiaDeDaniel = new Map();
for (const d of definidos) grafiaDeDaniel.set(claveDestino(d.destino), d.destino);
for (const d of ["Paso Canoas", "David", "Santiago", "Guabito", "Changuinola"]) {
  if (!grafiaDeDaniel.has(claveDestino(d))) grafiaDeDaniel.set(claveDestino(d), d);
}

const grupos = new Map();
let renglonesConDestino = 0;
for (const f of formas) {
  renglonesConDestino += f.n;
  const k = claveDestino(f.destino);
  const g = grupos.get(k) ?? { total: 0, formas: [] };
  g.total += f.n;
  g.formas.push(f);
  grupos.set(k, g);
}

const semilla = [];
for (const [k, g] of grupos) {
  if (g.total < MINIMO_USOS) continue;
  g.formas.sort((a, b) => b.n - a.n || (a.ultima < b.ultima ? 1 : -1));
  semilla.push({
    destino: grafiaDeDaniel.get(k) ?? g.formas[0].destino,
    masUsada: g.formas[0].destino,
    total: g.total,
  });
}
semilla.sort((a, b) => b.total - a.total);

console.log(`── B · LA SEMILLA — ${grupos.size} destinos agrupados, ${semilla.length} con ${MINIMO_USOS}+ usos ──`);
for (const s of semilla) {
  const nota = s.destino !== s.masUsada ? `   (el histórico dice «${s.masUsada}»)` : "";
  console.log(`   ${String(s.total).padStart(4)}  ${s.destino}${nota}`);
}
console.log("");

// ── C · cuánto cubre ────────────────────────────────────────────────────────
const cubiertos = semilla.reduce((s, x) => s + x.total, 0);
console.log("── C · CUÁNTO CUBRE ──");
console.log(
  `   ${cubiertos} de ${renglonesConDestino} renglones con destino = ` +
    `${((100 * cubiertos) / renglonesConDestino).toFixed(1)}%`,
);
console.log(
  `   los ${grupos.size - semilla.length} que quedan afuera son de 1 o 2 usos: ` +
    "no son una lista, son lo que se escribió una vez.",
);
