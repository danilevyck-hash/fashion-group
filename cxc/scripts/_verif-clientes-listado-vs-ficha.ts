// SOLO LECTURA. Verificación end-to-end contra PRODUCCIÓN:
//   1. La búsqueda del listado encuentra a D-108 escribiendo "multifashion",
//      "multi fashion", "MULTIFASHION" y "D-108".
//   2. Una búsqueda de 1-2 letras no devuelve el directorio entero.
//   3. El "compras del año" del LISTADO es idéntico al de la FICHA, cliente por
//      cliente — usando el MISMO código que corren los dos routes.
//   4. Cuánto tarda el listado antes y después de la columna.
//
// Correr: npx tsx scripts/_verif-clientes-listado-vs-ficha.ts
import fs from "node:fs";
function cargarEnv() {
  for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
    if (!l.includes("=") || l.trim().startsWith("#")) continue;
    const i = l.indexOf("=");
    process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
  }
}
cargarEnv();

// Los import ESM se izan por encima de cargarEnv(), y supabase-server crea su
// cliente al importarse → sin las variables ya puestas revienta. Por eso los
// módulos se cargan a mano DENTRO de main(), después de leer .env.local.
type Deps = {
  supabaseServer: typeof import("../src/lib/supabase-server").supabaseServer;
  leerTodoPaginado: typeof import("../src/lib/supabase-paginado").leerTodoPaginado;
  coincideBusqueda: typeof import("../src/lib/buscar-normalizado").coincideBusqueda;
  comprasDelAnioPorCodigo: typeof import("../src/lib/clientes-ytd-consulta").comprasDelAnioPorCodigo;
  ymdPanama: typeof import("../src/lib/clientes-ytd").ymdPanama;
  montoFirmado: typeof import("../src/lib/clientes-ytd").montoFirmado;
  ventanaAnioPanama: typeof import("../src/lib/clientes-ytd").ventanaAnioPanama;
  aCentavos: typeof import("../src/lib/clientes-ytd").aCentavos;
  B2B_EMPRESA_KEYS: typeof import("../src/lib/empresa-mapping").B2B_EMPRESA_KEYS;
};

async function cargarDeps(): Promise<Deps> {
  const [srv, pag, bus, cons, ytd, emp] = await Promise.all([
    import("../src/lib/supabase-server"),
    import("../src/lib/supabase-paginado"),
    import("../src/lib/buscar-normalizado"),
    import("../src/lib/clientes-ytd-consulta"),
    import("../src/lib/clientes-ytd"),
    import("../src/lib/empresa-mapping"),
  ]);
  return {
    supabaseServer: srv.supabaseServer,
    leerTodoPaginado: pag.leerTodoPaginado,
    coincideBusqueda: bus.coincideBusqueda,
    comprasDelAnioPorCodigo: cons.comprasDelAnioPorCodigo,
    ymdPanama: ytd.ymdPanama,
    montoFirmado: ytd.montoFirmado,
    ventanaAnioPanama: ytd.ventanaAnioPanama,
    aCentavos: ytd.aCentavos,
    B2B_EMPRESA_KEYS: emp.B2B_EMPRESA_KEYS,
  };
}

let D: Deps;

const f = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Fila {
  id: string; codigo: string | null; nombre: string | null; razon_social: string | null;
  telefono: string | null; celular: string | null; email: string | null; provincia: string | null;
}

/** Exactamente la lectura del route /api/clientes. */
async function leerListado(): Promise<Fila[]> {
  return D.leerTodoPaginado<Fila>("clientes_master (listado)", (pedirCount, from, to) =>
    D.supabaseServer
      .from("clientes_master")
      .select("id, codigo, nombre, razon_social, telefono, celular, email, provincia",
        pedirCount ? { count: "exact" } : {})
      .eq("deleted", false)
      .order("id", { ascending: true })
      .range(from, to));
}

/** Exactamente el cálculo del route /api/clientes/[codigo] (la FICHA). */
async function ytdDeLaFicha(codigo: string): Promise<number> {
  const { desde, hasta } = D.ventanaAnioPanama();
  const yearStart = desde.slice(0, 10);
  const { data: pares } = await D.supabaseServer
    .from("switch_clientes").select("empresa_key, cliente_switch_id").eq("codigo", codigo);
  const cids = [...new Set((pares ?? []).map(p => p.cliente_switch_id).filter((x): x is number => typeof x === "number"))];
  if (cids.length === 0) return 0;
  const pairSet = new Set((pares ?? []).map(p => `${p.empresa_key}|${p.cliente_switch_id}`));
  const { data: fact } = await D.supabaseServer
    .from("switch_facturas")
    .select("empresa_key, cliente_switch_id, fecha, tipo_comprobante, total")
    .in("cliente_switch_id", cids).gte("fecha", desde).lt("fecha", hasta);
  const porEmpresa = new Map<string, number>();
  for (const r of (fact ?? []) as any[]) {
    if (!pairSet.has(`${r.empresa_key}|${r.cliente_switch_id}`)) continue;
    if (!r.fecha || D.ymdPanama(r.fecha) < yearStart) continue;
    porEmpresa.set(r.empresa_key, (porEmpresa.get(r.empresa_key) ?? 0) + D.montoFirmado(r.tipo_comprobante, r.total));
  }
  // La ficha suma SOLO las 6 empresas B2B (así arma total_grupo).
  return D.aCentavos(D.B2B_EMPRESA_KEYS.reduce((s, e) => s + D.aCentavos(porEmpresa.get(e) ?? 0), 0));
}

async function main() {
  D = await cargarDeps();
  const t0 = Date.now();
  const filas = await leerListado();
  const msListado = Date.now() - t0;
  console.log(`LISTADO: ${filas.length} clientes vivos · ${msListado} ms (lectura sin columna)\n`);

  // ── 1. Búsqueda ────────────────────────────────────────────────────────────
  console.log("1) BÚSQUEDA — el caso de Daniel");
  for (const q of ["multifashion", "multi fashion", "MULTIFASHION", "D-108", "d108", "  Multi  Fashion  "]) {
    const r = filas.filter(c => D.coincideBusqueda(q, [c.nombre, c.razon_social, c.codigo]));
    const ok = r.length > 0 && r.some(c => c.codigo === "D-108");
    console.log(`   ${ok ? "✅" : "❌"} "${q}" → ${r.length} resultado(s): ${r.map(c => `${c.codigo} ${c.nombre}`).join(" | ") || "—"}`);
  }
  console.log("   (antes del arreglo: 'multifashion' 0 · 'MULTIFASHION' 0 · 'd108' 0)\n");

  console.log("2) BÚSQUEDA CORTA — no puede devolver el directorio entero");
  for (const q of ["a", "m", "sa", "ci", "mul"]) {
    const r = filas.filter(c => D.coincideBusqueda(q, [c.nombre, c.razon_social, c.codigo]));
    const pct = (100 * r.length / filas.length).toFixed(0);
    console.log(`   "${q}" (${q.length} letra${q.length > 1 ? "s" : ""}) → ${r.length}/${filas.length} (${pct}%)`);
  }
  console.log("   (con substring puro, 'a' devolvía 142/149 = 95%)\n");

  // ── 3. Listado vs ficha ────────────────────────────────────────────────────
  console.log("3) COMPRAS DEL AÑO — listado contra ficha, mismos clientes");
  // Primera página tal cual la arma el route (orden español por nombre).
  const orden = [...filas].sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es"));
  const pagina = orden.slice(0, 50);

  const t1 = Date.now();
  const mapa = await D.comprasDelAnioPorCodigo(pagina.map(c => c.codigo!).filter(Boolean));
  const msYtd = Date.now() - t1;

  // Los 3 que pidió verificar: D-108 + los dos mayores de la página + control en cero.
  const conMonto = [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  const enCero = pagina.find(c => c.codigo && !mapa.has(c.codigo));
  const aVerificar = [...new Set([
    "D-108",
    ...conMonto.slice(0, 2).map(([c]) => c),
    ...(enCero?.codigo ? [enCero.codigo] : []),
  ])];

  // D-108 no cae en la primera página (el orden es alfabético), así que se pide
  // su página como la pediría la pantalla: el endpoint recibe los códigos que
  // se están mostrando, sean los que sean.
  const paginaDeD108 = orden.filter(c => c.codigo).slice(
    Math.floor(orden.findIndex(c => c.codigo === "D-108") / 50) * 50,
  ).slice(0, 50).map(c => c.codigo!);
  const mapaD108 = await D.comprasDelAnioPorCodigo(paginaDeD108);
  for (const [k, v] of mapaD108) if (!mapa.has(k)) mapa.set(k, v);

  let todoOk = true;
  console.log("   codigo   cliente                        LISTADO         FICHA   ¿igual?");
  for (const codigo of aVerificar) {
    const delListado = mapa.get(codigo) ?? 0;
    const deLaFicha = await ytdDeLaFicha(codigo);
    const igual = Math.abs(delListado - deLaFicha) < 0.005;
    todoOk &&= igual;
    const nombre = filas.find(c => c.codigo === codigo)?.nombre ?? "?";
    console.log(`   ${codigo.padEnd(8)} ${nombre.slice(0, 28).padEnd(30)} ${f(delListado).padStart(12)} ${f(deLaFicha).padStart(13)}   ${igual ? "✅ sí" : "❌ NO"}`);
  }

  console.log(`\n   ${todoOk ? "✅" : "❌"} listado y ficha coinciden al centavo`);
  console.log(`   D-108 esperado por Daniel: 210,702.50 → ${f(mapa.get("D-108") ?? 0)} ${Math.abs((mapa.get("D-108") ?? 0) - 210702.5) < 0.005 ? "✅" : "❌"}`);
  console.log(`   clientes de la página con compras: ${mapa.size}/${pagina.length} (el resto muestra $0.00)`);

  console.log(`\n4) RENDIMIENTO — lista ${msListado} ms · columna ${msYtd} ms (llamada APARTE, no bloquea la tabla)`);
}

main().catch(e => { console.error(e); process.exit(1); });
