/**
 * PRUEBA DE QUE IR MÁS RÁPIDO NO CAMBIÓ NI UN DATO.
 *
 * El cambio del 13-ago-2026 toca UNA cosa: cómo se PIDEN los datos a Switch
 * (en serie → de a N). Así que la prueba correcta es pedir lo mismo de las dos
 * formas, contra el Switch REAL, y comparar campo por campo.
 *
 *   A. Catálogo  → `barrerPaginasArticulos` con concurrencia 1 vs. la de
 *      producción. Se comparan los artículos UNO POR UNO y EN ORDEN (como
 *      conjunto, dos artículos intercambiados se verían idénticos, y el orden
 *      es justo lo que el paralelismo puede romper).
 *   B. Cartera   → `getEstadoCuenta` de TODOS los clientes en serie vs. en
 *      tandas paralelas. Mismo criterio: por posición, campo por campo.
 *
 * 🔴 SOLO LECTURA. No escribe en Switch ni en Supabase. La prueba de que el
 * catálogo y el CXC guardados no se mueven va aparte
 * (`_verif-sync-paralelo-db.ts`), que sí corre el sync de verdad.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🩸 HALLAZGO — SWITCH NO ES DETERMINISTA, Y NO ES CULPA DEL PARALELISMO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Medido el 13-ago-2026 sobre los 8.173 artículos de vistana: la comparación
 * serial-contra-paralelo dio **1 a 3 artículos distintos**, siempre con la
 * MISMA firma — mismo `id`, mismo `codigo`, misma `descripcion`, mismo `costo`,
 * y distinto `codigoBarra` / `codigoBarraId` (p.ej. `YW0YW0090701V` con
 * codigoBarraId 3289 en una corrida y 2788 en la otra).
 *
 * Parecía el paralelismo. NO LO ES, y por eso este script hace un CONTROL de
 * **paralelo contra paralelo, pegados en el tiempo**: dos corridas del MISMO
 * método también difieren, en los mismos 3 artículos y con los valores DADOS
 * VUELTA. O sea que es Switch el que elige un código de barra u otro entre
 * pedidos, en artículos que tienen varios. Se verificó además pidiendo la misma
 * página **8 veces en serie**: ahí sí, byte por byte idéntica
 * (`scripts/_diag-pagina-inestable.ts`).
 *
 * ⚠️ Existe HOY, con el sync serial, exactamente igual. Lo único que escribe ese
 * campo es Reebok (`articuloFields: {codigo_barra_id}`); Calvin, Tommy y Joybees
 * ni lo miran. Sin esta prueba de control, esas 3 filas se habrían leído como
 * "el paralelismo corrompe el catálogo" y el trabajo se habría tirado por una
 * causa equivocada.
 *
 * ⚠️ SESIÓN ÚNICA. Mirar el calendario de crons antes de correr: esta empresa
 * no puede estar sincronizando. Cierra sesión al terminar.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-sync-paralelo-identico.ts
 */

import { createSwitchClient, logoutAllSwitchSessions } from "../src/lib/switch-api/client";
import { barrerPaginasArticulos } from "../src/lib/switch-api/sync-catalogo";
import { enParalelo } from "../src/lib/switch-api/en-paralelo";

const EMPRESA = process.env.EMPRESA ?? "vistana";
const PER_PAGE = 50;
const ms = () => Number(process.hrtime.bigint() / 1_000_000n);
const seg = (n: number) => (n / 1000).toFixed(1);

/** Compara dos listas POR POSICIÓN y campo por campo. Devuelve las diferencias. */
function diferencias(a: unknown[], b: unknown[], etiqueta: string): string[] {
  const difs: string[] = [];
  if (a.length !== b.length) {
    difs.push(`${etiqueta}: largos distintos — serial ${a.length} vs paralelo ${b.length}`);
  }
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = JSON.stringify(a[i]);
    const y = JSON.stringify(b[i]);
    if (x !== y) difs.push(`${etiqueta}[${i}]: serial ${x.slice(0, 160)} ≠ paralelo ${y.slice(0, 160)}`);
    if (difs.length > 12) return difs;
  }
  return difs;
}

async function main() {
  const client = createSwitchClient(EMPRESA);
  const traer = async (pagina: number) => {
    const d = await client.getArticulos({ porPagina: PER_PAGE, paginaActual: pagina });
    return d?.articulos ?? [];
  };

  console.log(`\n════ ${EMPRESA} — ¿el paralelismo cambió algún dato? ════\n`);

  // ── A. Catálogo ────────────────────────────────────────────────────────────
  console.log("── A. barrido de artículos ──");
  const t1 = ms();
  const serial = await barrerPaginasArticulos(traer, {
    empresaKey: EMPRESA,
    perPage: PER_PAGE,
    concurrencia: 1,
  });
  const msSerial = ms() - t1;
  const t2 = ms();
  const paralelo = await barrerPaginasArticulos(traer, { empresaKey: EMPRESA, perPage: PER_PAGE });
  const msParalelo = ms() - t2;
  // 2º barrido paralelo, pegado al 1º: si difiere de él, la inestabilidad es de
  // Switch con el TIEMPO y no del paralelismo (dos corridas del mismo método).
  const paralelo2 = await barrerPaginasArticulos(traer, { empresaKey: EMPRESA, perPage: PER_PAGE });
  const difPP = diferencias(paralelo, paralelo2, "artículo(par1 vs par2)");
  console.log(
    `   control paralelo vs paralelo (pegados en el tiempo): ${difPP.length === 0 ? "🟢 idénticos" : `🔴 ${difPP.length} dif`}`,
  );
  for (const d of difPP.slice(0, 3)) console.log(`      ${d}`);

  console.log(`   serial ....  ${String(serial.length).padStart(5)} artículos en ${seg(msSerial)} s`);
  console.log(`   paralelo ..  ${String(paralelo.length).padStart(5)} artículos en ${seg(msParalelo)} s   → ${(msSerial / msParalelo).toFixed(1)}× más rápido`);
  const difA = diferencias(serial, paralelo, "artículo");
  if (difA.length === 0) {
    console.log(`   🟢 ${serial.length} artículos IDÉNTICOS, uno por uno y en el mismo orden\n`);
  } else {
    console.log(`   🔴 ${difA.length} diferencia(s):`);
    for (const d of difA) console.log(`      ${d}`);
    console.log();
  }

  // ── B. Cartera ─────────────────────────────────────────────────────────────
  if (process.env.SOLO === "catalogo") return;
  console.log("── B. estados de cuenta (cartera) ──");
  const clientes: Array<{ id: number }> = [];
  for (let page = 1; page <= 40; page++) {
    const resp = await client.listClientes({ porPagina: 200, paginaActual: page });
    const batch = (resp.clientes ?? []) as Array<{ id: number }>;
    if (batch.length === 0) break;
    clientes.push(...batch.filter((c) => typeof c.id === "number"));
    const total = Number(resp.paginacion?.total ?? 0);
    if (total > 0 && clientes.length >= total) break;
  }
  console.log(`   ${clientes.length} clientes`);

  // Solo los `elements` importan: son los documentos que el sync escribe.
  const docsDe = (ec: unknown) =>
    ((ec as { estadocuenta?: { elements?: unknown[] } })?.estadocuenta?.elements ?? []);

  const t3 = ms();
  const ecSerial: unknown[][] = [];
  for (const c of clientes) ecSerial.push(docsDe(await client.getEstadoCuenta(c.id)));
  const msEcSerial = ms() - t3;

  const CONC = 6;
  const t4 = ms();
  const ecParalelo: unknown[][] = [];
  for (let i = 0; i < clientes.length; i += CONC) {
    const tanda = clientes.slice(i, i + CONC);
    const r = await enParalelo(tanda, CONC, async (c) => docsDe(await client.getEstadoCuenta(c.id)));
    ecParalelo.push(...r);
  }
  const msEcParalelo = ms() - t4;

  const docsSerial = ecSerial.flat();
  const docsParalelo = ecParalelo.flat();
  console.log(`   serial ....  ${String(docsSerial.length).padStart(5)} documentos en ${seg(msEcSerial)} s`);
  console.log(
    `   paralelo ..  ${String(docsParalelo.length).padStart(5)} documentos en ${seg(msEcParalelo)} s   → ${(msEcSerial / msEcParalelo).toFixed(1)}× más rápido`,
  );
  const difB = diferencias(docsSerial, docsParalelo, "documento");
  if (difB.length === 0) {
    console.log(`   🟢 ${docsSerial.length} documentos IDÉNTICOS, uno por uno y en el mismo orden`);
    // La suma de saldos es el número que Daniel MIRA: se compara aparte para
    // que el veredicto no dependa solo de una comparación de strings.
    const suma = (xs: unknown[]) =>
      xs.reduce((s: number, d) => s + (parseFloat(String((d as { saldo?: string }).saldo ?? "0").replace(/,/g, "")) || 0), 0);
    console.log(
      `   🟢 saldo total: serial ${suma(docsSerial).toFixed(2)} · paralelo ${suma(docsParalelo).toFixed(2)}`,
    );
  } else {
    console.log(`   🔴 ${difB.length} diferencia(s):`);
    for (const d of difB) console.log(`      ${d}`);
  }
  console.log();
}

main()
  .catch((e) => {
    console.error("FALLÓ:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await logoutAllSwitchSessions();
  });
