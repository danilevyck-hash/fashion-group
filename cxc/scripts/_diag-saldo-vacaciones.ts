/* Auditoría SOLO LECTURA del SALDO DE VACACIONES, con datos de producción.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-saldo-vacaciones.ts
 *
 * ── 🩸 POR QUÉ EXISTE ───────────────────────────────────────────────────────
 *
 * La migración del saldo inicial la corre Daniel a mano, así que hasta que la
 * corra NADIE tiene saldo cargado y la pantalla —correctamente— no muestra
 * ningún número. O sea que el camino que de verdad importa —el saldo CON un
 * arranque cargado, midiendo contra la fecha de ingreso y las vacaciones
 * REALES— no se puede ver en la pantalla todavía.
 *
 * Este script lo calcula con las MISMAS funciones que usa la ruta y con los
 * datos de producción, inyectando el saldo inicial SOLO EN MEMORIA.
 *
 * ⛔ SOLO LECTURA: no escribe una fila. Es una auditoría, no una carga.
 */
import {
  leerPersonasDelModulo,
  datosSaldoDeFila,
  vigenciaDeFila,
} from "@/lib/asistencia/config-server";
import { leerVacaciones } from "@/lib/asistencia/config-server";
import { tieneBaja } from "@/lib/asistencia/vigencia";
import { saldoDe, textoSaldo, textoDetalle, avisoSinSaldo } from "@/lib/asistencia/saldo-vacaciones";
import { hoyPanama } from "@/lib/fecha-panama";

/** El saldo inyectado para la simulación: código → días. Solo en memoria. */
const SIMULADO: Record<string, number> = { "7": 12, "29": 5 };

async function main() {
  const hoy = hoyPanama();
  const { personas, filas } = await leerPersonasDelModulo();
  // Ventana ancha: el saldo es histórico, no de una quincena.
  const { filas: vacaciones, faltaTabla } = await leerVacaciones("2000-01-01", "2100-01-01");
  console.log(`HOY (Panamá) ${hoy} · personas ${personas.length} · vacaciones ${vacaciones.length}${faltaTabla ? " (FALTA LA TABLA)" : ""}`);

  const fichas = new Map(filas.map((f) => [String(f.empleado_codigo), f]));
  const activos = personas.filter((p) => {
    const f = fichas.get(p.codigo);
    return !f || !tieneBaja(vigenciaDeFila(f));
  });

  console.log(`\n── COMO ESTÁ HOY (sin la migración corrida) ──`);
  const reales = activos.map((p) => {
    const f = fichas.get(p.codigo);
    return saldoDe(
      p.codigo, p.etiqueta,
      f ? datosSaldoDeFila(f) : { fechaIngreso: null, saldoInicial: null, corte: null },
      vacaciones, hoy,
    );
  });
  const cuenta = (k: string) => reales.filter((s) => s.falta === k).length;
  console.log(`   activos ${reales.length} · con saldo ${reales.filter((s) => !s.falta).length}`
    + ` · falta fecha ${cuenta("fecha")} · falta saldo ${cuenta("saldo")} · faltan ambos ${cuenta("ambos")}`);
  console.log(`   aviso → ${avisoSinSaldo(cuenta("fecha") + cuenta("ambos"), cuenta("saldo"))}`);
  const conNumero = reales.filter((s) => s.saldo !== null);
  console.log(`   🔴 renglones con número: ${conNumero.length} (tiene que ser 0 hasta que se corra el DDL)`);

  console.log(`\n── SIMULACIÓN: qué diría con el saldo cargado (SOLO EN MEMORIA) ──`);
  for (const [codigo, dias] of Object.entries(SIMULADO)) {
    const p = activos.find((x) => x.codigo === codigo);
    const f = fichas.get(codigo);
    if (!p || !f) { console.log(`   código ${codigo}: no está en la lista de activos`); continue; }
    const s = saldoDe(codigo, p.etiqueta, {
      fechaIngreso: f.fecha_ingreso ?? null,
      saldoInicial: dias,
      corte: hoy,
    }, vacaciones, hoy);
    console.log(`   ${p.etiqueta.padEnd(28)} ingreso ${f.fecha_ingreso ?? "—"} · ${textoSaldo(s)}  (${textoDetalle(s)})`);

    // Y a tres meses vista, para ver crecer el saldo sobre datos reales.
    const s3 = saldoDe(codigo, p.etiqueta, {
      fechaIngreso: f.fecha_ingreso ?? null, saldoInicial: dias, corte: hoy,
    }, vacaciones, `${Number(hoy.slice(0, 4))}-11-25`);
    console.log(`   ${"".padEnd(28)} al 25-nov-2026 → ${textoSaldo(s3)}  (${textoDetalle(s3)})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
