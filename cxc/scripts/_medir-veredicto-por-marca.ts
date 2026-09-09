/**
 * Mide el impacto de acotar la regla de las DOS MITADES a la MARCA
 * (8-sep-2026) — el cambio de `src/lib/depurador/veredicto.ts`.
 *
 * Compara, con la MISMA función real:
 *   · ANTES = veredictoDescripcion(desc, catalogo)          — mitades globales
 *   · AHORA = veredictoDescripcion(desc, catalogo, marca)   — mitades de su marca
 *
 * Contra dos universos de producción:
 *   A) las 281 descripciones ACTIVAS de `depurador_descripciones`
 *   B) las descripciones VIVAS del inventario: `switch_articulo_info` con
 *      existencia > 0 en las 6 empresas del grupo, cruzadas a su marca real por
 *      (empresa_key, codigo) contra `switch_factura_lineas`.
 *
 * Uso:  npx tsx scripts/_medir-veredicto-por-marca.ts
 */
import { readFileSync } from "node:fs";
import { veredictoDescripcion } from "../src/lib/depurador/veredicto";
import type { CatalogoDescripciones } from "../src/lib/depurador/logic";

const PROJECT = "rspocgqhtpveytgbtler";

function token(): string {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const m = env.match(/^SUPABASE_ACCESS_TOKEN=(.*)$/m);
  if (!m) throw new Error("Falta SUPABASE_ACCESS_TOKEN en .env.local");
  return m[1].trim();
}

async function q<T>(sql: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T[]>;
}

async function main() {
  const cat = await q<{ marca: string; descripcion: string }>(
    "select marca, descripcion from depurador_descripciones where activa order by marca, descripcion"
  );
  const catalogo: CatalogoDescripciones = {};
  for (const r of cat) (catalogo[r.marca] ??= []).push(r.descripcion);
  console.log(`Catálogo: ${cat.length} descripciones activas en ${Object.keys(catalogo).length} marcas`);

  const vivos = await q<{ marca: string; descripcion: string; articulos: number; piezas: string }>(`
    with vivos as (
      select empresa_key, codigo, descripcion, existencia
      from switch_articulo_info
      where existencia > 0
        and empresa_key in ('vistana','fashion_wear','fashion_shoes','active_wear','active_shoes','joystep')
    ),
    marcas as (
      select distinct on (l.empresa_key, l.codigo) l.empresa_key, l.codigo, l.marca
      from switch_factura_lineas l
      where l.marca is not null and l.marca <> ''
      order by l.empresa_key, l.codigo, l.fecha desc
    )
    select m.marca, v.descripcion, count(*)::int as articulos, sum(v.existencia)::numeric as piezas
    from vivos v join marcas m on m.empresa_key = v.empresa_key and m.codigo = v.codigo
    group by m.marca, v.descripcion
    order by piezas desc
  `);

  const medir = (
    titulo: string,
    filas: { marca: string; descripcion: string; articulos?: number; piezas?: string }[]
  ) => {
    let iguales = 0;
    const cambian: string[] = [];
    for (const f of filas) {
      const antes = veredictoDescripcion(f.descripcion, catalogo).veredicto;
      const ahora = veredictoDescripcion(f.descripcion, catalogo, f.marca);
      if (antes === ahora.veredicto) { iguales++; continue; }
      const piezas = f.piezas ? ` · ${Number(f.piezas).toLocaleString("es")} piezas` : "";
      const gemela = ahora.gemela ? ` → gemela: «${ahora.gemela}»` : "";
      cambian.push(`  ${antes} → ${ahora.veredicto}  ${f.marca} · «${f.descripcion}»${piezas}  [${ahora.texto ?? ""}]${gemela}`);
    }
    console.log(`\n${titulo}: ${filas.length} filas · ${iguales} IGUALES · ${cambian.length} CAMBIAN`);
    cambian.forEach((l) => console.log(l));
  };

  medir("A) Las 281 del catálogo", cat.map((r) => ({ marca: r.marca, descripcion: r.descripcion })));
  medir("B) Descripciones VIVAS del inventario (existencia > 0)", vivos);

  // El caso que originó el cambio.
  console.log("\nEl caso de Daniel:");
  for (const [d, m] of [["Men-Polos S/S Core", "TH Menswear"], ["Boys-Polos S/S Core", "TH Kids"]] as const) {
    const antes = veredictoDescripcion(d, catalogo);
    const ahora = veredictoDescripcion(d, catalogo, m);
    console.log(`  «${d}» en ${m}: antes ${antes.veredicto} → ahora ${ahora.veredicto} ${ahora.gemela ? `(gemela «${ahora.gemela}»)` : ""}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
