// Catálogo interno de productos, dirigido por cfg.products (marcas.ts).
//
// QUIRKS heredados (unificar con OK de Daniel):
//   · QUIRK 4 (auth del GET): en Reebok el catálogo es legible SIN sesión y
//     solo scope=admin exige rol; en Joybees TODA lectura exige sesión con los
//     roles del módulo Catálogos (incluye bodega).
//   · QUIRK 5 (edición): Reebok edita por `id` vía PUT; Joybees por `sku` vía
//     POST. El verbo que la marca no usa responde 405 (antes la ruta no
//     existía y Next respondía 405 igual).
//
// Común a ambas: la creación manual fue retirada (el catálogo lo llena el cron
// de la marca desde Switch); allow-list de edición manual = SOLO image_url y
// badge; PATCH = toggle "Ocultar del catálogo" (oculto_manual) que recalcula
// `active` con la regla ÚNICA de visibilidad; DELETE (solo Reebok) = soft.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { requireRole } from "@/lib/requireRole";
import { getSession } from "@/lib/require-auth";
import { logActivity } from "@/lib/log-activity";
import { esVisibleEnCatalogo } from "@/lib/catalogos/visibilidad";
import { getMarcaConfig, type MarcaConfig } from "@/lib/catalogo/marcas";

export const dynamic = "force-dynamic";
// Sin Data Cache en los fetch internos (gotcha Next.js + supabase-js): el
// catálogo debe reflejar al instante el sync y el toggle "Ocultar del catálogo".
export const fetchCache = "force-no-store";

// Roles del módulo Catálogos (admin/secretaria gestionan; vendedor/bodega
// consultan el catálogo interno). El catálogo PÚBLICO usa /[marca]/public.
const CATALOGO_ROLES = ["admin", "secretaria", "vendedor", "bodega"];

// Allow-list de columnas editables a mano. TODO lo demás (active, existencia,
// disponibilidad, stock, price, name…) lo maneja el cron de catálogo y se
// RECHAZA aquí — la edición manual nunca debe pisar el estado del sync.
const EDITABLE_FIELDS = ["image_url", "badge"] as const;
// badge = etiqueta visual manual. null = sin etiqueta; o uno de estos valores.
const VALID_BADGES = new Set(["nuevo", "oferta", "proximamente"]);

export async function GET(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });
  const pcfg = cfg.products;

  const { searchParams } = new URL(req.url);

  if (pcfg.authStyle === "publico-scope-admin") {
    // QUIRK 4 (Reebok): catálogo legible sin sesión; scope=admin (solo
    // admin/secretaria) devuelve el catálogo vivo (active=true) MÁS los
    // ocultados a mano (oculto_manual=true, active=false) para poder revertir
    // el toggle desde el admin. Incluye la columna oculto_manual.
    const adminScope = searchParams.get("scope") === "admin";
    if (adminScope) {
      const denied = requireAdmin(req);
      if (denied) return denied;
    }

    const supabase = await pcfg.readDb();
    const buildQuery = (cols: string, withOculto: boolean) => {
      let query = supabase.from(cfg.productsTable).select(cols).order("created_at", { ascending: false });
      if (adminScope && withOculto) query = query.or("active.is.true,oculto_manual.is.true");
      else if (adminScope || searchParams.get("active") === "true") query = query.eq("active", true);
      if (searchParams.get("category")) query = query.eq("category", searchParams.get("category"));
      if (searchParams.get("gender")) query = query.eq("gender", searchParams.get("gender"));
      const searchQ = searchParams.get("search");
      if (searchQ) query = query.or(`name.ilike.%${searchQ}%,sku.ilike.%${searchQ}%`);
      return query;
    };

    // Fallback pre-migración (DDL 20260723120000): si oculto_manual aún no
    // existe, se responde el catálogo activo sin la columna.
    let { data, error } = await buildQuery(adminScope ? `${pcfg.cols},oculto_manual` : pcfg.cols, adminScope);
    if (error && error.message.includes("oculto_manual")) {
      ({ data, error } = await buildQuery(pcfg.cols, false));
    }
    if (error) {
      console.error(error);
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  // QUIRK 4 (Joybees): sesión SIEMPRE, con los roles del módulo Catálogos.
  const auth = requireRole(req, CATALOGO_ROLES);
  if (auth instanceof NextResponse) return auth;

  const supabase = await pcfg.readDb();
  const buildQuery = (cols: string) => {
    let query = supabase
      .from(cfg.productsTable)
      .select(cols)
      .order("created_at", { ascending: false });
    if (searchParams.get("active") === "true") query = query.eq("active", true);
    if (searchParams.get("category")) query = query.eq("category", searchParams.get("category"));
    if (searchParams.get("gender")) query = query.eq("gender", searchParams.get("gender"));
    const searchQ = searchParams.get("search");
    if (searchQ) query = query.or(`name.ilike.%${searchQ}%,sku.ilike.%${searchQ}%`);
    return query;
  };

  // `oculto_manual` (toggle "Ocultar del catálogo") con fallback pre-migración
  // (DDL 20260723120000): si la columna no existe aún, se responde sin ella.
  let { data, error } = await buildQuery(`${pcfg.cols},oculto_manual`);
  if (error && error.message.includes("oculto_manual")) {
    ({ data, error } = await buildQuery(pcfg.cols));
  }
  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  return NextResponse.json(data);
}

// ── Edición manual (allow-list image_url/badge) ──────────────────────────────
// QUIRK 5: verbo e identificador según la marca (PUT+id Reebok, POST+sku
// Joybees). La lógica de allow-list y validación es la misma.

async function editProducto(cfg: MarcaConfig, req: NextRequest): Promise<NextResponse> {
  const pcfg = cfg.products;
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const idValue = (body as Record<string, unknown>)[pcfg.idField];
  if (!idValue || typeof idValue !== "string") {
    return NextResponse.json({ error: `${pcfg.idField} requerido` }, { status: 400 });
  }

  // Rechaza cualquier columna fuera de la allow-list (no la ignora en silencio).
  const rejected = Object.keys(body).filter(
    (k) => k !== pcfg.idField && !(EDITABLE_FIELDS as readonly string[]).includes(k),
  );
  if (rejected.length > 0) {
    return NextResponse.json({ error: `Campos no editables: ${rejected.join(", ")}` }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) updates[key] = (body as Record<string, unknown>)[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  // Validar badge: null (sin etiqueta) o un valor conocido. Evita texto libre.
  if ("badge" in updates) {
    const b = updates.badge;
    if (b !== null && !(typeof b === "string" && VALID_BADGES.has(b))) {
      return NextResponse.json({ error: "Etiqueta inválida" }, { status: 400 });
    }
  }
  // Validar image_url: string o null.
  if ("image_url" in updates) {
    const u = updates.image_url;
    if (u !== null && typeof u !== "string") {
      return NextResponse.json({ error: "image_url inválido" }, { status: 400 });
    }
  }

  const db = await pcfg.writeDb();
  const { data, error } = await db
    .from(cfg.productsTable)
    .update(updates)
    .eq(pcfg.idField, idValue)
    .select(pcfg.cols)
    .single();
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });
  if (cfg.products.editVerb !== "PUT") return new NextResponse(null, { status: 405 });
  return editProducto(cfg, req);
}

export async function POST(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });
  if (cfg.products.editVerb !== "POST") return new NextResponse(null, { status: 405 });
  return editProducto(cfg, req);
}

// ── Toggle "Visible en catálogo / Oculto" (decisión Daniel 22-jul-2026) ───────
// Oculta un producto no vendible SIN tocar código. El flag `oculto_manual`
// SOBREVIVE al sync: el motor (sync-catalogo.ts) lo respeta vía
// esVisibleEnCatalogo y mantiene active=false mientras esté puesto.
// Reversible: al mostrar se recalcula `active` con la MISMA regla del sync
// (regla única en lib/catalogos/visibilidad.ts).
export async function PATCH(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });
  const pcfg = cfg.products;

  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const { oculto } = (body ?? {}) as Record<string, unknown>;
  const idValue = ((body ?? {}) as Record<string, unknown>)[pcfg.idField];
  if (!idValue || typeof idValue !== "string" || typeof oculto !== "boolean") {
    return NextResponse.json({ error: `${pcfg.idField} y oculto (boolean) requeridos` }, { status: 400 });
  }

  const db = await pcfg.writeDb();

  // Leer el estado real (select explícito) para recalcular `active` al mostrar.
  const { data: prod, error: readErr } = await db
    .from(cfg.productsTable)
    .select("id,sku,existencia,keep_visible,badge,oculto_manual")
    .eq(pcfg.idField, idValue)
    .maybeSingle();
  if (readErr) {
    const msg = readErr.message.includes("oculto_manual")
      ? "Falta correr la migración 20260723120000 (columna oculto_manual)."
      : readErr.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  if (!prod) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const active = esVisibleEnCatalogo({
    existencia: prod.existencia ?? 0,
    keepVisible: prod.keep_visible,
    badge: prod.badge,
    ocultoManual: oculto,
  });
  const { data, error } = await db
    .from(cfg.productsTable)
    .update({ oculto_manual: oculto, active })
    .eq(pcfg.idField, idValue)
    .select("id,sku,active,oculto_manual")
    .single();
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const s = getSession(req);
  const detalle = pcfg.idField === "id" ? { productId: idValue, sku: prod.sku } : { sku: idValue };
  await logActivity(
    s?.role || "admin",
    oculto ? "product_ocultar_catalogo" : "product_mostrar_catalogo",
    cfg.marca,
    detalle,
    s?.userName,
  );
  return NextResponse.json(data);
}

// ── DELETE (solo Reebok): soft-delete, nunca borrado físico ──────────────────
export async function DELETE(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });
  if (!cfg.products.hasDelete) return new NextResponse(null, { status: 405 });

  const denied = requireAdmin(req);
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Soft-delete: desactivamos el producto en vez de borrarlo de forma
  // irreversible. Preserva la fila Y su inventario → reversible (reactivable
  // con active=true). El catálogo público ya filtra active=true, así que un
  // producto "borrado" desaparece de las listas activas sin pérdida de datos.
  const db = await cfg.products.writeDb();
  const { data, error } = await db
    .from(cfg.productsTable)
    .update({ active: false })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  const s = getSession(req);
  await logActivity(s?.role || "admin", "product_soft_delete", cfg.marca, { productId: id }, s?.userName);
  return NextResponse.json({ success: true, deleted: data.id });
}
