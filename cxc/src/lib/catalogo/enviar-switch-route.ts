// Handler COMPARTIDO de los endpoints enviar-switch de las 3 marcas (los route
// files son wrappers de una línea). Resuelve pedido + cliente/vendedor y delega
// el envío al motor enviarPedidoSwitch. El caller cierra la sesión de Switch en
// su finally.
//
// EL CLIENTE SIEMPRE SALE DEL PEDIDO. Sin él, 422 y no se llama a Switch — para
// cualquier origen, interno o del link (ver `cliente-elegido.ts`).
//
// Orden de resolución del VENDEDOR (el primero que aplique):
//   1. el guardado en el pedido (checkout del vendedor, o el que se eligió en
//      el detalle),
//   2. el default del piloto — SOLO Reebok legacy (Reinaldo 2),
//   3. el vendedor DEFAULT de la empresa (publico-switch-actor). Sin esto, un
//      pedido de Joybees/Tommy/Calvin sin vendedor quedaba 422 y NO se podía
//      mandar desde el admin.

import { NextRequest, NextResponse } from "next/server";
import { leerCategoriaYBulto } from "./bulto-productos";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { enviarPedidoSwitch, type EnvioItem, type EnvioResult } from "@/lib/catalogo/switch-envio";
import { resolvePublicoSwitchActor } from "@/lib/catalogo/publico-switch-actor";
import { tieneClienteElegido } from "@/lib/catalogo/cliente-elegido";
import { normalizarDocumento } from "@/lib/catalogo/documento-switch";

// El vendedor también puede consultar/reintentar el envío: crear+enviar desde
// el checkout ya es suyo — el Reintentar es la misma operación tras un fallo.
const SEND_ROLES = ["admin", "secretaria", "vendedor"];

interface OrderRow {
  id: string;
  order_number: string;
  client_name: string | null;
  status: string;
  cliente_switch_id?: number | null;
  vendedor_switch_id?: number | null;
  /** Origen del pedido — de esto depende si el mostrador es regla u olvido. */
  origen_original?: string | null;
  origen_short_id?: string | null;
  items: EnvioItem[];
}

async function fetchOrder(marca: string, orderId: string): Promise<OrderRow | null> {
  const cfg = MARCAS_CONFIG[marca];
  const db = await cfg.db();
  const itemCols = `product_id, sku, name, quantity, unit_price${marca === "reebok" ? ", is_preorder" : ""}`;
  // Historia (jul-2026): `cliente_switch_id`/`vendedor_switch_id` podían no
  // existir (DDL 20260705120000 pendiente) y se releía SIN esas columnas, en
  // "modo legacy", ante cualquier error que mencionara una columna. Tolerancia
  // retirada el 3-sep-2026: las tres columnas existen en las 4 marcas
  // (20260705120000_orders_cliente_vendedor_switch.sql; verificado en
  // producción). Hoy un error de lectura es un error: releer sin las columnas
  // mandaría el pedido a Switch SIN su cliente ni su vendedor y nadie se
  // enteraría — justo lo que "el cliente se elige, nunca viene puesto" prohíbe.
  const cols = `id, order_number, client_name, status, cliente_switch_id, vendedor_switch_id, origen_short_id, ${cfg.itemsRelation}(${itemCols})`;
  const { data, error } = await db.from(cfg.ordersTable).select(cols).eq("id", orderId).single();
  if (error || !data) {
    // PGRST116 = cero filas para `.single()`: ese sí es "no existe el pedido".
    // Cualquier otro error se LANZA: un permiso o un timeout no es un 404.
    if (error && error.code !== "PGRST116") {
      throw new Error(`pedido ${orderId}: ${error.message}`);
    }
    return null;
  }
  const row = data as unknown as Record<string, unknown>;
  return {
    id: String(row.id),
    order_number: String(row.order_number),
    client_name: (row.client_name as string) ?? null,
    status: String(row.status),
    cliente_switch_id: (row.cliente_switch_id as number) ?? null,
    vendedor_switch_id: (row.vendedor_switch_id as number) ?? null,
    origen_original: (row.origen_original as string) ?? null,
    origen_short_id: (row.origen_short_id as string) ?? null,
    items: (row[cfg.itemsRelation] as EnvioItem[]) ?? [],
  };
}

export async function handleGetEnvio(req: NextRequest, marca: string, orderId: string): Promise<NextResponse> {
  const auth = requireRole(req, SEND_ROLES);
  if (auth instanceof NextResponse) return auth;
  const cfg = MARCAS_CONFIG[marca];
  const db = await cfg.db();
  // Historia (ago-2026): `documento` (pedido | cotización) podía no existir
  // (DDL 20260824120000 pendiente) y se releía sin la columna; y si la tabla de
  // envíos entera faltaba (Joybees estrenó la suya en 20260705110000) se
  // respondía `{ envio: null, ddlPendiente: true }`. Tolerancia retirada el
  // 3-sep-2026: las 4 tablas de envíos existen y todas tienen `documento`
  // (20260824160000_switch_envios_documento.sql; verificado en producción).
  // Hoy cualquier error de esta lectura es un 500: responder "sin envío" ante un
  // permiso o un timeout le diría a la pantalla que el pedido nunca se mandó.
  const { data, error } = await db
    .from(cfg.enviosTable)
    .select("estado, pedido_switch_id, numero_interno, error_detalle, created_at, updated_at, documento")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`[enviar-switch ${marca}] envío de ${orderId}:`, error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  return NextResponse.json({ envio: data ?? null });
}

export async function handlePostEnvio(req: NextRequest, marca: string, orderId: string): Promise<NextResponse> {
  const auth = requireRole(req, SEND_ROLES);
  if (auth instanceof NextResponse) return auth;
  const cfg = MARCAS_CONFIG[marca];
  const db = await cfg.db();

  // dry:true  = solo pre-validar (preview, cero escrituras)
  // auto:true = pre-validar y crear EN EL MISMO VIAJE si no hay nada que
  //             decidir (toque único). Body vacío = crear directo.
  //
  // `documento` = qué se crea en Switch: 'pedido' (lo de siempre) o
  // 'cotizacion'. Lo elige la persona en la pantalla, un toque antes de mandar.
  // Cualquier valor raro —o su ausencia— cae a 'pedido': el modo de fallo
  // aceptable es crear el documento de siempre, nunca una cotización que nadie
  // pidió (ver `documento-switch.ts`).
  let dry = false;
  let auto = false;
  let documento = normalizarDocumento(undefined);
  try {
    const body = await req.json();
    dry = body?.dry === true;
    auto = body?.auto === true;
    documento = normalizarDocumento(body?.documento);
  } catch { /* body vacío = envío real */ }

  let order: OrderRow | null;
  try {
    order = await fetchOrder(marca, orderId);
  } catch (e) {
    console.error(`[enviar-switch ${marca}]`, e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  if (order.status !== "confirmado") {
    return NextResponse.json({ error: "Solo se pueden enviar a Switch pedidos confirmados" }, { status: 400 });
  }
  if (!order.items.length) {
    return NextResponse.json({ error: "El pedido no tiene productos" }, { status: 400 });
  }

  // ── 🔴 EL CANDADO: sin cliente elegido a propósito, no sale ──
  //
  // Es la capa que NO se puede saltear. La pantalla apaga el botón, pero un
  // botón apagado solo protege a quien mira la pantalla: este endpoint se puede
  // llamar igual. Y justo debajo hay tres redes que INVENTAN un cliente cuando
  // falta (el fallback del piloto Reebok y `resolvePublicoSwitchActor`), que es
  // exactamente cómo 15 pedidos por $53.124 se fueron a Switch a nombre de
  // Contado sin que nadie lo decidiera.
  //
  // ⚠️ Esas redes NO se quitan, pero desde el 14-ago-2026 (2ª vuelta) TAMPOCO
  // alcanzan al pedido del LINK: Daniel pidió que ése también espere a que una
  // persona le ponga el cliente. Lo que sobrevive de ellas es el VENDEDOR —
  // `resolvePublicoSwitchActor` sigue resolviendo el vendedor DEFAULT de la
  // empresa cuando el pedido no trae uno, y `fg_catalogo_publico_switch` sigue
  // siendo la manija por empresa.
  //
  // `tieneClienteElegido` es la MISMA función que apaga el botón — una segunda
  // definición del mismo `if` se separaría de la pantalla y volveríamos a tener
  // un botón verde con un servidor que rechaza (o peor, al revés).
  if (!tieneClienteElegido(order)) {
    return NextResponse.json(
      { error: "Este pedido no tiene cliente. Elige el cliente antes de mandarlo a Switch." },
      { status: 422 },
    );
  }

  // Cliente: SIEMPRE el del pedido — el candado de arriba ya garantizó que hay
  // uno, así que las redes de abajo nunca lo inventan. Vendedor: el del pedido,
  // el default del piloto (Reebok legacy) o el DEFAULT de la empresa.
  let clienteId = order.cliente_switch_id ?? cfg.fallback?.clienteId ?? null;
  let vendedorId = order.vendedor_switch_id ?? cfg.fallback?.vendedorId ?? null;
  if (clienteId == null || vendedorId == null) {
    const resuelto = await resolvePublicoSwitchActor(supabaseServer, cfg.empresaKey);
    if (!resuelto.ok) {
      return NextResponse.json(
        { error: `El pedido no tiene cliente/vendedor de Switch asignados — ${resuelto.motivo}` },
        { status: 422 },
      );
    }
    clienteId = clienteId ?? resuelto.actor.clienteId;
    vendedorId = vendedorId ?? resuelto.actor.vendedorId;
  }
  // Nombres para preview/Telegram (best-effort).
  let clienteNombre: string | null = order.cliente_switch_id == null ? cfg.fallback?.clienteNombre ?? null : null;
  if (clienteNombre == null) {
    const { data: cli } = await supabaseServer
      .from("switch_clientes")
      .select("nombre")
      .eq("empresa_key", cfg.empresaKey)
      .eq("cliente_switch_id", clienteId)
      .maybeSingle();
    clienteNombre = cli?.nombre ?? null;
  }
  let vendedorNombre: string | null = order.vendedor_switch_id == null ? cfg.fallback?.vendedorNombre ?? null : null;
  if (vendedorNombre == null) {
    const { data: v } = await supabaseServer
      .from("fg_user_switch_vendedor")
      .select("vendedor_nombre")
      .eq("empresa_key", cfg.empresaKey)
      .eq("vendedor_id", vendedorId)
      .limit(1)
      .maybeSingle();
    vendedorNombre = v?.vendedor_nombre ?? null;
  }

  // Categoría + piezas por bulto (Switch trabaja en PIEZAS, el pedido en bultos).
  const { categoryByProduct, bultoPzasByProduct } = await leerCategoriaYBulto(
    db as never,
    cfg.productsTable,
    order.items.map((i) => i.product_id),
  );

  const result = await enviarPedidoSwitch({
    empresaKey: cfg.empresaKey,
    enviosTable: cfg.enviosTable,
    db,
    orderId: order.id,
    orderNumber: order.order_number,
    marcaLabel: cfg.label,
    items: order.items,
    bultoSize: cfg.bultoSize,
    categoryByProduct,
    bultoPzasByProduct,
    clienteId,
    clienteNombre,
    vendedorId,
    vendedorNombre,
    dry,
    auto,
    // 🔴 Va DESPUÉS del candado del cliente, no antes: la cotización pasa por
    // el MISMO 422 que el pedido. Si se saltara el candado por este costado, el
    // agujero de los 15 pedidos a nombre de "Contado" volvería a estar abierto,
    // solo que con otro nombre.
    documento,
  });

  return envioResultToResponse(result);
}

export function envioResultToResponse(r: EnvioResult): NextResponse {
  switch (r.kind) {
    case "preorders":
      return NextResponse.json(
        { error: `El pedido tiene ${r.count} producto(s) en preventa — no se pueden enviar a Switch (sin inventario todavía)` },
        { status: 400 },
      );
    case "ya_enviado":
      return NextResponse.json({ error: `Este pedido ya fue enviado a Switch (${r.detalle})` }, { status: 409 });
    case "carrera":
      return NextResponse.json({ error: "Este pedido ya tiene un envío en curso" }, { status: 409 });
    case "switch_caido":
      return NextResponse.json({ error: r.error }, { status: 502 });
    case "prevalidacion":
      // `avisos` (con código) y `lineas` viajan para que la pantalla de
      // problema pueda mostrar los errores arriba y el pedido resuelto abajo.
      return NextResponse.json(
        { error: "El pedido no pasa la pre-validación", errores: r.errores, warnings: r.warnings, avisos: r.avisos, lineas: r.lineas },
        { status: 422 },
      );
    case "preview":
      return NextResponse.json({ preview: r.preview });
    case "rechazado":
      return NextResponse.json({ error: r.error, warnings: r.warnings }, { status: 502 });
    case "ambiguo":
      return NextResponse.json({ error: r.error, ambiguo: true }, { status: 502 });
    case "ok":
      // `documento` vuelve para que la pantalla diga QUÉ se creó sin tener que
      // recordar qué mandó (y sin depender de que el DDL ya esté corrido).
      return NextResponse.json({ ok: true, numeroInterno: r.numeroInterno, pedidoSwitchId: r.pedidoSwitchId, verificado: r.verificado, warnings: r.warnings, documento: r.documento });
  }
}
