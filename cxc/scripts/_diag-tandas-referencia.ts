// Barrido READ-ONLY contra producción: ¿cuántos códigos tienen 2+ TANDAS
// (episodios entre ceros de bodega) en Ventas › Referencia?
//
// Corre los MISMOS módulos puros que la pantalla (`armarArticulo` +
// `medirTandas`), código por código, y reporta:
//   · cuántos códigos tienen 2+ tandas (los que CAMBIAN con la regla nueva),
//   · cuántos tienen 1 / timeline no afirmable (los que NO cambian),
//   · la sensibilidad del criterio de "quedó en 0": el conteo con el umbral
//     de la casa (min(2, 10% de la tanda)) contra el 0 exacto,
//   · ejemplos reales de 2+ tandas para mirar a mano.
//
// Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-tandas-referencia.ts [empresa]
//   (default: vistana — la empresa de la captura de Daniel)

import { createClient } from "@supabase/supabase-js";
import { armarArticulo, type FilaIngreso } from "../src/lib/ventas/compras";
import { medirTandas, umbralTandaCero, type Tanda } from "../src/lib/ventas/resumen-articulo";

const verTanda = (t: Tanda) =>
  `${t.desdeMes}: llegaron ${t.llegaron} · vendidas ${t.vendidas} · ${t.cerrada ? "CERRADA" : "viva"} · ${t.meses} m`;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const EMPRESA = process.argv[2] ?? "vistana";
const HOY = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const HOY_MES = HOY.slice(0, 7);

/** Lee TODO paginado con orden estable — db-max-rows=1000 corta en silencio. */
async function leerTodo<T>(tabla: string, columnas: string, orden: string[]): Promise<T[]> {
  const out: T[] = [];
  const PAGINA = 1000;
  for (let desde = 0; ; desde += PAGINA) {
    let q = db.from(tabla).select(columnas).eq("empresa_key", EMPRESA);
    for (const o of orden) q = q.order(o);
    const { data, error } = await q.range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGINA) break;
  }
  return out;
}

async function main() {
  console.log(`empresa=${EMPRESA} · hoy (Panamá)=${HOY}\n`);

  const ing = await leerTodo<FilaIngreso>(
    "switch_ingresos_mercancia",
    "empresa_key, fecha, n_interno, codigo_articulo, cantidad",
    ["fecha", "n_interno", "linea"],
  );
  console.log(`ingresos: ${ing.length} líneas`);
  const ven = await leerTodo<{ fecha: string; codigo: string; tipo: string; cantidad_total: number; venta_total: number }>(
    "switch_articulo_diario",
    "fecha, codigo, tipo, cantidad_total, venta_total",
    ["id"],
  );
  console.log(`ventas diarias: ${ven.length} filas`);
  const inf = await leerTodo<{ codigo: string; existencia: number | null }>(
    "switch_articulo_info",
    "codigo, existencia",
    ["codigo"],
  );
  console.log(`catálogo: ${inf.length} códigos\n`);

  const ingPor = new Map<string, FilaIngreso[]>();
  for (const r of ing) {
    const l = ingPor.get(r.codigo_articulo) ?? [];
    l.push(r);
    ingPor.set(r.codigo_articulo, l);
  }
  const venPor = new Map<string, typeof ven>();
  for (const r of ven) {
    const l = venPor.get(r.codigo) ?? [];
    l.push(r);
    venPor.set(r.codigo, l);
  }
  const exisPor = new Map(inf.map((r) => [r.codigo, r.existencia == null ? null : Number(r.existencia)]));

  const codigos = new Set([...ingPor.keys(), ...venPor.keys()]);
  let noAfirmable = 0;
  let una = 0;
  let cero = 0;
  const dosMas: { codigo: string; tandas: string[] }[] = [];
  let dosMasConUmbralCero = 0; // sensibilidad: exigir saldo ≤ 0 exacto
  let vivas = 0;
  let agotadas = 0;

  for (const codigo of codigos) {
    const art = armarArticulo(
      {
        empresa: EMPRESA,
        codigo,
        descripcion: "",
        ingresos: ingPor.get(codigo) ?? [],
        ventas: venPor.get(codigo) ?? [],
        existencia: exisPor.get(codigo) ?? null,
        precioEtiqueta: null,
        catalogoSyncedAt: null,
      },
      HOY,
    );
    const m = medirTandas(art, HOY_MES);
    if (m == null) {
      noAfirmable += 1;
      continue;
    }
    if (m.tandas.length === 0) cero += 1;
    else if (m.tandas.length === 1) una += 1;
    else {
      dosMas.push({ codigo, tandas: m.tandas.map(verTanda) });
      if (m.tandas[m.tandas.length - 1].cerrada) agotadas += 1;
      else vivas += 1;
    }
    const estricto = medirTandas(art, HOY_MES, () => 0);
    if (estricto && estricto.tandas.length >= 2) dosMasConUmbralCero += 1;
  }

  console.log(`códigos mirados: ${codigos.size}`);
  console.log(`  timeline no afirmable (fuera de ventana / vendido antes / vendido de más) → sin cambios: ${noAfirmable}`);
  console.log(`  1 tanda (nunca tocó 0) → sin cambios: ${una}${cero ? ` · 0 tandas: ${cero}` : ""}`);
  console.log(`  🔴 2+ tandas (los que CAMBIAN): ${dosMas.length} (actual viva: ${vivas} · actual agotada: ${agotadas})`);
  console.log(
    `  sensibilidad del "quedó en 0": con el umbral de la casa (min(2, 10%)) ${dosMas.length} · con 0 exacto ${dosMasConUmbralCero}`,
  );
  console.log(`  (umbral para una tanda de 36 u: ${umbralTandaCero(36)} · de 8 u: ${umbralTandaCero(8)})\n`);

  const distr = new Map<number, number>();
  for (const d of dosMas) distr.set(d.tandas.length, (distr.get(d.tandas.length) ?? 0) + 1);
  console.log(
    `distribución: ${[...distr.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n} tandas: ${c}`).join(" · ")}\n`,
  );

  console.log("ejemplos (primeros 15):");
  for (const d of dosMas.slice(0, 15)) {
    console.log(`  ${d.codigo}`);
    for (const t of d.tandas) console.log(`     ${t}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
