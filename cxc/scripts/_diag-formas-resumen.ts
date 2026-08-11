// READ-ONLY: compara FORMAS de resumir "cuánto tarda en venderse" a nivel
// artículo, sobre una muestra real de códigos con 2+ compras agotadas.
// Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-formas-resumen.ts [N]

import { createClient } from "@supabase/supabase-js";
import { armarArticulo, diasEntre, DIAS_POR_MES, type FilaIngreso, type CompraMedida } from "../src/lib/ventas/compras";
import { REFERENCIA_EMPRESA_KEYS } from "../src/lib/ventas/referencia";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } });
const N = Number(process.argv[2] ?? 60);
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

/** Unión de los intervalos [llegada, fecha del 90%] de las compras agotadas. */
function mesesUnion(agotadas: CompraMedida[]): number {
  const iv = agotadas
    .map((c) => {
      const fin = c.fechaUmbral ?? null;
      return fin ? { a: c.fecha, b: fin } : null;
    })
    .filter((x): x is { a: string; b: string } => x != null)
    .sort((x, y) => x.a.localeCompare(y.a));
  if (!iv.length) return 0;
  let dias = 0;
  let curA = iv[0].a;
  let curB = iv[0].b;
  for (const v of iv.slice(1)) {
    if (v.a <= curB) {
      if (v.b > curB) curB = v.b;
    } else {
      dias += diasEntre(curA, curB);
      curA = v.a;
      curB = v.b;
    }
  }
  dias += diasEntre(curA, curB);
  return dias / DIAS_POR_MES;
}

async function main() {
  // Códigos con más de una compra: se muestrean del universo de ingresos.
  const muestra = await pag<any>(
    "switch_ingresos_mercancia",
    "codigo_articulo, empresa_key, fecha",
    (q) => q.gte("fecha", "2022-01-01"),
    ["codigo_articulo"],
  );
  const conteo = new Map<string, number>();
  for (const r of muestra) conteo.set(r.codigo_articulo, (conteo.get(r.codigo_articulo) ?? 0) + 1);
  const candidatos = [...conteo.entries()].filter(([, n]) => n >= 2).map(([c]) => c);
  console.log(`códigos con 2+ líneas de ingreso: ${candidatos.length} (de ${conteo.size})`);

  // Muestreo determinista repartido por todo el universo.
  const paso = Math.max(1, Math.floor(candidatos.length / N));
  const codigos = candidatos.filter((_, i) => i % paso === 0).slice(0, N);

  const [ventas, ingresos, info] = await Promise.all([
    pag<any>("switch_articulo_diario", "empresa_key, fecha, codigo, descripcion, tipo, cantidad_total, venta_total", (q) => q.in("codigo", codigos), ["id"]),
    pag<FilaIngreso>("switch_ingresos_mercancia", "empresa_key, fecha, n_interno, linea, proveedor, codigo_articulo, articulo, precio, cantidad, costo_fob, costo_cif, costo_sin_desglosar, fob_confiable", (q) => q.in("codigo_articulo", codigos), ["fecha", "empresa_key", "n_interno", "linea"]),
    pag<any>("switch_articulo_info", "empresa_key, codigo, descripcion, existencia, precio_etiqueta, synced_at", (q) => q.in("codigo", codigos), ["codigo", "empresa_key"]),
  ]);

  let conAgotadas2 = 0;
  let artefactoQueue = 0;
  const filas: string[] = [];

  for (const codigo of codigos) {
    const emps = new Set<string>([
      ...ventas.filter((v) => v.codigo === codigo).map((v) => v.empresa_key),
      ...ingresos.filter((g) => g.codigo_articulo === codigo).map((g) => g.empresa_key),
    ]);
    for (const emp of emps) {
      const inf = info.find((i) => i.empresa_key === emp && i.codigo === codigo) ?? null;
      const art = armarArticulo(
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
      );
      const agotadas = art.compras.filter((c) => c.estado === "medida" || c.estado === "cerrada-sin-90");
      if (agotadas.length < 2) continue;
      conAgotadas2 += 1;

      const ms = agotadas.map((c) => c.meses!).filter(Number.isFinite);
      const prom = ms.reduce((a, b) => a + b, 0) / ms.length;
      const min = Math.min(...ms);
      const max = Math.max(...ms);
      const ultima = agotadas[0].meses!; // compras vienen nueva primero
      const u = agotadas.reduce((s, c) => s + c.unidades, 0);
      const pond = agotadas.reduce((s, c) => s + c.meses! * c.unidades, 0) / u;
      const union = mesesUnion(agotadas);
      const ritmo = union > 0 ? agotadas.reduce((s, c) => s + c.vendidas, 0) / union : 0;

      // ¿Hay artefacto de cola? Dos llegadas cercanas con duraciones muy distintas.
      const solapan = union < ms.reduce((a, b) => a + b, 0) * 0.85;
      if (solapan) artefactoQueue += 1;

      filas.push(
        `${codigo.padEnd(15)} ${emp.padEnd(14)} n=${agotadas.length} u=${String(u).padStart(5)} | prom ${prom.toFixed(1).padStart(5)} | rango ${min.toFixed(1)}–${max.toFixed(1)} | última ${ultima.toFixed(1).padStart(5)} | pond ${pond.toFixed(1).padStart(5)} | unión ${union.toFixed(1).padStart(5)} | ritmo ${ritmo.toFixed(1).padStart(6)} u/m ${solapan ? "⚠solapan" : ""}`,
      );
    }
  }

  console.log(`\nartículos con 2+ compras agotadas: ${conAgotadas2}`);
  console.log(`de esos, con lotes que SE SOLAPAN (artefacto de cola): ${artefactoQueue} (${((artefactoQueue / Math.max(1, conAgotadas2)) * 100).toFixed(0)}%)\n`);
  for (const f of filas.slice(0, 45)) console.log(f);
}

main().catch((e) => {
  console.error("ERROR:", e?.message ?? e);
  process.exit(1);
});
