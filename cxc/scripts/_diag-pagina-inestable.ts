/**
 * ¿La diferencia que apareció al comparar el barrido serial contra el paralelo
 * la CAUSA el paralelismo, o Switch devuelve la misma página distinta cada vez?
 *
 * Medido el 13-ago-2026: al comparar los 8.173 artículos de vistana uno por uno,
 * 8.172 salieron idénticos y UNO (índice 1248, `J30J320199BEH`) trajo distinto
 * `codigoBarra` / `codigoBarraId` — mismo `id`, mismo `codigo`, misma
 * descripción, mismo costo. Es la firma de un artículo con VARIOS códigos de
 * barra, y el catálogo de Switch ya se sabe que REPITE renglones (221 ids
 * repetidos, ver sync-articulo-marca.ts).
 *
 * La pregunta se contesta pidiendo la MISMA página N veces EN SERIE: si dos
 * pedidos consecutivos ya difieren, la inestabilidad es de Switch y existe hoy
 * igual, sin paralelismo de por medio.
 *
 * SOLO LECTURA.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-pagina-inestable.ts
 */

import { createSwitchClient, logoutAllSwitchSessions } from "../src/lib/switch-api/client";

const EMPRESA = process.env.EMPRESA ?? "vistana";
const PER_PAGE = 50;
const CODIGO = process.env.CODIGO ?? "J30J320199BEH";
/** índice global 1248 → página 25, posición 48 (base 0) */
const PAGINA = Number(process.env.PAGINA ?? 25);
const VECES = 8;

async function main() {
  const client = createSwitchClient(EMPRESA);
  console.log(`\n════ ${EMPRESA} · página ${PAGINA} pedida ${VECES} veces EN SERIE ════\n`);

  const huellas: string[] = [];
  for (let i = 1; i <= VECES; i++) {
    const d = await client.getArticulos({ porPagina: PER_PAGE, paginaActual: PAGINA });
    const arr = d?.articulos ?? [];
    const huella = JSON.stringify(arr);
    huellas.push(huella);
    const fila = arr.find((a) => a.codigo === CODIGO) as
      | { codigo?: string; codigoBarra?: string; codigoBarraId?: number; precio?: string }
      | undefined;
    console.log(
      `   pedido ${i}: ${arr.length} art · ${CODIGO} → ` +
        (fila
          ? `codigoBarra=${fila.codigoBarra} codigoBarraId=${fila.codigoBarraId} precio=${fila.precio}`
          : "NO está en esta página"),
    );
  }

  const distintas = new Set(huellas).size;
  console.log(
    `\n   ${distintas === 1 ? "🟢 las " + VECES + " respuestas son IDÉNTICAS" : `🔴 ${distintas} respuestas DISTINTAS de ${VECES} pedidos EN SERIE`}`,
  );

  // ¿Cuántas veces aparece ese código en TODO el catálogo? (renglones repetidos)
  console.log(`\n── ¿${CODIGO} aparece más de una vez en el catálogo? ──`);
  const apariciones: Array<{ pagina: number; codigoBarraId?: number; marcaId?: number }> = [];
  for (let p = 1; p <= 250; p++) {
    const d = await client.getArticulos({ porPagina: PER_PAGE, paginaActual: p });
    const arr = (d?.articulos ?? []) as Array<{
      codigo?: string;
      codigoBarraId?: number;
      marcaId?: number;
    }>;
    for (const a of arr) {
      if (a.codigo === CODIGO) apariciones.push({ pagina: p, codigoBarraId: a.codigoBarraId, marcaId: a.marcaId });
    }
    if (arr.length < PER_PAGE) break;
  }
  console.log(`   ${apariciones.length} aparición(es):`);
  for (const a of apariciones) {
    console.log(`     página ${a.pagina} · codigoBarraId=${a.codigoBarraId} · marcaId=${a.marcaId}`);
  }
  console.log(
    `\n   ⚠️ marcaId de Calvin (CK FOOTWEAR en vistana) = 8. Este artículo ` +
      `${apariciones.some((a) => a.marcaId === 8) ? "SÍ entra" : "NO entra"} al catálogo Calvin.\n`,
  );
}

main()
  .catch((e) => {
    console.error("FALLÓ:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await logoutAllSwitchSessions();
  });
