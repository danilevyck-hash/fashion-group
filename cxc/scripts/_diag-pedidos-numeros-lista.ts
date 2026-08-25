/**
 * READ-ONLY. La lista de "Administrar catálogo › Pedidos" no muestra NINGÚN
 * número: ni el del pedido (PED-017 / TOM-002 / CKP-005) ni el que quedó en
 * Switch. Antes de construir hay que saber, contra producción:
 *
 *   1. ¿Cómo se llaman de verdad las columnas en las 4 marcas?
 *   2. ¿CUÁNTOS pedidos tienen cada número lleno? (un campo vacío en el 90% de
 *      las filas se muestra distinto de uno que siempre está)
 *   3. ¿Los pedidos del LINK sin convertir tienen número propio? (no deberían:
 *      el PED-XXX se lo asigna la conversión)
 *   4. ¿La columna `documento` (pedido | cotización, DDL 20260824160000) ya
 *      está corrida? ¿Cuántas cotizaciones hay?
 *   5. Ejemplos REALES para el reporte: pedido con sus DOS números.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-pedidos-numeros-lista.ts
 */
import { MARCAS_CONFIG } from "../src/lib/catalogo/marcas";

const ACTIVOS = ["enviado", "verificado"];

async function main() {
  let totOrders = 0;
  let totSinNumero = 0;
  let totConEnvio = 0;
  let totEnvioSinNumero = 0;
  let totPublicos = 0;
  const ejemplos: string[] = [];
  let documentoExiste: boolean | null = null;

  for (const cfg of Object.values(MARCAS_CONFIG)) {
    console.log(`\n══════ ${cfg.marca.toUpperCase()} (prefijo ${cfg.numeroPrefijo}) ══════`);
    const db = await cfg.db();

    // ── 1. orders: ¿existe order_number y cuántos lo tienen? ──
    const { data: ords, error: oe } = await db
      .from(cfg.ordersTable)
      .select("id, order_number, client_name, created_at, deleted, status")
      .order("created_at", { ascending: false });
    if (oe) {
      console.log(`  ERROR orders: ${oe.message}`);
      continue;
    }
    const vivos = (ords || []).filter((o) => !(o as Record<string, unknown>).deleted);
    const sinNum = vivos.filter((o) => !String((o as Record<string, unknown>).order_number || "").trim());
    totOrders += vivos.length;
    totSinNumero += sinNum.length;
    console.log(`  orders vivos: ${vivos.length} | SIN order_number: ${sinNum.length}`);
    if (sinNum.length > 0) {
      console.log(`    ⚠️ ejemplos sin número: ${sinNum.slice(0, 3).map((o) => (o as Record<string, unknown>).id).join(", ")}`);
    }
    const muestra = vivos.slice(0, 3).map((o) => (o as Record<string, unknown>).order_number);
    console.log(`    muestra de order_number: ${JSON.stringify(muestra)}`);

    // ── 2. envíos: columnas reales + documento ──
    let envs: Record<string, unknown>[] = [];
    for (const cols of ["order_id, estado, numero_interno, pedido_switch_id, documento", "order_id, estado, numero_interno, pedido_switch_id"]) {
      const res = await db.from(cfg.enviosTable).select(cols);
      if (!res.error) {
        envs = (res.data || []) as unknown as Record<string, unknown>[];
        const tieneDoc = cols.includes("documento");
        if (documentoExiste === null) documentoExiste = tieneDoc;
        console.log(`  envíos: ${envs.length} | columna \`documento\`: ${tieneDoc ? "SÍ existe (DDL corrida)" : "NO existe (DDL pendiente)"}`);
        break;
      }
    }
    const activos = envs.filter((e) => ACTIVOS.includes(String(e.estado)));
    const estados = new Map<string, number>();
    for (const e of envs) estados.set(String(e.estado), (estados.get(String(e.estado)) || 0) + 1);
    console.log(`    estados: ${JSON.stringify(Object.fromEntries(estados))}`);
    const docs = new Map<string, number>();
    for (const e of envs) docs.set(String(e.documento ?? "(sin columna)"), (docs.get(String(e.documento ?? "(sin columna)")) || 0) + 1);
    console.log(`    documento: ${JSON.stringify(Object.fromEntries(docs))}`);

    const activosSinNumero = activos.filter((e) => !(e.numero_interno || e.pedido_switch_id));
    totConEnvio += activos.length;
    totEnvioSinNumero += activosSinNumero.length;
    console.log(`  envíos ACTIVOS (enviado/verificado): ${activos.length} | SIN número: ${activosSinNumero.length}`);

    // ── 3. cruce: pedido → sus dos números ──
    const porOrder = new Map<string, Record<string, unknown>>();
    for (const e of activos) porOrder.set(String(e.order_id), e);
    const conAmbos = vivos.filter((o) => porOrder.has(String((o as Record<string, unknown>).id)));
    console.log(`  pedidos vivos CON número de Switch: ${conAmbos.length} de ${vivos.length}`);
    for (const o of conAmbos.slice(0, 3)) {
      const r = o as Record<string, unknown>;
      const e = porOrder.get(String(r.id))!;
      const num = e.numero_interno || e.pedido_switch_id;
      const linea = `${cfg.marca}: ${r.order_number} → Switch ${num} (${String(e.documento ?? "pedido")}, ${e.estado}) · ${r.client_name}`;
      console.log(`    ${linea}`);
      ejemplos.push(linea);
    }

    // ── 4. públicos sin convertir: NO tienen order_number ──
    const pdb = await cfg.publicosDb();
    let pubs: Record<string, unknown>[] = [];
    for (const cols of ["short_id, convertida, ped_order_number, deleted, cliente_nombre", "short_id, convertida, ped_order_number"]) {
      const res = await pdb.from(cfg.publicosTable).select(cols);
      if (!res.error) {
        pubs = (res.data || []) as unknown as Record<string, unknown>[];
        break;
      }
    }
    const sinConvertir = pubs.filter((p) => !p.convertida && !p.deleted);
    totPublicos += sinConvertir.length;
    console.log(`  del link SIN convertir (van a la lista y NO tienen order_number): ${sinConvertir.length}`);
    if (sinConvertir.length) {
      console.log(`    short_id de muestra: ${sinConvertir.slice(0, 3).map((p) => p.short_id).join(", ")}`);
    }
  }

  console.log(`\n══════ TOTAL 4 MARCAS ══════`);
  console.log(`  pedidos internos vivos:            ${totOrders}`);
  console.log(`    sin order_number:                ${totSinNumero} (${((totSinNumero / Math.max(totOrders, 1)) * 100).toFixed(1)}%)`);
  console.log(`  con envío ACTIVO en Switch:        ${totConEnvio} (${((totConEnvio / Math.max(totOrders, 1)) * 100).toFixed(1)}% de los internos)`);
  console.log(`    activos sin número de Switch:    ${totEnvioSinNumero}`);
  console.log(`  del link sin convertir (sin n.º):  ${totPublicos}`);
  console.log(`  columna documento (DDL 20260824160000): ${documentoExiste ? "CORRIDA" : "PENDIENTE"}`);
  console.log(`\n  Ejemplos reales (pedido → Switch):`);
  for (const e of ejemplos) console.log(`    ${e}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
