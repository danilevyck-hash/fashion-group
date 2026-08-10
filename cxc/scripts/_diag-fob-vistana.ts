/**
 * DIAGNÓSTICO READ-ONLY — ¿dónde vive el costo FOB en la API de Switch?
 * (Fase 2 del tab Referencia). UNA empresa (vistana), UNA sesión, 4 requests:
 *   1. /apiarticulos/lista con filtro=31KAE22003001 → campos crudos del row
 *   2. /apiarticulos/info del mismo artículo → los ~29 campos crudos
 *   3. /apiarticulos/stock → existencia
 *   4. /cierresesion (higiene de sesión única)
 * NO ESCRIBE NADA.
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-fob-vistana.ts
 */
import { createSwitchClient, logoutAllSwitchSessions } from "../src/lib/switch-api/client";

const EMPRESA = "vistana";
const CODIGO = process.env.CODIGO ?? "31KAE22003001";

async function main() {
  const cli = createSwitchClient(EMPRESA);
  try {
    const lista = await cli.getArticulos({ porPagina: 50, paginaActual: 1, filtro: CODIGO });
    const rows = (lista as { articulos: Record<string, unknown>[] }).articulos ?? [];
    console.log(`/apiarticulos/lista filtro=${CODIGO}: ${rows.length} row(s)`);
    const row = rows.find((r) => r.codigo === CODIGO) ?? rows[0];
    if (!row) { console.log("sin filas — probar sin filtro"); return; }
    console.log("ROW CRUDO de /lista:", JSON.stringify(row, null, 2));

    if (row.codigoBarra) {
      const info = await cli.getArticuloInfo(String(row.codigoBarra));
      console.log("FICHA CRUDA de /info:", JSON.stringify(info, null, 2));
    } else {
      console.log("row sin codigoBarra — /info no se puede pedir");
    }

    const stock = await cli.getStock(Number(row.id));
    console.log("STOCK CRUDO:", JSON.stringify(stock, null, 2));
  } finally {
    await logoutAllSwitchSessions();
  }
}
main().catch((e) => { console.error("ERROR:", e?.message ?? e); process.exit(1); });
