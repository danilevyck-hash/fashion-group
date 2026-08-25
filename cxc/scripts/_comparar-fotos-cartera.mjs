// Igual que _comparar-fotos-cartera.mjs pero con un ORDEN DETERMINISTA.
// 🩸 `switch_estadocuenta_aging` tiene una fila por (empresa, cliente): ordenar
// solo por `codigo` deja empates y PostgREST los devuelve en el orden que le
// conviene, así que dos fotos idénticas se veían distintas. El orden se fija
// acá, con la fila entera como llave.
import fs from "node:fs";
const a = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const b = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const llave = (f) => JSON.stringify(Object.entries(f).sort());
const orden = (f) => [...f].sort((x, y) => (llave(x) < llave(y) ? -1 : llave(x) > llave(y) ? 1 : 0));
let malas = 0;
const cmp = (nombre, fa, fb) => {
  const A = orden(fa), B = orden(fb);
  if (A.length !== B.length) { console.log(`🔴 ${nombre}: ${A.length} filas → ${B.length}`); malas++; return; }
  let dif = 0;
  for (let i = 0; i < A.length; i++) {
    if (llave(A[i]) !== llave(B[i])) { if (dif < 8) console.log(`  🔴 pos ${i}: ${llave(A[i])} → ${llave(B[i])}`); dif++; }
  }
  if (dif === 0) console.log(`✅ ${nombre}: ${A.length} filas idénticas POSICIÓN POR POSICIÓN, campo por campo`);
  else { console.log(`🔴 ${nombre}: ${dif} diferencias`); malas++; }
};
cmp("BOSTON", a.boston, b.boston);
cmp("GRUPO", a.grupo, b.grupo);
process.exit(malas === 0 ? 0 : 1);
