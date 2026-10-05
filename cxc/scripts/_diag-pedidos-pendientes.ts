/**
 * SOLO LEE. Cuántos pedidos pendientes quedarían por empresa con la regla de
 * Guías › Pedidos: estatus Activo (último año) − TCKCTA − 12188 − sin ficha.
 *   npx tsx -r dotenv/config scripts/_diag-pedidos-pendientes.ts <empresa_key>
 */
import { createClient } from "@supabase/supabase-js";
import { createSwitchClient, type SwitchPedidoListaRow } from "../src/lib/switch-api/client";
import { pedidoEntra } from "../src/lib/guias/pedidos-bodega";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const empresa = process.argv[2];
  const c = createSwitchClient(empresa);
  const lista: SwitchPedidoListaRow[] = [];
  try {
    for (let p = 1; p < 100; p++) {
      const d = await c.listPedidos({ desde: "2025-10-05", hasta: "2026-10-06", porPagina: 50, paginaActual: p, estatus: "Activo" });
      lista.push(...(d.pedidos ?? []));
      if ((d.pedidos ?? []).length < 50) break;
    }
  } finally {
    await c.logout();
  }
  const ids = [...new Set(lista.map((r) => Number(r.clienteId)))];
  const { data: cl } = await db.from("switch_clientes").select("cliente_switch_id, codigo").eq("empresa_key", empresa).in("cliente_switch_id", ids);
  const cod = new Map((cl ?? []).map((x) => [Number(x.cliente_switch_id), String(x.codigo ?? "")]));
  const codigos = [...new Set([...cod.values()].map((x) => x.trim().toUpperCase()).filter(Boolean))];
  const { data: cm } = await db.from("clientes_master").select("codigo").eq("deleted", false).in("codigo", codigos.length ? codigos : ["__"]);
  const fichas = new Set((cm ?? []).map((x) => String(x.codigo).trim().toUpperCase()));
  const entran = lista.filter((r) => pedidoEntra(cod.get(Number(r.clienteId)), fichas));
  const fuera = lista.filter((r) => !entran.includes(r)).map((r) => `${cod.get(Number(r.clienteId)) ?? "?"}`);
  console.log(`${empresa}: activos_365d=${lista.length} pendientes=${entran.length} excluidos=${JSON.stringify(fuera.reduce((m: Record<string, number>, k) => ((m[k] = (m[k] ?? 0) + 1), m), {}))}`);
  for (const r of entran) console.log(`   ${r.fecha?.slice(0, 10)} ${r.secuencial} ${cod.get(Number(r.clienteId))} ${r.cliente} · ${r.vendedor} · ${r.total}`);
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
