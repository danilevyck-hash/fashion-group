import { NextRequest, NextResponse } from "next/server";
import { resumirDesdeItems } from "@/lib/catalogo/lineas-pedido";
import { leerCategoriaYBulto } from "@/lib/catalogo/bulto-productos";
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
import { shortError } from "@/lib/telegram";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { avisoPedidoDelLink } from "@/lib/catalogo/telegram-pedido";
import { enviarNegocio, enviarSistema } from "@/lib/alertas/canal";

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
// 🔴 EL PEDIDO DEL LINK YA NO SALE SOLO A SWITCH (14-ago-2026)
//
// Entre el 25-jul y el 14-ago este endpoint, además de convertir, marcaba el
// pedido 'confirmado' con el cliente de MOSTRADOR + el vendedor DEFAULT de la
// empresa (publico-switch-actor) y disparaba `enviarPedidoSwitch` en el acto.
//
// Daniel lo pidió al revés, textual: *"cuando alguien interno le llega el
// pedido por WhatsApp, pueda entrar al sistema interno, escoger, editar precio,
// agregar o quitar y **ponerle el nombre del cliente para así mandarlo a
// Switch**"*. Y no es solo preferencia: un pedido que ya está en Switch queda
// BLOQUEADO para editar (`switch-lock` responde 409), así que con el
// auto-envío puesto **nada de lo que él pidió era posible**. Medido en
// producción: PED-022 "Nathalie" es el único pedido del link que llegó al ERP,
// salió a nombre del mostrador y hoy no se puede tocar.
//
// AHORA: se convierte igual (el cliente ve su número al instante), se marca
// 'confirmado' —lo confirmó él— y ahí termina. Cliente y vendedor de Switch
// quedan VACÍOS a propósito: los pone la persona que lo revisa, y sin cliente
// el envío responde 422 (`cliente-elegido.ts`). El aviso de Telegram dice que
// falta ese paso.
//
// ⚠️ `resolvePublicoSwitchActor` NO se borró: sigue siendo la red del
// `handlePostEnvio` para el VENDEDOR cuando el pedido no tiene uno, y la manija
// `fg_catalogo_publico_switch` sigue vigente. Lo que dejó de existir es que
// resuelva el CLIENTE por descarte.

/** Total para la RPC: misma maquinaria que el convertir del admin (Reebok:
 *  categoría real vía products con fallback apparel; Joybees: bulto 12). */
/**
 * Resumen del pedido del LINK: referencias, piezas y total. Devuelve todo —no
 * solo el total— porque el aviso de Telegram necesita las mismas cifras.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resumenParaConvertir(cfg: MarcaConfig, db: any, items: PedidoPublicoRow["items"]) {
  const ids = items.map((i) => i.product_id).filter(Boolean) as string[];
  const categoryMap = cfg.categoryLookup ? await cfg.categoryLookup(ids) : new Map<string, string>();
  const { bultoPzasByProduct } = await leerCategoriaYBulto(db, cfg.productsTable, ids);
  return resumirDesdeItems(items as never, {
    bultoSize: cfg.bultoSize,
    categoryByProduct: categoryMap,
    bultoPzasByProduct,
    fallbackCategory: cfg.fallbackCategory,
  });
}

/**
 * Deja el pedido recién numerado LISTO PARA QUE UNA PERSONA LO REVISE.
 *
 * Lo único que escribe es `status = 'confirmado'` — que quiere decir "el
 * cliente lo confirmó", no "salió al ERP". La pestaña de la lista NO se decide
 * por este campo sino por tener envío activo en Switch (`switch-lock.ts`), así
 * que el pedido aparece en **Borradores** hasta que alguien lo mande.
 *
 * 🔴 CLIENTE Y VENDEDOR DE SWITCH SE QUEDAN VACÍOS, y es el punto entero del
 * cambio: escribir acá el mostrador volvería a poner un default silencioso —
 * quien abra el pedido vería "Contado" ya puesto y lo aceptaría sin mirar, que
 * es exactamente el problema que se midió (15 pedidos internos por $53.124 y
 * PED-022 del link). Sin cliente, el envío responde 422 y la pantalla dice
 * "Falta: elegir el cliente".
 *
 * NO lanza: la confirmación del cliente nunca se cae por esto.
 */
async function dejarPedidoListoParaRevision(
  cfg: MarcaConfig,
  numero: string,
): Promise<void> {
  const db = await cfg.db();

  // El pedido que acaba de crear la RPC (por número: la RPC devuelve order_id
  // pero el core solo propaga el número, que es único).
  const { data: order, error: orderErr } = await db
    .from(cfg.ordersTable)
    .select("id, order_number")
    .eq("order_number", numero)
    .maybeSingle();
  if (orderErr || !order?.id) {
    await enviarSistema(
      `🚨 ${cfg.label} ${numero}: no se pudo ubicar el pedido del link para dejarlo listo (${shortError(orderErr?.message || "sin fila")}). Revisarlo en la lista de pedidos.`,
    );
    return;
  }

  const { error: updErr } = await db
    .from(cfg.ordersTable)
    .update({ status: "confirmado" })
    .eq("id", String(order.id));
  if (updErr) {
    // No se avisa a Telegram: el pedido existe, tiene su número y se ve en la
    // lista. Lo único que queda es el rótulo interno del estado.
    console.error(`[${cfg.marca}/confirmar] no se pudo marcar 'confirmado' (${updErr.message})`);
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
      // aviso de stock). Joybees: 12 fijo. Tommy: 8 o 12 según el ESTILO, por
      // eso se pasa el item entero y no solo la categoría.
      getBulto: (item) =>
        cfg.marca === "reebok"
          ? cfg.bultoSize(item.category || "footwear")
          : cfg.bultoSize(item.category, item.bulto_pzas),

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

      // El pedido del link queda esperando a una persona (ver la cabecera).
      // Nunca lanza hacia arriba: el core ya lo envuelve.
      async alQuedarNumerado(numero) {
        await dejarPedidoListoParaRevision(cfg, numero);
      },

      // Misma maquinaria que el convertir del admin: total con helpers JS +
      // RPC atómica idempotente.
      async convertir(pedido) {
        const resumenLink = await resumenParaConvertir(cfg, db as never, pedido.items);
        const total = resumenLink.total;

        const { data, error } = await publicosDb.rpc(cfg.convertRpc, {
          p_short_id: pedido.short_id,
          p_total: total,
          p_items: pedido.items,
        });
        if (error) throw error;
        const numero = (data as { order_number?: string })?.order_number;
        if (!numero) throw new Error("RPC sin order_number");
        const ya = !!(data as { already_converted?: boolean })?.already_converted;
        // Este endpoint es SIEMPRE el camino del LINK: la RPC de conversión
        // deja origen_original='link' en la fila del pedido. El aviso lo dice
        // con todas las letras, y además cómo entra a Switch (contado + vendedor
        // DEFAULT, ver publico-switch-actor) — es lo que lo diferencia del
        // pedido que mete un vendedor, que sí lleva cliente y vendedor reales.
        if (!ya) {
          await enviarNegocio(
            avisoPedidoDelLink({
              emoji: cfg.telegramEmoji,
              label: cfg.label,
              cliente: pedido.cliente_nombre,
              total,
              numero,
              piezas: resumenLink.piezas,
            }),
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
      await enviarNegocio(
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
// sesión que este proceso pudo abrir. Desde que este endpoint dejó de mandar el
// pedido al ERP ya no abre ninguna, así que recorre una caché vacía y es un
// no-op; se conserva para que reencender un camino a Switch acá no nazca
// dejando sesiones abiertas.
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
