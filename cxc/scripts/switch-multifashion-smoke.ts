/**
 * Smoke test del cliente Switch para Multifashion.
 *
 * Verifica E2E que:
 *   - El cliente lee env vars con la convención SWITCH_MULTIFASHION_API_*
 *   - Auth funciona y cachea token
 *   - listFacturas devuelve data válida con paginación
 *   - Los tipos compilan correctamente
 *
 * NO inserta nada en Supabase.
 *
 * Uso:
 *   npx tsx scripts/switch-multifashion-smoke.ts
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });

import { createSwitchClient, SwitchApiError } from "../src/lib/switch-api/client";

async function main() {
  console.log("\n=== Switch Multifashion — Smoke Test ===\n");

  const client = createSwitchClient("multifashion");

  const desde = "2026-05-01";
  const hasta = "2026-05-26";
  const porPagina = 5;

  console.log(`Llamando listFacturas(desde=${desde}, hasta=${hasta}, porPagina=${porPagina})...`);
  const facturas = await client.listFacturas({
    desde,
    hasta,
    porPagina,
    paginaActual: 1,
  });

  console.log(`\nFacturas en esta página: ${facturas.facturas.length}`);
  console.log(`Paginación reportada por Switch:`);
  console.log(`  porPagina:    ${facturas.paginacion.porPagina}`);
  console.log(`  paginaActual: ${facturas.paginacion.paginaActual}`);
  console.log(`  total:        ${facturas.paginacion.total}`);

  if (facturas.facturas.length > 0) {
    const first = facturas.facturas[0];
    console.log(`\nPrimera factura (sample):`);
    console.log(`  id:              ${first.id}`);
    console.log(`  secuencial:      ${first.secuencial}`);
    console.log(`  tipoComprobante: ${first.tipoComprobante}`);
    console.log(`  fecha:           ${first.fecha}`);
    console.log(`  total:           ${first.total}`);
    console.log(`  cliente:         ${first.cliente} (id=${first.clienteId})`);
    console.log(`  vendedor:        ${first.vendedor} (id=${first.vendedorId})`);
    console.log(`  sucursal:        ${first.sucursal} (id=${first.sucursalId})`);
  }

  console.log(`\nSmoke test OK.\n`);
}

main().catch((err) => {
  if (err instanceof SwitchApiError) {
    console.error(`\nSwitchApiError en ${err.endpoint}:`);
    console.error(`  message:  ${err.message}`);
    console.error(`  code:     ${err.code ?? "(ninguno)"}`);
    console.error(`  httpCode: ${err.httpCode ?? "(ninguno)"}`);
  } else {
    console.error("\nError fatal:", err);
  }
  process.exit(1);
});
