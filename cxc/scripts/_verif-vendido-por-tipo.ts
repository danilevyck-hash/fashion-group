// ¿«Vendido por tipo» suma TODAS las piezas del período? SOLO LEE.
//
//   npx tsx scripts/_verif-vendido-por-tipo.ts [anio|a2025|a2024|mes|12m]
//
// Por empresa: el total de la tarjeta (`leerVendidoPorTipo` + `agruparPorTipo`)
// contra la suma cruda de la fuente, leída aparte y SIN clasificar (renglones de
// factura para las seis, venta diaria por artículo para Multifashion; facturas
// suman, notas de crédito restan). Y que las filas + lo que no se dibuja den el
// total. Sale con código 1 si una sola pieza no cuadra.
import fs from "fs";

for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

(async () => {
  const { supabaseServer } = await import("../src/lib/supabase-server");
  const { leerTodoPaginado } = await import("../src/lib/supabase-paginado");
  const { hoyPanama } = await import("../src/lib/fecha-panama");
  const { B2B_EMPRESA_KEYS } = await import("../src/lib/empresa-mapping");
  const { agruparPorTipo, periodoTipoValido, rangoPeriodoTipo, OTROS } = await import("../src/lib/vista-general/vendido-por-tipo");
  const { leerVendidoPorTipo } = await import("../src/lib/vista-general/vendido-por-tipo-server");

  const periodo = periodoTipoValido(process.argv[2], hoyPanama());
  const { desde, hasta } = rangoPeriodoTipo(periodo, hoyPanama());
  const siguiente = new Date(`${hasta}T00:00:00Z`);
  siguiente.setUTCDate(siguiente.getUTCDate() + 1);
  const finExcl = `${siguiente.toISOString().slice(0, 10)}T00:00:00-05:00`;

  async function crudo(empresa: string): Promise<number> {
    if (empresa === "american_classic") {
      const f = await leerTodoPaginado<{ tipo: string; cantidad_total: number }>("diario", (c, d, h) =>
        supabaseServer.from("switch_articulo_diario").select("tipo, cantidad_total", c ? { count: "exact" } : {})
          .eq("empresa_key", empresa).gte("fecha", desde).lte("fecha", hasta).order("id").range(d, h), undefined, 6);
      return f.reduce((s, r) => s + (r.tipo === "NC" ? -1 : 1) * Number(r.cantidad_total), 0);
    }
    const f = await leerTodoPaginado<{ tipo_comprobante: string; cantidad: number }>("lineas", (c, d, h) =>
      supabaseServer.from("switch_factura_lineas").select("tipo_comprobante, cantidad", c ? { count: "exact" } : {})
        .eq("empresa_key", empresa).gte("fecha", `${desde}T00:00:00-05:00`).lt("fecha", finExcl).order("id").range(d, h), undefined, 6);
    return f.reduce((s, r) => s + (r.tipo_comprobante === "Nota de Crédito" ? -1 : 1) * Number(r.cantidad), 0);
  }

  console.log(`Vendido por tipo · ${periodo} · ${desde} → ${hasta}`);
  let malas = 0;
  for (const empresa of [...B2B_EMPRESA_KEYS, "american_classic"]) {
    const arts = await leerVendidoPorTipo([empresa], desde, hasta);
    const r = agruparPorTipo(arts);
    const fuente = await crudo(empresa);
    const dibujado = r.filas.reduce((s, f) => s + f.piezas, 0);
    const otros = arts.filter((a) => r.visible(a.tipo) === OTROS).reduce((s, a) => s + a.piezas, 0);
    const oculto = r.filas.some((f) => f.tipo === OTROS) ? 0 : otros;
    const ok = Math.abs(r.total - fuente) < 0.001 && Math.abs(dibujado + oculto - r.total) < 0.001;
    if (!ok) malas += 1;
    const pct = r.total > 0 ? ((otros / r.total) * 100).toFixed(1) : "—";
    console.log(`${ok ? "✓" : "✗"} ${empresa.padEnd(18)} tarjeta ${r.total.toFixed(0).padStart(7)} · fuente ${fuente.toFixed(0).padStart(7)} · Otros ${otros.toFixed(0)} (${pct}%) · ${r.filas.map((f) => `${f.tipo} ${f.piezas}`).join(" · ")}`);
  }
  // Fashion Group: las seis juntas, con los tipos del mismo nombre sumados y
  // «Camisetas» dentro de «Ropa» (SE_SUMA_A). El total = la suma de las seis.
  const seis = await leerVendidoPorTipo(B2B_EMPRESA_KEYS, desde, hasta);
  const g = agruparPorTipo(seis);
  let fuenteSeis = 0;
  for (const e of B2B_EMPRESA_KEYS) fuenteSeis += await crudo(e);
  const okG = Math.abs(g.total - fuenteSeis) < 0.001 && !g.filas.some((f) => f.tipo === "Camisetas");
  if (!okG) malas += 1;
  console.log(`${okG ? "✓" : "✗"} ${"Fashion Group".padEnd(18)} tarjeta ${g.total.toFixed(0).padStart(7)} · fuente ${fuenteSeis.toFixed(0).padStart(7)} · ${g.filas.map((f) => `${f.tipo} ${f.piezas}`).join(" · ")}`);
  process.exit(malas ? 1 : 0);
})();
