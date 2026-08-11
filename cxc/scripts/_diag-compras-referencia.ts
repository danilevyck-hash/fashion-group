// Diagnóstico read-only: compras reales (switch_ingresos_mercancia) vs ventas
// (switch_articulo_diario) para el tab Ventas › Referencia.
// Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-compras-referencia.ts [CODIGO]

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } });

const CODIGO = process.argv[2] ?? "40HM265032";

async function paginado<T>(tabla: string, sel: string, filtro: (q: any) => any, orden: string): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; desde < 60_000; desde += 1000) {
    const { data, error } = await filtro(db.from(tabla).select(sel)).order(orden).range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

async function main() {
  console.log(`\n═══ ${CODIGO} ═══\n`);

  // 1) Compras
  const compras = await paginado<any>(
    "switch_ingresos_mercancia",
    "empresa_key, fecha, n_interno, sucursal, proveedor, codigo_articulo, articulo, referencia, precio, cantidad, costo_fob, costo_cif, costo_promedio, linea",
    (q) => q.eq("codigo_articulo", CODIGO),
    "fecha",
  );
  console.log(`COMPRAS (${compras.length} líneas):`);
  for (const c of compras) {
    console.log(
      `  ${c.fecha} · ${c.empresa_key} · doc ${c.n_interno} · ${c.cantidad} u · FOB ${c.costo_fob} · CIF ${c.costo_cif} · prom ${c.costo_promedio} · precio ${c.precio} · ${c.proveedor}`,
    );
  }

  // 2) Ventas por mes y tipo
  const ventas = await paginado<any>(
    "switch_articulo_diario",
    "empresa_key, fecha, codigo, descripcion, tipo, cantidad_total, venta_total, costo_total",
    (q) => q.eq("codigo", CODIGO),
    "fecha",
  );
  const porMes = new Map<string, { u: number; v: number; tipos: Record<string, number> }>();
  const porTipo: Record<string, { u: number; v: number; n: number }> = {};
  for (const f of ventas) {
    const mes = String(f.fecha).slice(0, 7);
    const s = f.tipo === "NC" ? -1 : 1;
    const m = porMes.get(mes) ?? { u: 0, v: 0, tipos: {} };
    m.u += s * Number(f.cantidad_total);
    m.v += s * Number(f.venta_total);
    m.tipos[f.tipo] = (m.tipos[f.tipo] ?? 0) + Number(f.cantidad_total);
    porMes.set(mes, m);
    const t = (porTipo[f.tipo] ??= { u: 0, v: 0, n: 0 });
    t.u += Number(f.cantidad_total);
    t.v += Number(f.venta_total);
    t.n += 1;
  }
  console.log(`\nVENTAS por tipo (magnitudes crudas):`);
  for (const [tipo, t] of Object.entries(porTipo)) {
    console.log(`  ${tipo}: ${t.n} filas · ${t.u} u · $${t.v.toFixed(2)}`);
  }
  const netoU = Object.entries(porTipo).reduce((s, [t, v]) => s + (t === "NC" ? -1 : 1) * v.u, 0);
  const netoV = Object.entries(porTipo).reduce((s, [t, v]) => s + (t === "NC" ? -1 : 1) * v.v, 0);
  const crudoU = Object.values(porTipo).reduce((s, v) => s + v.u, 0);
  console.log(`  NETO (NC restadas): ${netoU} u · $${netoV.toFixed(2)}`);
  console.log(`  CRUDO (mal, NC sumadas): ${crudoU} u  ← la diferencia debe ser 2× las NC`);

  console.log(`\nVENTAS mes a mes (neto):`);
  const meses = [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let acum = 0;
  const totalCompra = compras.reduce((s, c) => s + Number(c.cantidad), 0);
  for (const [mes, m] of meses) {
    acum += m.u;
    const pct = totalCompra > 0 ? ((acum / totalCompra) * 100).toFixed(1) : "—";
    console.log(
      `  ${mes}  ${String(m.u).padStart(5)} u  acum ${String(acum).padStart(5)}  ${String(pct).padStart(6)}%  $${m.v.toFixed(2)}  ${JSON.stringify(m.tipos)}`,
    );
  }

  // 3) Info de catálogo
  const { data: info } = await db
    .from("switch_articulo_info")
    .select("empresa_key, codigo, descripcion, existencia, precio_etiqueta, costo_api, synced_at")
    .eq("codigo", CODIGO);
  console.log(`\nCATALOGO:`, JSON.stringify(info, null, 2));

  console.log(`\nCUADRE: comprado ${totalCompra} − vendido neto ${netoU} = ${totalCompra - netoU} (¿existencia?)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
