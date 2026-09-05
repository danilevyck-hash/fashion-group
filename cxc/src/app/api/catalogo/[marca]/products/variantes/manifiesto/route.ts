// ─────────────────────────────────────────────────────────────────────────────
// Manifiesto del ZIP del B2B — UNA sola escritura a la DB al final del proceso.
//
// El navegador ya descomprimió, recortó y subió las ~2,500 variantes a Storage;
// aquí solo se decide qué producto se queda con qué foto:
//
//   POST { items: [{ sku, variantes: [n...], elegida: n|null }] }
//     → { asignadas, manuales, sinMatch: [...], errores: [...] }
//
// REGLA CLAVE — no pisar elecciones manuales: si el producto tiene
// foto_manual=true (alguien eligió su foto a mano en el admin), sus variantes
// quedan guardadas pero su image_url NO se toca. Se cuenta en `manuales`.
//
// Idempotente: volver a subir el mismo ZIP produce el mismo resultado.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOSecretaria } from "@/lib/api-auth";
import { getSession } from "@/lib/require-auth";
import { logActivity } from "@/lib/log-activity";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import {
  urlDeVariante,
  guardarFotoElegida,
  skusConFotoManual,
} from "@/lib/catalogos/variantes-server";
import { normalizarCodigo, type ManifiestoItem } from "@/lib/catalogos/fotos-b2b";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300;

/** Tope defensivo — el catálogo más grande ronda los 500 productos. */
const MAX_ITEMS = 5000;

export async function POST(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const denied = requireAdminOSecretaria(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { items?: unknown } | null;
  const raw = Array.isArray(body?.items) ? (body!.items as unknown[]) : null;
  if (!raw) return NextResponse.json({ error: "items requerido" }, { status: 400 });
  if (raw.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Demasiados productos (máx ${MAX_ITEMS})` }, { status: 400 });
  }

  const items: ManifiestoItem[] = [];
  for (const it of raw) {
    const o = it as Record<string, unknown>;
    if (typeof o?.sku !== "string" || !o.sku.trim()) continue;
    items.push({
      sku: o.sku.trim(),
      variantes: Array.isArray(o.variantes) ? (o.variantes as number[]).filter(Number.isInteger) : [],
      elegida: Number.isInteger(o.elegida) ? (o.elegida as number) : null,
    });
  }

  // Productos reales de la marca (select explícito) → resuelve el identificador
  // según el quirk de la marca y detecta los códigos sin match.
  const db = await cfg.products.writeDb();
  const { data: prods, error } = await db.from(cfg.productsTable).select("id,sku");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const porCodigo = new Map<string, { id: string; sku: string }>();
  for (const p of prods ?? []) {
    const row = p as { id: string; sku: string | null };
    if (row.sku) porCodigo.set(normalizarCodigo(row.sku), { id: String(row.id), sku: row.sku });
  }

  const manuales = await skusConFotoManual(cfg);

  let asignadas = 0;
  let saltadasManual = 0;
  const sinMatch: string[] = [];
  const errores: string[] = [];

  for (const item of items) {
    const prod = porCodigo.get(normalizarCodigo(item.sku));
    if (!prod) {
      sinMatch.push(item.sku);
      continue;
    }
    if (item.elegida == null) continue; // todas sus vistas eran lifestyle → sin foto
    if (manuales.has(prod.sku)) {
      saltadasManual++;
      continue;
    }
    // La elegida tiene que ser una de las que el navegador dice haber subido.
    if (item.variantes.length > 0 && !item.variantes.includes(item.elegida)) {
      errores.push(`${prod.sku}: la foto elegida no se subió`);
      continue;
    }
    try {
      const url = await urlDeVariante(cfg, prod.sku, item.elegida, { verificar: false });
      const idValue = cfg.products.idField === "id" ? prod.id : prod.sku;
      // manual=false: la puso el proceso automático, sigue siendo reemplazable
      // por un ZIP posterior (y elegible a mano, que sí pone el candado).
      await guardarFotoElegida(cfg, idValue, url, false);
      asignadas++;
    } catch (err) {
      errores.push(`${prod.sku}: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  const s = getSession(req);
  await logActivity(
    s?.role || "admin",
    "catalogo_zip_b2b",
    cfg.marca,
    { productos: items.length, asignadas, sinMatch: sinMatch.length, manuales: saltadasManual },
    s?.userName,
  );

  return NextResponse.json({ asignadas, manuales: saltadasManual, sinMatch, errores });
}
