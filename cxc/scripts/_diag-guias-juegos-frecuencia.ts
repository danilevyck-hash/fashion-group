// Diagnóstico SOLO LECTURA contra producción — Guías / memoria por transportista.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-guias-juegos-frecuencia.ts
//
// No escribe NADA. Contesta lo que hay que saber ANTES de escribir una línea:
//   1. ¿Cuántas veces se repite cada placa / receptor / cédula / transportista?
//   2. ¿La normalización (mayúsculas, tildes, guiones) junta lo que tiene que
//      juntar, y cuánto cambia el conteo?
//   3. ¿Los juegos (receptor+cédula+placa) se concentran, o se dispersan?
//   4. ¿Ordenar por FRECUENCIA da algo distinto que ordenar por fecha?

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(url, key, { auth: { persistSession: false } });

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const normNombre = (s: string) => sinTildes(String(s ?? "")).toUpperCase().replace(/\s+/g, " ").trim();
const normCodigo = (s: string) => sinTildes(String(s ?? "")).toUpperCase().replace(/[^A-Z0-9]/g, "");

function contar(valores: string[]) {
  const m = new Map<string, number>();
  for (const v of valores) { const t = String(v ?? "").trim(); if (t) m.set(t, (m.get(t) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function contarNorm(valores: string[], norm: (s: string) => string) {
  const m = new Map<string, { n: number; formas: Map<string, number> }>();
  for (const v of valores) {
    const t = String(v ?? "").trim();
    if (!t) continue;
    const k = norm(t);
    if (!k) continue;
    if (!m.has(k)) m.set(k, { n: 0, formas: new Map() });
    const e = m.get(k)!;
    e.n++;
    e.formas.set(t, (e.formas.get(t) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
}
const linea = (pares: [string, number][], n = 8) =>
  pares.slice(0, n).map(([v, c]) => `${v} x${c}`).join(" · ");

async function main() {
  const { data, error } = await db
    .from("guia_transporte")
    .select("numero, fecha, estado, deleted, modo_entrega, transportista_id, transportista, receptor_nombre, cedula, placa, nombre_chofer")
    .order("numero", { ascending: true });
  if (error) throw error;
  type Fila = {
    numero: number; fecha: string | null; estado: string; deleted: boolean | null;
    modo_entrega: string | null; transportista_id: string | null; transportista: string | null;
    receptor_nombre: string | null; cedula: string | null; placa: string | null; nombre_chofer: string | null;
  };
  const vivas = (data as Fila[]).filter((g) => !g.deleted);
  const despachadas = vivas.filter((g) => g.estado === "Completada" || g.estado === "Rechazada");
  console.log(`\nguías vivas ${vivas.length} · despachadas ${despachadas.length}`);

  console.log("\n═══ CRUDO (tal como está guardado) ═══");
  console.log("PLACA:    ", linea(contar(vivas.map((g) => g.placa ?? ""))));
  console.log("RECEPTOR: ", linea(contar(vivas.map((g) => g.receptor_nombre ?? ""))));
  console.log("CEDULA:   ", linea(contar(vivas.map((g) => g.cedula ?? ""))));
  console.log("TRANSPORT:", linea(contar(vivas.map((g) => g.transportista ?? ""))));
  console.log("CHOFER:   ", linea(contar(vivas.map((g) => g.nombre_chofer ?? ""))));

  console.log("\n═══ NORMALIZADO (lo que junta la agrupación) ═══");
  for (const [etiqueta, valores, norm] of [
    ["PLACA", vivas.map((g) => g.placa ?? ""), normCodigo],
    ["RECEPTOR", vivas.map((g) => g.receptor_nombre ?? ""), normNombre],
    ["CEDULA", vivas.map((g) => g.cedula ?? ""), normCodigo],
    ["TRANSPORT", vivas.map((g) => g.transportista ?? ""), normNombre],
  ] as [string, string[], (s: string) => string][]) {
    const crudo = contar(valores).length;
    const agrupado = contarNorm(valores, norm);
    console.log(`\n${etiqueta}: ${crudo} distintos crudos → ${agrupado.length} agrupados`);
    for (const [k, e] of agrupado.slice(0, 6)) {
      const formas = [...e.formas.entries()].sort((a, b) => b[1] - a[1]);
      const juntadas = formas.length > 1 ? `  ⬅ junta ${formas.map(([f, c]) => `"${f}"x${c}`).join(" + ")}` : "";
      console.log(`   ${String(e.n).padStart(3)}  ${k}${juntadas}`);
    }
  }

  // ── Juegos por transportista: ¿se concentran? ¿frecuencia ≠ fecha? ────────
  console.log("\n═══ JUEGOS (receptor+cédula+placa) POR TRANSPORTISTA ═══");
  const porTransp = new Map<string, Fila[]>();
  for (const g of despachadas) {
    const t = g.transportista_id ?? "";
    if (!t) continue;
    if (!porTransp.has(t)) porTransp.set(t, []);
    porTransp.get(t)!.push(g);
  }
  const { data: transportistas } = await db.from("transportistas").select("id, nombre, activo");
  const nombreDe = new Map<string, string>();
  for (const t of (transportistas ?? []) as { id: string; nombre: string }[]) nombreDe.set(t.id, t.nombre);
  console.log(`transportistas en el catálogo: ${(transportistas ?? []).length}`);

  const completo = (g: Fila) => !!(g.receptor_nombre?.trim() && g.cedula?.trim() && g.placa?.trim());
  const clave = (g: Fila) => {
    const ced = normCodigo(g.cedula ?? "");
    const placa = normCodigo(g.placa ?? "");
    return ced ? `C:${ced}|P:${placa}` : `R:${normNombre(g.receptor_nombre ?? "")}|P:${placa}`;
  };

  for (const [tid, filas] of [...porTransp.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6)) {
    const conJuego = filas.filter(completo);
    const grupos = new Map<string, { n: number; formas: Map<string, number>; ultima: string }>();
    for (const g of conJuego) {
      const k = clave(g);
      if (!grupos.has(k)) grupos.set(k, { n: 0, formas: new Map(), ultima: "" });
      const e = grupos.get(k)!;
      e.n++;
      const forma = `${g.receptor_nombre?.trim()} · ${g.cedula?.trim()} · ${g.placa?.trim()}`;
      e.formas.set(forma, (e.formas.get(forma) ?? 0) + 1);
      const f = String(g.fecha ?? "").slice(0, 10);
      if (f > e.ultima) e.ultima = f;
    }
    const porFrec = [...grupos.entries()].sort((a, b) => b[1].n - a[1].n);
    const porFecha = [...grupos.entries()].sort((a, b) => (a[1].ultima < b[1].ultima ? 1 : -1));
    console.log(`\n▸ ${nombreDe.get(tid) ?? tid} — ${filas.length} guías, ${conJuego.length} con juego completo, ${grupos.size} juegos distintos`);
    console.log(`   POR FRECUENCIA: ${porFrec.slice(0, 3).map(([, e]) => `${[...e.formas.entries()].sort((a, b) => b[1] - a[1])[0][0]} (x${e.n})`).join("  |  ")}`);
    console.log(`   POR FECHA     : ${porFecha.slice(0, 3).map(([, e]) => `${[...e.formas.entries()].sort((a, b) => b[1] - a[1])[0][0]} (${e.ultima})`).join("  |  ")}`);
    const distinto = porFrec.slice(0, 3).map(([k]) => k).join() !== porFecha.slice(0, 3).map(([k]) => k).join();
    console.log(`   ¿ordenar por frecuencia da algo DISTINTO que por fecha? ${distinto ? "SÍ" : "no"}`);
    for (const [, e] of porFrec.slice(0, 3)) {
      const formas = [...e.formas.entries()].sort((a, b) => b[1] - a[1]);
      if (formas.length > 1) console.log(`   ⬅ un juego escrito de ${formas.length} formas: ${formas.map(([f, c]) => `"${f}"x${c}`).join(" + ")}`);
    }
  }
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
