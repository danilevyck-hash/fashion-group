/**
 * READ-ONLY. Una sola lectura ancha de `switch_articulo_diario` y, EN MEMORIA,
 * la comparación de varias definiciones de "últimos 12 meses" y de agrupación
 * de la descripción, contra las cifras de control que dio Daniel.
 *
 *   npx tsx scripts/_diag-productos-ventana.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface Fila {
  id: number; fecha: string; codigo: string | null; descripcion: string | null;
  tipo: string | null; cantidad_total: string | number | null;
  venta_total: string | number | null; costo_total: string | number | null;
}

const n = (x: unknown) => { const v = parseFloat(String(x ?? "0")); return Number.isFinite(v) ? v : 0; };

async function leer(desde: string, hasta: string): Promise<Fila[]> {
  const out: Fila[] = [];
  let esperadas: number | null = null;
  for (let p = 0; p < 200; p += 1) {
    const ini = p * 1000;
    const { data, error, count } = await db
      .from("switch_articulo_diario")
      .select("id, fecha, codigo, descripcion, tipo, cantidad_total, venta_total, costo_total", p === 0 ? { count: "exact" } : {})
      .eq("empresa_key", "american_classic")
      .gte("fecha", desde).lte("fecha", hasta)
      .order("id", { ascending: true }).range(ini, ini + 999);
    if (error) throw new Error(error.message);
    if (p === 0) esperadas = count ?? null;
    const lote = (data ?? []) as unknown as Fila[];
    out.push(...lote);
    if (lote.length < 1000) break;
    if (esperadas != null && out.length >= esperadas) break;
  }
  console.log(`lectura ancha: COUNT ${esperadas} · leídas ${out.length}`);
  return out;
}

type Politica = "exacta" | "espacios";
const clave = (d: string, pol: Politica) => (pol === "exacta" ? d.trim() : d.trim().replace(/\s+/g, " "));

function agrupar(filas: Fila[], desde: string, hasta: string, pol: Politica) {
  const m = new Map<string, { u: number; v: number; c: number }>();
  let filasN = 0;
  const codigos = new Set<string>();
  for (const f of filas) {
    if (f.fecha < desde || f.fecha > hasta) continue;
    filasN += 1;
    const s = String(f.tipo ?? "").trim().toUpperCase() === "NC" ? -1 : 1;
    const k = clave(f.descripcion ?? "", pol) || "(sin descripción)";
    const a = m.get(k) ?? { u: 0, v: 0, c: 0 };
    a.u += n(f.cantidad_total) * s; a.v += n(f.venta_total) * s; a.c += n(f.costo_total) * s;
    m.set(k, a);
    if (f.codigo) codigos.add(f.codigo.trim());
  }
  return { m, filasN, descs: m.size, codigos: codigos.size };
}

const CONTROL = [
  { nombre: "Women-Bags", u: 1446, v: 69032, mg: 33.2 },
  { nombre: "Men-T-Shirts S/S", u: 3181, v: 67150, mg: 34.8 },
  { nombre: "Women-T-Shirts S/S", u: 2833, v: 64538, mg: 37.9 },
];

async function main() {
  const filas = await leer("2025-01-01", "2026-08-07");

  const ventanas: Array<[string, string, string]> = [
    ["rolling 07-ago", "2025-08-07", "2026-08-07"],
    ["rolling 08-ago", "2025-08-08", "2026-08-07"],
    ["12 cal. incl. actual", "2025-09-01", "2026-08-07"],
    ["12 cal. cerrados", "2025-08-01", "2026-07-31"],
    ["ago25→ago26 (13m)", "2025-08-01", "2026-08-07"],
    ["jul25→jun26", "2025-07-01", "2026-06-30"],
  ];

  for (const pol of ["exacta", "espacios"] as Politica[]) {
    console.log(`\n════ política de descripción: ${pol} ════`);
    for (const [nombre, d, h] of ventanas) {
      const g = agrupar(filas, d, h, pol);
      const linea = CONTROL.map(c => {
        const a = g.m.get(c.nombre);
        if (!a) return `${c.nombre}: —`;
        const util = a.v - a.c;
        const mg = a.v > 0 ? (util / a.v) * 100 : 0;
        return `${c.nombre}: ${Math.round(a.u)}u/$${Math.round(a.v)}/${mg.toFixed(1)}% (Δ${Math.round(a.u) - c.u}u,Δ$${Math.round(a.v - c.v)},Δ${(mg - c.mg).toFixed(1)}pp)`;
      }).join("   ");
      console.log(`${nombre.padEnd(22)} filas ${String(g.filasN).padStart(6)} · descs ${String(g.descs).padStart(4)} · códigos ${String(g.codigos).padStart(5)}`);
      console.log(`   ${linea}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
