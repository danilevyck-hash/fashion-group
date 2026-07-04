// POST /api/catalogo/stock-carrito { marca, skus: string[] } — stock EN VIVO de
// todo el carrito en una sola llamada (re-validación del checkout). Misma
// resolución que stock-vivo (artículo por código + /apiarticulos/stock), en
// serie sobre una única sesión de Switch.
//
// SESIÓN ÚNICA: sin cierresesion aquí a propósito (mismo razonamiento que
// stock-vivo: cada login extra ES la colisión; el confirm del checkout cierra
// la sesión en su finally).

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { createSwitchClient } from "@/lib/switch-api/client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 120;

const EMPRESA_POR_MARCA: Record<string, string> = {
  reebok: "active_shoes",
  joybees: "joystep",
};
const MAX_SKUS = 40;

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(v ?? "0");
  return Number.isFinite(n) ? n : 0;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const empresa = EMPRESA_POR_MARCA[body?.marca || ""];
  const skusRaw: unknown[] = Array.isArray(body?.skus) ? body.skus : [];
  const skus = [...new Set(
    skusRaw.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim()),
  )];
  if (!empresa || skus.length === 0) {
    return NextResponse.json({ error: "marca y skus requeridos" }, { status: 400 });
  }
  if (skus.length > MAX_SKUS) {
    return NextResponse.json({ error: `Máximo ${MAX_SKUS} productos por consulta` }, { status: 400 });
  }

  const client = createSwitchClient(empresa);
  const stocks: Record<string, { existencia: number; disponible: number }> = {};
  const errores: Record<string, string> = {};

  for (const sku of skus) {
    try {
      const lista = await client.getArticulos({ porPagina: 50, paginaActual: 1, filtro: sku });
      const articulo = (lista.articulos ?? []).find((a) => a.codigo === sku);
      if (!articulo) { errores[sku] = "no existe en Switch"; continue; }
      const stock = await client.getStock(articulo.id);
      let existencia = 0, disponible = 0;
      for (const row of stock.stock ?? []) {
        existencia += num(row.saldo);
        disponible += num(row.disponible);
      }
      stocks[sku] = { existencia: Math.round(existencia), disponible: Math.round(disponible) };
    } catch (err) {
      errores[sku] = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json({ stocks, errores, actualizado: new Date().toISOString() });
}
