import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";

export const dynamic = "force-dynamic";

// Frescura de CXC por empresa = última sincronización del API
// (switch_estadocuenta.synced_at). Server-side (service_role) porque la tabla
// tiene RLS y el cliente browser/anon no la lee. Shape compatible con CxcUpload
// (company_key + uploaded_at) que consume UploadFreshness.
//
// ⚠️ PAGINADO (26-jul-2026): esta lectura se cortaba en 1.000 filas de las 1.511
// que tiene la tabla, en silencio. Y era el peor caso posible del truncado: las
// filas venían ordenadas por `synced_at` desc y TODAS las filas de una misma
// corrida del sync comparten el sello, así que las primeras 1.000 eran de UNA
// sola empresa — el resto simplemente no existía para este endpoint y su
// frescura salía en blanco. Ahora se leen todas (orden estable por `id`, no por
// el campo de negocio) y el máximo por empresa se calcula acá.
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]); if (auth instanceof NextResponse) return auth;

  let filas: { empresa_key: string; synced_at: string }[];
  try {
    filas = await leerTodoPaginado<{ empresa_key: string; synced_at: string }>(
      "switch_estadocuenta (frescura CXC)",
      (pedirCount, desde, hasta) =>
        supabaseServer
          .from("switch_estadocuenta")
          .select("empresa_key, synced_at", pedirCount ? { count: "exact" } : {})
          .order("id", { ascending: true })
          .range(desde, hasta),
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  const latest: Record<string, { company_key: string; uploaded_at: string }> = {};
  for (const r of filas) {
    const prev = latest[r.empresa_key];
    if (!prev || r.synced_at > prev.uploaded_at) {
      latest[r.empresa_key] = { company_key: r.empresa_key, uploaded_at: r.synced_at };
    }
  }
  return NextResponse.json(Object.values(latest));
}
