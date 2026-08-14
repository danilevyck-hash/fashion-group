// ─────────────────────────────────────────────────────────────────────────────
// VERIFICACIÓN (SOLO LECTURA) — una meta GRUPAL mide la TIENDA ENTERA.
//
// Corre:
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_verif-meta-mide-la-tienda.ts
//
// Corre la función REAL (`avanceDeMeta`) contra producción, con la meta real
// —sep-dic 2026, $420.000, las 4 vendedoras como participantes— y con el MISMO
// juego de participantes sobre períodos que SÍ tienen ventas (sep-dic 2026
// todavía no empezó, así que ahí el avance es 0 contra 0 y no prueba nada).
//
// Exige, y falla si no:
//   1. el avance de la meta grupal == el total PELADO del período (`totalDe`),
//      incluido `DEFAULT` y los códigos de gente que ya no trabaja acá;
//   2. la suma de los aportes + `aporteNoAsignado` == 1 (al centavo);
//   3. que ese `aporteNoAsignado` esté CALCULADO (varía por período), no fijo.
//
// No escribe una sola fila: solo lee.
// ─────────────────────────────────────────────────────────────────────────────

import {
  avanceDeMeta,
  leerMetas,
  leerVentasDelPeriodo,
  totalDe,
  type Meta,
} from "../src/lib/multifashion/metas-lectura";
import { textoAporteNoAsignado } from "../src/lib/multifashion/metas-clave";

const money = (n: number) =>
  n.toLocaleString("es-PA", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Las 4 que están todos los meses (Daniel). */
const LAS_CUATRO = [
  { clave: "JAILINE", nombre: "Jailine" },
  { clave: "MILAGROS TORRES", nombre: "Milagros Torres" },
  { clave: "SHEYNEE BATISTA", nombre: "Sheynee Batista" },
  { clave: "JENNIFER MIRANDA", nombre: "Jennifer Miranda" },
].map((p) => ({ ...p, objetivoIndividual: null }));

let fallas = 0;
function exigir(ok: boolean, que: string) {
  console.log(`   ${ok ? "🟢" : "🔴"} ${que}`);
  if (!ok) fallas++;
}

async function medir(rotulo: string, desde: string, hasta: string, participantes: Meta["participantes"], hoy: string) {
  const meta: Meta = {
    id: `verif-${desde}`,
    nombre: "Meta del viaje",
    desde,
    hasta,
    objetivo: 420000,
    tipo: "grupal",
    premio: "Un viaje para todas",
    premioMonto: 2000,
    activa: true,
    participantes,
  };

  const { filas } = await leerVentasDelPeriodo(desde, hasta);
  const tienda = totalDe(filas);
  const con = await avanceDeMeta(meta, hoy);

  console.log("");
  console.log("─".repeat(78));
  console.log(`${rotulo}  (${desde} → ${hasta}, ${participantes.length} participantes)`);
  console.log("─".repeat(78));
  console.log(`   avance de la meta      ${money(con.avance.vendido)}`);
  console.log(`   total de la tienda     ${money(tienda)}   ← el mismo número de Ventas`);
  console.log(`   proyección             ${con.avance.proyeccion == null ? "—" : money(con.avance.proyeccion)}  (base: ${con.avance.base})`);
  console.log("");
  let sumaAportes = 0;
  let sumaVendido = 0;
  for (const v of con.porVendedora) {
    sumaAportes += v.aporte;
    sumaVendido += v.vendido;
    console.log(`   ${v.nombre.padEnd(22)} ${money(v.vendido).padStart(14)}   ${pct(v.aporte).padStart(7)} del avance`);
  }
  console.log(`   ${"— suma de aportes —".padEnd(22)} ${money(sumaVendido).padStart(14)}   ${pct(sumaAportes).padStart(7)}`);
  console.log(`   ${"— no asignado —".padEnd(22)} ${money(Math.round((tienda - sumaVendido) * 100) / 100).padStart(14)}   ${pct(con.aporteNoAsignado).padStart(7)}`);
  console.log("");
  console.log(`   línea en pantalla: ${textoAporteNoAsignado(con.aporteNoAsignado) ?? "(no se dibuja)"}`);
  console.log("");

  exigir(
    con.avance.vendido === tienda,
    `el avance ES el total de la tienda (${money(con.avance.vendido)} == ${money(tienda)})`,
  );
  exigir(
    Math.abs(sumaAportes + con.aporteNoAsignado - 1) < 1e-9 || tienda <= 0,
    "los aportes + lo no asignado dan exactamente el 100%",
  );

  return { tienda, sumaVendido, resto: con.aporteNoAsignado };
}

async function main() {
  const HOY = "2026-08-14";

  console.log("═".repeat(78));
  console.log("UNA META GRUPAL MIDE LA TIENDA ENTERA — verificación contra producción");
  console.log("═".repeat(78));

  // 1. La meta REAL, si la DDL ya corrió.
  const guardadas = await leerMetas();
  if (guardadas == null) {
    console.log("\n⚠️  Las tablas de metas todavía no existen en producción (DDL sin correr).");
    console.log("    Se verifica con la meta ARMADA IGUAL que la real: sep-dic 2026, $420.000,");
    console.log("    las 4 vendedoras como participantes.");
    await medir("META REAL (sep-dic 2026 — todavía no empieza)", "2026-09-01", "2026-12-31", LAS_CUATRO, HOY);
  } else {
    for (const m of guardadas) {
      console.log(`\n   meta guardada: ${m.nombre} · ${m.desde}→${m.hasta} · ${money(m.objetivo)} · ${m.tipo} · ${m.participantes.length} participantes`);
      await medir(`META GUARDADA — ${m.nombre}`, m.desde, m.hasta, m.participantes, HOY);
    }
  }

  // 2. Los mismos participantes sobre períodos CON ventas.
  const a = await medir("MISMAS 4 · may-jul 2026 (el período que midió Daniel)", "2026-05-01", "2026-07-31", LAS_CUATRO, HOY);
  const b = await medir("MISMAS 4 · sep-dic 2025 (la temporada del año pasado)", "2025-09-01", "2025-12-31", LAS_CUATRO, HOY);

  // 3. Sin participantes: la meta tiene que dar EXACTAMENTE lo mismo.
  const c = await medir("SIN participantes · may-jul 2026", "2026-05-01", "2026-07-31", [], HOY);

  console.log("");
  console.log("═".repeat(78));
  exigir(
    a.tienda === c.tienda,
    `elegir participantes NO cambia el avance (${money(a.tienda)} con las 4 == ${money(c.tienda)} sin nadie)`,
  );
  exigir(
    Math.abs(a.resto - b.resto) > 1e-6,
    `el % no asignado se CALCULA por período (${pct(a.resto)} may-jul vs ${pct(b.resto)} sep-dic), no es un 4% fijo`,
  );
  console.log("═".repeat(78));
  console.log(fallas === 0 ? "🟢 TODO CUADRA" : `🔴 ${fallas} verificación(es) fallaron`);
  process.exit(fallas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
