// Pedidos del catálogo (lista + creación), dirigido por MARCAS_CONFIG.
//
// 🔴 LA LISTA INCLUYE LOS PEDIDOS DEL LINK (14-ago-2026)
//
// Daniel, textual: *"si yo mando el link al público quiero que el que lo use
// pueda hacer su pedido, mandar al vendedor el pedido con nombre… así cuando
// alguien interno le llega el pedido por WhatsApp, pueda entrar al sistema
// interno"*. Hasta hoy ese pedido SOLO se veía en el panel de admin/secretaria
// (`/catalogos/admin/[marca]` → tab Pedidos, vía `pedidos-unificado`, que es
// admin+secretaria): el vendedor que comparte el link y recibe el WhatsApp
// **no lo encontraba en el sistema**. Medido el 14-ago-2026: 7 pedidos
// públicos vivos sin convertir (5 Reebok + 2 Joybees) invisibles para él.
//
// Ahora este GET devuelve las dos cosas, con `fuente` y `del_link` para que la
// pantalla sepa qué es cada fila:
//   · `fuente: "orders"`   → pedido interno. Puede venir del link (convertido):
//                            ahí `del_link` es true y `id` es su uuid.
//   · `fuente: "publicos"` → pedido del link TODAVÍA SIN CONVERTIR. `id` es el
//                            short_id y `order_number` es null (no tiene: se lo
//                            asigna la conversión).
//
// ⚠️ Un pedido del link SIN convertir es un BORRADOR (`en_switch: false`), y no
// puede ser otra cosa: la pestaña la decide tener envío activo en Switch
// (#558/#560, ver `switch-lock.ts`) y una fila pública no tiene envío.
//
// ⚠️ FAIL-OPEN: si la lectura de los públicos falla, la lista sale con los
// pedidos internos de siempre. Perder el catálogo de borradores del link es
// peor que no verlos, pero dejar sin lista a quien ya tenía una es peor todavía.
//
// QUIRKS heredados (unificar con OK de Daniel):
//   · QUIRK 1: la lista de Joybees filtra deleted=false; la de Reebok NO.
//   · QUIRK 2: Reebok aún acepta el rol legacy 'cliente' al crear.
// Reebok además resuelve category por producto (bulto 6/12) y maneja
// is_preorder; Joybees es bulto 12 fijo sin preventa.

import { NextRequest, NextResponse } from "next/server";
import { leerCategoriaYBulto } from "@/lib/catalogo/bulto-productos";
import { resumirDesdeItems } from "@/lib/catalogo/lineas-pedido";
import { getSession } from "@/lib/require-auth";
import { getMarcaConfig, type MarcaConfig } from "@/lib/catalogo/marcas";
import { esPedidoDelLink } from "@/lib/catalogo/cliente-elegido";
import { avisoPedidoDeVendedor } from "@/lib/catalogo/telegram-pedido";
import { enviarNegocio } from "@/lib/alertas/canal";
import {
  errorClienteNoExiste,
  guardarClienteSwitchEnPedido,
  parsearClienteSwitchId,
  resolverClienteSwitch,
  traeEleccionDeCliente,
} from "@/lib/catalogo/cliente-switch";
import { numerosSwitchPorPedido } from "@/lib/catalogo/switch-lock";
import {
  guardarVendedorSwitchEnPedido,
  leerVendedorDePedido,
  vendedorParaDuplicado,
  type VendedorDePedido,
} from "@/lib/catalogo/vendedor-switch";

const VIEW_ROLES = ["admin", "secretaria", "vendedor"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const session = getSession(req);
  if (!session || !VIEW_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const db = await cfg.db();
  // `origen_short_id` marca los pedidos que VINIERON del link. Solo Reebok lo
  // trae en su select base (`ordersSelectExtra`); en las demás se pide aparte y
  // se reintenta sin él si la columna no existiera — el mismo escalón tolerante
  // que usa el GET del detalle.
  const extraOrigen = cfg.ordersSelectExtra.includes("origen_short_id") ? "" : ", origen_short_id";
  const colsBase = `id, order_number, client_name, vendor_name, client_email, comment, total, created_at, updated_at, idempotency_key, status${cfg.ordersSelectExtra}`;
  let data: Record<string, unknown>[] | null = null;
  for (const extra of [extraOrigen, ""]) {
    let query = db
      .from(cfg.ordersTable)
      .select(`${colsBase}${extra}, ${cfg.itemsRelation}(id, product_id, quantity, unit_price)`);
    // QUIRK 1: solo Joybees filtra los soft-deleted en la query de la lista.
    if (cfg.listaFiltraDeleted) query = query.eq("deleted", false);
    const res = await query.order("created_at", { ascending: false });
    if (!res.error) {
      data = (res.data || []) as unknown as Record<string, unknown>[];
      break;
    }
    if (extra === "") return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  // Los pedidos del LINK sin convertir se leen ACÁ ARRIBA a propósito: sus
  // productos tienen que entrar en la MISMA resolución de categorías que los
  // internos. Resolverlos aparte dejaría a Reebok calculando sus totales con el
  // fallback apparel (bulto 6) y la lista del vendedor diría un número distinto
  // del que muestra el panel del admin para el mismo pedido.
  const filasPublicas = await leerFilasPublicasSinConvertir(cfg);

  // Reebok: una sola query batch para resolver category de todos los items.
  const allProductIds = [
    ...(data || []).flatMap((o) =>
      ((o as unknown as Record<string, unknown>)[cfg.itemsRelation] as { product_id: string }[] | null || []).map((i) => i.product_id),
    ),
    ...filasPublicas.flatMap((f) =>
      (Array.isArray(f.items) ? (f.items as { product_id?: string }[]) : []).map((i) => i.product_id).filter(Boolean) as string[],
    ),
  ];
  const categoryMap = cfg.categoryLookup ? await cfg.categoryLookup(allProductIds) : new Map<string, string>();
  // Las piezas por bulto son del ESTILO (Tommy): sin esto la lista mostraba el
  // total con el bulto por default, distinto del que abre el detalle.
  const { bultoPzasByProduct } = await leerCategoriaYBulto(db as never, cfg.productsTable, allProductIds);

  // ¿Cuáles están en Switch? Mismo criterio que el candado de edición
  // (envío 'enviado'/'verificado'), en UNA sola query. Decide la pestaña de
  // la lista y el número que se pinta en la fila — ver `switch-lock.ts`.
  const numerosSwitch = await numerosSwitchPorPedido(
    db as never,
    cfg.enviosTable,
    (data || []).map((o) => String((o as unknown as Record<string, unknown>).id)),
  );

  const orders = (data || []).map((o) => {
    const row = o as unknown as Record<string, unknown>;
    const items = (row[cfg.itemsRelation] || []) as { product_id: string; quantity: number; unit_price: number }[];
    const resumen = resumirDesdeItems(items, {
      bultoSize: cfg.bultoSize,
      categoryByProduct: categoryMap,
      bultoPzasByProduct,
      fallbackCategory: cfg.fallbackCategory,
    });
    const idPedido = String(row.id);
    return {
      ...row,
      item_count: items.length,
      total: resumen.total,
      // `en_switch` decide la PESTAÑA; `switch_numero` es lo que se PINTA.
      // Se separan a propósito: un envío activo sin número (hoy 0 casos)
      // sigue estando en Switch, y esconderlo en Borradores sería mentira.
      en_switch: numerosSwitch.has(idPedido),
      switch_numero: numerosSwitch.get(idPedido) ?? null,
      fuente: "orders" as const,
      // El MISMO `esPedidoDelLink` que usa el detalle para no pisarle el nombre
      // a quien lo escribió. Una segunda definición de "vino del link" se
      // separaría de aquélla.
      del_link: esPedidoDelLink({
        origen_original: (row.origen_original as string) ?? null,
        origen_short_id: (row.origen_short_id as string) ?? null,
      }),
      [cfg.itemsRelation]: undefined,
    };
  });

  const delLinkSinConvertir = filasPublicas.map((f) => filaPublicaComoPedido(cfg, f, categoryMap));

  // Una sola lista, la más nueva arriba (el orden que ya traía la query).
  const todos = [...orders, ...delLinkSinConvertir].sort(
    (a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime(),
  );
  return NextResponse.json(todos);
}

/**
 * Filas CRUDAS de los pedidos del LINK que todavía no se convirtieron — los que
 * hasta hoy solo veía el admin.
 *
 * ⚠️ FAIL-OPEN en todos los escalones: cualquier error devuelve `[]` y la lista
 * queda exactamente como estaba. Y `deleted`/`confirmado_cliente_at` se piden en
 * un escalón tolerante: son de migraciones posteriores a la tabla.
 */
async function leerFilasPublicasSinConvertir(cfg: MarcaConfig): Promise<Record<string, unknown>[]> {
  try {
    const publicosDb = await cfg.publicosDb();
    const COLS_FULL = "short_id, cliente_nombre, items, created_at, convertida, deleted, confirmado_cliente_at";
    const COLS_BASE = "short_id, cliente_nombre, items, created_at, convertida";
    for (const cols of [COLS_FULL, COLS_BASE]) {
      const res = await publicosDb
        .from(cfg.publicosTable)
        .select(cols)
        .order("created_at", { ascending: false });
      if (!res.error) {
        return ((res.data || []) as unknown as Record<string, unknown>[]).filter(
          (f) => !f.convertida && !f.deleted,
        );
      }
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Una fila pública con la MISMA forma que un pedido interno, para que la lista
 * no tenga que saber de dos formatos. `fuente: "publicos"` es lo que le dice a
 * la pantalla que primero hay que convertirlo.
 */
function filaPublicaComoPedido(
  cfg: MarcaConfig,
  f: Record<string, unknown>,
  categoryMap: Map<string, string>,
): Record<string, unknown> {
  const items = (Array.isArray(f.items) ? f.items : []) as {
    product_id?: string;
    quantity?: number;
    unit_price?: number;
    category?: string;
  }[];
  // Mismo recálculo que la lista unificada del admin: nunca el `total`
  // guardado, que en pedidos viejos quedó subvaluado.
  const total = cfg.calcTotal(
    items.map((i) => ({
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
      ...(cfg.categoryLookup
        ? { category: (i.product_id && categoryMap.get(i.product_id)) || i.category || cfg.fallbackCategory || undefined }
        : {}),
    })),
  );
  return {
    // El id de una fila pública es su short_id: la pantalla lo usa para
    // convertirla, no para abrir un detalle interno que todavía no existe.
    id: String(f.short_id),
    // No tiene número todavía — se lo asigna la conversión. Va null en vez de
    // inventar uno: un "PED-?" en la lista sería mentira.
    order_number: null,
    client_name: (f.cliente_nombre as string) || "Sin nombre",
    vendor_name: null,
    status: "borrador",
    total,
    item_count: items.length,
    created_at: String(f.created_at),
    en_switch: false,
    switch_numero: null,
    fuente: "publicos" as const,
    del_link: true,
    confirmado_cliente_at: (f.confirmado_cliente_at as string) ?? null,
  };
}

interface IncomingItem {
  product_id: string;
  sku?: string;
  name?: string;
  image_url?: string;
  quantity: number;
  unit_price: number;
  category?: string;
  is_preorder?: boolean;
}

/**
 * Resumen del pedido: referencias, bultos, piezas y total. Devuelve TODO y no
 * solo el total porque el aviso de Telegram necesita las mismas cifras, y
 * calcularlas dos veces es exactamente cómo se separan.
 *
 * La categoría se resuelve con `cfg.categoryLookup` (Reebok usa su propio
 * cliente de base); las piezas por bulto salen de la tabla de productos.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resumenDePedido(cfg: MarcaConfig, db: any, items: IncomingItem[]) {
  const ids = items.map((i) => i.product_id);
  const categoryMap = cfg.categoryLookup ? await cfg.categoryLookup(ids) : new Map<string, string>();
  const { bultoPzasByProduct } = await leerCategoriaYBulto(db as never, cfg.productsTable, ids);
  return resumirDesdeItems(items, {
    bultoSize: cfg.bultoSize,
    categoryByProduct: categoryMap,
    bultoPzasByProduct,
    fallbackCategory: cfg.fallbackCategory,
  });
}

export async function POST(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const session = getSession(req);
  // QUIRK 2: los roles de creación vienen de la config (Reebok incluye 'cliente').
  if (!session || !cfg.createRoles.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json();
  const { client_name, vendor_name, client_email, items, idempotency_key } = body;
  if (!client_name) return NextResponse.json({ error: "client_name required" }, { status: 400 });
  if (!items || !Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "El pedido debe tener al menos un producto" }, { status: 400 });

  const typedItems = items as IncomingItem[];
  // `<marca>_order_items.product_id` es NOT NULL sin default y las RPC lo
  // insertan SIN COALESCE, a diferencia de `quantity`/`unit_price`. Un item sin
  // product_id abortaba la transacción entera (pedido + items) con un 23502 que
  // la ruta contestaba como "Error interno". El carrito siempre lo manda; esto
  // es la red del lado del servidor.
  const sinProducto = typedItems.findIndex((i) => typeof i.product_id !== "string" || !i.product_id.trim());
  if (sinProducto !== -1) {
    return NextResponse.json(
      { error: `El producto ${sinProducto + 1} del pedido no se pudo identificar. Vuelve a agregarlo al carrito.` },
      { status: 400 },
    );
  }
  // Precio por unidad debe ser positivo: un negativo metería un total artificial.
  if (typedItems.some((i) => !(Number(i.unit_price) > 0))) {
    return NextResponse.json({ error: "El precio de cada producto debe ser mayor a cero" }, { status: 400 });
  }
  // ── Cliente de Switch elegido al armar el pedido (12-ago-2026) ──
  // Se valida ANTES de crear: un id de otra empresa no puede quedar guardado.
  // Ausente = el POST histórico (no se toca la columna); `null` = Contado.
  const eligioCliente = traeEleccionDeCliente(body);
  let clienteSwitchId: number | null = null;
  if (eligioCliente) {
    const parsed = parsearClienteSwitchId(body.cliente_switch_id);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    clienteSwitchId = parsed.id;
    if (clienteSwitchId != null && !(await resolverClienteSwitch(cfg, clienteSwitchId))) {
      return NextResponse.json({ error: errorClienteNoExiste(cfg) }, { status: 404 });
    }
  }

  const dbPedido = await cfg.db();

  // ── DUPLICAR: el pedido nuevo hereda el VENDEDOR del original (13-ago-2026) ──
  // Daniel, textual: *"al duplicar el pedido el vendedor debe de ser el mismo
  // que el otro por default, si lo quiere cambiar que lo cambie despues"*. Este
  // endpoint es el que usa el botón "Duplicar" de la lista de pedidos.
  //
  // 🔴 EL ID DEL VENDEDOR NO VIAJA EN EL BODY, y no es un detalle: de ese id
  // depende la COMISIÓN. Lo que llega es el pedido del que se duplica y el
  // vendedor se LEE de esa fila, en la base de ESTA marca — un id mandado desde
  // el navegador le acreditaría la venta a cualquiera. La regla (y el caso del
  // original sin vendedor) vive en `vendedorParaDuplicado`, la misma que usa
  // "Duplicar y corregir".
  const duplicarDe = typeof body.duplicar_de === "string" ? body.duplicar_de.trim() : "";
  let vendedorPedido: VendedorDePedido = {
    vendedor_switch_id: null,
    vendor_name: vendor_name || session.userName || null,
  };
  if (duplicarDe) {
    const original = await leerVendedorDePedido(dbPedido, cfg.ordersTable, duplicarDe);
    if (original) {
      vendedorPedido = await vendedorParaDuplicado(
        original,
        session.userId,
        cfg.empresaKey,
        session.userName,
      );
    }
  }

  const resumenPed = await resumenDePedido(cfg, dbPedido as never, typedItems);
  const total = resumenPed.total;

  // Creación atómica e idempotente vía RPC: numera <prefijo>-### sin race
  // (advisory lock) e inserta pedido + items en una transacción. Si llega un
  // retry con el mismo idempotency_key, devuelve el pedido ya creado en vez de
  // duplicarlo.
  const db = dbPedido;
  const { data: result, error } = await db.rpc(cfg.createOrderRpc, {
    p_client_name: client_name,
    p_vendor_name: vendedorPedido.vendor_name,
    p_client_email: client_email || null,
    p_total: total,
    p_idempotency_key: idempotency_key || null,
    p_items: typedItems.map((i) => ({
      product_id: i.product_id,
      sku: i.sku || null,
      name: i.name || null,
      image_url: i.image_url || null,
      quantity: i.quantity || 1,
      unit_price: Number(i.unit_price) || 0,
      ...(cfg.itemsHasPreorder ? { is_preorder: i.is_preorder === true } : {}),
    })),
  });
  if (error || !result) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const { order_id, order_number, already_created } = result as {
    order_id: string; order_number: string; already_created: boolean;
  };

  // Cliente Switch elegido → se guarda en el pedido recién creado. Tolerante a
  // la DDL 20260705120000 pendiente (sin la columna el pedido queda igual, y el
  // envío a Switch cae a Contado como siempre). NO se toca en un retry
  // idempotente: el pedido ya existe con el cliente que se eligió la 1ª vez.
  if (eligioCliente && !already_created) {
    try {
      await guardarClienteSwitchEnPedido(db, cfg.ordersTable, order_id, clienteSwitchId);
    } catch {
      return NextResponse.json(
        { error: `El pedido se creó como ${order_number} pero no se pudo guardar el cliente. Elígelo de nuevo en el pedido.`, id: order_id, order_number },
        { status: 500 },
      );
    }
  }

  // Vendedor heredado del pedido que se duplicó → se guarda en el recién
  // creado. Tolerante a la DDL 20260705120000 pendiente.
  //
  // 🩸 UN FALLO ACÁ NO PUEDE TUMBAR EL DUPLICADO: el pedido YA existe, y
  // devolver un error haría que la pantalla no navegue y que la persona vuelva
  // a tocar "Duplicar" — o sea un SEGUNDO pedido. El vendedor se ve en el
  // detalle (bloque propio, #513) y se cambia de un toque, así que quedar sin
  // él es visible y corregible; un pedido duplicado no.
  if (vendedorPedido.vendedor_switch_id != null && !already_created) {
    try {
      await guardarVendedorSwitchEnPedido(
        db,
        cfg.ordersTable,
        order_id,
        vendedorPedido.vendedor_switch_id,
        vendedorPedido.vendor_name,
      );
    } catch {
      /* el pedido queda sin vendedor asignado; se elige en el detalle */
    }
  }

  // Telegram solo en creación real (un retry idempotente NO reenvía la alerta).
  // Este endpoint es SIEMPRE el camino del vendedor: la RPC de creación deja
  // origen_original en su default 'mio' (el 'link' solo lo escribe la RPC de
  // conversión del pedido público). Por eso el origen no se lee de la fila.
  if (!already_created) {
    await enviarNegocio(
      avisoPedidoDeVendedor({
        emoji: cfg.telegramEmoji,
        label: cfg.label,
        cliente: client_name,
        total,
        numero: order_number,
        piezas: resumenPed.piezas,
      }),
    );
  }

  // Respuesta compatible con el front (espera order.id para navegar al detalle).
  const { data: order } = await db.from(cfg.ordersTable).select("id, order_number").eq("id", order_id).single();
  return NextResponse.json(order ?? { id: order_id, order_number });
}
