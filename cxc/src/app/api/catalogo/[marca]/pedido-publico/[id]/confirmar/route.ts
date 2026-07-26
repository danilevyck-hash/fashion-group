import { NextRequest, NextResponse } from "next/server";
import { getMarcaConfig, type MarcaConfig } from "@/lib/catalogo/marcas";
import {
  checkConfirmRateLimit,
  confirmarPedidoPublico,
  soloCortas,
  type ConfirmarDeps,
  type PedidoPublicoRow,
  type StockLineaCorta,
} from "@/lib/catalogo/confirmar-pedido";
import { formatBultosPiezas } from "@/lib/catalogo/piezas";
import { disponibleVendible } from "@/lib/catalogos/disponible";
import { sendTelegramAlert, shortError } from "@/lib/telegram";
import { enviarPedidoSwitch, type EnvioItem } from "@/lib/catalogo/switch-envio";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { resolvePublicoSwitchActor } from "@/lib/catalogo/publico-switch-actor";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// El envío al ERP encadena varias llamadas a Switch (artículo + talla/color por
// línea + terminar + verificación): igual que el checkout del vendedor, no cabe
// en el default de 10s.
export const maxDuration = 300;

// Endpoint PÚBLICO (sin sesión): el cliente confirma su pedido desde el link
// /pedido-<marca>/[short_id]. La confirmación AUTO-CONVIERTE a <prefijo>-###
// vía la RPC atómica existente (cfg.convertRpc) — el pedido entra directo al
// pipeline del admin. Idempotente.
//
// SIN modal de stock (25-jul-2026): ya no hay 409 'stock_corto' ni
// aceptar_stock. En su lugar se guarda la FOTO del stock del momento
// (stock_confirmacion) para mostrarle al cliente y a la secretaria la cantidad
// REAL disponible. Lógica testeable en src/lib/catalogo/confirmar-pedido.ts.
//
// Stock por marca: Reebok suma `inventory` (piezas por talla) en su proyecto;
// Joybees y Tommy leen la columna stock de su tabla de catálogo.
//
// ENVÍO A SWITCH (25-jul-2026): hasta ahora este endpoint convertía el pedido y
// ahí moría — el pedido quedaba en 'borrador' y NUNCA llegaba al ERP (TOM-001,
// tommy_switch_envios con 0 filas). Ahora, igual que el checkout del vendedor:
// se marca el pedido 'confirmado' con el cliente/vendedor de Switch resueltos
// (publico-switch-actor: contado + vendedor DEFAULT de la empresa, sin sesión
// que los aporte) y se dispara enviarPedidoSwitch. Si Switch falla, el pedido
// YA está guardado y confirmado: el cliente ve su número igual y el envío se
// recupera con el "Reintentar" del admin (Telegram avisa).

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Total para la RPC: misma maquinaria que el convertir del admin (Reebok:
 *  categoría real vía products con fallback apparel; Joybees: bulto 12). */
async function totalParaConvertir(cfg: MarcaConfig, items: PedidoPublicoRow["items"]): Promise<number> {
  if (cfg.categoryLookup) {
    const categoryMap = await cfg.categoryLookup(items.map((i) => i.product_id));
    return cfg.calcTotal(
      items.map((i) => ({
        quantity: Number(i.quantity) || 0,
        unit_price: Number((i as { unit_price?: number }).unit_price) || 0,
        category:
          (i.product_id && categoryMap.get(i.product_id)) || i.category || cfg.fallbackCategory || undefined,
      })),
    );
  }
  return cfg.calcTotal(
    items.map((i) => ({
      quantity: Number(i.quantity) || 0,
      unit_price: Number((i as { unit_price?: number }).unit_price) || 0,
    })),
  );
}

/**
 * Convierte el pedido recién numerado en un pedido de Switch:
 *   1. resuelve cliente/vendedor (no hay sesión que los aporte),
 *   2. los guarda en el pedido + status 'confirmado' — así el "Reintentar" del
 *      admin funciona sin pedirle nada a la secretaria,
 *   3. dispara el motor compartido enviarPedidoSwitch.
 * Cualquier problema se avisa por Telegram y se deja recuperable. NO lanza.
 */
async function enviarPedidoDelLinkASwitch(
  cfg: MarcaConfig,
  numero: string,
  pedido: PedidoPublicoRow,
): Promise<void> {
  const db = await cfg.db();
  const mainDb = await cfg.mainDb();

  // El pedido que acaba de crear la RPC (por número: la RPC devuelve order_id
  // pero el core solo propaga el número, que es único).
  const { data: order, error: orderErr } = await db
    .from(cfg.ordersTable)
    .select("id, order_number")
    .eq("order_number", numero)
    .maybeSingle();
  if (orderErr || !order?.id) {
    await sendTelegramAlert(
      `🚨 ${cfg.label} ${numero}: no se pudo ubicar el pedido para mandarlo a Switch (${shortError(orderErr?.message || "sin fila")}). Enviarlo a mano desde el admin.`,
    );
    return;
  }
  const orderId = String(order.id);

  const resuelto = await resolvePublicoSwitchActor(mainDb, cfg.empresaKey);
  if (!resuelto.ok) {
    await sendTelegramAlert(
      `⚠️ ${cfg.label} ${numero} (pedido del link) NO salió a Switch: ${resuelto.motivo}. El pedido está guardado — usar "Reintentar" en el admin cuando esté el dato.`,
    );
    return;
  }
  const { clienteId, clienteNombre, vendedorId, vendedorNombre } = resuelto.actor;

  // Confirmado + cliente/vendedor guardados (mismo patrón que el checkout, con
  // la misma tolerancia a la DDL 20260705120000).
  const { error: updErr } = await db
    .from(cfg.ordersTable)
    .update({ status: "confirmado", cliente_switch_id: clienteId, vendedor_switch_id: vendedorId })
    .eq("id", orderId);
  if (updErr) {
    console.error(`[${cfg.marca}/confirmar] update cliente/vendedor falló (${updErr.message}) — reintento solo status`);
    await db.from(cfg.ordersTable).update({ status: "confirmado" }).eq("id", orderId);
  }

  // Items del pedido interno (los de la fila pública ya están saneados, pero
  // los del pedido son la fuente de verdad de lo que se envía).
  const itemCols = `product_id, sku, name, quantity, unit_price${cfg.itemsHasPreorder ? ", is_preorder" : ""}`;
  const { data: itemRows } = await db
    .from(cfg.itemsRelation)
    .select(itemCols)
    .eq("order_id", orderId);
  const items = (itemRows || []) as unknown as EnvioItem[];
  if (!items.length) {
    await sendTelegramAlert(`🚨 ${cfg.label} ${numero}: sin productos al mandarlo a Switch. Revisar en el admin.`);
    return;
  }

  const { data: prods } = await db
    .from(cfg.productsTable)
    .select("id, category")
    .in("id", items.map((i) => i.product_id));
  const categoryByProduct = new Map((prods || []).map((p) => [String(p.id), p.category as string]));

  const result = await enviarPedidoSwitch({
    empresaKey: cfg.empresaKey,
    enviosTable: cfg.enviosTable,
    db,
    orderId,
    orderNumber: numero,
    marcaLabel: cfg.label,
    items,
    bultoSize: cfg.bultoSize,
    categoryByProduct,
    clienteId,
    clienteNombre,
    vendedorId,
    vendedorNombre,
  });

  // 'ok' y 'ya_enviado' ya alertan (o no hace falta). El resto sí: el pedido
  // quedó guardado pero sin salir, y alguien tiene que reintentarlo.
  const pendiente: Record<string, string> = {
    preorders: "tiene productos en preventa",
    prevalidacion: "no pasa la pre-validación de Switch (SKU sin código de barra o precio 0)",
    switch_caido: "Switch no respondió a la consulta previa",
    carrera: "ya había un envío en curso",
  };
  if (result.kind in pendiente) {
    await sendTelegramAlert(
      `⚠️ ${cfg.label} ${numero} (pedido del link de ${pedido.cliente_nombre || "sin nombre"}) NO salió a Switch: ${pendiente[result.kind]}. Usar "Reintentar" en el admin.`,
    );
  }
}

async function handleConfirmar(
  req: NextRequest,
  { params }: { params: { marca: string; id: string } },
) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  try {
    const shortId = params.id;
    if (!shortId) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    const publicosDb = await cfg.publicosDb();
    const db = await cfg.db();

    // Rate-limit anti-spam por IP (fail-open, mismo patrón que la creación).
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkConfirmRateLimit(publicosDb, cfg.publicosTable, ip);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos seguidos. Espera unos minutos e intenta de nuevo." },
        { status: 429 },
      );
    }

    const deps: ConfirmarDeps = {
      async getPedido(sid) {
        const { data, error } = await publicosDb
          .from(cfg.publicosTable)
          .select("short_id, items, cliente_nombre, convertida, ped_order_number, deleted")
          .eq("short_id", sid)
          .maybeSingle();
        if (error) {
          console.error(`[${cfg.marca}/confirmar] fetch error:`, error);
          return null;
        }
        if (!data) return null;
        return {
          short_id: data.short_id,
          items: Array.isArray(data.items) ? data.items : [],
          cliente_nombre: data.cliente_nombre ?? null,
          convertida: !!data.convertida,
          ped_order_number: data.ped_order_number ?? null,
          deleted: !!data.deleted,
        } satisfies PedidoPublicoRow;
      },

      // Stock por marca (ver cabecera). FAIL-OPEN: si la lectura falla, se
      // confirma sin aviso (es cortesía).
      //
      // Lo que se le muestra al cliente dice "Disponible ahora", así que tiene
      // que ser DISPONIBILIDAD (vendible = saldo − apartado), igual que el
      // catálogo. Antes salía existencia en las 3 marcas: en Reebok la suma de
      // `inventory.quantity` (que el sync escribe como quantity: existencia) y
      // en Joybees/Tommy la columna `stock`, que es el espejo de existencia.
      // Fallback a existencia si el sync todavía no escribió disponibilidad.
      async getDisponibles(ids) {
        try {
          if (cfg.marca === "reebok") {
            const [prodRes, invRes] = await Promise.all([
              db.from(cfg.productsTable).select("id, existencia, disponibilidad").in("id", ids),
              db.from("inventory").select("product_id, quantity").in("product_id", ids),
            ]);
            if (prodRes.error && invRes.error) {
              console.warn(
                `[${cfg.marca}/confirmar] stock no disponible (fail-open):`,
                prodRes.error.message,
              );
              return null;
            }
            // La existencia por talla vive en `inventory`; solo sirve de
            // fallback cuando la fila del producto no trae disponibilidad.
            const porInventory = new Map<string, number>();
            for (const row of invRes.data || []) {
              const pid = row.product_id as string;
              porInventory.set(pid, (porInventory.get(pid) || 0) + (Number(row.quantity) || 0));
            }
            const map = new Map<string, number>(porInventory);
            for (const p of prodRes.data || []) {
              const pid = p.id as string;
              map.set(pid, disponibleVendible(p, porInventory.get(pid)));
            }
            return map;
          }
          const { data, error } = await db
            .from(cfg.productsTable)
            .select("id, stock, existencia, disponibilidad")
            .in("id", ids);
          if (error) {
            console.warn(`[${cfg.marca}/confirmar] stock no disponible (fail-open):`, error.message);
            return null;
          }
          return new Map<string, number>(
            (data || []).map((p) => [p.id as string, disponibleVendible(p)]),
          );
        } catch {
          return null;
        }
      },

      // Reebok: bulto por categoría con default footwear (patrón original del
      // aviso de stock). Joybees: bulto 12 fijo.
      getBulto: (category) =>
        cfg.marca === "reebok" ? cfg.bultoSize(category || "footwear") : cfg.bultoSize(),

      // TOLERANTE a migraciones pendientes: primero se intenta con la foto de
      // stock (columna stock_confirmacion, DDL 20260725130000) y, si esa
      // columna no existe, se reintenta solo con confirmado_cliente_at (DDL
      // 20260724120000). Si tampoco existe, solo se loguea — la conversión
      // (que es la confirmación real) sigue igual.
      async marcarConfirmado(sid, stock) {
        const base: Record<string, unknown> = { confirmado_cliente_at: new Date().toISOString() };
        if (rate.ipHash) base.confirmado_ip_hash = rate.ipHash;
        const intentos: Record<string, unknown>[] = [{ ...base, stock_confirmacion: stock }, base];
        for (const patch of intentos) {
          const { error } = await publicosDb
            .from(cfg.publicosTable)
            .update(patch)
            .eq("short_id", sid);
          if (!error) return;
          console.warn(
            `[${cfg.marca}/confirmar] update de confirmación falló (¿migración pendiente?):`,
            error.message,
          );
        }
      },

      // El pedido del link entra al ERP igual que el del vendedor. Nunca lanza
      // hacia arriba: el core ya lo envuelve, y aquí además se traduce cada
      // resultado a una alerta accionable.
      async enviarSwitch(numero, pedido) {
        await enviarPedidoDelLinkASwitch(cfg, numero, pedido);
      },

      // Misma maquinaria que el convertir del admin: total con helpers JS +
      // RPC atómica idempotente.
      async convertir(pedido) {
        const total = await totalParaConvertir(cfg, pedido.items);

        const { data, error } = await publicosDb.rpc(cfg.convertRpc, {
          p_short_id: pedido.short_id,
          p_total: total,
          p_items: pedido.items,
        });
        if (error) throw error;
        const numero = (data as { order_number?: string })?.order_number;
        if (!numero) throw new Error("RPC sin order_number");
        const ya = !!(data as { already_converted?: boolean })?.already_converted;
        if (!ya) {
          await sendTelegramAlert(
            `✅ Pedido ${cfg.label} CONFIRMADO por el cliente — ${pedido.cliente_nombre || "Sin nombre"} — ${numero} — ${money(total)}`,
          );
        }
        return { numero, yaConvertida: ya };
      },
    };

    const result = await confirmarPedidoPublico(deps, shortId);

    if (result.status === 404) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    if (result.status === 500) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Aviso a Telegram cuando el pedido entra con menos piezas de las pedidas:
    // ya no hay modal que frene al cliente, así que el aviso va al equipo.
    const cortas: StockLineaCorta[] = soloCortas(result.stock);
    if (!result.ya_confirmado && cortas.length > 0) {
      const detalle = cortas
        .slice(0, 5)
        .map(
          (l) =>
            `${l.sku || l.name}: pidió ${formatBultosPiezas(l.pedido_pzas, l.bulto_pzas || 12)}, hay ${formatBultosPiezas(l.disponible_pzas, l.bulto_pzas || 12)}`,
        )
        .join(" · ");
      await sendTelegramAlert(
        `⚠️ ${cfg.label} ${result.numero}: ${cortas.length} producto(s) con menos piezas de las pedidas — ${detalle}`,
      );
    }

    return NextResponse.json({
      numero: result.numero,
      estado: "confirmado",
      ya_confirmado: result.ya_confirmado,
      stock: result.stock,
    });
  } catch (err) {
    console.error(`[${params.marca}/confirmar] error:`, err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// Higiene de SESIÓN ÚNICA de Switch (un 2do login mata el token del 1ro y
// tumba los crons de la empresa): al terminar —éxito o fallo— se cierra la
// sesión que este proceso pudo abrir, igual que el checkout del vendedor.
export async function POST(
  req: NextRequest,
  ctx: { params: { marca: string; id: string } },
): Promise<NextResponse> {
  try {
    return await handleConfirmar(req, ctx);
  } finally {
    await logoutAllSwitchSessions();
  }
}
