/* ─────────────────────────────────────────────────────────────────────────────
 * ¿FUNCIONA LA PANTALLA ANTES DE QUE LA DDL CORRA? — solo lectura.
 *
 * En este proyecto los DDL los corre Daniel a mano y varios se quedaron
 * pendientes semanas. Este script llama a las MISMAS funciones que usan el
 * reporte y la planilla, contra la base REAL, con la tabla todavía sin crear:
 *
 *   · `leerCorrecciones` tiene que devolver CERO correcciones y avisar, NO tirar.
 *   · La detección tiene que ser ESTRECHA: un error que no nombre la tabla
 *     (permisos, red, RLS) tiene que propagarse, no leerse como «falta el SQL».
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-correcciones-sin-ddl.ts
 * ────────────────────────────────────────────────────────────────────────── */

import { leerCorrecciones, leerHistorialDelDia } from "@/lib/asistencia/correcciones-server";
import { avisoMigracionCorrecciones, TABLA_CORRECCIONES } from "@/lib/asistencia/correcciones";
import { esTablaFaltante } from "@/lib/asistencia/config";

async function main() {
  console.log("═".repeat(74));
  console.log("CORRECCIONES SIN LA DDL CORRIDA — contra producción, solo lectura");
  console.log("═".repeat(74));

  const r = await leerCorrecciones("2026-07-01", "2026-08-31");
  console.log(`leerCorrecciones  → ${r.correcciones.length} correcciones · faltaMigracion=${r.faltaMigracion}`);
  console.log(`  ${r.correcciones.length === 0 ? "🟢" : "ℹ️"} sin correcciones, el cálculo es el de siempre`);
  console.log(`  ${r.faltaMigracion ? "🟢 degradó limpio (no tiró)" : "ℹ️ la tabla ya existe"}`);

  const h = await leerHistorialDelDia("26", "2026-08-07");
  console.log(`leerHistorial     → ${h.historial.length} filas · faltaMigracion=${h.faltaMigracion}`);

  if (r.faltaMigracion) {
    console.log(`\nLo que ve la gente: «${avisoMigracionCorrecciones()}»`);
  }

  // ── La detección tiene que ser ESTRECHA ────────────────────────────────────
  console.log("\nLa detección de «falta la tabla» no se traga cualquier error:");
  const casos: Array<[string, unknown, boolean]> = [
    ["PostgREST real (no existe)", { code: "PGRST205", message: `Could not find the table 'public.${TABLA_CORRECCIONES}' in the schema cache` }, true],
    ["Postgres real (42P01)", { code: "42P01", message: `relation "${TABLA_CORRECCIONES}" does not exist` }, true],
    ["permiso denegado", { code: "42501", message: `permission denied for table ${TABLA_CORRECCIONES}` }, false],
    ["timeout", { code: "57014", message: "canceling statement due to statement timeout" }, false],
    ["red caída", { message: "fetch failed" }, false],
    ["otra tabla que no existe", { code: "42P01", message: 'relation "otra_cosa" does not exist' }, false],
  ];
  let mal = 0;
  for (const [nombre, err, esperado] of casos) {
    const dio = esTablaFaltante(err, TABLA_CORRECCIONES);
    const ok = dio === esperado;
    if (!ok) mal++;
    console.log(`  ${ok ? "🟢" : "🔴"} ${nombre.padEnd(28)} → ${dio} (se esperaba ${esperado})`);
  }
  console.log(`\n${mal === 0 ? "🟢" : "🔴"} ${casos.length - mal}/${casos.length} correctos`);
  console.log("═".repeat(74));
  if (mal > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("🔴 TIRÓ (no debería):", e); process.exitCode = 1; });
