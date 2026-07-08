import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { joybeesServer } from "@/lib/joybees-supabase-server";
import {
  validatePedidoBody,
  applyDbPrices,
  type ProductPriceInfo,
} from "@/lib/joybees-pedido-publico-validate";
import { checkPedidoRateLimit } from "@/lib/joybees-pedido-rate-limit";
import { sendTelegramAlert } from "@/lib/telegram";

// Endpoint PÚBLICO (sin auth): nada del body se confía. Validación estructural +
// precios reales de la DB en src/lib/joybees-pedido-publico-validate.ts (funciones
// puras, con tests); rate-limit anti-spam por IP (fail-open) en
// src/lib/joybees-pedido-rate-limit.ts. Espejo de reebok/pedido-publico.

// short_id: 8 chars base36 con aleatoriedad CRIPTOGRÁFICA (randomInt usa crypto)
// para que el token del link público no sea adivinable.
const SHORT_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
function generateShortId(): string {
  return Array.from({ length: 8 }, () => SHORT_ID_ALPHABET[randomInt(36)]).join("");
}

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    // (1) Validación estructural: tipos, rangos, tamaños, whitelist de campos.
    const parsed = validatePedidoBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // (2) Rate-limit anti-spam por IP (máx 5 pedidos / 10 min). FAIL-OPEN.
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkPedidoRateLimit(supabase, ip);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Ya enviaste varios pedidos seguidos. Espera unos minutos e intenta de nuevo." },
        { status: 429 }
      );
    }

    // (3) Precios reales: el unit_price del cliente NO se confía — se reemplaza por
    // el de `joybees_products` y el total se calcula server-side (bulto 12).
    // product_id desconocido → rechazo (carrito forjado).
    const ids = [...new Set(parsed.items.map((i) => i.product_id))];
    const { data: prods, error: prodErr } = await joybeesServer
      .from("joybees_products")
      .select("id, price")
      .in("id", ids);
    if (prodErr) {
      console.error("Error fetching joybees product prices:", prodErr);
      return NextResponse.json(
        { error: "No se pudieron verificar los precios. Intenta de nuevo en unos segundos." },
        { status: 500 }
      );
    }
    const priceMap = new Map<string, ProductPriceInfo>(
      (prods || []).map((p) => [p.id as string, { price: Number(p.price) }])
    );
    const priced = applyDbPrices(parsed.items, priceMap);
    if (!priced.ok) {
      return NextResponse.json({ error: priced.error }, { status: 400 });
    }
    if (priced.adjusted) {
      console.warn(`joybees pedido-publico: precios del cliente difieren de la DB (${parsed.cliente_nombre}) — se usaron los de la DB`);
    }

    const short_id = generateShortId();

    const insertRow: Record<string, unknown> = {
      short_id,
      items: priced.items,
      total: priced.total,
      cliente_nombre: parsed.cliente_nombre,
    };
    // Solo si la columna ip_hash ya existe (el check de rate-limit la probó).
    if (rate.ipHash) insertRow.ip_hash = rate.ipHash;

    const { error } = await supabase.from("joybees_pedidos_publicos").insert(insertRow);

    if (error) {
      console.error("Error saving joybees public order:", error);
      return NextResponse.json({ error: "No se pudo guardar el pedido" }, { status: 500 });
    }

    await sendTelegramAlert(`🐝 Nuevo pedido Joybees (público) — ${parsed.cliente_nombre} — ${money(priced.total)}`);

    return NextResponse.json({ short_id });
  } catch (err) {
    console.error("Error in joybees pedido-publico POST:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
