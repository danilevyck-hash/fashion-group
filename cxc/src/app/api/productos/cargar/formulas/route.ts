import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, HAS_SERVICE_ROLE } from "@/lib/supabase-server";
import { requireAuth, getSession } from "@/lib/require-auth";
import { validarDivisor } from "@/lib/depurador/divisor";

export const dynamic = "force-dynamic";

// Cualquiera con acceso al módulo (admin + secretaria) puede leer y guardar.
const ALLOWED = ["admin", "secretaria"];

// marca_formulas tiene RLS `to service_role`: sin la service role key, el rol anon
// la lee VACÍA sin error (fallo silencioso). Fallamos ruidosamente para que se vea.
const MISCONFIG = NextResponse.json(
  { error: "Falta SUPABASE_SERVICE_ROLE_KEY en este entorno: las fórmulas no se pueden leer ni guardar (RLS las bloquea para el rol anon)." },
  { status: 503 }
);

const COLS = "id, marca, empresa, divisor, extra, redondeo, updated_at, updated_by";

/** Lista todas las fórmulas guardadas, ordenadas por empresa y marca. */
export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED);
  if (authError) return authError;
  if (!HAS_SERVICE_ROLE) return MISCONFIG;

  const { data, error } = await supabaseServer
    .from("marca_formulas")
    .select(COLS)
    .order("empresa", { ascending: true, nullsFirst: true })
    .order("marca", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "No se pudieron cargar las fórmulas." }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}

/** Upsert de una fórmula por marca (case-insensitive). */
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
  const empresa = body.empresa != null ? String(body.empresa).trim() : null;
  const divisorOk = validarDivisor(body.divisor);
  const extra = Math.round(Number(body.extra));
  const redondeo = String(body.redondeo ?? "int");

  // Validación en el borde.
  if (!marca) return NextResponse.json({ error: "La marca es obligatoria." }, { status: 400 });
  // Rango del divisor: 0 (sin fórmula) o entre 0.10 y 1.00. Ver src/lib/depurador/divisor.ts.
  if (!divisorOk.ok) {
    return NextResponse.json({ error: divisorOk.error }, { status: 400 });
  }
  const divisor = divisorOk.divisor;
  if (!Number.isFinite(extra) || extra < 0 || extra > 5) {
    return NextResponse.json({ error: "Extra debe ser un entero entre 0 y 5." }, { status: 400 });
  }
  if (redondeo !== "int" && redondeo !== "half" && redondeo !== "par") {
    return NextResponse.json({ error: "Redondeo inválido." }, { status: 400 });
  }

  const fields = {
    marca,
    empresa,
    divisor,
    extra,
    redondeo,
    updated_at: new Date().toISOString(),
    updated_by: session.userName || session.role || null,
  };

  // Upsert manual case-insensitive: si ya existe la marca (en cualquier caja),
  // actualiza esa fila; si no, inserta. Evita la limitación de onConflict sobre
  // índice de expresión (lower(marca)).
  const { data: existing, error: findErr } = await supabaseServer
    .from("marca_formulas")
    .select("id")
    .ilike("marca", marca)
    .limit(1)
    .maybeSingle();

  if (findErr) {
    return NextResponse.json({ error: "No se pudo guardar la fórmula." }, { status: 500 });
  }

  if (existing?.id) {
    const { error } = await supabaseServer.from("marca_formulas").update(fields).eq("id", existing.id);
    if (error) return NextResponse.json({ error: "No se pudo guardar la fórmula." }, { status: 500 });
  } else {
    const { error } = await supabaseServer.from("marca_formulas").insert(fields);
    if (error) return NextResponse.json({ error: "No se pudo guardar la fórmula." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
