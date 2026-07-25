import { NextRequest, NextResponse } from "next/server";
import { getMarcaConfig, type MarcaConfig } from "@/lib/catalogo/marcas";
import {
  checkConfirmRateLimit,
  confirmarPedidoPublico,
  type ConfirmarDeps,
  type PedidoPublicoRow,
} from "@/lib/catalogo/confirmar-pedido";
import { sendTelegramAlert } from "@/lib/telegram";

export const dynamic = "force-dynamic";

// Endpoint PÚBLICO (sin sesión): el cliente confirma su pedido desde el link
// /pedido-<marca>/[short_id]. La confirmación AUTO-CONVIERTE a <prefijo>-###
// vía la RPC atómica existente (cfg.convertRpc) — el pedido entra directo al
// pipeline del admin. Idempotente; con aviso de stock (S2): si hay líneas
// cortas responde 409 con el detalle y el cliente puede reenviar con
// aceptar_stock=true. Lógica testeable en src/lib/catalogo/confirmar-pedido.ts.
//
// Stock por marca: Reebok suma `inventory` (piezas por talla) en su proyecto;
// Joybees lee la columna stock de joybees_products.

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

export async function POST(
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

    const body = await req.json().catch(() => null);
    const aceptarStock = !!body && (body as Record<string, unknown>).aceptar_stock === true;

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
      async getDisponibles(ids) {
        try {
          if (cfg.marca === "reebok") {
            const { data, error } = await db
              .from("inventory")
              .select("product_id, quantity")
              .in("product_id", ids);
            if (error) {
              console.warn(`[${cfg.marca}/confirmar] stock no disponible (fail-open):`, error.message);
              return null;
            }
            const map = new Map<string, number>();
            for (const row of data || []) {
              const pid = row.product_id as string;
              map.set(pid, (map.get(pid) || 0) + (Number(row.quantity) || 0));
            }
            return map;
          }
          const { data, error } = await db
            .from(cfg.productsTable)
            .select("id, stock")
            .in("id", ids);
          if (error) {
            console.warn(`[${cfg.marca}/confirmar] stock no disponible (fail-open):`, error.message);
            return null;
          }
          return new Map<string, number>(
            (data || []).map((p) => [p.id as string, Number(p.stock) || 0]),
          );
        } catch {
          return null;
        }
      },

      // Reebok: bulto por categoría con default footwear (patrón original del
      // aviso de stock). Joybees: bulto 12 fijo.
      getBulto: (category) =>
        cfg.marca === "reebok" ? cfg.bultoSize(category || "footwear") : cfg.bultoSize(),

      // TOLERANTE a la migración 20260724120000 pendiente: si la columna
      // confirmado_cliente_at no existe aún, solo se loguea — la conversión
      // (que es la confirmación real) sigue igual.
      async marcarConfirmado(sid) {
        const patch: Record<string, unknown> = { confirmado_cliente_at: new Date().toISOString() };
        if (rate.ipHash) patch.confirmado_ip_hash = rate.ipHash;
        const { error } = await publicosDb
          .from(cfg.publicosTable)
          .update(patch)
          .eq("short_id", sid);
        if (error) {
          console.warn(
            `[${cfg.marca}/confirmar] no se pudo registrar confirmado_cliente_at (¿migración pendiente?):`,
            error.message,
          );
        }
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

    const result = await confirmarPedidoPublico(deps, shortId, aceptarStock);

    if (result.status === 404) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    if (result.status === 409) {
      return NextResponse.json({ error: "stock_corto", lineas: result.lineas }, { status: 409 });
    }
    if (result.status === 500) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({
      numero: result.numero,
      estado: "confirmado",
      ya_confirmado: result.ya_confirmado,
    });
  } catch (err) {
    console.error(`[${params.marca}/confirmar] error:`, err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
