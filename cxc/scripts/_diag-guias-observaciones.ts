// Diagnóstico SOLO LECTURA contra producción — Guías / observaciones.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-guias-observaciones.ts
//
// No escribe NADA. Contesta lo que hay que saber ANTES de diseñar la caja:
//   1. ¿Cuántas guías tienen observación de verdad?
//   2. ¿Cuánto miden? (¿es un párrafo o son textos cortos?)
//   3. ¿Cuántas líneas tienen? ¿Hay saltos de línea que respetar?
//   4. ¿Qué basura hay adentro? (para NO filtrarla, pero saber que existe)

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(url, key, { auth: { persistSession: false } });

// El texto que dejó el cierre administrativo del 3-ago: no es una nota de trabajo.
const ADMIN = /cerrada en bloque/i;

async function main() {
  const { data, error } = await db
    .from("guia_transporte")
    .select("numero, fecha, estado, deleted, observaciones")
    .order("numero", { ascending: true });
  if (error) throw error;
  type Fila = { numero: number; fecha: string | null; estado: string; deleted: boolean | null; observaciones: string | null };
  const vivas = (data as Fila[]).filter((g) => !g.deleted);

  const conTexto = vivas.filter((g) => String(g.observaciones ?? "").trim());
  const administrativas = conTexto.filter((g) => ADMIN.test(g.observaciones ?? ""));
  const reales = conTexto.filter((g) => !ADMIN.test(g.observaciones ?? ""));
  const sinNada = vivas.length - conTexto.length;

  console.log(`\nguías vivas ${vivas.length}`);
  console.log(`  con texto en observaciones : ${conTexto.length}`);
  console.log(`  · administrativas ("Cerrada en bloque…") : ${administrativas.length}`);
  console.log(`  · notas de trabajo REALES               : ${reales.length}`);
  console.log(`  SIN observación (no se dibuja nada)     : ${sinNada}`);

  const largos = reales.map((g) => (g.observaciones ?? "").trim().length).sort((a, b) => a - b);
  const lineas = reales.map((g) => (g.observaciones ?? "").trim().split(/\r?\n/).length);
  const mediana = largos[Math.floor(largos.length / 2)];
  console.log(`\nlargo del texto (caracteres): min ${largos[0]} · mediana ${mediana} · max ${largos[largos.length - 1]}`);
  console.log(`¿cuántas pasan de 80 caracteres? ${largos.filter((n) => n > 80).length} de ${largos.length}`);
  console.log(`¿cuántas pasan de 140? ${largos.filter((n) => n > 140).length}`);
  console.log(`líneas: max ${Math.max(...lineas)} · con salto de línea: ${lineas.filter((n) => n > 1).length}`);

  const masLarga = reales.slice().sort((a, b) => (b.observaciones ?? "").length - (a.observaciones ?? "").length)[0];
  console.log(`\nLA MÁS LARGA — GT-${String(masLarga.numero).padStart(3, "0")} (${(masLarga.observaciones ?? "").trim().length} caracteres):`);
  console.log(`  "${(masLarga.observaciones ?? "").trim()}"`);

  console.log(`\nLAS 5 MÁS CORTAS (¿basura?):`);
  for (const g of reales.slice().sort((a, b) => (a.observaciones ?? "").length - (b.observaciones ?? "").length).slice(0, 5)) {
    console.log(`  GT-${String(g.numero).padStart(3, "0")}: "${(g.observaciones ?? "").trim()}"  (${(g.observaciones ?? "").trim().length})`);
  }

  console.log(`\nTODAS las notas reales:`);
  for (const g of reales) {
    console.log(`  GT-${String(g.numero).padStart(3, "0")} [${g.estado}] "${(g.observaciones ?? "").trim().replace(/\s+/g, " ")}"`);
  }

  // El hallazgo para el reporte: el campo hace tres trabajos.
  const retira = reales.filter((g) => /retir[ao]/i.test(g.observaciones ?? ""));
  console.log(`\n🔑 "el cliente retira en bodega" (modo de entrega sin campo propio): ${retira.length}`);
  for (const g of retira) console.log(`   GT-${String(g.numero).padStart(3, "0")}: "${(g.observaciones ?? "").trim()}"`);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
