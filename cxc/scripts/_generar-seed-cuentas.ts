/**
 * Genera el bloque de SIEMBRA de `cuentas_contables` a partir del CSV real del
 * catálogo que bajó Daniel del panel de Switch.
 *
 * No toca la base ni la red: lee el fixture, lo parsea con el MISMO módulo puro
 * que usa el test, e imprime el SQL. Lo que se pega en la migración sale de acá
 * — y `cuentas-catalogo-csv.test.ts` vuelve a parsear el fixture y exige que las
 * filas del .sql sean IDÉNTICAS, así que la siembra no puede quedar a mano y
 * desincronizarse.
 *
 *   npx tsx scripts/_generar-seed-cuentas.ts [empresa_key] > /tmp/seed.sql
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsearCatalogoCsv } from "../src/lib/cuentas/catalogo-csv";

const EMPRESA = process.argv[2] ?? "vistana";
const FIXTURE = join(__dirname, "..", "src", "__tests__", "fixtures", "catalogo-cuentas-vistana.csv");

const sql = (s: string) => `'${s.replace(/'/g, "''")}'`;

const { cuentas, errores } = parsearCatalogoCsv(readFileSync(FIXTURE, "latin1"));
if (errores.length > 0) {
  console.error(`⚠️ ${errores.length} filas no se pudieron leer:`);
  for (const e of errores) console.error(`   línea ${e.linea}: ${e.motivo}`);
}

const filas = cuentas
  .map((c) => `  (${sql(EMPRESA)}, ${sql(c.cuenta)}, ${sql(c.nombre)}, ${sql(c.nombreCrudo)}, ${c.nivel})`)
  .join(",\n");

console.log(`INSERT INTO cuentas_contables (empresa_key, cuenta, nombre, nombre_switch, nivel) VALUES`);
console.log(`${filas}`);
console.log(`ON CONFLICT (empresa_key, cuenta) DO NOTHING;`);
console.error(`\n${cuentas.length} cuentas para ${EMPRESA}`);
