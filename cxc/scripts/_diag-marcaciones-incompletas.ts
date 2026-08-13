/* ─────────────────────────────────────────────────────────────────────────────
 * ¿CUÁNTOS DÍAS MAL MARCADOS HAY DE VERDAD? — solo lectura, contra producción.
 *
 * La pregunta que decide si la corrección de marcaciones es un caso raro o pan
 * de todos los días: cuántos días tienen entrada y no salida (o al revés), y
 * cuántos días hábiles no tienen NI UNA marca sin justificación.
 *
 * ⚠️ NO ESCRIBE NADA.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_diag-marcaciones-incompletas.ts
 * ────────────────────────────────────────────────────────────────────────── */

import { createClient } from "@supabase/supabase-js";
import { diaPanama, esHabil } from "@/lib/asistencia/reporte";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } });

async function todo<T>(tabla: string, cols: string, orden: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(tabla).select(cols).order(orden).range(from, from + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    const filas = (data ?? []) as unknown as T[];
    out.push(...filas);
    if (filas.length < 1000) break;
  }
  return out;
}

async function main() {
  const marcaciones = await todo<{ empleado_codigo: string | null; ocurrio_en: string }>(
    "asistencia_marcaciones",
    "empleado_codigo, ocurrio_en",
    "ocurrio_en",
  );
  const justis = await todo<{ empleado_codigo: string; desde: string; hasta: string }>(
    "asistencia_justificaciones",
    "empleado_codigo, desde, hasta",
    "desde",
  );
  const feriados = await todo<{ fecha: string }>("asistencia_feriados", "fecha", "fecha");
  const setFeriados = new Set(feriados.map((f) => String(f.fecha)));

  // (codigo|dia) → cuántas marcas
  const porDia = new Map<string, number>();
  const dias = new Set<string>();
  const personas = new Set<string>();
  for (const m of marcaciones) {
    const cod = (m.empleado_codigo ?? "").trim();
    if (!cod || !m.ocurrio_en) continue;
    const d = diaPanama(m.ocurrio_en);
    porDia.set(`${cod}|${d}`, (porDia.get(`${cod}|${d}`) ?? 0) + 1);
    dias.add(d);
    personas.add(cod);
  }

  const conteo = new Map<number, number>();
  for (const n of porDia.values()) conteo.set(n, (conteo.get(n) ?? 0) + 1);

  const ordenados = [...dias].sort();
  const primerDia = ordenados[0] ?? "—";
  const ultimoDia = ordenados[ordenados.length - 1] ?? "—";

  console.log("═".repeat(74));
  console.log("MARCACIONES INCOMPLETAS — producción, solo lectura");
  console.log("═".repeat(74));
  console.log(`Marcaciones cargadas : ${marcaciones.length}`);
  console.log(`Rango                : ${primerDia} → ${ultimoDia}`);
  console.log(`Personas con marcas  : ${personas.size}`);
  console.log(`Días-persona con marcas: ${porDia.size}`);
  console.log("");
  console.log("Marcas por día-persona:");
  let incompletos = 0;
  for (const n of [...conteo.keys()].sort((a, b) => a - b)) {
    const c = conteo.get(n)!;
    const pct = ((c / porDia.size) * 100).toFixed(1);
    const etiqueta =
      n === 1 ? "  ← SOLO UNA: no se sabe a qué hora se fue"
      : n === 2 ? "  ← entrada y salida, sin almuerzo"
      : n === 3 ? "  ← falta una marca"
      : n === 4 ? "  ← completo"
      : "  ← de más";
    console.log(`  ${String(n).padStart(2)} marcas: ${String(c).padStart(5)} días (${pct.padStart(5)}%)${etiqueta}`);
    if (n !== 4) incompletos += c;
  }
  console.log("");
  console.log(`🔴 DÍAS MAL MARCADOS (≠ 4 marcas): ${incompletos} de ${porDia.size} (${((incompletos / porDia.size) * 100).toFixed(1)}%)`);
  const soloUna = conteo.get(1) ?? 0;
  const impares = (conteo.get(1) ?? 0) + (conteo.get(3) ?? 0);
  console.log(`   · con una sola marca (entrada sin salida): ${soloUna}`);
  console.log(`   · con número IMPAR de marcas (falta una): ${impares}`);

  // ── Ausencias: día hábil, con alguien que marcó ese día, y esta persona no ──
  const diasHabiles = ordenados.filter((d) => esHabil(d) && !setFeriados.has(d));
  const justiDe = (cod: string, dia: string) =>
    justis.some((j) => j.empleado_codigo === cod && j.desde <= dia && dia <= j.hasta);

  // Solo se cuenta a una persona en los días en que YA tenía marcas alguna vez
  // (entre su primera y su última marca): antes de entrar o después de irse no
  // es una ausencia, es que no trabajaba acá.
  const rango = new Map<string, { min: string; max: string }>();
  for (const [k] of porDia) {
    const [cod, d] = k.split("|");
    const r = rango.get(cod);
    if (!r) rango.set(cod, { min: d, max: d });
    else { if (d < r.min) r.min = d; if (d > r.max) r.max = d; }
  }

  let ausenciasSinJustificar = 0;
  let ausenciasJustificadas = 0;
  for (const [cod, r] of rango) {
    for (const d of diasHabiles) {
      if (d < r.min || d > r.max) continue;
      if (porDia.has(`${cod}|${d}`)) continue;
      if (justiDe(cod, d)) ausenciasJustificadas++;
      else ausenciasSinJustificar++;
    }
  }
  console.log("");
  console.log(`Días hábiles SIN NINGUNA marca (dentro del período activo de cada persona):`);
  console.log(`   · sin justificar : ${ausenciasSinJustificar}  ← acá es donde no hay nada que corregir`);
  console.log(`   · justificados   : ${ausenciasJustificadas}`);
  console.log("");

  // Últimos 60 días, para dimensionar el ritmo actual
  const corte = ordenados[ordenados.length - 1];
  const hace60 = new Date(Date.parse(`${corte}T12:00:00Z`) - 60 * 86_400_000).toISOString().slice(0, 10);
  let inc60 = 0, tot60 = 0;
  for (const [k, n] of porDia) {
    const d = k.split("|")[1];
    if (d < hace60) continue;
    tot60++;
    if (n !== 4) inc60++;
  }
  console.log(`Últimos 60 días (${hace60} → ${corte}): ${inc60} mal marcados de ${tot60} (${((inc60 / Math.max(1, tot60)) * 100).toFixed(1)}%)`);
  console.log("═".repeat(74));
}

main().catch((e) => { console.error(e); process.exit(1); });
