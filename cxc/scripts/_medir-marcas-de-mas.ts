/* ─────────────────────────────────────────────────────────────────────────────
 * ¿QUIÉNES MARCARON 5 VECES O MÁS? — solo lectura, contra producción.
 *
 * Daniel, 18-sep-2026: *«osea las quincena solo cierran con 4, hay q quitar
 * hasta que llegue a 4 maximo. cuando hay 5 o mas es porq es error. quiero
 * saber todos los que marcaron 5 veces last 30 days»*.
 *
 * ⚠️ NO ESCRIBE NADA.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_medir-marcas-de-mas.ts [dias]
 * ────────────────────────────────────────────────────────────────────────── */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } });

const DIAS = Number(process.argv[2] ?? 30);

async function todo<T>(tabla: string, cols: string, orden: string, filtro?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(tabla).select(cols).order(orden).range(from, from + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    const filas = (data ?? []) as unknown as T[];
    out.push(...filas);
    if (filas.length < 1000) break;
  }
  return out;
}

/** Panamá es UTC−5 fijo. */
function diaPanama(iso: string): string {
  return new Date(new Date(iso).getTime() - 5 * 3600_000).toISOString().slice(0, 10);
}
function horaPanama(iso: string): string {
  return new Date(new Date(iso).getTime() - 5 * 3600_000).toISOString().slice(11, 19);
}
function segDe(hhmmss: string): number {
  const [h, m, s] = hhmmss.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

async function main() {
  const hoy = diaPanama(new Date().toISOString());
  const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString().slice(0, 10);

  const marcas = await todo<{ id: string; empleado_codigo: string | null; ocurrio_en: string; dispositivo: string | null }>(
    "asistencia_marcaciones",
    "id, empleado_codigo, empleado_nombre, ocurrio_en, dispositivo",
    "ocurrio_en",
    (q) => q.gte("ocurrio_en", `${desde}T00:00:00Z`),
  );

  const personas = await todo<{ empleado_codigo: string; nombre: string | null; empresa: string | null }>(
    "asistencia_personas", "empleado_codigo, nombre, empresa", "empleado_codigo",
  );
  const nombre = new Map(personas.map((p) => [String(p.empleado_codigo), p.nombre ?? ""]));
  const empresa = new Map(personas.map((p) => [String(p.empleado_codigo), p.empresa ?? ""]));

  // Las que YA se quitaron con una corrección viva no cuentan.
  let quitadas = new Set<string>();
  try {
    const corr = await todo<{ marcacion_id: string | null; quita: boolean | null; anulada_en: string | null }>(
      "asistencia_correcciones", "marcacion_id, quita, anulada_en", "marcacion_id",
    );
    quitadas = new Set(
      corr.filter((c) => c.quita && !c.anulada_en && c.marcacion_id).map((c) => String(c.marcacion_id)),
    );
  } catch { /* sin la columna, nadie está quitado */ }

  const porDia = new Map<string, { hora: string; origen: string }[]>();
  for (const m of marcas) {
    if (!m.empleado_codigo) continue;
    if (quitadas.has(String(m.id))) continue;
    const dia = diaPanama(m.ocurrio_en);
    if (dia < desde || dia >= hoy) continue; // el día en curso no se juzga
    const k = `${m.empleado_codigo}|${dia}`;
    (porDia.get(k) ?? porDia.set(k, []).get(k)!).push({
      hora: horaPanama(m.ocurrio_en),
      origen: String(m.dispositivo ?? ""),
    });
  }

  const conMarca = porDia.size;
  const filas: { cod: string; dia: string; n: number; horas: { hora: string; origen: string }[] }[] = [];
  for (const [k, v] of porDia) {
    if (v.length <= 4) continue;
    const [cod, dia] = k.split("|");
    filas.push({ cod, dia, n: v.length, horas: v.sort((a, b) => a.hora.localeCompare(b.hora)) });
  }
  filas.sort((a, b) => (a.cod === b.cod ? a.dia.localeCompare(b.dia) : Number(a.cod) - Number(b.cod)));

  const impares = [...porDia.values()].filter((v) => v.length % 2 === 1).length;
  const cinco = filas.filter((f) => f.n === 5).length;
  const seis = filas.filter((f) => f.n === 6).length;
  const masDeSeis = filas.filter((f) => f.n > 6).length;

  console.log(`\nVentana: ${desde} → ${hoy} (${DIAS} días, el día en curso NO se cuenta)`);
  console.log(`Días-persona con marca: ${conMarca}`);
  console.log(`Con 5 o más: ${filas.length}   (5 marcas: ${cinco} · 6: ${seis} · 7+: ${masDeSeis})`);
  console.log(`Con número IMPAR (la regla de hoy): ${impares}\n`);

  const porPersona = new Map<string, number>();
  for (const f of filas) porPersona.set(f.cod, (porPersona.get(f.cod) ?? 0) + 1);

  console.log("QUIÉNES\n" + "─".repeat(60));
  for (const [cod, n] of [...porPersona].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(cod).padStart(4)} ${(nombre.get(cod) ?? "?").padEnd(32)} ${n} día(s)`);
  }

  console.log("\nDÍA POR DÍA\n" + "─".repeat(78));
  for (const f of filas) {
    console.log(`\n  ${f.cod} · ${nombre.get(f.cod) ?? "?"} · ${f.dia} · ${f.n} marcas · ${empresa.get(f.cod) ?? ""}`);
    let prev: number | null = null;
    for (const h of f.horas) {
      const seg = segDe(h.hora);
      const cerca = prev != null && seg - prev <= 300 ? `  ← ${seg - prev}s de la anterior` : "";
      console.log(`      ${h.hora}  ${h.origen.padEnd(16)}${cerca}`);
      prev = seg;
    }
  }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
