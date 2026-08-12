/**
 * ¿Se puede resolver sku→artículo con MENOS llamadas a Switch?
 *
 * El motor de envío (`switch-envio.ts`) pide `/apiarticulos/lista?filtro=SKU`
 * una vez por línea, y después `/apiarticulos/tallacolor` otra vez por línea.
 * Antes de paralelizar hay que descartar lo obvio: que Switch acepte VARIOS
 * códigos en un solo `filtro`. Esto lo prueba contra la API real.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_probe-envio-alternativas.ts [marca]
 */

import { MARCAS_CONFIG } from "../src/lib/catalogo/marcas";
import { createSwitchClient, logoutAllSwitchSessions } from "../src/lib/switch-api/client";

const marca = process.argv[2] || "tommy";

async function main() {
  const cfg = MARCAS_CONFIG[marca];
  const db = await cfg.db();
  const { data: prods } = await db
    .from(cfg.productsTable)
    .select("sku")
    .not("sku", "is", null)
    .limit(4);
  const skus = (prods || []).map((p: { sku: string }) => String(p.sku).trim()).filter(Boolean);
  console.log("SKUs de prueba:", skus.join(" | "));

  const client = createSwitchClient(cfg.empresaKey);
  const medir = async (etiqueta: string, fn: () => Promise<unknown>) => {
    const t0 = Date.now();
    try {
      const r = await fn();
      console.log(`${etiqueta} → ${((Date.now() - t0) / 1000).toFixed(2)} s :: ${JSON.stringify(r).slice(0, 200)}`);
    } catch (e) {
      console.log(`${etiqueta} → ERROR ${(e as Error).message}`);
    }
  };

  // 0) Costo de UNA llamada de cada tipo (calienta el token primero).
  await client.getArticulos({ porPagina: 50, paginaActual: 1, filtro: skus[0] });
  for (let i = 0; i < 3; i++) {
    await medir(`lista(1 sku) #${i}`, async () => {
      const r = await client.getArticulos({ porPagina: 50, paginaActual: 1, filtro: skus[0] });
      return { n: (r.articulos || []).length };
    });
  }
  const uno = await client.getArticulos({ porPagina: 50, paginaActual: 1, filtro: skus[0] });
  const art = (uno.articulos || [])[0];
  for (let i = 0; i < 2; i++) {
    await medir(`tallacolor #${i}`, async () => {
      const r = await client.apiarticulosTallaColor({ articuloId: art.id });
      return { n: (r.tallacolor || []).length };
    });
  }

  // 1) ¿Varios códigos en un solo filtro? Separadores plausibles.
  for (const sep of [",", ", ", " ", "|", ";"]) {
    const filtro = skus.slice(0, 3).join(sep);
    await medir(`filtro multi "${sep}"`, async () => {
      const r = await client.getArticulos({ porPagina: 50, paginaActual: 1, filtro });
      const codigos = (r.articulos || []).map((a) => a.codigo);
      return { n: codigos.length, cruzan: skus.slice(0, 3).filter((s) => codigos.includes(s)).length };
    });
  }

  // 2) ¿Un PREFIJO común trae varios? (el filtro parece ser LIKE)
  const prefijo = skus[0].slice(0, 6);
  await medir(`filtro prefijo "${prefijo}"`, async () => {
    const r = await client.getArticulos({ porPagina: 50, paginaActual: 1, filtro: prefijo });
    return { n: (r.articulos || []).length, primeros: (r.articulos || []).slice(0, 3).map((a) => a.codigo) };
  });

  // 3) ¿La lista SIN filtro trae precio + codigoBarraId? (cuántas páginas costaría)
  await medir("lista sin filtro (pág 1 de 50)", async () => {
    const r = await client.getArticulos({ porPagina: 50, paginaActual: 1 });
    const a = (r.articulos || [])[0];
    return {
      n: (r.articulos || []).length,
      total: (r as unknown as Record<string, unknown>).totalRegistros ?? "?",
      campos: a ? Object.keys(a) : [],
    };
  });
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => logoutAllSwitchSessions());
