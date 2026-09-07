#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// ¿CUÁNTAS PIEZAS DE MÁS MUESTRA EL CATÁLOGO EN LOS PRODUCTOS ESCONDIDOS?
// …y ¿cuál de las cuatro marcas no puede proteger una foto elegida a mano?
//
// Solo LECTURA contra producción (Management API). Tres mediciones:
//
//   1. Por marca: cuántos productos están escondidos a mano (`oculto_manual`),
//      qué existencia muestra el catálogo y qué dice Switch de verdad
//      (`switch_articulo_info`, por empresa + código). La diferencia es lo que
//      se congeló el día que se escondieron.
//   2. Qué tablas de producto tienen la columna `foto_manual` — el candado que
//      impide que el ZIP del banco B2B pise una foto elegida a mano.
//   3. Cuánto cuesta el arreglo: cuántos /stock más por corrida, contra los
//      que ya se hacen y contra el techo de 800 s de la función.
//
//   node scripts/_medir-catalogo-escondidos-y-fotos.mjs
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

// marca → (tabla del catálogo, empresa de Switch)
const MARCAS = [
  ["Reebok", "products", "active_shoes"],
  ["Tommy", "tommy_products", "fashion_shoes"],
  ["Calvin", "calvin_products", "vistana"],
  ["Joybees", "joybees_products", "joystep"],
];

const n = (x) => Number(x ?? 0);
const pad = (s, w) => String(s).padEnd(w);
const num = (s, w) => String(s).padStart(w);

console.log("\n1 · LA EXISTENCIA CONGELADA DE LOS ESCONDIDOS A MANO\n");
console.log(pad("marca", 10) + num("escondidos", 11) + num("catálogo", 10) + num("Switch", 9) + num("de más", 9) + "  filas que difieren");
console.log("─".repeat(72));

let totCat = 0, totSw = 0, totEsc = 0;
const detalle = [];
for (const [marca, tabla, empresa] of MARCAS) {
  const filas = await sql(`
    select p.sku,
           coalesce(p.existencia, 0)::numeric as catalogo,
           coalesce(s.existencia, 0)::numeric as switch,
           p.active
    from ${tabla} p
    left join switch_articulo_info s
      on s.empresa_key = '${empresa}' and s.codigo = p.sku
    where p.oculto_manual is true
    order by (coalesce(p.existencia,0) - coalesce(s.existencia,0)) desc`);
  const cat = filas.reduce((a, f) => a + n(f.catalogo), 0);
  const sw = filas.reduce((a, f) => a + n(f.switch), 0);
  const difieren = filas.filter((f) => n(f.catalogo) !== n(f.switch)).length;
  totCat += cat; totSw += sw; totEsc += filas.length;
  detalle.push([marca, filas]);
  console.log(
    pad(marca, 10) + num(filas.length, 11) + num(cat, 10) + num(sw, 9) + num(cat - sw, 9) +
    `  ${difieren} de ${filas.length}` + (filas.some((f) => f.active) ? "  ⚠️ alguno ACTIVO" : ""),
  );
}
console.log("─".repeat(72));
console.log(pad("TOTAL", 10) + num(totEsc, 11) + num(totCat, 10) + num(totSw, 9) + num(totCat - totSw, 9));

console.log("\n   Los peores, uno por uno:");
for (const [marca, filas] of detalle) {
  for (const f of filas.filter((x) => n(x.catalogo) !== n(x.switch)).slice(0, 4)) {
    console.log(`   ${pad(marca, 9)} ${pad(f.sku, 18)} catálogo ${num(n(f.catalogo), 5)} · Switch ${num(n(f.switch), 5)}`);
  }
}

console.log("\n2 · ¿QUÉ TABLA PUEDE PROTEGER UNA FOTO ELEGIDA A MANO?\n");
const cols = await sql(`
  select table_name, count(*) filter (where column_name = 'foto_manual') as tiene
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('products','tommy_products','calvin_products','joybees_products')
  group by table_name order by table_name`);
for (const [marca, tabla] of MARCAS) {
  const fila = cols.find((c) => c.table_name === tabla);
  const tiene = n(fila?.tiene) > 0;
  let protegidas = "—";
  if (tiene) {
    const r = await sql(`select count(*) c from ${tabla} where foto_manual is true`);
    protegidas = `${n(r[0].c)} foto(s) protegida(s)`;
  }
  console.log(`   ${pad(marca, 10)} ${tiene ? "✅ tiene foto_manual" : "❌ NO tiene foto_manual"}   ${protegidas}`);
}

console.log("\n3 · CUÁNTO CUESTA PREGUNTARLES LA EXISTENCIA\n");
const corridas = await sql(`
  select sync_type,
         max(records_updated) llamadas_aprox,
         max(extract(epoch from (finished_at - started_at)))::int seg_max
  from switch_sync_log
  where sync_type like '%catalogo%' and status = 'success'
    and started_at > now() - interval '30 days'
  group by 1 order by 1`);
for (const [marca] of MARCAS) {
  const c = corridas.find((x) => x.sync_type === `catalogo_${marca.toLowerCase()}`);
  const esc = detalle.find(([m]) => m === marca)[1].length;
  if (!c) continue;
  const base = n(c.llamadas_aprox);
  console.log(
    `   ${pad(marca, 10)} ~${num(base, 4)} /stock hoy  +${num(esc, 3)} escondidos  = +${((esc / Math.max(base, 1)) * 100).toFixed(1)}%` +
    `   · la corrida más lenta de 30 días: ${c.seg_max} s (techo 800)`,
  );
}
console.log("");
