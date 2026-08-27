/* ─────────────────────────────────────────────────────────────────────────────
 * QUÉ VA A DECIR LA CASILLA «PRÉSTAMO» DE CADA PERSONA — contra PRODUCCIÓN.
 *
 * SOLO LECTURA. No escribe una fila.
 *
 * 🔑 Corre los MISMOS módulos que la pantalla (`leerPrestamosDeQuincena` +
 * `sugerirPrestamos`), no una segunda cuenta escrita para el informe: si el
 * script sumara por su cuenta, podría decir un número que la planilla no dice.
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-prestamo-planilla.ts [quincena] [desde] [hasta]
 * ─────────────────────────────────────────────────────────────────────────── */
import { createClient } from "@supabase/supabase-js";
import {
  prestamosSinAprobar,
  prestamosSinAtar,
  resumenPrestamos,
  sugerirPrestamos,
  textoPrestamoSinAprobar,
  textoPrestamoSinAtar,
  type PersonaEnCuadro,
} from "../src/lib/asistencia/prestamos-planilla";
import {
  leerAprobacionesPrestamo,
  leerPrestamosDeQuincena,
} from "../src/lib/asistencia/prestamos-planilla-server";

const QUINCENA = process.argv[2] ?? "2026-08-2";
const DESDE = process.argv[3] ?? "2026-08-16";
const HASTA = process.argv[4] ?? "2026-08-31";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const db = createClient(url, key, { auth: { persistSession: false } });

  // La gente del cuadro, y lo que HOY dice su casilla.
  const [{ data: personasDb }, { data: manualDb }] = await Promise.all([
    db.from("asistencia_personas").select("empleado_codigo, nombre, empresa, activo"),
    db.from("asistencia_planilla_manual").select("empleado_codigo, prestamo").eq("quincena", QUINCENA),
  ]);
  const casilla = new Map((manualDb ?? []).map((m) => [String(m.empleado_codigo), Number(m.prestamo ?? 0)]));
  const personas: PersonaEnCuadro[] = (personasDb ?? []).map((p) => ({
    codigo: String(p.empleado_codigo),
    etiqueta: String(p.nombre ?? p.empleado_codigo),
    empresa: p.empresa ?? null,
    empresaEtiqueta: p.empresa ?? null,
    enCasilla: casilla.get(String(p.empleado_codigo)) ?? 0,
  }));

  const pres = await leerPrestamosDeQuincena(DESDE, HASTA);
  const apr = await leerAprobacionesPrestamo(QUINCENA);

  console.log(`\nQUINCENA ${QUINCENA}  (${DESDE} → ${HASTA})`);
  console.log(`  personas en el cuadro: ${personas.length}`);
  console.log(`  fichas de préstamo leídas: ${pres.fichas.length}` +
    (pres.faltaColumnaAmarre ? "  ⚠️ FALTA la columna del amarre" : "  ✅ columna del amarre presente"));
  console.log(`  aprobaciones guardadas: ${apr.porCodigo.size}` +
    (apr.faltaTabla ? "  ⚠️ FALTA la tabla de aprobación" : "  ✅ tabla de aprobación presente"));

  const sug = sugerirPrestamos({ fichas: pres.fichas, personas, aprobaciones: apr.porCodigo });
  const res = resumenPrestamos(sug);

  console.log(`\n  LO QUE LA PANTALLA VA A PROPONER — ${sug.length} personas, $${res.monto.toFixed(2)} pendientes:`);
  for (const s of sug) {
    const marca = s.aprobado ? "✅" : "  ";
    const orig = s.origen === "descontado" ? "ya descontado por el módulo" : `cuota ${s.cuota.toFixed(2)} · saldo ${s.saldo.toFixed(2)}`;
    const nom = s.nombrePrestamos.toUpperCase() !== s.etiqueta.toUpperCase() ? `  (en Préstamos: ${s.nombrePrestamos})` : "";
    console.log(`   ${marca} cod ${s.codigo.padStart(3)} ${s.etiqueta.padEnd(30)} $${s.sugerido.toFixed(2).padStart(8)}  ${orig}${nom}`);
  }

  const sueltos = prestamosSinAtar(pres.fichas);
  console.log(`\n  PRÉSTAMOS CON SALDO SIN ATAR: ${sueltos.length}`);
  console.log("  " + (textoPrestamoSinAtar(sueltos) ?? "(ninguno — todo saldo vivo tiene su persona)"));

  const faltan = prestamosSinAprobar(sug);
  console.log(`\n  AVISO ÁMBAR (${faltan.length}):`);
  console.log("  " + (textoPrestamoSinAprobar(faltan) ?? "(no hay aviso)"));
}

void main();
