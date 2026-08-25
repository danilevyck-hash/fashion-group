/**
 * READ-ONLY. Verificación de los TRES bugs denunciados y de los conteos, antes
 * de tocar una línea. Nada de esto se da por cierto: se mide.
 *
 *   1. ¿Reebok lista pedidos YA BORRADOS? ¿Cuántos, y cuántos están en Switch?
 *   2. Los conteos vivos por marca (deleted = false) y los borradores.
 *   3. ¿Existe una COTIZACIÓN en Switch? (TOM-027)
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-pedidos-una-pantalla.ts
 */
import { MARCAS_CONFIG } from "../src/lib/catalogo/marcas";

const ACTIVOS = ["enviado", "verificado"];

async function main() {
  let vivosTot = 0, borradosTot = 0, borradorTot = 0, publicosTot = 0;

  for (const cfg of Object.values(MARCAS_CONFIG)) {
    const db = await cfg.db();
    const { data: ords, error } = await db
      .from(cfg.ordersTable)
      .select("id, order_number, client_name, status, deleted")
      .order("created_at", { ascending: false });
    if (error) { console.log(`${cfg.marca}: ERROR orders ${error.message}`); continue; }
    const filas = (ords ?? []) as Record<string, unknown>[];
    const vivos = filas.filter((o) => o.deleted !== true);
    const borrados = filas.filter((o) => o.deleted === true);
    const borradores = vivos.filter((o) => String(o.status ?? "").trim().toLowerCase() === "borrador");

    // ¿Cuáles de los BORRADOS tienen envío ACTIVO en Switch?
    const { data: envios } = await db
      .from(cfg.enviosTable)
      .select("order_id, numero_interno, pedido_switch_id, documento")
      .in("estado", ACTIVOS);
    const enSwitch = new Map<string, string>();
    const doc = new Map<string, string>();
    for (const e of ((envios ?? []) as Record<string, unknown>[])) {
      enSwitch.set(String(e.order_id), String(e.numero_interno || e.pedido_switch_id || "?"));
      doc.set(String(e.order_id), String(e.documento ?? "pedido"));
    }
    const borradosEnSwitch = borrados.filter((o) => enSwitch.has(String(o.id)));

    // Públicos sin convertir y vivos.
    const pdb = await cfg.publicosDb();
    const { data: pubs } = await pdb
      .from(cfg.publicosTable)
      .select("short_id, convertida, deleted");
    const pubVivos = ((pubs ?? []) as Record<string, unknown>[]).filter((p) => !p.convertida && !p.deleted);

    // Cotizaciones vivas
    const cotiz = vivos.filter((o) => doc.get(String(o.id)) === "cotizacion");

    console.log(
      `${cfg.marca.padEnd(8)} vivos ${String(vivos.length).padStart(3)} · borrados ${String(borrados.length).padStart(3)}` +
      ` · borrador(status) ${borradores.length} · publicos-sin-convertir ${pubVivos.length}` +
      ` · BORRADOS-EN-SWITCH ${borradosEnSwitch.length} · cotizaciones ${cotiz.length}`,
    );
    if (borradosEnSwitch.length)
      console.log(`   borrados que siguen en Switch: ${borradosEnSwitch.map((o) => `${o.order_number} (#${enSwitch.get(String(o.id))})`).join(", ")}`);
    if (cotiz.length)
      console.log(`   COTIZACIONES: ${cotiz.map((o) => `${o.order_number} ${o.client_name} #${enSwitch.get(String(o.id))}`).join(", ")}`);
    if (borrados.length && cfg.listaFiltraDeleted === false)
      console.log(`   ⚠️ listaFiltraDeleted=false → GET /orders devolvería ${filas.length} (vivos+borrados)`);

    vivosTot += vivos.length; borradosTot += borrados.length;
    borradorTot += borradores.length; publicosTot += pubVivos.length;
  }
  console.log(`\nTOTAL vivos ${vivosTot} · borrados ${borradosTot} · borradores(status) ${borradorTot} · publicos ${publicosTot}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
