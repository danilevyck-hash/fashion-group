import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, HAS_SERVICE_ROLE } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { CLAVE_FLETE_DEFAULT, FLETE_DEFAULT, esFleteValido, normalizarFlete } from "@/lib/depurador/flete";

export const dynamic = "force-dynamic";

// Los mismos que guardan las fórmulas de precio del módulo (admin + secretaria).
const ALLOWED = ["admin", "secretaria"];

/**
 * El flete POR DEFECTO de Reebok (1.10 o 1.15), compartido por todo el equipo.
 *
 * 🔑 LEER FALLA ABIERTA. Sin la fila —o con la lectura caída— contesta 1.10, que
 * es lo que el sistema hacía escrito a mano hasta el 14-sep-2026: la pantalla
 * nunca queda sin flete y el Excel nunca sale distinto por un problema de red.
 */
export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED);
  if (authError) return authError;
  if (!HAS_SERVICE_ROLE) return NextResponse.json({ flete: FLETE_DEFAULT });

  const { data } = await supabaseServer
    .from("app_settings")
    .select("value")
    .eq("key", CLAVE_FLETE_DEFAULT)
    .maybeSingle();

  return NextResponse.json({ flete: normalizarFlete(data?.value) });
}

/** Cambia el default para todos. 🔴 Solo 1.10 o 1.15: no hay un tercer valor. */
export async function PUT(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED);
  if (authError) return authError;
  if (!HAS_SERVICE_ROLE) {
    return NextResponse.json(
      { error: "Falta la configuración del servidor: el flete por defecto no se puede guardar." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  // 🔴 El borde valida con la MISMA función que la pantalla: un 11 en vez de un
  // 1.1 mandaría a Switch costos diez veces mal (el defecto del divisor).
  if (!esFleteValido(body.flete)) {
    return NextResponse.json(
      { error: "El flete solo puede ser 1.10 o 1.15." },
      { status: 400 }
    );
  }
  const flete = normalizarFlete(body.flete);

  const { error } = await supabaseServer.from("app_settings").upsert(
    {
      key: CLAVE_FLETE_DEFAULT,
      value: flete,
      description:
        "Flete por defecto de Reebok: Costo FOB x flete = Costo CIF. Solo 1.1 o 1.15. Se cambia en Plantilla Switch > Reebok.",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  if (error) {
    return NextResponse.json(
      { error: "No se pudo guardar el flete por defecto. Intenta de nuevo en unos segundos." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, flete });
}
