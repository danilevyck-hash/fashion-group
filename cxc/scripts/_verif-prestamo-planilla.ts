/* ─────────────────────────────────────────────────────────────────────────────
 * QUÉ VA A DECIR LA CASILLA «PRÉSTAMO» DE CADA PERSONA — contra PRODUCCIÓN.
 *
 * SOLO LECTURA. No escribe una fila.
 *
 * 🔑 Corre los MISMOS módulos que la pantalla (`leerPrestamosDeQuincena` +
 * `sugerirPrestamos`), no una segunda cuenta escrita para el informe: si el
 * script sumara por su cuenta, podría decir un número que la planilla no dice.
 *
 * ⚠️ 11-sep-2026: se fue la aprobación quincenal (Daniel: «quita lo de
 * aprobación a préstamos, no es necesario»). Ya no se lee
 * `asistencia_prestamo_aprobado`; la cuota entra sola salvo que la casilla tenga
 * algo escrito a mano.
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-prestamo-planilla.ts [quincena] [desde] [hasta]
 * ─────────────────────────────────────────────────────────────────────────── */
import { createClient } from "@supabase/supabase-js";
import {
  avisosDeUltimaCuota,
  casillaAutomatica,
  prestamosSinAtar,
  sugerirPrestamos,
  textoAvisoPrestamo,
  textoPrestamoSinAtar,
  type PersonaEnCuadro,
} from "../src/lib/asistencia/prestamos-planilla";
import { leerPrestamosDeQuincena } from "../src/lib/asistencia/prestamos-planilla-server";

const QUINCENA = process.argv[2] ?? "2026-09-1";
const DESDE = process.argv[3] ?? "2026-09-01";
const HASTA = process.argv[4] ?? "2026-09-15";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const db = createClient(url, key, { auth: { persistSession: false } });

  // La gente del cuadro, y lo que HOY dice su casilla (escrito a mano).
  const [{ data: personasDb }, { data: manualDb }] = await Promise.all([
    db.from("asistencia_personas").select("empleado_codigo, nombre, empresa, activo"),
    db.from("asistencia_planilla_manual").select("empleado_codigo, prestamo, terceros").eq("quincena", QUINCENA),
  ]);
  const casilla = new Map((manualDb ?? []).map((m) => [String(m.empleado_codigo), { p: Number(m.prestamo ?? 0), t: Number(m.terceros ?? 0) }]));
  const personas: PersonaEnCuadro[] = (personasDb ?? []).map((p) => ({
    codigo: String(p.empleado_codigo),
    etiqueta: String(p.nombre ?? p.empleado_codigo),
    empresa: p.empresa ?? null,
    empresaEtiqueta: p.empresa ?? null,
    enCasilla: casilla.get(String(p.empleado_codigo))?.p ?? 0,
    enCasillaTerceros: casilla.get(String(p.empleado_codigo))?.t ?? 0,
  }));

  const pres = await leerPrestamosDeQuincena(DESDE, HASTA);

  console.log(`\nQUINCENA ${QUINCENA}  (${DESDE} → ${HASTA})`);
  console.log(`  personas en el cuadro: ${personas.length}`);
  console.log(`  fichas de préstamo leídas: ${pres.fichas.length}`);

  const sug = sugerirPrestamos({ fichas: pres.fichas, personas });
  let total = 0;
  console.log(`\n  LO QUE ENTRA SOLO A LA CASILLA — ${sug.length} personas:`);
  for (const s of sug) {
    const entra = casillaAutomatica(s.enCasilla, s.sugerido) + casillaAutomatica(s.enCasillaTerceros, s.sugeridoTerceros);
    total += entra;
    const orig = s.origen === "descontado" ? "ya descontado por el módulo" : `cuota ${s.cuota.toFixed(2)} · saldo ${s.saldo.toFixed(2)}`;
    const mano = s.enCasilla > 0 ? `  (a mano: $${s.enCasilla.toFixed(2)}, manda)` : "";
    const nom = s.nombrePrestamos.toUpperCase() !== s.etiqueta.toUpperCase() ? `  (en Préstamos: ${s.nombrePrestamos})` : "";
    console.log(`    cod ${s.codigo.padStart(3)} ${s.etiqueta.padEnd(30)} $${entra.toFixed(2).padStart(8)}  ${orig}${mano}${nom}`);
  }
  console.log(`  total que entra solo: $${total.toFixed(2)}`);

  const sueltos = prestamosSinAtar(pres.fichas);
  console.log(`\n  PRÉSTAMOS CON SALDO SIN ATAR: ${sueltos.length}`);
  console.log("  " + (textoPrestamoSinAtar(sueltos) ?? "(ninguno — todo saldo vivo tiene su persona)"));

  console.log(`\n  AVISO ÁMBAR:`);
  console.log("  " + (textoAvisoPrestamo(avisosDeUltimaCuota(sug)) ?? "(no hay aviso)"));
}

void main();
