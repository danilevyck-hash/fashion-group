// Medición READ-ONLY para el rediseño de Ventas › Referencia.
// Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-referencia-simple.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } });

const CODIGOS = (process.env.CODIGOS ?? "NB2570001,QD3958033").split(",");

const EMPRESAS = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "joystep",
];

async function main() {
  for (const codigo of CODIGOS) {
    console.log(`\n${"═".repeat(70)}\n${codigo}\n${"═".repeat(70)}`);

    const { data: info, error: e1 } = await db
      .from("switch_articulo_info")
      .select("empresa_key, codigo, descripcion, existencia, precio_etiqueta, synced_at")
      .eq("codigo", codigo)
      .in("empresa_key", EMPRESAS);
    if (e1) throw e1;
    console.log("INFO:", JSON.stringify(info, null, 1));

    const { data: ing, error: e2 } = await db
      .from("switch_ingresos_mercancia")
      .select(
        "empresa_key, fecha, n_interno, linea, proveedor, articulo, precio, cantidad, costo_fob, costo_cif, costo_sin_desglosar, fob_confiable",
      )
      .eq("codigo_articulo", codigo)
      .in("empresa_key", EMPRESAS)
      .order("fecha", { ascending: true });
    if (e2) throw e2;
    console.log("\nINGRESOS:");
    for (const r of ing ?? []) {
      console.log(
        `  ${r.fecha} ${r.empresa_key} doc=${r.n_interno} cant=${r.cantidad} cif=${r.costo_cif} fob=${r.costo_fob} sinDesg=${r.costo_sin_desglosar} precio=${r.precio} fobConf=${r.fob_confiable} prov=${r.proveedor}`,
      );
    }

    // ventas: paginado simple
    const ventas: {
      fecha: string;
      tipo: string;
      cantidad_total: number;
      venta_total: number;
      empresa_key: string;
    }[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await db
        .from("switch_articulo_diario")
        .select("empresa_key, fecha, tipo, cantidad_total, venta_total")
        .eq("codigo", codigo)
        .in("empresa_key", EMPRESAS)
        .order("id", { ascending: true })
        .range(desde, desde + 999);
      if (error) throw error;
      ventas.push(...((data ?? []) as never[]));
      if (!data || data.length < 1000) break;
    }

    const signo = (t: string) => (t === "NC" ? -1 : 1);
    const porMes = new Map<string, { u: number; v: number }>();
    for (const r of ventas) {
      const m = r.fecha.slice(0, 7);
      const g = porMes.get(m) ?? { u: 0, v: 0 };
      g.u += signo(r.tipo) * Number(r.cantidad_total);
      g.v += signo(r.tipo) * Number(r.venta_total);
      porMes.set(m, g);
    }
    const meses = [...porMes.entries()].sort();
    console.log(`\nVENTAS por mes (netas, NC restadas) — ${ventas.length} filas crudas:`);
    for (const [m, g] of meses) console.log(`  ${m}  ${g.u} u  $${g.v.toFixed(2)}`);

    // 12 meses completos anteriores a hoy (Panamá UTC-5)
    const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
    const hoyMes = hoy.slice(0, 7);
    const restar = (mes: string, n: number) => {
      const [y, m] = mes.split("-").map(Number);
      const t = y * 12 + (m - 1) - n;
      return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
    };
    const ventana: string[] = [];
    for (let i = 12; i >= 1; i -= 1) ventana.push(restar(hoyMes, i));
    let sumU = 0;
    let sumV = 0;
    console.log(`\nVENTANA 12 meses completos (hoy=${hoy}):`);
    for (const m of ventana) {
      const g = porMes.get(m);
      sumU += g?.u ?? 0;
      sumV += g?.v ?? 0;
      console.log(`  ${m}  ${g ? `${g.u} u  $${g.v.toFixed(2)}` : "—"}`);
    }
    const primerMesConVenta = meses.find(([, g]) => g.u > 0)?.[0] ?? null;
    const mesesVivos = primerMesConVenta && primerMesConVenta > ventana[0]
      ? ventana.filter((m) => m >= primerMesConVenta).length
      : 12;
    console.log(`  TOTAL ventana: ${sumU} u  $${sumV.toFixed(2)}`);
    console.log(`  primer mes con venta EVER: ${primerMesConVenta}  → meses promediados: ${mesesVivos}`);
    console.log(`  vendo por mes: ${(sumU / mesesVivos).toFixed(2)}`);
    const ex = Number(info?.[0]?.existencia ?? 0);
    console.log(`  existencia: ${ex}  → me queda para: ${(ex / (sumU / mesesVivos)).toFixed(2)} meses`);
    console.log(`  precio real promedio (ventana): $${(sumV / sumU).toFixed(4)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
