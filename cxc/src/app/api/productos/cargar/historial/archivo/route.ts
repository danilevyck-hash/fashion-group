import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, HAS_SERVICE_ROLE } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { BUCKET_PLANTILLAS, contentTypeDe } from "@/lib/depurador/historial-archivos";

export const dynamic = "force-dynamic";

const ALLOWED = ["admin", "secretaria"];

/** Vuelve a bajar el Excel guardado de una carga del historial (90 días).
 *  Todos los que ven el módulo pueden bajar lo de cualquiera (Daniel:
 *  «todos» — Angela puede bajar lo que corrió Andrea). El bucket es privado:
 *  el archivo sale SOLO por acá, con la sesión de siempre. */
export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED);
  if (authError) return authError;
  if (!HAS_SERVICE_ROLE) {
    return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en este entorno." }, { status: 503 });
  }

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("carga_history")
    .select("archivo_path, archivo_nombre")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "No se pudo leer el historial." }, { status: 500 });
  const path = (data as { archivo_path?: string | null } | null)?.archivo_path;
  if (!path) {
    // La fila no existe o su archivo ya venció (90 días): mismo 404.
    return NextResponse.json({ error: "Este archivo ya no está guardado." }, { status: 404 });
  }

  const { data: blob, error: dlErr } = await supabaseServer.storage
    .from(BUCKET_PLANTILLAS)
    .download(path);
  if (dlErr || !blob) {
    return NextResponse.json({ error: "No se pudo bajar el archivo." }, { status: 500 });
  }

  const nombre = (data as { archivo_nombre?: string | null } | null)?.archivo_nombre
    || path.split("/").pop() || "plantilla.xlsx";
  const bytes = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": contentTypeDe(nombre),
      "Content-Disposition": `attachment; filename="${nombre.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
