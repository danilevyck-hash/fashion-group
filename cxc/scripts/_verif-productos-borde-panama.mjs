// 🔴 EL BORDE HORARIO, CONTRA EL SERVIDOR DE PRODUCCIÓN DE VERDAD.
//
// El rango de cada período lo decide el SERVIDOR (`/api/ventas/productos`), no
// el navegador: con el reloj de la máquina, este bug solo se puede ver 5 horas
// de cada 24 y "antes" y "después" quedarían medidos con relojes distintos.
// Por eso el servidor arranca con el reloj CLAVADO (`_reloj-clavado.cjs`), que
// es lo mismo que `vi.setSystemTime` pero del lado del server: misma build,
// mismos datos, mismo instante en las dos etapas.
//
// Instante: 2026-08-25T00:30:00Z = 19:30 del 24-ago en Panamá.
//   · Reloj UTC → 25-ago  (lo que devolvía «Año en curso»: un día del FUTURO)
//   · Panamá    → 24-ago  (el día de negocio real)
//
// Se piden los CINCO períodos. Solo «Año en curso» puede moverse, y solo un día.
//
//   BASE=http://localhost:3223 ETAPA=antes   node scripts/_verif-productos-borde-panama.mjs
//   BASE=http://localhost:3223 ETAPA=despues node scripts/_verif-productos-borde-panama.mjs
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3223";
const SALIDA = process.env.SALIDA ?? "/tmp/t231";
const ETAPA = process.env.ETAPA ?? "antes";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const CASOS = [
  { id: "ano-en-curso", q: "periodo=ytd&year=2026" },
  { id: "mes-suelto-jul", q: "periodo=ytd&year=2026&mes=7" },
  { id: "ultimos-6", q: "periodo=6m&year=2026" },
  { id: "ultimos-12", q: "periodo=12m&year=2026" },
  { id: "ano-pasado", q: "periodo=anio_pasado&year=2026" },
];
const EMPRESAS = ["fashion_wear", "vistana"];

mkdirSync(SALIDA, { recursive: true });
const out = {};
for (const empresa of EMPRESAS) {
  for (const c of CASOS) {
    const url = `${BASE}/api/ventas/productos?empresa=${empresa}&${c.q}`;
    const r = await fetch(url, { headers: { cookie: `cxc_session=${COOKIE}` } });
    if (!r.ok) { console.error(`❌ ${empresa}/${c.id}: HTTP ${r.status}`); process.exit(2); }
    const j = await r.json();
    if (!Array.isArray(j.productos) || j.productos.length === 0) {
      console.error(`❌ ${empresa}/${c.id}: 0 productos — la medición no prueba nada`);
      process.exit(2);
    }
    out[`${empresa}/${c.id}`] = {
      desde: j.desde, hasta: j.hasta,
      comparativo: j.comparativo,
      filas: j.productos.length,
      venta: Number(j.totales.venta).toFixed(2),
    };
    console.error(
      `[${ETAPA}] ${(empresa + "/" + c.id).padEnd(28)} ${j.desde} → ${j.hasta}` +
      `  ·  Δ contra ${j.comparativo?.desde} → ${j.comparativo?.hasta}  ·  ${j.productos.length} filas · $${Number(j.totales.venta).toFixed(2)}`,
    );
  }
}
const archivo = path.join(SALIDA, `productos-borde-${ETAPA}.json`);
writeFileSync(archivo, JSON.stringify(out, null, 1));
console.error(`\nGuardado en ${archivo}`);

const a = path.join(SALIDA, "productos-borde-antes.json");
const d = path.join(SALIDA, "productos-borde-despues.json");
if (!existsSync(a) || !existsSync(d)) process.exit(0);
const A = JSON.parse(readFileSync(a, "utf8")), D = JSON.parse(readFileSync(d, "utf8"));

console.log("\n=== EN EL BORDE (19:30 de Panamá del 24-ago) · ANTES vs DESPUÉS ===");
let malas = 0, arregladas = 0;
for (const k of Object.keys(A)) {
  const esAnioEnCurso = k.endsWith("/ano-en-curso");
  const dif = [];
  for (const campo of ["desde", "hasta", "filas", "venta"]) {
    if (String(A[k][campo]) !== String(D[k][campo])) dif.push(`${campo}: ${A[k][campo]} → ${D[k][campo]}`);
  }
  for (const p of ["desde", "hasta"]) {
    if (A[k].comparativo?.[p] !== D[k].comparativo?.[p]) {
      dif.push(`comparativo.${p}: ${A[k].comparativo?.[p]} → ${D[k].comparativo?.[p]}`);
    }
  }
  if (esAnioEnCurso) {
    // Lo que TIENE que pasar: el período dejaba de terminar en el 25 (futuro).
    const ok = A[k].hasta === "2026-08-25" && D[k].hasta === "2026-08-24"
      && A[k].comparativo?.hasta === "2025-08-25" && D[k].comparativo?.hasta === "2025-08-24"
      && A[k].desde === D[k].desde;
    if (ok) { arregladas++; console.log(`${k.padEnd(28)} ✅ ARREGLADO · ${dif.join(" · ")}`); }
    else { malas++; console.log(`${k.padEnd(28)} ❌ el borde NO se arregló: ${dif.join(" · ") || "no cambió nada"}`); }
  } else if (dif.length) {
    malas++; console.log(`${k.padEnd(28)} ❌ SE MOVIÓ y no debía: ${dif.join(" · ")}`);
  } else {
    console.log(`${k.padEnd(28)} ✅ idéntico`);
  }
}
console.log(malas === 0 && arregladas === EMPRESAS.length
  ? `\n✅ «Año en curso» dejó de terminar en un día del futuro (2026-08-25 → 2026-08-24) en ${arregladas} empresas. Los otros 4 períodos, idénticos.`
  : `\n❌ ${malas} problemas.`);
process.exit(malas === 0 && arregladas === EMPRESAS.length ? 0 : 1);
