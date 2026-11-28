// Cuadre de la tarjeta mes a mes de «Margen del mes» y «Cobros del mes»
// (Vista general, 27-nov-2026). SOLO LEE. Para UNA empresa y dos meses
// cerrados compara:
//   · Margen: `margenMesAMes` contra la utilidad ÷ venta de ese mes en
//     Ventas › Resumen (`/api/ventas/resumen`), este año y el pasado.
//   · Cobros: la ruta mes a mes contra `leerCobrosDelMes` (la lectura de la
//     tarjeta «Cobros del mes») corrida sobre ese mes entero.
//
//   npx tsx scripts/_verif-vista-general-margen-cobros-mes-a-mes.ts [empresa] [mes1] [mes2]
//
// Sale con código 1 si algo no cuadra.
import fs from "fs";
import { NextRequest } from "next/server";

for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
process.env.SESSION_SECRET ??= "cuadre-local-" + Date.now();

async function main() {
  const empresa = process.argv[2] ?? "vistana";
  const meses = [Number(process.argv[3] ?? 9), Number(process.argv[4] ?? 10)];
  const { signSession } = await import("../src/lib/session-cookie");
  const { leerVistaGeneralHoy, leerCobrosDelMes } = await import("../src/lib/vista-general/hoy-server");
  const { margenMesAMes } = await import("../src/lib/vista-general/hoy");
  const { VENTAS_ID_TO_EMPRESA_KEY } = await import("../src/lib/empresa-mapping");
  const cookie = signSession({ role: "admin", userId: "cuadre", userName: "cuadre", sessionToken: "cuadre-local" });
  const pedir = async (ruta: string, mod: { GET: (r: NextRequest) => Promise<Response> }) => {
    const r = await mod.GET(new NextRequest(new URL(ruta, "http://localhost"), { headers: { cookie: `cxc_session=${cookie}` } }));
    if (!r.ok) throw new Error(`${ruta}: ${r.status}`);
    return r.json();
  };

  const data = await leerVistaGeneralHoy();
  const [resumen, cobros] = await Promise.all([
    pedir(`/api/ventas/resumen?year=${data.anio}`, await import("../src/app/api/ventas/resumen/route")),
    pedir(`/api/dashboard/vista-general/cobros-mes-a-mes?empresa=${empresa}`, await import("../src/app/api/dashboard/vista-general/cobros-mes-a-mes/route")),
  ]);
  const fila = resumen.empresas.find((e: { empresa: { id: string } }) => VENTAS_ID_TO_EMPRESA_KEY[e.empresa.id] === empresa);
  const margen = margenMesAMes([empresa], data)!;
  let fallas = 0;
  const ver = (rotulo: string, a: number | null, b: number | null, tol: number) => {
    const ok = a != null && b != null && Math.abs(a - b) <= tol;
    if (!ok) fallas++;
    console.log(`${ok ? "OK " : "MAL"} ${rotulo}: tarjeta ${a} · origen ${b}`);
  };
  for (const m of meses) {
    const i = m - 1;
    const pct = (u: number | null, v: number | null) => (u == null || !v ? null : u / v);
    ver(`${empresa} margen ${data.anio}-${m}`, margen.meses[i].actual, pct(fila.utilidad2026[i], fila.ventasParaMargen?.[i] ?? fila.ventas2026[i]), 1e-9);
    ver(`${empresa} margen ${data.anio - 1}-${m}`, margen.meses[i].previo, pct(fila.utilidad2025[i], fila.ventas2025[i]), 1e-9);
    const mm = String(m).padStart(2, "0");
    const fin = new Date(Date.UTC(data.anio, m, 0)).getUTCDate();
    const card = (await leerCobrosDelMes(`${data.anio}-${mm}-01`, `${data.anio}-${mm}-${fin}`)).get(empresa) ?? 0;
    ver(`${empresa} cobros ${data.anio}-${m}`, cobros.meses[i].actual, Math.round(card * 100) / 100, 0.005);
  }
  console.log(fallas ? `\n${fallas} no cuadran` : "\nTodo cuadra");
  process.exit(fallas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
