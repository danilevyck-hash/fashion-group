// Verificación del API de la planilla contra los datos reales, y del Excel que
// bajó el navegador (que traiga filas de verdad, no un archivo vacío).

import { readFileSync } from "fs";
import XLSX from "xlsx-js-style";

const BASE = process.env.BASE ?? "http://localhost:3167";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const H = { cookie: `cxc_session=${COOKIE}` };

const j = await (await fetch(`${BASE}/api/asistencia/planilla?quincena=2026-07-2&empresa=confecciones_boston`, { headers: H })).json();

console.log("quincena:", j.quincena?.desde, "→", j.quincena?.hasta, "| empresa:", j.empresaEtiqueta);
console.log("avisos:", JSON.stringify(j.avisos));
console.log("marcaciones leídas:", j.marcaciones);
console.log("\n--- LÍNEAS", j.lineas?.length);
for (const l of j.lineas ?? []) {
  if (!l.dinero) {
    console.log(`  ⚠ ${l.codigo.padStart(3)} ${l.etiqueta.padEnd(28)} FALTA: ${l.faltaConfigurar.join(" · ")}`);
    continue;
  }
  const d = l.dinero, h = l.horas;
  console.log(
    `    ${l.codigo.padStart(3)} ${l.etiqueta.padEnd(28)} rata=${String(d.rataHora).padStart(5)} ` +
    `quinc=${d.salarioQuincenal.toFixed(2).padStart(7)} e125=${d.extraDiurno.toFixed(2).padStart(6)} ` +
    `e150=${d.extraNocturno.toFixed(2).padStart(6)} exc=${d.excedente.toFixed(2).padStart(6)} ` +
    `dom=${d.domingos.toFixed(2).padStart(6)} aus=${d.ausencias.toFixed(2).padStart(7)} ` +
    `tard=${d.tardanzas.toFixed(2).padStart(6)} BRUTO=${d.totalBruto.toFixed(2).padStart(8)} ` +
    `NETO=${d.netoPagar.toFixed(2).padStart(8)}  [h: 1.25=${(h.extraDiurnoMin/60).toFixed(2)} 1.50=${(h.extraNocturnoMin/60).toFixed(2)} exc=${(h.excedenteMin/60).toFixed(2)} dom=${(h.domingoMin/60).toFixed(2)} tarde=${h.tardanzaMin}min aus=${h.ausenciaDias}d rev=${h.diasARevisar}]`,
  );
}
console.log("\nTOTALES:", JSON.stringify(j.totales));

// ── ¿Cuadra la suma de las filas con el total del pie? ──────────────────────
const suma = (j.lineas ?? []).filter((l) => l.dinero)
  .reduce((a, l) => a + l.dinero.netoPagar, 0);
console.log(`\ncuadre neto: filas=${suma.toFixed(2)} pie=${j.totales.netoPagar.toFixed(2)} ` +
  `${Math.abs(suma - j.totales.netoPagar) < 0.005 ? "✅" : "❌"}`);

// ── El POST de montos manuales (la tabla todavía no existe: debe AVISAR) ────
const post = await fetch(`${BASE}/api/asistencia/planilla`, {
  method: "POST",
  headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ quincena: "2026-07-2", codigo: "22", prestamo: 10 }),
});
console.log("\nPOST manuales:", post.status, JSON.stringify(await post.json()).slice(0, 220));

// ── El Excel que bajó el navegador ─────────────────────────────────────────
const wb = XLSX.read(readFileSync("/tmp/planilla-verif/planilla-confecciones-boston-2026-07-2.xlsx"));
console.log("\nEXCEL hojas:", wb.SheetNames);
for (const n of wb.SheetNames) {
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false });
  console.log(`  ${n}: ${filas.length} filas`);
}
const pl = XLSX.utils.sheet_to_json(wb.Sheets.Planilla, { header: 1, blankrows: false });
console.log("\n  encabezados:", JSON.stringify(pl[3]));
console.log("  1ª fila    :", JSON.stringify(pl[4]));
console.log("  última fila:", JSON.stringify(pl[pl.length - 1]));
