import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, HAS_SERVICE_ROLE } from "@/lib/supabase-server";
import { requireAuth, getSession } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// Cualquiera con acceso al módulo (admin + secretaria) puede leer y guardar.
const ALLOWED = ["admin", "secretaria"];

const COLS = "id, marca, rubro, divisor, extra, redondeo, precio_fijo, updated_at, updated_by";

const MISCONFIG = NextResponse.json(
  { error: "Falta SUPABASE_SERVICE_ROLE_KEY en este entorno: las excepciones por rubro no se pueden leer ni guardar." },
  { status: 503 }
);

/** Lista todas las excepciones marca+rubro. */
export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED);
  if (authError) return authError;
  if (!HAS_SERVICE_ROLE) return MISCONFIG;

  const { data, error } = await supabaseServer
    .from("marca_rubro_formulas")
    .select(COLS)
    .order("marca", { ascending: true })
    .order("rubro", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "No se pudieron cargar las excepciones." }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}

/** Upsert de una excepción por marca+rubro (case-insensitive). */
export async function PUT(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED);
  if (authError) return authError;
  if (!HAS_SERVICE_ROLE) return MISCONFIG;

  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const marca = String(body.marca ?? "").trim();
  const rubro = String(body.rubro ?? "").trim();
  const divisor = Number(body.divisor);
  const extra = Math.round(Number(body.extra));
  const redondeo = String(body.redondeo ?? "int");

  if (!marca) return NextResponse.json({ error: "La marca es obligatoria." }, { status: 400 });
  if (!rubro) return NextResponse.json({ error: "El rubro es obligatorio." }, { status: 400 });
  if (!Number.isFinite(divisor) || divisor < 0) {
    return NextResponse.json({ error: "Divisor inválido." }, { status: 400 });
  }
  if (!Number.isFinite(extra) || extra < 0 || extra > 5) {
    return NextResponse.json({ error: "Extra debe ser un entero entre 0 y 5." }, { status: 400 });
  }
  if (redondeo !== "int" && redondeo !== "half" && redondeo !== "par") {
    return NextResponse.json({ error: "Redondeo inválido." }, { status: 400 });
  }

  const fields: Record<string, unknown> = {
    marca,
    rubro,
    divisor,
    extra,
    redondeo,
    updated_at: new Date().toISOString(),
    updated_by: session.userName || session.role || null,
  };

  // precio_fijo (opcional): si está lleno, GANA a la fórmula. Solo se toca si el
  // cuerpo lo trae (así BulkExcel, que no lo manda, no lo borra). > 0 = válido; null = limpiar.
  if ("precio_fijo" in body) {
    const pf = body.precio_fijo;
    if (pf == null || pf === "") {
      fields.precio_fijo = null;
    } else {
      const n = Number(pf);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: "Precio fijo inválido." }, { status: 400 });
      }
      fields.precio_fijo = n > 0 ? n : null;
    }
  }

  // Upsert manual case-insensitive por marca+rubro.
  const { data: existing, error: findErr } = await supabaseServer
    .from("marca_rubro_formulas")
    .select("id")
    .ilike("marca", marca)
    .ilike("rubro", rubro)
    .limit(1)
    .maybeSingle();

  if (findErr) {
    return NextResponse.json({ error: "No se pudo guardar la excepción." }, { status: 500 });
  }

  if (existing?.id) {
    const { error } = await supabaseServer.from("marca_rubro_formulas").update(fields).eq("id", existing.id);
    if (error) return NextResponse.json({ error: "No se pudo guardar la excepción." }, { status: 500 });
  } else {
    const { error } = await supabaseServer.from("marca_rubro_formulas").insert(fields);
    if (error) return NextResponse.json({ error: "No se pudo guardar la excepción." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Borra una excepción por id. */
export async function DELETE(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED);
  if (authError) return authError;
  if (!HAS_SERVICE_ROLE) return MISCONFIG;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });

  const { error } = await supabaseServer.from("marca_rubro_formulas").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "No se pudo borrar la excepción." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
