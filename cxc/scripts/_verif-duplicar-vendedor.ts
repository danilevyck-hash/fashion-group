// ─────────────────────────────────────────────────────────────────────────────
// Verificación CONTRA PRODUCCIÓN de "el pedido duplicado lleva el vendedor del
// ORIGINAL" (13-ago-2026), en los DOS caminos de duplicar y con usuarios REALES.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_verif-duplicar-vendedor.ts
//
// Corre los handlers REALES —`POST /api/catalogo/[marca]/orders/[id]/duplicar`
// ("Duplicar y corregir") y `POST /api/catalogo/[marca]/orders` con
// `duplicar_de` (el botón "Duplicar" de la LISTA)— con una cookie de sesión
// firmada, y LEE DE LA BASE lo que quedó guardado (`vendedor_switch_id` y
// `vendor_name`) en vez de confiar en la respuesta.
//
// 🔴 NO TOCA SWITCH. Duplicar solo crea un BORRADOR; acá no se llama a "Enviar
// a Switch" por ningún camino. La fila de `*_switch_envios` que se inserta es un
// CANDADO LOCAL de mentira (el `/duplicar` solo actúa sobre pedidos bloqueados)
// con `numero_interno` que lo dice, y se BORRA al terminar.
//
// 🔴 NO MANDA TELEGRAM. `POST /orders` avisa por el canal de NEGOCIO en cada
// pedido creado; acá se borran las credenciales del proceso antes de tocar nada,
// así que el aviso se omite solo (`sendTelegramAlert` sin token no sale a la
// red). Sin esto, la verificación spamearía el chat de Daniel con pedidos falsos.
//
// 🔴 TODO LO QUE CREA SE BORRA, incluso si algo revienta (bloque `finally`):
// los pedidos con el soft delete de siempre (deleted=true + deleted_at, igual
// que el borrado del módulo) y la fila de envío con un delete de verdad.
//
// Cubre las CUATRO combinaciones (camino × original con/sin vendedor) con TRES
// vendedores distintos y REALES de vistana, para que ningún resultado se pueda
// explicar por casualidad: el original es de DANIEL LEVY (2), quien duplica es
// EDWIN (5) o Rodrigo (8).
//
// 🩸 POR QUÉ TRES Y NO DOS. La verificación del #517 usaba `alberto` como "el
// que NO tiene vendedor en vistana" y leía `vendedor_switch_id=2`, dándolo por
// heredado del original. Medido el 13-ago-2026: **alberto SÍ tiene mapeo en
// vistana, y es el 2** — el mismo número, así que ese caso no distinguía nada.
// Hoy los 7 usuarios activos tienen mapeo en las 4 empresas (0 huecos), o sea
// que la rama "nadie tiene vendedor" no es alcanzable con los datos de hoy y no
// se puede verificar contra producción: la cubre el test unitario.
// ─────────────────────────────────────────────────────────────────────────────

// ANTES de importar nada que pueda alertar.
for (const k of [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_BOT_TOKEN_NEGOCIO",
  "TELEGRAM_CHAT_ID_NEGOCIO",
  "TELEGRAM_BOT_TOKEN_SISTEMA",
  "TELEGRAM_CHAT_ID_SISTEMA",
]) {
  delete process.env[k];
}

import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { POST as duplicarPost } from "@/app/api/catalogo/[marca]/orders/[id]/duplicar/route";
import { POST as ordersPost } from "@/app/api/catalogo/[marca]/orders/route";

const MARCA = "calvin"; // empresa vistana — donde está el hueco de mapeo real
const NOMBRE_PRUEBA = "PRUEBA T173 — BORRAR";
const ENVIO_FALSO = "T173-CANDADO-LOCAL-NO-ES-SWITCH";

/** Vendedor con el que arranca el ORIGINAL (el que se tiene que heredar). */
const VENDEDOR_ORIGINAL = { id: 2, nombre: "DANIEL LEVY" };

/** Quien duplica: tiene SU PROPIO vendedor en vistana, distinto del original. */
const EDWIN = {
  userId: "f3e172d5-5fc3-42cc-88d4-8c9bfdbf8c8f",
  userName: "edwin",
  role: "vendedor",
  vendedor: { id: 5, nombre: "EDWIN" },
};
/** Otro que duplica, con un vendedor DISTINTO de los dos anteriores. */
const RODRIGO = {
  userId: "8051b5b9-91f5-4751-b626-ae1edda2c143",
  userName: "rodrigo",
  role: "vendedor",
  vendedor: { id: 8, nombre: "Rodrigo" },
};

type Quien = { userId: string; userName: string; role: string };

function req(quien: Quien, url: string, body?: unknown): NextRequest {
  const r = new NextRequest(`http://localhost${url}`, {
    method: "POST",
    ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
  r.cookies.set(
    "cxc_session",
    signSession({ role: quien.role, userId: quien.userId, userName: quien.userName, sessionToken: "verif-t173" }),
  );
  return r;
}

async function main() {
  const cfg = MARCAS_CONFIG[MARCA];
  const db = await cfg.db();
  const creados: string[] = [];
  const envios: string[] = [];
  let fallos = 0;

  const marcarBorrado = (id: string) =>
    db.from(cfg.ordersTable).update({ deleted: true, deleted_at: new Date().toISOString() }).eq("id", id);

  try {
    const { data: prod } = await db.from(cfg.productsTable).select("id, sku, name").limit(1).maybeSingle();
    if (!prod) throw new Error(`Sin productos en ${cfg.productsTable} — no se puede armar el pedido`);
    const ITEM = { product_id: prod.id, sku: prod.sku, name: prod.name, quantity: 1, unit_price: 10 };

    /** Crea un pedido ORIGINAL de prueba, con o sin vendedor propio. */
    async function crearOriginal(conVendedor: boolean): Promise<{ id: string; numero: string }> {
      const { data: creado, error } = await db.rpc(cfg.createOrderRpc, {
        p_client_name: NOMBRE_PRUEBA,
        p_vendor_name: conVendedor ? VENDEDOR_ORIGINAL.nombre : "Angela",
        p_client_email: null,
        p_total: 10,
        p_idempotency_key: `verif-t173-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        p_items: [ITEM],
      });
      if (error || !creado) throw new Error(`No se pudo crear el original: ${error?.message}`);
      const { order_id, order_number } = creado as { order_id: string; order_number: string };
      creados.push(order_id);
      if (conVendedor) {
        await db
          .from(cfg.ordersTable)
          .update({ vendedor_switch_id: VENDEDOR_ORIGINAL.id, vendor_name: VENDEDOR_ORIGINAL.nombre })
          .eq("id", order_id);
      }
      return { id: order_id, numero: order_number };
    }

    /** Pone el candado LOCAL que exige `/duplicar` (nunca se envió a Switch). */
    async function candadoLocal(orderId: string) {
      const { data, error } = await db
        .from(cfg.enviosTable)
        .insert({
          order_id: orderId,
          estado: "enviado",
          numero_interno: ENVIO_FALSO,
          payload: { verificacion: "t173", nota: "candado local — este pedido NUNCA se mandó a Switch" },
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(`No se pudo poner el candado: ${error?.message}`);
      envios.push(data.id as string);
    }

    async function revisar(titulo: string, clonId: string, espera: { id: number | null; nombre: string | null }) {
      const { data: clon } = await db
        .from(cfg.ordersTable)
        .select("order_number, vendedor_switch_id, vendor_name")
        .eq("id", clonId)
        .single();
      const ok = clon?.vendedor_switch_id === espera.id && clon?.vendor_name === espera.nombre;
      if (!ok) fallos++;
      console.log(`${ok ? "🟢" : "🔴"} ${titulo}`);
      console.log(
        `   duplicado ${clon?.order_number}: vendedor_switch_id=${clon?.vendedor_switch_id} · vendor_name=${JSON.stringify(clon?.vendor_name)}`,
      );
      console.log(`   esperado:  vendedor_switch_id=${espera.id} · vendor_name=${JSON.stringify(espera.nombre)}\n`);
    }

    // ── CASO 1 — "Duplicar y corregir": el clon lleva el vendedor del ORIGINAL,
    //    aunque quien duplica (edwin) tenga el suyo propio. ──
    const conVend = await crearOriginal(true);
    await candadoLocal(conVend.id);
    console.log(`ORIGINAL ${conVend.numero} · vendedor_switch_id=${VENDEDOR_ORIGINAL.id} · ${JSON.stringify(VENDEDOR_ORIGINAL.nombre)}\n`);

    let res = await duplicarPost(req(EDWIN, "/api/catalogo/calvin/orders/x/duplicar"), {
      params: { marca: MARCA, id: conVend.id },
    });
    let body = (await res.json()) as { id?: string; error?: string; yaExistia?: boolean };
    if (res.status !== 200 || !body.id) throw new Error(`/duplicar respondió ${res.status}: ${body.error}`);
    if (body.yaExistia) throw new Error("devolvió un duplicado anterior — el soft delete no limpió");
    creados.push(body.id);
    await revisar("/duplicar · edwin (con vendedor propio) duplica → queda el del ORIGINAL", body.id, VENDEDOR_ORIGINAL);
    await marcarBorrado(body.id); // el dedupe devolvería este mismo al siguiente

    // ── CASO 2 — el botón "Duplicar" de la LISTA (POST /orders + duplicar_de):
    //    mismo original, mismo resultado. El `vendor_name` que manda el
    //    navegador es el de quien duplica y NO puede pisar al heredado. ──
    res = await ordersPost(
      req(EDWIN, "/api/catalogo/calvin/orders", {
        client_name: NOMBRE_PRUEBA,
        vendor_name: EDWIN.userName,
        items: [ITEM],
        duplicar_de: conVend.id,
      }),
      { params: { marca: MARCA } },
    );
    body = (await res.json()) as { id?: string; error?: string };
    if (res.status !== 200 || !body.id) throw new Error(`POST /orders respondió ${res.status}: ${body.error}`);
    creados.push(body.id);
    await revisar("lista · edwin duplica → queda el del ORIGINAL (el nombre del body no pisa)", body.id, VENDEDOR_ORIGINAL);

    // ── CASO 3 — original SIN vendedor: entra el de QUIEN DUPLICA (edwin), para
    //    que el clon nunca quede sin vendedor (422 SIN_VENDEDOR al enviarlo). ──
    const sinVend = await crearOriginal(false);
    await candadoLocal(sinVend.id);
    console.log(`ORIGINAL ${sinVend.numero} · SIN vendedor_switch_id\n`);

    res = await duplicarPost(req(EDWIN, "/api/catalogo/calvin/orders/x/duplicar"), {
      params: { marca: MARCA, id: sinVend.id },
    });
    body = (await res.json()) as { id?: string; error?: string };
    if (res.status !== 200 || !body.id) throw new Error(`/duplicar respondió ${res.status}: ${body.error}`);
    creados.push(body.id);
    await revisar("/duplicar · original SIN vendedor → entra el de quien duplica", body.id, EDWIN.vendedor);
    await marcarBorrado(body.id);

    // ── CASO 4 — la LISTA sobre un original sin vendedor, con un TERCER
    //    vendedor (rodrigo, 8): cierra el cuadro 2×2 y descarta la casualidad. ──
    res = await ordersPost(
      req(RODRIGO, "/api/catalogo/calvin/orders", {
        client_name: NOMBRE_PRUEBA,
        vendor_name: RODRIGO.userName,
        items: [ITEM],
        duplicar_de: sinVend.id,
      }),
      { params: { marca: MARCA } },
    );
    body = (await res.json()) as { id?: string; error?: string };
    if (res.status !== 200 || !body.id) throw new Error(`POST /orders respondió ${res.status}: ${body.error}`);
    creados.push(body.id);
    await revisar("lista · original SIN vendedor → entra el de quien duplica (rodrigo)", body.id, RODRIGO.vendedor);

    console.log(fallos === 0 ? "🟢 LOS 4 CASOS PASAN" : `🔴 ${fallos} caso(s) fallaron`);
  } finally {
    // ── Limpieza: se borra TODO lo creado, pase lo que pase ──
    for (const id of envios) {
      const { error } = await db.from(cfg.enviosTable).delete().eq("id", id);
      console.log(`\nlimpieza · candado local ${id}: ${error ? "🔴 " + error.message : "borrado"}`);
    }
    for (const id of creados) {
      const { error } = await marcarBorrado(id);
      console.log(`limpieza · pedido ${id}: ${error ? "🔴 " + error.message : "deleted=true"}`);
    }
    const { data: vivos } = await db
      .from(cfg.ordersTable)
      .select("id, order_number")
      .eq("client_name", NOMBRE_PRUEBA)
      .eq("deleted", false);
    console.log(`limpieza · pedidos de prueba VIVOS: ${vivos?.length ?? "?"} ${(vivos?.length ?? 0) === 0 ? "🟢" : "🔴"}`);
    const { data: enviosVivos } = await db.from(cfg.enviosTable).select("id").eq("numero_interno", ENVIO_FALSO);
    console.log(`limpieza · candados locales VIVOS: ${enviosVivos?.length ?? "?"} ${(enviosVivos?.length ?? 0) === 0 ? "🟢" : "🔴"}`);
  }
  if (fallos > 0) process.exitCode = 1;
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => {
    console.error("🔴", e);
    process.exit(1);
  },
);
