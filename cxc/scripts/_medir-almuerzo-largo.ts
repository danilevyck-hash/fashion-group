/* SOLO LECTURA. Cuánto vale el almuerzo de más que el reloj MIDE y el sistema
 * hoy NO cobra en ninguna columna de plata.
 *   npx tsx scripts/_medir-almuerzo-largo.ts <dias.json> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";

async function main() {
  const [fDias, salida] = process.argv.slice(2);
  const { leerReglas, leerPersonas } = await import("@/lib/asistencia/config-server");
  const { valorMinuto } = await import("@/lib/asistencia/config");
  const { reglas } = await leerReglas();
  const { filas } = await leerPersonas();
  const dias = JSON.parse(readFileSync(fDias, "utf8")) as Array<{
    codigo: string; dias: Array<{ excesoAlmuerzoMin?: number }>;
  }>;
  const porCod = new Map(filas.map((f) => [String(f.empleado_codigo), f]));
  const out: Array<{ nombre: string; codigo: string; empresa: string | null; minutos: number; plata: number }> = [];
  let total = 0, minutos = 0;
  for (const p of dias) {
    const f = porCod.get(p.codigo);
    if (!f) continue;
    const vm = valorMinuto(f.salario_mensual, f.jornada_semanal ?? 44, reglas);
    let alm = 0;
    for (const d of p.dias) alm += d.excesoAlmuerzoMin || 0;
    if (alm <= 0 || vm === null) continue;
    const plata = Math.round(alm * vm * 100) / 100;
    out.push({ nombre: String(f.nombre), codigo: p.codigo, empresa: f.empresa ?? null, minutos: Math.round(alm), plata });
    total += plata; minutos += alm;
  }
  out.sort((a, b) => b.plata - a.plata);
  for (const o of out) {
    console.log(o.nombre.padEnd(28) + String(o.minutos).padStart(5) + " min   $" + o.plata.toFixed(2).padStart(7));
  }
  console.log(`\nTOTAL  ${Math.round(minutos)} minutos  =  $${total.toFixed(2)}  ·  ${out.length} personas`);
  writeFileSync(salida, JSON.stringify({ minutos: Math.round(minutos), plata: Math.round(total * 100) / 100, personas: out }, null, 1));
}
main();
