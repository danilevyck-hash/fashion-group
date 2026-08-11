// READ-ONLY: mide el RESUMEN por artículo del tab Ventas › Referencia.
// Usa los MISMOS módulos puros que la pantalla (armarArticulo), así que lo que
// imprime es exactamente lo que vería Daniel.
// Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-resumen-articulo.ts [CODIGO...]

import { createClient } from "@supabase/supabase-js";
import { armarArticulo, type FilaIngreso } from "../src/lib/ventas/compras";
import { REFERENCIA_EMPRESA_KEYS } from "../src/lib/ventas/referencia";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } });

const CODIGOS = process.argv.slice(2).length ? process.argv.slice(2) : ["NB2570001"];
const HOY = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

/* eslint-disable @typescript-eslint/no-explicit-any */
async function paginado<T>(tabla: string, sel: string, filtro: (q: any) => any, orden: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; desde < 60_000; desde += 1000) {
    let q = filtro(db.from(tabla).select(sel)).in("empresa_key", [...REFERENCIA_EMPRESA_KEYS]);
    for (const o of orden) q = q.order(o, { ascending: true });
    const { data, error } = await q.range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

async function main() {
  for (const CODIGO of CODIGOS) {
    const [ventas, ingresos, info] = await Promise.all([
      paginado<any>(
        "switch_articulo_diario",
        "empresa_key, fecha, codigo, descripcion, tipo, cantidad_total, venta_total",
        (q) => q.eq("codigo", CODIGO),
        ["id"],
      ),
      paginado<FilaIngreso>(
        "switch_ingresos_mercancia",
        "empresa_key, fecha, n_interno, linea, proveedor, codigo_articulo, articulo, precio, cantidad, costo_fob, costo_cif, costo_sin_desglosar, fob_confiable",
        (q) => q.eq("codigo_articulo", CODIGO),
        ["fecha", "empresa_key", "n_interno", "linea"],
      ),
      paginado<any>(
        "switch_articulo_info",
        "empresa_key, codigo, descripcion, existencia, precio_etiqueta, synced_at",
        (q) => q.eq("codigo", CODIGO),
        ["codigo", "empresa_key"],
      ),
    ]);

    const empresas = new Set<string>();
    for (const v of ventas) empresas.add(v.empresa_key);
    for (const i of ingresos) empresas.add(i.empresa_key);
    for (const i of info) empresas.add(i.empresa_key);

    for (const emp of empresas) {
      const vs = ventas.filter((v) => v.empresa_key === emp);
      const gs = ingresos.filter((g) => g.empresa_key === emp);
      const inf = info.find((i) => i.empresa_key === emp) ?? null;

      const art = armarArticulo(
        {
          empresa: emp,
          codigo: CODIGO,
          descripcion: inf?.descripcion || vs[0]?.descripcion || gs[0]?.articulo || "",
          ingresos: gs,
          ventas: vs,
          existencia: inf?.existencia != null ? Number(inf.existencia) : null,
          precioEtiqueta: inf?.precio_etiqueta != null ? Number(inf.precio_etiqueta) : null,
          catalogoSyncedAt: inf?.synced_at ?? null,
        },
        HOY,
      );

      console.log(`\n═══ ${CODIGO} · ${emp} · ${art.descripcion} ═══`);
      console.log(`existencia Switch: ${art.existencia}`);
      console.log(`comprado ${art.cuadre.comprado} · vendido ${art.cuadre.vendido} · residuo ${art.cuadre.residuo}`);
      console.log(`compras visibles ${art.compras.length} · fuera de ventana ${art.comprasFueraDeVentana}`);
      console.log(`vendidoAntes ${art.vendidoAntes} · vendidoDeMas ${art.vendidoDeMas} · stockSinRespaldo ${art.stockSinRespaldo}`);
      console.log(`sinCompraRegistrada ${art.sinCompraRegistrada}`);

      console.log(`\n  COMPRAS VISIBLES (nueva primero):`);
      let sumaQuedanVisibles = 0;
      for (const c of art.compras) {
        sumaQuedanVisibles += c.quedan;
        console.log(
          `   ${c.fecha} · ${String(c.unidades).padStart(5)} u · vendidas ${String(c.vendidas).padStart(5)} · quedan ${String(c.quedan).padStart(5)} · estado ${c.estado.padEnd(15)} · meses ${c.meses != null ? c.meses.toFixed(2) : "—"}`,
        );
      }
      console.log(`  Σ quedan (visibles) = ${sumaQuedanVisibles}`);

      // Agotadas = las que YA no tienen nada en bodega y llegaron a medirse.
      const agotadas = art.compras.filter((c) => c.estado === "medida" || c.estado === "cerrada-sin-90");
      console.log(`\n  AGOTADAS (${agotadas.length}): ${agotadas.map((c) => `${c.fecha}=${c.meses?.toFixed(2)}m/${c.unidades}u`).join(" · ")}`);
      if (agotadas.length) {
        const ms = agotadas.map((c) => c.meses!).filter((m) => Number.isFinite(m));
        const u = agotadas.reduce((s, c) => s + c.unidades, 0);
        const mm = agotadas.reduce((s, c) => s + c.meses! * c.unidades, 0);
        console.log(`   promedio simple: ${(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(2)}`);
        console.log(`   rango: ${Math.min(...ms).toFixed(2)} → ${Math.max(...ms).toFixed(2)}`);
        console.log(`   última agotada (por fecha de llegada): ${agotadas[0].fecha} = ${agotadas[0].meses?.toFixed(2)}`);
        console.log(`   ponderado por unidades: ${(mm / u).toFixed(2)}  (Σu=${u})`);
        console.log(`   ritmo ponderado (u/mes): ${(u / mm * u / u).toFixed(2)} → u÷Σmeses·u ... unidades/mes = ${(u / (mm / u)).toFixed(2)}`);
      }
    }
  }
}

main().catch((e) => {
  console.error("ERROR:", e?.message ?? e);
  process.exit(1);
});
