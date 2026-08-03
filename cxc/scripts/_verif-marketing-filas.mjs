// Verifica que NINGÚN NÚMERO cambie entre anchos: compara fila por fila y
// campo por campo lo que se lee en pantalla a 390, 834 y 1440.
//
// 🩸 GOTCHA que este script evita a propósito: buscar por la clase de
// breakpoint (`.md\:hidden`) devuelve vacío en cuanto alguien mueve el corte, y
// el chequeo PASA sin haber comparado nada. Acá se busca por `data-fg-fila` /
// `data-fg-campo`, que son fijos y viven en los DOS layouts (tarjeta y tabla).
//
//   node scripts/_verif-marketing-filas.mjs

import { readFileSync } from "fs";
import path from "path";

const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const datos = JSON.parse(
  readFileSync(path.join(SALIDA, "mkt-medicion-despues.json"), "utf8"),
);

const porPantalla = new Map();
for (const r of datos) {
  if (!porPantalla.has(r.pantalla)) porPantalla.set(r.pantalla, new Map());
  porPantalla.get(r.pantalla).set(r.tamano, r.filasDato);
}

let fallas = 0;
for (const [pantalla, porTamano] of porPantalla) {
  const anchos = [...porTamano.keys()];
  const base = porTamano.get("1440");
  const mapaBase = new Map(base.map((f) => [f.id, f.campos]));
  console.log(`\n=== ${pantalla} — ${base.length} filas de referencia (1440)`);
  if (base.length === 0) {
    console.log("  ✗ referencia VACÍA: el chequeo no compararía nada.");
    fallas += 1;
    continue;
  }
  for (const ancho of anchos) {
    if (ancho === "1440") continue;
    const filas = porTamano.get(ancho);
    let campos = 0;
    const problemas = [];
    if (filas.length !== base.length) {
      problemas.push(`filas ${filas.length} vs ${base.length}`);
    }
    for (const f of filas) {
      const ref = mapaBase.get(f.id);
      if (!ref) {
        problemas.push(`fila ausente en 1440: ${f.id}`);
        continue;
      }
      for (const [k, v] of Object.entries(f.campos)) {
        campos += 1;
        if (ref[k] === undefined) {
          problemas.push(`${f.id} · campo "${k}" no existe a 1440`);
        } else if (ref[k] !== v) {
          problemas.push(`${f.id} · ${k}: "${v}" @${ancho} vs "${ref[k]}" @1440`);
        }
      }
      // Todo campo de 1440 tiene que estar también en el ancho chico: si no,
      // ese dato se PERDIÓ al pasar a tarjetas.
      for (const k of Object.keys(ref)) {
        if (f.campos[k] === undefined) {
          problemas.push(`${f.id} · campo "${k}" FALTA @${ancho}`);
        }
      }
    }
    if (problemas.length) {
      fallas += problemas.length;
      console.log(`  ✗ @${ancho}: ${problemas.length} diferencias`);
      for (const p of problemas.slice(0, 12)) console.log(`      ${p}`);
    } else {
      console.log(`  ✓ @${ancho}: ${filas.length} filas · ${campos} campos idénticos a 1440`);
    }
  }
}

console.log(fallas === 0 ? "\nOK — ningún número cambia entre anchos." : `\nFALLAS: ${fallas}`);
process.exit(fallas === 0 ? 0 : 1);
