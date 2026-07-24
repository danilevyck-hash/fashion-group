import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { getBultoSize } from "@/lib/reebok-bulto";
import { calculateReebokOrderTotal } from "@/lib/reebok-order-total";
import { fetchReebokCategoryMap } from "@/lib/reebok-category-lookup";
import {
  checkConfirmRateLimit,
  confirmarPedidoPublico,
  type ConfirmarDeps,
  type PedidoPublicoRow,
} from "@/lib/catalogo/confirmar-pedido";
import { sendTelegramAlert } from "@/lib/telegram";

export const dynamic = "force-dynamic";

// Endpoint PÚBLICO (sin sesión): el cliente confirma su pedido desde el link
// /pedido-reebok/[short_id]. La confirmación AUTO-CONVIERTE a PED-### vía la
// RPC atómica existente (convert_reebok_pedido_publico) — el pedido entra
// directo al pipeline del admin. Idempotente; con aviso de stock (S2): si hay
// líneas cortas responde 409 con el detalle y el cliente puede reenviar con
// aceptar_stock=true. Lógica testeable en src/lib/catalogo/confirmar-pedido.ts.

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Fallback de categoría para el TOTAL: apparel (bulto=6) para no inflar el
// monto — misma regla que pedidos-unificado y el convertir del admin.
const FALLBACK_CATEGORY_TOTAL = "apparel";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const shortId = params.id;
    if (!shortId) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const aceptarStock = !!body && (body as Record<string, unknown>).aceptar_stock === true;

    // Rate-limit anti-spam por IP (fail-open, mismo patrón que la creación).
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkConfirmRateLimit(supabaseServer, "reebok_pedidos_publicos", ip);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos seguidos. Espera unos minutos e intenta de nuevo." },
        { status: 429 },
      );
    }

    const deps: ConfirmarDeps = {
      async getPedido(sid) {
        const { data, error } = await supabaseServer
          .from("reebok_pedidos_publicos")
          .select("short_id, items, cliente_nombre, convertida, ped_order_number, deleted")
          .eq("short_id", sid)
          .maybeSingle();
        if (error) {
          console.error("[reebok/confirmar] fetch error:", error);
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

      // Stock Reebok: suma de `inventory` (piezas por talla) por producto.
      // FAIL-OPEN: si la lectura falla, se confirma sin aviso (es cortesía).
      async getDisponibles(ids) {
        try {
          const { data, error } = await reebokServer
            .from("inventory")
            .select("product_id, quantity")
            .in("product_id", ids);
          if (error) {
            console.warn("[reebok/confirmar] stock no disponible (fail-open):", error.message);
            return null;
          }
          const map = new Map<string, number>();
          for (const row of data || []) {
            const pid = row.product_id as string;
            map.set(pid, (map.get(pid) || 0) + (Number(row.quantity) || 0));
          }
          return map;
        } catch {
          return null;
        }
      },

      getBulto: (category) => getBultoSize(category || "footwear"),

      // TOLERANTE a la migración 20260724120000 pendiente: si la columna
      // confirmado_cliente_at no existe aún, solo se loguea — la conversión
      // (que es la confirmación real) sigue igual.
      async marcarConfirmado(sid) {
        const patch: Record<string, unknown> = { confirmado_cliente_at: new Date().toISOString() };
        if (rate.ipHash) patch.confirmado_ip_hash = rate.ipHash;
        const { error } = await supabaseServer
          .from("reebok_pedidos_publicos")
          .update(patch)
          .eq("short_id", sid);
        if (error) {
          console.warn(
            "[reebok/confirmar] no se pudo registrar confirmado_cliente_at (¿migración pendiente?):",
            error.message,
          );
        }
      },

      // Misma maquinaria que el convertir del admin: total con helpers JS
      // (categoría real via products, fallback apparel) + RPC atómica idempotente.
      async convertir(pedido) {
        const items = pedido.items;
        const categoryMap = await fetchReebokCategoryMap(items.map((i) => i.product_id));
        const itemsForTotal = items.map((i) => ({
          quantity: Number(i.quantity) || 0,
          unit_price: Number((i as { unit_price?: number }).unit_price) || 0,
          category:
            (i.product_id && categoryMap.get(i.product_id)) || i.category || FALLBACK_CATEGORY_TOTAL,
        }));
        const total = calculateReebokOrderTotal(itemsForTotal);

        const { data, error } = await supabaseServer.rpc("convert_reebok_pedido_publico", {
          p_short_id: pedido.short_id,
          p_total: total,
          p_items: items,
        });
        if (error) throw error;
        const numero = (data as { order_number?: string })?.order_number;
        if (!numero) throw new Error("RPC sin order_number");
        const ya = !!(data as { already_converted?: boolean })?.already_converted;
        if (!ya) {
          await sendTelegramAlert(
            `✅ Pedido Reebok CONFIRMADO por el cliente — ${pedido.cliente_nombre || "Sin nombre"} — ${numero} — ${money(total)}`,
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
    console.error("[reebok/confirmar] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
