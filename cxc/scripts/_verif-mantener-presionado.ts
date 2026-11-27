// Cuadre al centavo de las tarjetas «mes a mes» del 27-nov-2026
// (`MANTENER_PRESIONADO_2026_11`). SOLO LEE.
//
//   npx tsx scripts/_verif-mantener-presionado.ts [codigo=D-25] [empresa=vistana] [hoy=AAAA-MM-DD]
//
// (a) Pagos de un cliente (CxC): las 6 empresas, sin retenciones ni recibos en cero.
// (b) Compras de una empresa (Proveedores): cantidad × costo CIF.
// Cada número sale DOS veces: por el camino de la pantalla (`mesesContraAnioPasado`
// sobre la lectura paginada) y por otro independiente (una consulta por mes con
// su rango de fechas). Sale con código 1 si un solo centavo no cuadra.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { mesesContraAnioPasado, desdeParaComparar } from "../src/lib/mes-contra-anio-pasado";
import { CXC_GRUPO_EMPRESA_KEYS } from "../src/lib/empresa-mapping";
import { hoyPanama } from "../src/lib/fecha-panama";

for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const [codigo = "D-25", empresa = "vistana", hoy = hoyPanama()] = process.argv.slice(2);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

async function todas<T>(q: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await q(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Rango [desde, hasta] de un mes; el mes en curso del año pasado, hasta el mismo día. */
function rango(anio: number, mes: number): [string, string] {
  const mm = String(mes).padStart(2, "0");
  const fin = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const esCurso = mes === Number(hoy.slice(5, 7));
  const dia = esCurso ? Math.min(fin, Number(hoy.slice(8, 10))) : fin;
  return [`${anio}-${mm}-01`, `${anio}-${mm}-${String(dia).padStart(2, "0")}`];
}

let fallas = 0;
function comparar(titulo: string, r: ReturnType<typeof mesesContraAnioPasado>, indep: { actual: number | null; previo: number | null }[]) {
  console.log(`\n${titulo} — ${r.anio} vs ${r.anio - 1} (corte ${r.corte})`);
  r.meses.forEach((m, i) => {
    const ok = m.actual === indep[i].actual && m.previo === indep[i].previo;
    if (!ok) fallas++;
    console.log(`  ${String(m.mes).padStart(2)}  ${fmt(m.actual).padStart(14)}  ${fmt(m.previo).padStart(14)}  ${ok ? "✓" : `✗ indep ${fmt(indep[i].actual)} / ${fmt(indep[i].previo)}`}`);
  });
  console.log(`  Total ${fmt(r.total.actual).padStart(14)}  ${fmt(r.total.previo).padStart(14)}`);
}

async function pagos() {
  const filas = (await Promise.all(CXC_GRUPO_EMPRESA_KEYS.map((e) =>
    todas<{ fecha: string; total: number }>((a, b) => sb.from("switch_recibos").select("fecha,total").eq("empresa_key", e).eq("cliente_codigo", codigo)
      .eq("es_retencion", false).neq("total", 0).gte("fecha", desdeParaComparar(hoy)).order("id").range(a, b)),
  ))).flat();
  const r = mesesContraAnioPasado(filas.map((f) => ({ fecha: f.fecha, monto: Number(f.total) })), hoy);
  const indep = [];
  for (const m of r.meses) {
    const suma = async (anio: number) => {
      const [d, h] = rango(anio, m.mes);
      let s = 0;
      for (const e of CXC_GRUPO_EMPRESA_KEYS) {
        const xs = await todas<{ total: number }>((a, b) => sb.from("switch_recibos").select("total").eq("empresa_key", e).eq("cliente_codigo", codigo)
          .eq("es_retencion", false).neq("total", 0).gte("fecha", d).lte("fecha", h).order("id").range(a, b));
        s += xs.reduce((t, x) => t + Math.round(Number(x.total) * 1e6), 0);
      }
      return Math.round(s / 1e4) / 100;
    };
    indep.push({ actual: await suma(r.anio), previo: await suma(r.anio - 1) });
  }
  comparar(`Pagos de ${codigo} (6 empresas)`, r, indep);
}

async function compras() {
  const filas = await todas<{ fecha: string; cantidad: number; costo_cif: number | null }>((a, b) =>
    sb.from("switch_ingresos_mercancia").select("fecha,cantidad,costo_cif").eq("empresa_key", empresa)
      .gte("fecha", desdeParaComparar(hoy)).lte("fecha", hoy).order("n_interno").order("linea").range(a, b));
  const r = mesesContraAnioPasado(filas.map((f) => ({ fecha: f.fecha, monto: f.costo_cif == null ? null : Number(f.cantidad) * Number(f.costo_cif) })), hoy);
  const indep = [];
  for (const m of r.meses) {
    const suma = async (anio: number) => {
      const [d, h] = rango(anio, m.mes);
      const xs = await todas<{ cantidad: number; costo_cif: number | null }>((a, b) => sb.from("switch_ingresos_mercancia").select("cantidad,costo_cif")
        .eq("empresa_key", empresa).gte("fecha", d).lte("fecha", h).order("n_interno").order("linea").range(a, b));
      // En millonésimas enteras, como NUMERIC en la base (el flotante pierde el medio centavo).
      return xs.some((x) => x.costo_cif == null) ? null : Math.round(xs.reduce((t, x) => t + Math.round(Number(x.cantidad) * Number(x.costo_cif) * 1e6), 0) / 1e4) / 100;
    };
    indep.push({ actual: await suma(r.anio), previo: await suma(r.anio - 1) });
  }
  comparar(`Compras de ${empresa} (CIF)`, r, indep);
}

pagos().then(compras).then(() => {
  console.log(fallas ? `\n✗ ${fallas} meses no cuadran` : "\n✓ todo cuadra al centavo");
  process.exit(fallas ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });
