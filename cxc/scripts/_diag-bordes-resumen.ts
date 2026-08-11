// READ-ONLY: casos borde del resumen por artículo + unión exacta de NB2570001.
// Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-bordes-resumen.ts

import { createClient } from "@supabase/supabase-js";
import { armarArticulo, diasEntre, DIAS_POR_MES, type FilaIngreso } from "../src/lib/ventas/compras";
import { REFERENCIA_EMPRESA_KEYS } from "../src/lib/ventas/referencia";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } });
const HOY = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

/* eslint-disable @typescript-eslint/no-explicit-any */
async function pag<T>(tabla: string, sel: string, filtro: (q: any) => any, orden: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let d = 0; d < 80_000; d += 1000) {
    let q = filtro(db.from(tabla).select(sel)).in("empresa_key", [...REFERENCIA_EMPRESA_KEYS]);
    for (const o of orden) q = q.order(o, { ascending: true });
    const { data, error } = await q.range(d, d + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

async function armar(codigos: string[]) {
  const [ventas, ingresos, info] = await Promise.all([
    pag<any>("switch_articulo_diario", "empresa_key, fecha, codigo, descripcion, tipo, cantidad_total, venta_total", (q) => q.in("codigo", codigos), ["id"]),
    pag<FilaIngreso>("switch_ingresos_mercancia", "empresa_key, fecha, n_interno, linea, proveedor, codigo_articulo, articulo, precio, cantidad, costo_fob, costo_cif, costo_sin_desglosar, fob_confiable", (q) => q.in("codigo_articulo", codigos), ["fecha", "empresa_key", "n_interno", "linea"]),
    pag<any>("switch_articulo_info", "empresa_key, codigo, descripcion, existencia, precio_etiqueta, synced_at", (q) => q.in("codigo", codigos), ["codigo", "empresa_key"]),
  ]);
  const out = [];
  for (const codigo of codigos) {
    const emps = new Set<string>([
      ...ventas.filter((v) => v.codigo === codigo).map((v) => v.empresa_key),
      ...ingresos.filter((g) => g.codigo_articulo === codigo).map((g) => g.empresa_key),
      ...info.filter((i) => i.codigo === codigo).map((i) => i.empresa_key),
    ]);
    for (const emp of emps) {
      const inf = info.find((i) => i.empresa_key === emp && i.codigo === codigo) ?? null;
      out.push(
        armarArticulo(
          {
            empresa: emp,
            codigo,
            descripcion: inf?.descripcion || "",
            ingresos: ingresos.filter((g) => g.empresa_key === emp && g.codigo_articulo === codigo),
            ventas: ventas.filter((v) => v.empresa_key === emp && v.codigo === codigo),
            existencia: inf?.existencia != null ? Number(inf.existencia) : null,
            precioEtiqueta: null,
            catalogoSyncedAt: inf?.synced_at ?? null,
          },
          HOY,
        ),
      );
    }
  }
  return out;
}

async function main() {
  // ── 1) NB2570001 con fechas de umbral exactas ────────────────────────────
  const [nb] = await armar(["NB2570001"]);
  console.log(`\n═══ NB2570001 · existencia Switch ${nb.existencia} ═══`);
  for (const c of nb.compras) {
    console.log(`  llegó ${c.fecha} · ${c.unidades} u · estado ${c.estado} · 90% el ${c.fechaUmbral ?? "—"} · ${c.meses?.toFixed(2) ?? "—"} meses · quedan ${c.quedan}`);
  }
  const ag = nb.compras.filter((c) => c.fechaUmbral != null);
  const desde = ag.map((c) => c.fecha).sort()[0];
  const hasta = ag.map((c) => c.fechaUmbral!).sort().pop()!;
  console.log(`  UNIÓN: ${desde} → ${hasta} = ${diasEntre(desde, hasta)} días = ${(diasEntre(desde, hasta) / DIAS_POR_MES).toFixed(2)} meses`);
  console.log(`  unidades de compras agotadas = ${ag.reduce((s, c) => s + c.unidades, 0)}`);

  // ── 2) Barrido para encontrar casos borde reales ─────────────────────────
  const muestra = await pag<any>("switch_ingresos_mercancia", "codigo_articulo, empresa_key", (q) => q.gte("fecha", "2024-01-01"), ["codigo_articulo"]);
  const codigos = [...new Set(muestra.map((r) => r.codigo_articulo))];
  const paso = Math.max(1, Math.floor(codigos.length / 300));
  const sub = codigos.filter((_, i) => i % paso === 0).slice(0, 300);
  const arts = await armar(sub);

  const sinAgotadas = arts.filter((a) => !a.sinCompraRegistrada && a.compras.length > 0 && a.compras.every((c) => c.estado === "viva" || c.estado === "sin-ventas"));
  const agotado0 = arts.filter((a) => a.existencia === 0 && a.compras.length > 0);
  const sinCompra = arts.filter((a) => a.sinCompraRegistrada);
  const sinExistencia = arts.filter((a) => a.existencia == null && a.compras.length > 0);
  const conOcultasVivas = arts.filter((a) => a.comprasFueraDeVentana > 0 && a.existencia != null && a.compras.reduce((s, c) => s + c.quedan, 0) < a.existencia);

  const muestraDe = (t: string, xs: typeof arts, n = 4) => {
    console.log(`\n── ${t}: ${xs.length} de ${arts.length}`);
    for (const a of xs.slice(0, n)) {
      console.log(`   ${a.codigo} (${a.empresa}) exist=${a.existencia} compras=${a.compras.length} fuera=${a.comprasFueraDeVentana} Σquedan_visibles=${a.compras.reduce((s, c) => s + c.quedan, 0)} estados=[${a.compras.map((c) => c.estado).join(",")}]`);
    }
  };
  muestraDe("SIN NINGUNA COMPRA AGOTADA (todas vivas)", sinAgotadas);
  muestraDe("AGOTADO (existencia 0)", agotado0);
  muestraDe("SIN COMPRA REGISTRADA", sinCompra);
  muestraDe("SIN EXISTENCIA DE SWITCH (null)", sinExistencia);
  muestraDe("⚠ OCULTAS >3 AÑOS CON UNIDADES VIVAS (Σvisible < existencia)", conOcultasVivas, 8);
}

main().catch((e) => {
  console.error("ERROR:", e?.message ?? e);
  process.exit(1);
});
