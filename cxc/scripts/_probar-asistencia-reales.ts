// Verificación del lector de asistencia contra los TRES exportes reales que
// mandó Daniel el 4-ago-2026. Solo lectura, no toca la base.
import { readFileSync } from "fs";
import * as XLSX from "xlsx-js-style";
import { importarMatriz, type Matriz } from "@/lib/asistencia/importar-excel";
import { armarJornadas, resumir, horaPanama } from "@/lib/asistencia/jornadas";

const base = "/Users/daniellevy/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents";
const archivos: Array<[string, string]> = [
  ["78707AE2-2286-4FBB-ABCF-68A9C0DC9C16", "MARCACION DEL 13 DE JULIO AL 27 DE JULIO 2027.xlsx"],
  ["BFE1CFC4-2DD7-4CAD-AF46-7844122D7E36", "MARCACION DEL 13 DE JULIO AL 27 DE JULIO.xlsx"],
  ["FC0F54C3-DCE6-4EF6-AE80-4989A28A0454", "MARCACION DEL 13 DE JULIO AL 27 DE JULIO 2026.xlsx"],
];

const todas: ReturnType<typeof importarMatriz>["filas"] = [];
for (const [dir, nombre] of archivos) {
  const wb = XLSX.read(readFileSync(`${base}/${dir}/${nombre}`), { type: "buffer", cellDates: true });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const matriz = XLSX.utils.sheet_to_json<Matriz[number]>(hoja, { header: 1, defval: null, blankrows: false });
  const r = importarMatriz("RELOJ_FG", matriz);
  console.log("=".repeat(64));
  console.log(nombre);
  console.log(`  filas del archivo : ${matriz.length}`);
  console.log(`  filas de detalle  : ${r.filasDeDetalle} (salteadas)`);
  console.log(`  MARCACIONES       : ${r.filas.length}`);
  console.log(`  descartadas       : ${r.descartadas.length}`);
  const motivos = new Map<string, number>();
  for (const d of r.descartadas) motivos.set(d.motivo, (motivos.get(d.motivo) ?? 0) + 1);
  for (const [m, n] of motivos) console.log(`      ${n}x ${m}`);
  const deps = new Set(r.filas.map((f) => String((f.raw as Record<string, unknown>).departamento)));
  console.log(`  departamentos     : ${[...deps].join(", ")}`);
  console.log(`  empleados         : ${new Set(r.filas.map((f) => f.empleado_nombre)).size}`);
  todas.push(...r.filas);
}

console.log("=".repeat(64));
console.log("TODO JUNTO");
console.log(`  marcaciones: ${todas.length} | llaves unicas: ${new Set(todas.map((f) => f.evento_id)).size}`);
const j = armarJornadas(todas.map((f) => ({
  empleado_codigo: f.empleado_codigo, empleado_nombre: f.empleado_nombre,
  ocurrio_en: f.ocurrio_en, tipo: f.tipo,
})));
console.log("  resumen:", JSON.stringify(resumir(j)));
console.log("\n  primeras 6 jornadas como se veran en pantalla:");
for (const x of j.slice(0, 6)) {
  console.log(`    ${x.dia}  ${String(x.empleadoNombre).padEnd(20)} ${horaPanama(x.entrada)} -> ${x.salida ? horaPanama(x.salida) : "falta"}  ${x.horas ?? "-"}h`);
}
