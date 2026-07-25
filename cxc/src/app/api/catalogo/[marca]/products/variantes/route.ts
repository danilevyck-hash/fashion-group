// ─────────────────────────────────────────────────────────────────────────────
// Variantes de foto por producto (las que trae el ZIP del banco B2B).
//
//   GET  ?sku=XXX  → { variantes: [{ vista, url }], actual }  tira + cuál lleva ✓
//   GET  (sin sku) → { skus: [...] }                  qué SKUs tienen variantes
//                                                     (habilita el botón sin
//                                                      N peticiones)
//   POST { sku, vista } → elige esa variante como foto del producto:
//         image_url apunta a esa variante y foto_manual=true (candado contra
//         la asignación automática del ZIP).
//
// Auth: requireAdmin (admin + secretaria) — los mismos roles que ya editan
// products. Selects explícitos y respeto de los quirks por marca vía
// MARCAS_CONFIG (idField id/sku, tabla, client de escritura).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getSession } from "@/lib/require-auth";
import { logActivity } from "@/lib/log-activity";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import {
  listarSkusConVariantes,
  listarVariantesDeSku,
  urlDeVariante,
  guardarFotoElegida,
} from "@/lib/catalogos/variantes-server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const denied = requireAdmin(req);
  if (denied) return denied;

  const sku = new URL(req.url).searchParams.get("sku")?.trim();
  try {
    if (!sku) return NextResponse.json({ skus: await listarSkusConVariantes(cfg) });
    return NextResponse.json(await listarVariantesDeSku(cfg, sku));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudieron leer las fotos guardadas." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const sku = typeof body?.sku === "string" ? body.sku.trim() : "";
  const vista = typeof body?.vista === "number" ? body.vista : NaN;
  if (!sku || !Number.isInteger(vista) || vista < 0) {
    return NextResponse.json({ error: "sku y vista (entero) requeridos" }, { status: 400 });
  }

  // El producto se identifica con el quirk de la marca (Reebok por id, el resto
  // por sku); siempre se resuelve DESDE el sku que manda la UI.
  const db = await cfg.products.writeDb();
  const { data: prod, error: readErr } = await db
    .from(cfg.productsTable)
    .select("id,sku")
    .eq("sku", sku)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!prod) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const idValue = cfg.products.idField === "id" ? String(prod.id) : String(prod.sku);

  try {
    const url = await urlDeVariante(cfg, sku, vista);
    await guardarFotoElegida(cfg, idValue, url, true);
    const s = getSession(req);
    await logActivity(s?.role || "admin", "product_foto_variante", cfg.marca, { sku, vista }, s?.userName);
    return NextResponse.json({ image_url: url, foto_manual: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo guardar la foto.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
