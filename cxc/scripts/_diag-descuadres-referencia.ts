// Diagnóstico READ-ONLY: ¿dónde NO cuadra `Compré − Vendí` contra `Me quedan`?
//
// Los tres grandes del tab Referencia NO fuerzan el cuadre (ajustes, ventas sin
// compra registrada, robos) — este barrido mide QUÉ TAN grandes son los peores
// descuadres reales para poder mirarlos con los avisos puestos. También lista
// los peores casos de COMPRAS SOLAPADAS (varias compras vivas), que es donde la
// línea del 90% usa el agregado rotulado.
//
// Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-descuadres-referencia.ts
//
// 🔴 NO ESCRIBE NADA. Lecturas paginadas y SECUENCIALES (no saturar Supabase):
// ~35 páginas de ingresos + ventas de los ~220 códigos más comprados en tandas.

import { createClient } from "@supabase/supabase-js";
import { armarArticulo } from "../src/lib/ventas/compras";
import { REFERENCIA_EMPRESA_KEYS } from "../src/lib/ventas/referencia";
import { medirNoventa, textoNoventa } from "../src/lib/ventas/resumen-articulo";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const HOY = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const HOY_MES = HOY.slice(0, 7);
const TOP = 220;

async function paginado<T>(tabla: string, sel: string, filtro: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await filtro(db.from(tabla).select(sel)).range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

async function main() {
  console.log(`hoy (Panamá) = ${HOY}\n`);

  // 1) TODAS las compras, agregadas por (empresa, código).
  const ingresos = await paginado<any>(
    "switch_ingresos_mercancia",
    "empresa_key, fecha, n_interno, codigo_articulo, cantidad",
    (q) => q.in("empresa_key", [...REFERENCIA_EMPRESA_KEYS]).order("empresa_key").order("codigo_articulo").order("fecha").order("n_interno"),
  );
  console.log(`ingresos: ${ingresos.length} líneas`);

  const porCodigo = new Map<string, { empresa: string; codigo: string; comprado: number; compras: Set<string>; meses12: Set<string> }>();
  const inicio12 = `${Number(HOY_MES.slice(0, 4)) - 1}${HOY_MES.slice(4)}`;
  for (const f of ingresos) {
    const k = `${f.empresa_key}·${f.codigo_articulo}`;
    const g = porCodigo.get(k) ?? {
      empresa: f.empresa_key,
      codigo: f.codigo_articulo,
      comprado: 0,
      compras: new Set<string>(),
      meses12: new Set<string>(),
    };
    g.comprado += Number(f.cantidad) || 0;
    g.compras.add(`${f.fecha}·${f.n_interno}`);
    if (String(f.fecha).slice(0, 7) >= inicio12) g.meses12.add(String(f.fecha).slice(0, 7));
    porCodigo.set(k, g);
  }

  // 2) Los TOP por unidades compradas + todos los que tienen 2+ llegadas en 12m.
  const todos = [...porCodigo.values()];
  const top = [...todos].sort((a, b) => b.comprado - a.comprado).slice(0, TOP);
  const solapados = todos.filter((g) => g.meses12.size >= 2);
  const elegidos = new Map<string, (typeof todos)[number]>();
  for (const g of [...top, ...solapados]) elegidos.set(`${g.empresa}·${g.codigo}`, g);
  console.log(`códigos a medir: ${elegidos.size} (top ${TOP} + ${solapados.length} con 2+ llegadas en 12m)\n`);

  // 3) Ventas + existencia + ingresos completos de esos códigos, en tandas.
  const codigos = [...new Set([...elegidos.values()].map((g) => g.codigo))];
  const resultados: {
    empresa: string;
    codigo: string;
    comprado: number;
    vendido: number;
    existencia: number | null;
    residuo: number | null;
    compras: number;
    noventa: string | null;
  }[] = [];

  for (let i = 0; i < codigos.length; i += 120) {
    const lote = codigos.slice(i, i + 120);
    const [ven, inf, ing] = [
      await paginado<any>(
        "switch_articulo_diario",
        "empresa_key, fecha, codigo, tipo, cantidad_total, venta_total",
        (q) => q.in("empresa_key", [...REFERENCIA_EMPRESA_KEYS]).in("codigo", lote).order("codigo").order("fecha").order("tipo"),
      ),
      await paginado<any>(
        "switch_articulo_info",
        "empresa_key, codigo, existencia",
        (q) => q.in("empresa_key", [...REFERENCIA_EMPRESA_KEYS]).in("codigo", lote).order("codigo"),
      ),
      await paginado<any>(
        "switch_ingresos_mercancia",
        "empresa_key, fecha, n_interno, linea, proveedor, codigo_articulo, articulo, precio, cantidad, costo_fob, costo_cif, costo_sin_desglosar, fob_confiable",
        (q) => q.in("empresa_key", [...REFERENCIA_EMPRESA_KEYS]).in("codigo_articulo", lote).order("codigo_articulo").order("fecha"),
      ),
    ];

    for (const g of [...elegidos.values()].filter((x) => lote.includes(x.codigo))) {
      const venE = ven.filter((r) => r.empresa_key === g.empresa && r.codigo === g.codigo);
      const infE = inf.find((r) => r.empresa_key === g.empresa && r.codigo === g.codigo);
      const ingE = ing.filter((r) => r.empresa_key === g.empresa && r.codigo_articulo === g.codigo);
      const art = armarArticulo(
        {
          empresa: g.empresa,
          codigo: g.codigo,
          descripcion: "",
          ingresos: ingE,
          ventas: venE,
          existencia: infE?.existencia == null ? null : Number(infE.existencia),
          precioEtiqueta: null,
          catalogoSyncedAt: null,
        },
        HOY,
      );
      resultados.push({
        empresa: g.empresa,
        codigo: g.codigo,
        comprado: art.cuadre.comprado,
        vendido: art.cuadre.vendido,
        existencia: art.cuadre.existencia,
        residuo: art.cuadre.residuo,
        compras: g.compras.size,
        noventa: textoNoventa(medirNoventa(art, HOY_MES)),
      });
    }
  }

  // 4) Peores descuadres |Compré − Vendí − Quedan|.
  const conResiduo = resultados.filter((r) => r.residuo != null);
  conResiduo.sort((a, b) => Math.abs(b.residuo!) - Math.abs(a.residuo!));
  console.log("═══ PEORES DESCUADRES: Compré − Vendí ≠ Me quedan ═══");
  for (const r of conResiduo.slice(0, 15)) {
    console.log(
      `  ${r.codigo.padEnd(16)} ${r.empresa.padEnd(13)} compré ${String(r.comprado).padStart(6)} · vendí ${String(r.vendido).padStart(6)} · quedan ${String(r.existencia).padStart(6)} → residuo ${String(r.residuo).padStart(6)} (${r.compras} compras)`,
    );
  }

  // 5) Compras solapadas: los agregados más grandes de la línea del 90%.
  const agregados = resultados.filter((r) => r.noventa?.startsWith("Desde"));
  agregados.sort((a, b) => b.comprado - a.comprado);
  console.log("\n═══ COMPRAS SOLAPADAS (línea del 90% en modo agregado) ═══");
  for (const r of agregados.slice(0, 15)) {
    console.log(`  ${r.codigo.padEnd(16)} ${r.empresa.padEnd(13)} ${r.noventa}`);
  }

  // Guard: ningún agregado puede decir "van X de Y" con X > Y tras la
  // extensión del ancla — salvo que ni la compra más vieja con fecha alcance.
  const rotos = resultados.filter((r) => {
    const m = r.noventa?.match(/llegaron ([\d,]+) u · van vendidas ([\d,]+)/);
    if (!m) return false;
    return Number(m[2].replace(/,/g, "")) > Number(m[1].replace(/,/g, ""));
  });
  console.log(`\nagregados con van > llegaron (ni extendiendo el ancla alcanza): ${rotos.length}`);
  for (const r of rotos.slice(0, 10)) console.log(`  ${r.codigo} ${r.empresa}: ${r.noventa}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
