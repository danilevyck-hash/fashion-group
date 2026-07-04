// GET /api/catalogo/stock-vivo?marca=reebok|joybees&sku=XXX — stock EN VIVO de
// un artículo desde Switch (/apiarticulos/lista para resolver el artículo por
// código + /apiarticulos/stock). Lo dispara el catálogo al agregar un producto
// al carrito, para corregir en pantalla el número del sync nocturno.
//
// SESIÓN ÚNICA: aquí NO se hace cierresesion por request A PROPÓSITO — cada
// login extra es en sí el evento que mata la sesión de otro proceso (crons).
// Reutilizar el token cacheado del proceso (TTL 55min) minimiza logins: una
// ráfaga de taps del vendedor = 1 login, no N. El flujo de checkout/envío sí
// cierra la sesión al confirmar (logoutAllSwitchSessions en su finally).
//
// Micro-caché en memoria (60s por sku) para absorber taps repetidos, y
// persistencia best-effort del número fresco a la tabla de productos (el grid
// de otros usuarios también se beneficia).

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { createSwitchClient } from "@/lib/switch-api/client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 30;

const MARCAS: Record<string, { empresa: string; tabla: string }> = {
  reebok: { empresa: "active_shoes", tabla: "products" },
  joybees: { empresa: "joystep", tabla: "joybees_products" },
};

interface StockVivo {
  sku: string;
  existencia: number;
  disponible: number;
  actualizado: string;
}

const cache = new Map<string, { data: StockVivo; ts: number }>();
const CACHE_TTL_MS = 60_000;

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(v ?? "0");
  return Number.isFinite(n) ? n : 0;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;

  const marca = req.nextUrl.searchParams.get("marca") || "";
  const sku = (req.nextUrl.searchParams.get("sku") || "").trim();
  const cfg = MARCAS[marca];
  if (!cfg || !sku) {
    return NextResponse.json({ error: "marca y sku requeridos" }, { status: 400 });
  }

  const key = `${marca}:${sku}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return NextResponse.json({ ...hit.data, cached: true });
  }

  try {
    const client = createSwitchClient(cfg.empresa);
    // Resolver el artículo por código (el filtro de Switch es substring —
    // matchear exacto sobre el resultado).
    const lista = await client.getArticulos({ porPagina: 50, paginaActual: 1, filtro: sku });
    const articulo = (lista.articulos ?? []).find((a) => a.codigo === sku);
    if (!articulo) {
      return NextResponse.json({ error: `SKU ${sku} no existe en Switch` }, { status: 404 });
    }
    const stock = await client.getStock(articulo.id);
    let existencia = 0;
    let disponible = 0;
    for (const row of stock.stock ?? []) {
      existencia += num(row.saldo);
      disponible += num(row.disponible);
    }

    const data: StockVivo = {
      sku,
      existencia: Math.round(existencia),
      disponible: Math.round(disponible),
      actualizado: new Date().toISOString(),
    };
    cache.set(key, { data, ts: Date.now() });

    // Best-effort: refrescar el número del sync en la tabla del catálogo
    // (Joybees además mantiene `stock`, que gatea el botón Agregar).
    const patch: Record<string, number> = { existencia: data.existencia, disponibilidad: data.disponible };
    if (marca === "joybees") patch.stock = data.disponible;
    supabaseServer.from(cfg.tabla).update(patch).eq("sku", sku).then(({ error }) => {
      if (error) console.warn(`[stock-vivo] persistencia ${cfg.tabla}/${sku}: ${error.message}`);
    });

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Switch no respondió: ${msg}` }, { status: 502 });
  }
}
