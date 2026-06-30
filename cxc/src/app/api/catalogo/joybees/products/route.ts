import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/api-auth";
import { requireRole } from "@/lib/requireRole";

export const dynamic = "force-dynamic";

// Roles del módulo Catálogos (admin/secretaria gestionan; vendedor/bodega
// consultan el catálogo interno). El catálogo PÚBLICO usa /joybees/public.
const CATALOGO_ROLES = ["admin", "secretaria", "vendedor", "bodega"];

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CATALOGO_ROLES);
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);

  // Columnas explícitas (no select('*')): blinda contra fugas de columnas
  // futuras (ej. costo). Mismas que el endpoint público + created_at (orden).
  let query = supabase
    .from("joybees_products")
    .select("id,sku,name,category,gender,price,stock,image_url,active,popular,is_regalia,badge,created_at")
    .order("created_at", { ascending: false });

  if (searchParams.get("active") === "true") query = query.eq("active", true);
  if (searchParams.get("category")) query = query.eq("category", searchParams.get("category"));
  if (searchParams.get("gender")) query = query.eq("gender", searchParams.get("gender"));

  const searchQ = searchParams.get("search");
  if (searchQ) query = query.or(`name.ilike.%${searchQ}%,sku.ilike.%${searchQ}%`);

  const { data, error } = await query;
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
