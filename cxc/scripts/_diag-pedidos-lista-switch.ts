/**
 * SOLO LEE. Prueba de /apipedido/lista (doc págs 47-48) para la pestaña
 * «Pedidos» de bodega: qué campos trae y si algo dice «facturado».
 * Una empresa por corrida; cierra la sesión al terminar.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-pedidos-lista-switch.ts <empresa_key> [desde] [hasta]
 */
import { writeFileSync } from "node:fs";
import { createSwitchClient, type SwitchPedidoListaRow } from "../src/lib/switch-api/client";

async function todas(c: ReturnType<typeof createSwitchClient>, desde: string, hasta: string, estatus?: string) {
  const out: SwitchPedidoListaRow[] = [];
  for (let p = 1; p < 200; p++) {
    const d = await c.listPedidos({ desde, hasta, porPagina: 50, paginaActual: p, estatus });
    if (p === 1) console.log(`  [${estatus ?? "sin estatus"}] paginacion:`, JSON.stringify(d.paginacion));
    out.push(...(d.pedidos ?? []));
    if (!d.pedidos || d.pedidos.length < 50) break;
  }
  return out;
}

async function main() {
  const empresa = process.argv[2];
  const desde = process.argv[3] ?? "2026-08-06";
  const hasta = process.argv[4] ?? "2026-10-05";
  const c = createSwitchClient(empresa);
  try {
    const todos = await todas(c, desde, hasta);
    const activos = await todas(c, desde, hasta, "Activo");
    const inactivos = await todas(c, desde, hasta, "Inactivo");
    console.log(`${empresa}: total=${todos.length} activos=${activos.length} inactivos=${inactivos.length}`);
    if (todos[0]) console.log("  campos:", Object.keys(todos[0]).join(", "));
    if (todos[0]) console.log("  ejemplo:", JSON.stringify(todos[0]));
    writeFileSync(`/tmp/pedidos-probe/${empresa}.json`, JSON.stringify({ todos, inactivos }, null, 1));
  } finally {
    await c.logout();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
