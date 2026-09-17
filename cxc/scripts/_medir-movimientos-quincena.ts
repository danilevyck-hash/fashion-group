/* SOLO LECTURA. Reproduce, contra producción, lo que la pantalla
 * «Préstamos › Movimientos» va a mostrar en cada quincena.
 *
 * Usa las MISMAS funciones puras que la pantalla (`movimientos-quincena.ts`) y
 * la MISMA ventana (`ventanaDeLaQuincena`), así que si este guion y la pantalla
 * dieran números distintos, sería un defecto de la pantalla y no de la medición.
 *
 *   set -a && . ./.env.local && set +a && npx tsx scripts/_medir-movimientos-quincena.ts
 */
import {
  agruparMovimientos,
  filaDeMovimiento,
  ventanaDeLaQuincena,
  type DatosDeLaFicha,
  type MovimientoCrudo,
} from "../src/lib/asistencia/movimientos-quincena";
import { quincenasHasta } from "../src/lib/asistencia/planilla";

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function todo<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < 200; p++) {
    const r = await fetch(`${URL_BASE}/rest/v1/${path}&limit=1000&offset=${p * 1000}`, { headers: H });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const j = (await r.json()) as T[];
    out.push(...j);
    if (j.length < 1000) break;
  }
  return out;
}

const plata = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const movs = await todo<MovimientoCrudo & { estado: string; deleted: boolean | null }>(
    "prestamos_movimientos?select=id,empleado_id,fecha,concepto,monto,estado,deleted,origen_pago&order=id.asc",
  );
  const vivos = movs.filter((m) => m.deleted !== true && m.estado === "aprobado");
  const fichasDb = await todo<{ id: string; nombre: string | null; empleado_codigo: string | null }>(
    "prestamos_empleados?select=id,nombre,empleado_codigo&order=id.asc",
  );
  const personas = await todo<{ empleado_codigo: string; empresa: string | null }>(
    "asistencia_personas?select=empleado_codigo,empresa&order=empleado_codigo.asc",
  );
  const amarre = await todo<{ movimiento_id: string | null }>(
    "asistencia_planilla_prestamo?select=id,movimiento_id&revertido_en=is.null&order=id.asc",
  );
  const amarrados = new Set(amarre.map((a) => String(a.movimiento_id ?? "")).filter(Boolean));
  const empresaDe = new Map(personas.map((p) => [String(p.empleado_codigo), p.empresa ?? null]));
  const fichas = new Map<string, DatosDeLaFicha>(
    fichasDb.map((f) => {
      const codigo = String(f.empleado_codigo ?? "").trim() || null;
      return [String(f.id), {
        nombre: String(f.nombre ?? "").trim(),
        codigo,
        empresa: codigo ? empresaDe.get(codigo) ?? null : null,
      }];
    }),
  );

  console.log(`movimientos vivos y aprobados: ${vivos.length} · amarres vivos: ${amarrados.size}`);
  const quincenas = quincenasHasta("2026-09-17", 6).reverse();
  let totalEnQuincenas = 0;
  for (const q of quincenas) {
    const { desde, hasta } = ventanaDeLaQuincena(q);
    const dentro = vivos.filter((m) => {
      const f = String(m.fecha).slice(0, 10);
      return f >= desde && f <= hasta;
    });
    totalEnQuincenas += dentro.length;
    const { descuentos, deudas, resumen } = agruparMovimientos(
      dentro.map((m) => filaDeMovimiento(m, fichas, amarrados)),
    );
    console.log(
      `${q.etiqueta.padEnd(34)} ventana ${desde}→${hasta}  `
      + `descuentos ${String(resumen.descuentos.cuantos).padStart(3)} ${plata(resumen.descuentos.total).padStart(11)}`
      + `  deudas ${String(resumen.deudas.cuantos).padStart(3)} ${plata(resumen.deudas.total).padStart(11)}`
      + `  variación ${plata(resumen.variacion).padStart(11)}`
      + `  sin clasificar ${resumen.sinClasificar}`,
    );
    if (q.clave === "2026-08-2") {
      console.log("  ── detalle 16 al 30 de agosto ──");
      for (const f of descuentos) console.log(`   DESCUENTO ${f.nombre.padEnd(28)} ${f.etiqueta.padEnd(24)} ${plata(f.monto).padStart(10)}  día ${String(f.dia).padStart(2)}  ${f.origenEtiqueta}`);
      for (const f of deudas) console.log(`   DEUDA     ${f.nombre.padEnd(28)} ${f.etiqueta.padEnd(24)} ${plata(f.monto).padStart(10)}  día ${String(f.dia).padStart(2)}  ${f.origenEtiqueta}`);
    }
  }

  // 🔴 Que ningún movimiento quede entre dos quincenas: se barre toda la
  // historia con las ventanas y se compara contra el total.
  const todas = quincenasHasta("2026-09-17", 48);
  const cubiertos = new Set<string>();
  for (const q of todas) {
    const { desde, hasta } = ventanaDeLaQuincena(q);
    for (const m of vivos) {
      const f = String(m.fecha).slice(0, 10);
      if (f >= desde && f <= hasta) cubiertos.add(String(m.id));
    }
  }
  const huerfanos = vivos.filter((m) => !cubiertos.has(String(m.id)));
  console.log(`\nmovimientos cubiertos por alguna quincena: ${cubiertos.size} de ${vivos.length}`);
  console.log(`fuera de toda quincena (deberían ser los anteriores a 2022): ${huerfanos.length}`,
    huerfanos.slice(0, 5).map((m) => m.fecha));
  console.log(`(en las 6 quincenas impresas entraron ${totalEnQuincenas} movimientos)`);
}

void main();
