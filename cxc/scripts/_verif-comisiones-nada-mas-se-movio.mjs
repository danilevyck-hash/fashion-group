// ─────────────────────────────────────────────────────────────────────────────
// NINGÚN OTRO NÚMERO SE MOVIÓ — la matriz "Todas las empresas" y las tablas de
// "Por empresa", comparadas ANTES contra DESPUÉS, celda por celda y POR
// POSICIÓN.
//
// 🔑 Por POSICIÓN y no como conjunto: un conjunto diría "los mismos números"
// aunque dos filas se hubieran intercambiado, que es el error que más daño hace
// en Comisiones (la plata quedaría a nombre de otra persona).
//
// Lee lo que dejaron las dos corridas de `_medir-comisiones-dos-pestanas.mjs`:
//   node scripts/_verif-comisiones-nada-mas-se-movio.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "fs";

const DIR = process.env.SALIDA ?? "/tmp/t234";
const antes = JSON.parse(readFileSync(`${DIR}/pantallas-antes.json`, "utf8"));
const despues = JSON.parse(readFileSync(`${DIR}/pantallas-despues.json`, "utf8"));

// El nombre del vendedor ahora puede traer pegada la línea del descuento.
const limpio = (t) => String(t ?? "").replace(/−\s*\$[\d.,]+\s*en descuentos$/, "").trim();

const distintas = [];
let comparadas = 0;

function compararTabla(etiqueta, a, b) {
  if (!a && !b) return;
  if (!a || !b) {
    distintas.push({ donde: etiqueta, campo: "tabla", antes: a ? "hay" : "falta", despues: b ? "hay" : "falta" });
    return;
  }
  if (a.heads.join("|") !== b.heads.join("|")) {
    distintas.push({ donde: etiqueta, campo: "encabezados", antes: a.heads.join(" · "), despues: b.heads.join(" · ") });
  }
  const filas = Math.max(a.filas.length, b.filas.length);
  for (let i = 0; i < filas; i++) {
    const fa = a.filas[i] ?? [];
    const fb = b.filas[i] ?? [];
    const cols = Math.max(fa.length, fb.length);
    for (let c = 0; c < cols; c++) {
      comparadas++;
      const x = limpio(fa[c]);
      const y = limpio(fb[c]);
      if (x !== y) distintas.push({ donde: etiqueta, campo: `fila ${i + 1} col ${c + 1}`, antes: x, despues: y });
    }
  }
  for (let c = 0; c < Math.max(a.pie.length, b.pie.length); c++) {
    comparadas++;
    const x = limpio(a.pie[c]);
    const y = limpio(b.pie[c]);
    if (x !== y) distintas.push({ donde: etiqueta, campo: `pie col ${c + 1}`, antes: x, despues: y });
  }
}

for (let i = 0; i < antes.periodos.length; i++) {
  const pa = antes.periodos[i];
  const pb = despues.periodos[i];
  const per = `${pa.year}-${String(pa.mes).padStart(2, "0")}`;
  compararTabla(`${per} · Todas las empresas`, pa.todas, pb.todas);
  for (const empresa of Object.keys(pa.porEmpresa)) {
    compararTabla(`${per} · ${empresa}`, pa.porEmpresa[empresa], pb.porEmpresa[empresa]);
  }
}

if (comparadas === 0) {
  console.error("🔴 0 celdas comparadas — la verificación no verificó nada");
  process.exit(1);
}

console.log(`\n=== ANTES vs DESPUÉS: ${comparadas} celdas · ${distintas.length} distintas ===`);
if (distintas.length) {
  console.table(distintas);
  console.log("\nOJO: las de Fashion Shoes / Reinaldo son LAS QUE SE VENÍA A ARREGLAR.");
} else {
  console.log("🟢 ninguna celda cambió");
}
