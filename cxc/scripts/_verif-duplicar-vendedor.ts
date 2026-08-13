// ─────────────────────────────────────────────────────────────────────────────
// Verificación CONTRA PRODUCCIÓN de "el pedido duplicado queda a nombre de
// quien lo duplica" (13-ago-2026), en las DOS direcciones y con usuarios REALES.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_verif-duplicar-vendedor.ts
//
// Corre el handler REAL (`POST /api/catalogo/[marca]/orders/[id]/duplicar`) con
// una cookie de sesión firmada, y LEE DE LA BASE lo que quedó guardado —
// `vendedor_switch_id` y `vendor_name`— en vez de confiar en la respuesta.
//
// 🔴 NO TOCA SWITCH. El duplicar solo crea un BORRADOR; acá no se llama a
// "Enviar a Switch" por ningún camino. La fila de `*_switch_envios` que se
// inserta es un CANDADO LOCAL de mentira (el duplicar solo actúa sobre pedidos
// bloqueados) con `numero_interno` que lo dice, y se BORRA al terminar.
//
// 🔴 TODO LO QUE CREA SE BORRA, incluso si algo revienta (bloque `finally`):
// los pedidos con el soft delete de siempre (deleted=true + deleted_at, igual
// que el borrado del módulo) y la fila de envío con un delete de verdad.
//
// Los dos casos salen de mapeos REALES de `fg_user_switch_vendedor` medidos el
// 13-ago-2026 (ver la constante CASOS): `edwin` tiene vendedor en vistana y
// `alberto` NO — o sea que la degradación se prueba con el hueco que existe de
// verdad, no con un usuario inventado.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { POST as duplicarPost } from "@/app/api/catalogo/[marca]/orders/[id]/duplicar/route";

const MARCA = "calvin"; // empresa vistana — donde está el hueco de mapeo real
const NOMBRE_PRUEBA = "PRUEBA T169 — BORRAR";
const ENVIO_FALSO = "T169-CANDADO-LOCAL-NO-ES-SWITCH";

/** Vendedor con el que arranca el ORIGINAL (para ver si cambia o se conserva). */
const VENDEDOR_ORIGINAL = { id: 2, nombre: "DANIEL LEVY" };

const CASOS = [
  {
    titulo: "CON mapeo (edwin en vistana) → el clon queda a nombre de quien duplica",
    userId: "f3e172d5-5fc3-42cc-88d4-8c9bfdbf8c8f",
    userName: "edwin",
    role: "vendedor",
    espera: { id: 5, nombre: "EDWIN" },
  },
  {
    titulo: "SIN mapeo (alberto NO tiene vistana) → se CONSERVA el del original",
    userId: "3fbc00d0-9022-42b6-864d-ab9b98dcda16",
    userName: "alberto",
    role: "admin",
    espera: VENDEDOR_ORIGINAL,
  },
];

function req(userId: string, userName: string, role: string): NextRequest {
  const r = new NextRequest("http://localhost/api/catalogo/calvin/orders/x/duplicar", {
    method: "POST",
  });
  r.cookies.set("cxc_session", signSession({ role, userId, userName, sessionToken: "verif-t169" }));
  return r;
}

async function main() {
  const cfg = MARCAS_CONFIG[MARCA];
  const db = await cfg.db();
  const creados: string[] = [];
  let envioId: string | null = null;
  let originalId = "";

  try {
    const { data: prod } = await db
      .from(cfg.productsTable)
      .select("id, sku, name")
      .limit(1)
      .maybeSingle();
    if (!prod) throw new Error(`Sin productos en ${cfg.productsTable} — no se puede armar el pedido`);

    // ── 1. Pedido ORIGINAL de prueba, a nombre de OTRO vendedor ──
    const { data: creado, error: errRpc } = await db.rpc(cfg.createOrderRpc, {
      p_client_name: NOMBRE_PRUEBA,
      p_vendor_name: VENDEDOR_ORIGINAL.nombre,
      p_client_email: null,
      p_total: 10,
      p_idempotency_key: `verif-t169-${Date.now().toString(36)}`,
      p_items: [{ product_id: prod.id, sku: prod.sku, name: prod.name, quantity: 1, unit_price: 10 }],
    });
    if (errRpc || !creado) throw new Error(`No se pudo crear el original: ${errRpc?.message}`);
    originalId = (creado as { order_id: string }).order_id;
    creados.push(originalId);
    await db
      .from(cfg.ordersTable)
      .update({ vendedor_switch_id: VENDEDOR_ORIGINAL.id, vendor_name: VENDEDOR_ORIGINAL.nombre })
      .eq("id", originalId);
    console.log(`ORIGINAL ${(creado as { order_number: string }).order_number} (${originalId})`);
    console.log(`  vendedor_switch_id=${VENDEDOR_ORIGINAL.id} · vendor_name=${JSON.stringify(VENDEDOR_ORIGINAL.nombre)}\n`);

    // ── 2. Candado LOCAL (el duplicar solo actúa sobre pedidos bloqueados) ──
    const { data: envio, error: errEnvio } = await db
      .from(cfg.enviosTable)
      .insert({
        order_id: originalId,
        estado: "enviado",
        numero_interno: ENVIO_FALSO,
        payload: { verificacion: "t169", nota: "candado local — este pedido NUNCA se mandó a Switch" },
      })
      .select("id")
      .single();
    if (errEnvio || !envio) throw new Error(`No se pudo poner el candado: ${errEnvio?.message}`);
    envioId = envio.id as string;

    // ── 3. Los dos casos ──
    let fallos = 0;
    for (const caso of CASOS) {
      const res = await duplicarPost(req(caso.userId, caso.userName, caso.role), {
        params: { marca: MARCA, id: originalId },
      });
      const body = (await res.json()) as { id?: string; error?: string; yaExistia?: boolean };
      if (res.status !== 200 || !body.id) throw new Error(`duplicar respondió ${res.status}: ${body.error}`);
      if (body.yaExistia) throw new Error("devolvió un duplicado anterior — el soft delete no limpió");
      creados.push(body.id);

      // Lo que quedó EN LA BASE, no lo que dijo la respuesta.
      const { data: clon } = await db
        .from(cfg.ordersTable)
        .select("order_number, vendedor_switch_id, vendor_name, client_name")
        .eq("id", body.id)
        .single();
      const ok =
        clon?.vendedor_switch_id === caso.espera.id && clon?.vendor_name === caso.espera.nombre;
      if (!ok) fallos++;
      console.log(`${ok ? "🟢" : "🔴"} ${caso.titulo}`);
      console.log(`   duplicado ${clon?.order_number}: vendedor_switch_id=${clon?.vendedor_switch_id} · vendor_name=${JSON.stringify(clon?.vendor_name)}`);
      console.log(`   esperado:  vendedor_switch_id=${caso.espera.id} · vendor_name=${JSON.stringify(caso.espera.nombre)}\n`);

      // El segundo caso necesita que el reemplazo anterior YA no cuente
      // (el dedupe devolvería ese mismo en vez de crear otro).
      await db
        .from(cfg.ordersTable)
        .update({ deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", body.id);
    }
    console.log(fallos === 0 ? "🟢 LOS DOS CASOS PASAN" : `🔴 ${fallos} caso(s) fallaron`);
  } finally {
    // ── 4. Limpieza: se borra TODO lo creado, pase lo que pase ──
    if (envioId) {
      const { error } = await db.from(cfg.enviosTable).delete().eq("id", envioId);
      console.log(`\nlimpieza · candado local ${envioId}: ${error ? "🔴 " + error.message : "borrado"}`);
    }
    for (const id of creados) {
      const { error } = await db
        .from(cfg.ordersTable)
        .update({ deleted: true, deleted_at: new Date().toISOString() })
        .eq("id", id);
      console.log(`limpieza · pedido ${id}: ${error ? "🔴 " + error.message : "deleted=true"}`);
    }
    // Prueba de que no quedó nada visible con el nombre de prueba.
    const { data: vivos } = await db
      .from(cfg.ordersTable)
      .select("id, order_number")
      .eq("client_name", NOMBRE_PRUEBA)
      .eq("deleted", false);
    console.log(`limpieza · pedidos de prueba VIVOS: ${vivos?.length ?? "?"} ${(vivos?.length ?? 0) === 0 ? "🟢" : "🔴"}`);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("🔴", e);
    process.exit(1);
  },
);
