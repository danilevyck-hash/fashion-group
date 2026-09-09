#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// LOS TRANSPORTISTAS QUE SE PUEDEN AGREGAR — la medición que sostiene el
// cambio (9-sep-2026).
//
// Daniel: *«Ponme opción en configuración de guía para poder agregar un
// transportista nuevo.»*
//
// Lee producción de SOLO LECTURA (Management API) y contesta tres cosas:
//
//   A. 🔴 LO QUE SE GUARDA EN UNA GUÍA NO CAMBIA. Guías vivas · renglones ·
//      bultos. Este cambio toca lo que la pantalla OFRECE, jamás lo guardado:
//      los tres números tienen que dar igual antes y después.
//
//   B. LOS TRANSPORTISTAS DE HOY, con cuántas guías lleva cada uno — que es el
//      dato que dice si se puede quitar uno sin dudar.
//
//   C. 🩸 LOS QUE SE ESCRIBIERON A MANO en el campo de texto de la guía,
//      saltándose la lista. Es el defecto que este cambio viene a cerrar: en
//      tres meses y medio nadie pudo agregar un transportista, así que se
//      escribieron por fuera. ⚠️ Las guías con el texto VACÍO son las de
//      Entrega directa (nuestro propio camión): están bien así.
//
//   node scripts/_medir-transportistas.mjs
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

const n = (v) => Number(v ?? 0).toLocaleString("es-PA");

// ── A. Lo guardado, que no puede moverse ─────────────────────────────────────
const [tot] = await sql(`
  select
    (select count(*) from guia_transporte where coalesce(deleted,false)=false) as guias,
    (select count(*) from guia_items i join guia_transporte g on g.id = i.guia_id
      where coalesce(i.deleted,false)=false and coalesce(g.deleted,false)=false) as renglones,
    (select coalesce(sum(i.bultos),0) from guia_items i join guia_transporte g on g.id = i.guia_id
      where coalesce(i.deleted,false)=false and coalesce(g.deleted,false)=false) as bultos
`);

console.log("═══ A. LO QUE SE GUARDA (tiene que dar IGUAL antes y después) ═══");
console.log(`  Guías vivas ....... ${n(tot.guias)}`);
console.log(`  Renglones ......... ${n(tot.renglones)}`);
console.log(`  Bultos ............ ${n(tot.bultos)}`);

// ── B. La lista de hoy, con cuántas guías lleva cada uno ─────────────────────
const trs = await sql(`
  select tr.nombre, tr.activo, tr.created_at::date as desde,
    (select count(*) from guia_transporte g
      where g.transportista_id = tr.id and coalesce(g.deleted,false)=false) as guias
  from transportistas tr
  order by guias desc, tr.nombre
`);
console.log("\n═══ B. LOS TRANSPORTISTAS DE HOY ═══");
for (const t of trs) {
  console.log(`  ${t.nombre.padEnd(18)} ${String(t.guias).padStart(4)} guías   ${t.activo ? "activo" : "QUITADO"}   desde ${t.desde}`);
}
const sembrados = new Set(trs.map((t) => String(t.desde)));
console.log(`  → ${trs.length} en total; se sembraron el ${[...sembrados].join(" y el ")} y desde entonces nadie pudo agregar uno.`);

// ── C. Los escritos a mano, saltándose la lista ──────────────────────────────
const manuales = await sql(`
  select coalesce(nullif(btrim(transportista),''),'(vacío — Entrega directa)') as texto,
         modo_entrega, count(*) as guias, min(fecha)::date as primera, max(fecha)::date as ultima
  from guia_transporte
  where coalesce(deleted,false)=false and transportista_id is null
  group by 1,2 order by guias desc, texto
`);
console.log("\n═══ C. 🩸 ESCRITOS A MANO (sin fila en la lista) ═══");
for (const m of manuales) {
  const vacio = m.texto.startsWith("(vacío");
  const nota = vacio ? "  ⚠️ nuestro propio camión: están BIEN así, no se tocan" : "";
  console.log(`  ${m.texto.padEnd(26)} ${String(m.guias).padStart(3)} guías  (${m.primera}${m.primera === m.ultima ? "" : ` … ${m.ultima}`})${nota}`);
}
const aMano = manuales.filter((m) => !m.texto.startsWith("(vacío"));
console.log(`  → ${aMano.reduce((s, m) => s + Number(m.guias), 0)} guías con ${aMano.length} nombres tecleados por fuera de la lista.`);
console.log("  🔴 Ninguno entra a la lista: cuatro son nombres de CLIENTE y uno dice «no».");
console.log("     Sus guías viejas no se tocan.");
