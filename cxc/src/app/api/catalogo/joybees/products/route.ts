import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/api-auth";
import { requireRole } from "@/lib/requireRole";
import { esVisibleEnCatalogo } from "@/lib/catalogos/visibilidad";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";

export const dynamic = "force-dynamic";
// Sin Data Cache en los fetch internos (gotcha Next.js + supabase-js): el
// catálogo debe reflejar al instante el sync y el toggle "Ocultar del catálogo".
export const fetchCache = "force-no-store";

// Roles del módulo Catálogos (admin/secretaria gestionan; vendedor/bodega
// consultan el catálogo interno). El catálogo PÚBLICO usa /joybees/public.
const CATALOGO_ROLES = ["admin", "secretaria", "vendedor", "bodega"];

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Columnas explícitas (no select('*')): blinda contra fugas de columnas
// futuras (ej. costo). Mismas que el endpoint público + created_at (orden).
const GET_COLS = "id,sku,name,category,gender,price,stock,image_url,active,popular,is_regalia,badge,created_at";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CATALOGO_ROLES);
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);

  const buildQuery = (cols: string) => {
    let query = supabase
      .from("joybees_products")
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
  let { data, error } = await buildQuery(`${GET_COLS},oculto_manual`);
  if (error && error.message.includes("oculto_manual")) {
    ({ data, error } = await buildQuery(GET_COLS));
  }
  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  return NextResponse.json(data);
}

// Allow-list de edición manual: SOLO foto y etiqueta. Todo lo demás (active,
// existencia, disponibilidad, stock, price, name, category…) lo maneja el cron
// joybees-catalogo → editarlos a mano pisaría la data fresca de Switch. Espejo
// del hardening de Reebok (mismo patrón). El identificador es `sku` (unique).
const EDITABLE_FIELDS = ["image_url", "badge"] as const;
const VALID_BADGES = new Set(["nuevo", "oferta", "proximamente"]);
const PRODUCT_COLS = "id,sku,name,category,gender,price,stock,image_url,active,popular,is_regalia,badge,created_at";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const { sku } = body as Record<string, unknown>;
  if (!sku || typeof sku !== "string") {
    return NextResponse.json({ error: "sku requerido" }, { status: 400 });
  }

  // Rechaza cualquier columna fuera de la allow-list (no la ignora en silencio).
  const rejected = Object.keys(body).filter(
    (k) => k !== "sku" && !(EDITABLE_FIELDS as readonly string[]).includes(k),
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

  // badge: null (sin etiqueta) o un valor conocido. image_url: string o null.
  if ("badge" in updates) {
    const b = updates.badge;
    if (b !== null && !(typeof b === "string" && VALID_BADGES.has(b))) {
      return NextResponse.json({ error: "Etiqueta inválida" }, { status: 400 });
    }
  }
  if ("image_url" in updates) {
    const u = updates.image_url;
    if (u !== null && typeof u !== "string") {
      return NextResponse.json({ error: "image_url inválido" }, { status: 400 });
    }
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("joybees_products")
    .update(updates)
    .eq("sku", sku)
    .select(PRODUCT_COLS)
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// ── Toggle "Visible en catálogo / Oculto" (espejo EXACTO de Reebok) ───────────
// Oculta un producto no vendible SIN tocar código. `oculto_manual` SOBREVIVE al
// sync: el motor (sync-catalogo.ts) lo respeta vía esVisibleEnCatalogo y
// mantiene active=false mientras esté puesto. Reversible: al mostrar se
// recalcula `active` con la MISMA regla del sync (lib/catalogos/visibilidad.ts).
// Identificador: `sku` (unique) — igual que el POST de este endpoint.
export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const { sku, oculto } = (body ?? {}) as Record<string, unknown>;
  if (!sku || typeof sku !== "string" || typeof oculto !== "boolean") {
    return NextResponse.json({ error: "sku y oculto (boolean) requeridos" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Leer el estado real (select explícito) para recalcular `active` al mostrar.
  const { data: prod, error: readErr } = await supabase
    .from("joybees_products")
    .select("id,sku,existencia,keep_visible,badge,oculto_manual")
    .eq("sku", sku)
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
  const { data, error } = await supabase
    .from("joybees_products")
    .update({ oculto_manual: oculto, active })
    .eq("sku", sku)
    .select("id,sku,active,oculto_manual")
    .single();
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const s = getSession(req);
  await logActivity(s?.role || "admin", oculto ? "product_ocultar_catalogo" : "product_mostrar_catalogo", "joybees", { sku }, s?.userName);
  return NextResponse.json(data);
}
