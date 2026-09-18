/* ─────────────────────────────────────────────────────────────────────────────
 * EL EXCEL DE LOS DÍAS CON 5 MARCAS O MÁS — solo lectura, contra producción.
 *
 * Daniel, 18-sep-2026: *«dame un excel detallado sobre esa info, dia, persona,
 * y las marcaciones ese dia la 1,2,3,4,5,6. solo las que tengan de 5
 * marcaciones para arriba»*.
 *
 * 🔑 La columna «Pegadas» es la que sirve: dice qué par de marcas está a
 * segundos una de otra, que es el dedo doble en el reloj y la que hay que
 * quitar. Medido: 47 de 55 días tienen una.
 *
 * ⚠️ NO ESCRIBE NADA EN LA BASE.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_excel-marcas-de-mas.ts [dias] [carpeta]
 * ────────────────────────────────────────────────────────────────────────── */

import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildReportSheet, workbookFromSheets, workbookBuffer, exportFilename } from "@/lib/excel-export";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const DIAS = Number(process.argv[2] ?? 30);
const CARPETA = process.argv[3] ?? ".";

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

/** Panamá es UTC−5 fijo, sin horario de verano. */
const pan = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3600_000).toISOString();
const diaPanama = (iso: string) => pan(iso).slice(0, 10);
const horaPanama = (iso: string) => pan(iso).slice(11, 19);
const seg = (h: string) => { const [a, b, c] = h.split(":").map(Number); return a * 3600 + b * 60 + c; };

const SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function diaLargo(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d} ${MES[m - 1]}`;
}
const ORDINAL = ["1ª", "2ª", "3ª", "4ª", "5ª", "6ª", "7ª", "8ª"];

async function main() {
  const hoy = diaPanama(new Date().toISOString());
  const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString().slice(0, 10);

  const marcas = await todo<{ id: string; empleado_codigo: string | null; ocurrio_en: string; dispositivo: string | null }>(
    "asistencia_marcaciones", "id, empleado_codigo, ocurrio_en, dispositivo", "ocurrio_en",
    (q) => q.gte("ocurrio_en", `${desde}T00:00:00Z`),
  );
  const personas = await todo<{ empleado_codigo: string; nombre: string | null; empresa: string | null }>(
    "asistencia_personas", "empleado_codigo, nombre, empresa", "empleado_codigo",
  );
  const nombre = new Map(personas.map((p) => [String(p.empleado_codigo), p.nombre ?? "?"]));
  const empresa = new Map(personas.map((p) => [String(p.empleado_codigo), p.empresa ?? ""]));

  // Lo ya quitado con una corrección VIVA no cuenta.
  let quitadas = new Set<string>();
  try {
    const corr = await todo<{ marcacion_id: string | null; quita: boolean | null; anulada_en: string | null }>(
      "asistencia_correcciones", "marcacion_id, quita, anulada_en", "marcacion_id",
    );
    quitadas = new Set(corr.filter((c) => c.quita && !c.anulada_en && c.marcacion_id).map((c) => String(c.marcacion_id)));
  } catch { /* sin la columna, nadie está quitado */ }

  const porDia = new Map<string, { hora: string; reloj: string }[]>();
  for (const m of marcas) {
    if (!m.empleado_codigo || quitadas.has(String(m.id))) continue;
    const dia = diaPanama(m.ocurrio_en);
    if (dia < desde || dia >= hoy) continue; // el día en curso no se juzga
    const k = `${m.empleado_codigo}|${dia}`;
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k)!.push({ hora: horaPanama(m.ocurrio_en), reloj: String(m.dispositivo ?? "") });
  }

  const filas = [...porDia.entries()]
    .filter(([, v]) => v.length >= 5)
    .map(([k, v]) => {
      const [cod, dia] = k.split("|");
      return { cod, dia, horas: v.map((x) => x.hora).sort(), reloj: v[0].reloj };
    })
    .sort((a, b) => (a.dia === b.dia ? Number(a.cod) - Number(b.cod) : a.dia.localeCompare(b.dia)));

  const maxMarcas = Math.max(6, ...filas.map((f) => f.horas.length));

  /** El par más pegado del día: es el candidato a quitar. */
  function pegadas(horas: string[]): string {
    let mejor = -1, i0 = -1;
    for (let i = 1; i < horas.length; i++) {
      const d = seg(horas[i]) - seg(horas[i - 1]);
      if (mejor < 0 || d < mejor) { mejor = d; i0 = i; }
    }
    if (mejor < 0 || mejor > 300) return "";
    const cuanto = mejor < 60 ? `${mejor} s` : `${Math.round(mejor / 60)} min`;
    return `${ORDINAL[i0 - 1]} y ${ORDINAL[i0]} · ${cuanto}`;
  }

  const columns = [
    { header: "Día", wch: 12 },
    { header: "Código", wch: 8, align: "center" as const },
    { header: "Colaborador", wch: 32 },
    { header: "Empresa", wch: 20 },
    { header: "Marcas", wch: 8, align: "center" as const },
    ...Array.from({ length: maxMarcas }, (_, i) => ({ header: ORDINAL[i], wch: 10, align: "center" as const })),
    { header: "Sobran", wch: 8, align: "center" as const },
    { header: "Pegadas", wch: 20 },
  ];

  const rows = filas.map((f) => [
    diaLargo(f.dia),
    f.cod,
    nombre.get(f.cod) ?? "?",
    empresa.get(f.cod) ?? "",
    f.horas.length,
    ...Array.from({ length: maxMarcas }, (_, i) => f.horas[i] ?? ""),
    f.horas.length - 4,
    pegadas(f.horas),
  ]);

  const ws = buildReportSheet({ columns, rows });
  const wb = workbookFromSheets([{ name: "5 marcas o más", ws }]);
  const ruta = `${CARPETA}/${exportFilename("marcaciones-de-mas")}`;
  writeFileSync(ruta, workbookBuffer(wb));

  const conPegadas = rows.filter((r) => r[r.length - 1] !== "").length;
  console.log(`\nVentana ${desde} → ${hoy} · ${porDia.size} días-persona con marca`);
  console.log(`${filas.length} días con 5 o más · ${conPegadas} con un par pegado (la que sobra se ve sola)`);
  console.log(`\n${ruta}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
