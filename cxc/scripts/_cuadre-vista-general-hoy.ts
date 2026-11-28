// Cuadre al centavo de la Vista general «HOY» contra las pantallas de origen.
// SOLO LEE: llama a las MISMAS rutas GET que abren Ventas, Cuentas por cobrar,
// Boston, Proveedores y Despachos › Pedidos (con una sesión de admin firmada
// aquí, sin tocar `user_sessions`) y compara tarjeta por tarjeta.
//
//   npx tsx scripts/_cuadre-vista-general-hoy.ts
//
// Sale con código 1 si un solo centavo no cuadra.
import fs from "fs";
import { NextRequest } from "next/server";

for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

// La sesión se firma y se verifica en ESTE proceso: un secreto local basta.
process.env.SESSION_SECRET ??= "cuadre-local-" + Date.now();

async function main() {
  const { signSession } = await import("../src/lib/session-cookie");
  const { leerVistaGeneralHoy } = await import("../src/lib/vista-general/hoy-server");
  const { resumir, empresasDe, porDespachar, VALOR_GRUPO, BOSTON, MULTIFASHION } = await import("../src/lib/vista-general/hoy");
  const { VENTAS_ID_TO_EMPRESA_KEY } = await import("../src/lib/empresa-mapping");
  const cookie = signSession({ role: "admin", userId: "cuadre", userName: "cuadre", sessionToken: "cuadre-local" });

  const pedir = async (ruta: string, mod: { GET: (r: NextRequest) => Promise<Response> }) => {
    const req = new NextRequest(new URL(ruta, "http://localhost"), { headers: { cookie: `cxc_session=${cookie}` } });
    const r = await mod.GET(req);
    if (!r.ok) throw new Error(`${ruta}: ${r.status}`);
    return r.json();
  };

  const data = await leerVistaGeneralHoy();
  const [ventas, aging, boston, prov, ped] = await Promise.all([
    pedir(`/api/ventas/resumen?year=${data.anio}`, await import("../src/app/api/ventas/resumen/route")),
    pedir("/api/cxc/aging", await import("../src/app/api/cxc/aging/route")),
    pedir("/api/cxc/boston", await import("../src/app/api/cxc/boston/route")),
    pedir("/api/proveedores", await import("../src/app/api/proveedores/route")),
    pedir("/api/guias/pedidos", await import("../src/app/api/guias/pedidos/route")),
  ]);

  const c2 = (n: number) => Math.round(n * 100) / 100;
  let malos = 0;
  let comparados = 0;
  const filas: string[] = [];
  const comparar = (vista: string, tarjeta: string, nuestro: number | null, origen: number | null) => {
    comparados += 1;
    const ok = nuestro != null && origen != null && Math.abs(c2(nuestro) - c2(origen)) < 0.005;
    if (!ok) malos += 1;
    filas.push(`${ok ? "OK " : "MAL"} ${vista.padEnd(14)} ${tarjeta.padEnd(28)} ${String(nuestro == null ? "—" : c2(nuestro)).padStart(16)} ${String(origen == null ? "—" : c2(origen)).padStart(16)}`);
  };

  // ── Origen, por empresa ──
  const i = data.mes - 1;
  const vOrigen = new Map<string, { mes: number; mesPrev: number; anio: number; anioPrev: number }>();
  for (const e of ventas.empresas as Array<{ empresa: { id: string }; ventas2026: (number | null)[]; ventas2025: (number | null)[] }>) {
    const k = VENTAS_ID_TO_EMPRESA_KEY[e.empresa.id];
    const s = (a: (number | null)[], n = 12) => a.slice(0, n).reduce<number>((x, v) => x + (v ?? 0), 0);
    vOrigen.set(k, { mes: e.ventas2026[i] ?? 0, mesPrev: e.ventas2025[i] ?? 0, anio: s(e.ventas2026), anioPrev: s(e.ventas2025, data.mes) });
  }
  const mas120 = (r: Record<string, number | null>) => ["d121_180", "d181_270", "d271_365", "mas_365"].reduce((s, k) => s + Number(r[k] ?? 0), 0);
  const cxcOrigen = new Map<string, { total: number; mas120: number }>();
  for (const r of aging.rows as Array<Record<string, number | null> & { company_key: string }>) {
    const a = cxcOrigen.get(r.company_key) ?? { total: 0, mas120: 0 };
    cxcOrigen.set(r.company_key, { total: a.total + Number(r.total ?? 0), mas120: a.mas120 + mas120(r) });
  }
  cxcOrigen.set(BOSTON, { total: boston.totales.total, mas120: boston.totales.d121_plus });
  const cxpOrigen = new Map<string, { total: number; mas120: number }>(
    (prov.empresas as Array<{ empresa_key: string; saldo: { por_pagar: number }; tramos: Record<string, number> }>).map((e) => [
      e.empresa_key,
      { total: e.saldo.por_pagar, mas120: e.tramos.t121_365 + e.tramos.tMas365 },
    ]),
  );
  const pedOrigen = new Map<string, number>();
  for (const p of ped.pedidos as Array<{ empresa_key: string; estado: string }>) {
    if (p.estado === "recibido") continue;
    pedOrigen.set(`${p.empresa_key}:${p.estado}`, (pedOrigen.get(`${p.empresa_key}:${p.estado}`) ?? 0) + 1);
  }

  for (const vista of [VALOR_GRUPO, "fashion_wear", BOSTON, MULTIFASHION]) {
    const keys = empresasDe(vista);
    const r = resumir(keys, data);
    const sum = <T,>(m: Map<string, T>, f: (t: T) => number) => keys.reduce((s, k) => s + (m.has(k) ? f(m.get(k)!) : 0), 0);
    comparar(vista, "Ventas del mes", r.ventasMes?.actual ?? null, sum(vOrigen, (v) => v.mes));
    comparar(vista, "Ventas mes año pasado", r.ventasMes?.previo ?? null, sum(vOrigen, (v) => v.mesPrev));
    comparar(vista, "Ventas del año", r.ventasAnio?.actual ?? null, sum(vOrigen, (v) => v.anio));
    comparar(vista, "Ventas año pasado", r.ventasAnio?.previo ?? null, sum(vOrigen, (v) => v.anioPrev));
    if (r.cxc.estado === "ok") {
      comparar(vista, "Por cobrar", r.cxc.valor.total, sum(cxcOrigen, (c) => c.total));
      comparar(vista, "Por cobrar +120", r.cxc.valor.mas120, sum(cxcOrigen, (c) => c.mas120));
    }
    if (r.cxp.estado === "ok") {
      comparar(vista, "Por pagar", r.cxp.valor.total, sum(cxpOrigen, (c) => c.total));
      comparar(vista, "Por pagar +120", r.cxp.valor.mas120, sum(cxpOrigen, (c) => c.mas120));
    }
    if (r.pedidos.estado === "ok") {
      for (const e of ["pendiente", "en_preparacion", "preparado"] as const) {
        comparar(vista, `Pedidos ${e}`, r.pedidos.valor[e], keys.reduce((s, k) => s + (pedOrigen.get(`${k}:${e}`) ?? 0), 0));
      }
      filas.push(`    ${vista.padEnd(14)} Pedidos por despachar = ${porDespachar(r.pedidos.valor)} (atrasados +3 d: ${r.pedidos.valor.atrasados})`);
    }
    filas.push(
      `    ${vista.padEnd(14)} margen ${r.margenMes == null ? "—" : (r.margenMes * 100).toFixed(2) + "%"} · cobros ${r.cobros.estado === "ok" ? c2(r.cobros.valor) : r.cobros.estado} · inventario ${r.inventario.estado === "ok" ? `${c2(r.inventario.valor.costo)} / ${r.inventario.valor.unidades} u` : r.inventario.estado}`,
    );
  }

  console.log(`ok  vista          tarjeta                        vista general           origen`);
  console.log(filas.join("\n"));
  console.log(`\n${comparados} comparaciones · ${malos} no cuadran`);
  if (malos > 0 || comparados === 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
