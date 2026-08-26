/* ─────────────────────────────────────────────────────────────────────────────
 * FOTO DE LAS FICHAS — solo lectura, por la PUERTA DE LA APP.
 *
 * Vuelca las 40 fichas de `asistencia_personas` campo por campo, en un formato
 * estable y ordenado, para poder correr un `diff` de antes y después de tocar
 * UNA ficha y demostrar que las otras 39 no se movieron.
 *
 * 🔑 NINGÚN NÚMERO SALE DE UN `select` CRUDO: se lee con `leerPersonas` y con
 * los mismos lectores de campo que usan la pantalla y la planilla
 * (`vigenciaDeFila`, `servicioProfesionalDeFila`, `pagaSegurosDeFila`,
 * `noMarcaRelojDeFila`, `baseSegurosDeFila`, `datosSaldoDeFila`). Un `select`
 * copiado acá diría otra cosa que la app el día que se agregue una columna.
 *
 * ⛔ NO ESCRIBE NI UNA FILA.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_diag-fichas-snapshot.ts
 * ────────────────────────────────────────────────────────────────────────── */
import {
  leerPersonas, vigenciaDeFila, servicioProfesionalDeFila, pagaSegurosDeFila,
  noMarcaRelojDeFila, baseSegurosDeFila, datosSaldoDeFila,
} from "@/lib/asistencia/config-server";

async function main() {
  const p = await leerPersonas();
  console.log(
    `fichas ${p.filas.length}`
    + ` · faltaMigracion=${p.faltaMigracion}`
    + ` · faltaBajas=${p.faltaColumnasBajas}`
    + ` · faltaServicio=${p.faltaColumnaServicioProfesional}`
    + ` · faltaSeguros=${p.faltaColumnaPagaSeguros}`
    + ` · faltaBaseSeguros=${p.faltaColumnaBaseSeguros}`
    + ` · faltaReloj=${p.faltaColumnaNoMarcaReloj}`
    + ` · faltaSaldo=${p.faltaColumnasSaldoVacaciones}`,
  );
  const filas = [...p.filas].sort((a, b) =>
    String(a.empleado_codigo).localeCompare(String(b.empleado_codigo)));
  for (const f of filas) {
    const v = vigenciaDeFila(f);
    const s = datosSaldoDeFila(f);
    console.log([
      `cod=${String(f.empleado_codigo)}`,
      `nombre=${f.nombre ?? "-"}`,
      `empresa=${f.empresa ?? "-"}`,
      `salario=${f.salario_mensual ?? "-"}`,
      `jornada=${f.jornada_semanal ?? "-"}`,
      `ingreso=${v.fechaIngreso ?? "-"}`,
      `salida=${v.fechaSalida ?? "-"}`,
      `motivo=${v.motivoSalida ?? "-"}`,
      `servicioProf=${servicioProfesionalDeFila(f)}`,
      `pagaSeguros=${pagaSegurosDeFila(f)}`,
      `baseSeguros=${baseSegurosDeFila(f) ?? "-"}`,
      `noMarcaReloj=${noMarcaRelojDeFila(f)}`,
      `saldoDias=${s.saldoInicial ?? "-"}`,
      `saldoCorte=${s.corte ?? "-"}`,
    ].join(" | "));
  }
}
void main().catch((e) => { console.error(e); process.exitCode = 1; });
