import { NextRequest, NextResponse } from "next/server";
import { joybeesServer } from "@/lib/joybees-supabase-server";
import { getBultoSize } from "@/lib/joybees-bulto";
import { calculateJoybeesOrderTotal } from "@/lib/joybees-order-total";
import {
  checkConfirmRateLimit,
  confirmarPedidoPublico,
  type ConfirmarDeps,
  type PedidoPublicoRow,
} from "@/lib/catalogo/confirmar-pedido";
import { sendTelegramAlert } from "@/lib/telegram";

export const dynamic = "force-dynamic";

// Endpoint PÚBLICO (sin sesión): el cliente confirma su pedido desde el link
// /pedido-joybees/[short_id]. La confirmación AUTO-CONVIERTE a JBP-### vía la
// RPC atómica existente (convert_joybees_pedido_publico). Idempotente; con
// aviso de stock (S2, joybees_products.stock): 409 con el detalle y el cliente
// puede reenviar con aceptar_stock=true. Espejo EXACTO de reebok/confirmar;
// lógica testeable en src/lib/catalogo/confirmar-pedido.ts.

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
    const rate = await checkConfirmRateLimit(joybeesServer, "joybees_pedidos_publicos", ip);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos seguidos. Espera unos minutos e intenta de nuevo." },
        { status: 429 },
      );
    }

    const deps: ConfirmarDeps = {
      async getPedido(sid) {
        const { data, error } = await joybeesServer
          .from("joybees_pedidos_publicos")
          .select("short_id, items, cliente_nombre, convertida, ped_order_number, deleted")
          .eq("short_id", sid)
          .maybeSingle();
        if (error) {
          console.error("[joybees/confirmar] fetch error:", error);
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

      // Stock Joybees: columna stock de joybees_products (piezas).
      // FAIL-OPEN: si la lectura falla, se confirma sin aviso (es cortesía).
      async getDisponibles(ids) {
        try {
          const { data, error } = await joybeesServer
            .from("joybees_products")
            .select("id, stock")
            .in("id", ids);
          if (error) {
            console.warn("[joybees/confirmar] stock no disponible (fail-open):", error.message);
            return null;
          }
          return new Map<string, number>(
            (data || []).map((p) => [p.id as string, Number(p.stock) || 0]),
          );
        } catch {
          return null;
        }
      },

      getBulto: () => getBultoSize(),

      // TOLERANTE a la migración 20260724120000 pendiente: si la columna
      // confirmado_cliente_at no existe aún, solo se loguea — la conversión
      // (que es la confirmación real) sigue igual.
      async marcarConfirmado(sid) {
        const patch: Record<string, unknown> = { confirmado_cliente_at: new Date().toISOString() };
        if (rate.ipHash) patch.confirmado_ip_hash = rate.ipHash;
        const { error } = await joybeesServer
          .from("joybees_pedidos_publicos")
          .update(patch)
          .eq("short_id", sid);
        if (error) {
          console.warn(
            "[joybees/confirmar] no se pudo registrar confirmado_cliente_at (¿migración pendiente?):",
            error.message,
          );
        }
      },

      // Misma maquinaria que el convertir del admin: total con helpers JS
      // (bulto 12 fijo) + RPC atómica idempotente.
      async convertir(pedido) {
        const items = pedido.items;
        const total = calculateJoybeesOrderTotal(
          items.map((i) => ({
            quantity: Number(i.quantity) || 0,
            unit_price: Number((i as { unit_price?: number }).unit_price) || 0,
          })),
        );

        const { data, error } = await joybeesServer.rpc("convert_joybees_pedido_publico", {
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
            `✅ Pedido Joybees CONFIRMADO por el cliente — ${pedido.cliente_nombre || "Sin nombre"} — ${numero} — ${money(total)}`,
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
    console.error("[joybees/confirmar] error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
