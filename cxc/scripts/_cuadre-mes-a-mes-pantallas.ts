// ¿La tarjeta «mes a mes» de Multifashion, Comisiones, Consulta de artículos y
// Clientes da, al centavo, lo que muestra su pantalla? SOLO LEE.
//
//   ENV_FILE=/ruta/.env.local npx tsx scripts/_cuadre-mes-a-mes-pantallas.ts
//
// 2 casos por pantalla. Sale con código 1 si algo no cuadra.
import fs from "fs";

for (const l of fs.readFileSync(process.env.ENV_FILE ?? ".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

let comparados = 0, malos = 0;
/** Al centavo: menos de medio centavo de diferencia (los subtotales traen 3 decimales). */
function ver(rotulo: string, a: number, b: number, tolerancia = 0.005) {
  comparados++;
  const ok = Math.abs(a - b) < tolerancia;
  if (!ok) malos++;
  console.log(`${ok ? "✓" : "✗"} ${rotulo}  tarjeta ${a.toFixed(2)}  pantalla ${b.toFixed(2)}`);
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { leerTodoPaginado } = await import("../src/lib/supabase-paginado");
  const { hoyPanama } = await import("../src/lib/fecha-panama");
  const hoy = hoyPanama();
  const anio = Number(hoy.slice(0, 4));

  // ── Multifashion › Vendedoras: cada mes contra `multifashion_vendedoras_v5` (la pantalla) ──
  const { vendedoraMesAMes } = await import("../src/lib/multifashion/vendedora-mes-a-mes");
  for (const vend of ["Jennifer Miranda", "Jailine Quispe"]) {
    const filas = await leerTodoPaginado<{ fecha: string; vendedor: string; vendedor_canonico: string; subtotal: number }>(
      "cuadre mf", (cc, d, h) => sb.from("_multifashion_sf_vw").select("fecha, vendedor, vendedor_canonico, subtotal", cc ? { count: "exact" } : undefined)
        .eq("vendedor_canonico", vend).gte("fecha", `${anio - 1}-01-01`).lte("fecha", `${anio}-12-31`).order("fecha_ts").order("n_sistema").range(d, h));
    const { data: ult } = await sb.from("_multifashion_sf_vw").select("fecha").order("fecha", { ascending: false }).limit(1);
    const r = vendedoraMesAMes(filas, vend, anio, ult?.[0]?.fecha ?? null, new Date());
    for (const m of [r.meses.length - 1, r.meses.length].filter((x) => x >= 1)) {
      const { data, error } = await sb.rpc("multifashion_vendedoras_v5", { p_year: anio, p_periodo: "mes", p_mes: m, p_trimestre: null });
      if (error) throw error;
      const fila = (data.vendedoras as { nombre: string; ventas: number }[]).find((v) => v.nombre === vend);
      ver(`Multifashion ${vend} ${anio}-${m}`, r.meses[m - 1].actual, Number(fila?.ventas ?? 0));
    }
    const { data: y } = await sb.rpc("multifashion_vendedoras_v5", { p_year: anio, p_periodo: "ytd", p_mes: null, p_trimestre: null });
    ver(`Multifashion ${vend} total ${anio}`, r.total.actual, Number((y.vendedoras as { nombre: string; ventas: number }[]).find((v) => v.nombre === vend)?.ventas ?? 0));
  }

  // ── Comisiones: cada mes y el año contra lo que la pantalla pide (mes=m y mes=0) ──
  const { leerComision } = await import("../src/lib/comisiones/rpc");
  const { leerDescuentosEfectivos, totalPorVendedor, netearComisiones } = await import("../src/lib/comisiones/descuentos");
  const { acumularVendedores } = await import("../src/lib/comisiones/acumular-anio");
  const { mesesDelPeriodo } = await import("../src/lib/comisiones/periodo");
  const { comisionMesAMes } = await import("../src/lib/comisiones/mes-a-mes");
  for (const [empresa, vend] of [["vistana", "EDWIN"], ["fashion_shoes", null]] as const) {
    const meses = mesesDelPeriodo(anio, 0, hoy);
    const netos = await Promise.all(meses.map(async (m) => {
      const r = await leerComision(empresa, anio, m);
      const d = await leerDescuentosEfectivos([empresa], anio, m);
      return netearComisiones(r.data!.vendedores, totalPorVendedor(d, empresa));
    }));
    const anioPantalla = acumularVendedores(netos);
    const quien = vend ?? [...anioPantalla].sort((a, b) => b.comision_total - a.comision_total)[0].vendedor;
    const tarjeta = comisionMesAMes({ por_mes: meses.map((m, i) => ({ mes: m, vendedores: netos[i] })) }, quien);
    for (const i of [0, meses.length - 1]) ver(`Comisiones ${empresa} ${quien} mes ${meses[i]}`, tarjeta[i].actual, Number(netos[i].find((v) => v.vendedor === quien)?.comision_total ?? 0));
    ver(`Comisiones ${empresa} ${quien} Todo ${anio}`, Math.round(tarjeta.reduce((a, m) => a + m.actual, 0) * 100) / 100, Number(anioPantalla.find((v) => v.vendedor === quien)?.comision_total ?? 0));
  }

  // ── Consulta de artículos: la tarjeta contra la suma firmada del diario ──
  const { ventasNetasPorDia, ventasPorMes } = await import("../src/lib/ventas/compras");
  const { articuloMesAMes } = await import("../src/lib/ventas/articulo-mes-a-mes");
  // Testigo independiente: FA suma, NC resta (los dos únicos tipos del diario de estos modelos).
  const signo = (t: string) => (t === "NC" ? -1 : t === "FA" ? 1 : NaN);
  for (const [empresa, modelo] of [["fashion_wear", "MW0MW32346"], ["fashion_wear", "MW0MW32347"]] as const) {
    const filas = await leerTodoPaginado<{ fecha: string; tipo: string; cantidad_total: number; venta_total: number }>(
      "cuadre art", (cc, d, h) => sb.from("switch_articulo_diario").select("fecha, tipo, cantidad_total, venta_total, codigo", cc ? { count: "exact" } : undefined)
        .eq("empresa_key", empresa).like("codigo", `${modelo}%`).gte("fecha", `${anio - 1}-01-01`).order("fecha").order("codigo").order("tipo").range(d, h));
    if (!filas.length) { console.log(`· artículos ${modelo}: sin filas, se salta`); continue; }
    const dias = ventasNetasPorDia(filas);
    const r = articuloMesAMes(ventasPorMes(dias), dias, hoy);
    for (const m of [r.meses.length - 1, r.meses.length]) {
      const mm = `${anio}-${String(m).padStart(2, "0")}`;
      const testigo = filas.filter((f) => f.fecha.startsWith(mm)).reduce((s, f) => s + signo(f.tipo) * Number(f.cantidad_total), 0);
      ver(`Artículos ${modelo} ${mm} piezas`, r.meses[m - 1].actual, testigo);
    }
  }

  // ── Clientes: la tarjeta (la ruta de la hoja, las 6 empresas) contra «Compras <año>» de la lista ──
  // La ruta se llama en el MISMO proceso con una sesión de prueba firmada con un
  // secreto de prueba (nunca el real ni la sesión de nadie); no sale a la red.
  process.env.SESSION_SECRET = "cuadre-local-solo-en-este-proceso-0123456789";
  const { signSession } = await import("../src/lib/session-cookie");
  const { NextRequest } = await import("next/server");
  const { GET } = await import("../src/app/api/clientes/[codigo]/por-empresa-anual/route");
  const { comprasDelAnioPorCodigo } = await import("../src/lib/clientes-ytd-consulta");
  const { delClienteEnLaFila } = await import("../src/lib/ventas/mes-a-mes");
  const cookie = signSession({ role: "admin", userId: "cuadre", userName: "cuadre", sessionToken: "cuadre" });
  for (const codigo of ["D-25", "D-24"]) {
    const req = new NextRequest(`http://local/api/clientes/${codigo}/por-empresa-anual?year=${anio}`, { headers: { cookie: `cxc_session=${cookie}` } });
    const res = await GET(req, { params: Promise.resolve({ codigo }) });
    if (!res.ok) throw new Error(`ruta ${res.status}`);
    const datos = await res.json();
    const d = delClienteEnLaFila(datos, { empresaKey: "", empresas_count: Infinity });
    const lista = await comprasDelAnioPorCodigo([codigo]);
    // ⚠️ La ruta de la hoja redondea por mes y por empresa; la lista suma en
    // centavos enteros: entre las dos puede haber 1 ¢ (ya medido el 25-sep-2026,
    // ver el encabezado de la ruta). La tarjeta y la lista se muestran en
    // DÓLARES ENTEROS, así que se compara lo que se ve, con ese centavo dicho.
    const lista$ = Number(lista.get(codigo) ?? 0);
    ver(`Clientes ${codigo} Compras ${anio} (centavos: ${d.actual.toFixed(2)} vs ${lista$.toFixed(2)})`, Math.round(d.actual), Math.round(lista$), 0.5);
    ver(`Clientes ${codigo} suma de meses = total (±1 ¢ de redondeo por mes)`, d.meses.reduce((x, m) => x + m.actual, 0), d.actual, 0.015);
  }

  console.log(`\n${comparados} comparaciones, ${malos} con diferencia.`);
  if (!comparados || malos) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
