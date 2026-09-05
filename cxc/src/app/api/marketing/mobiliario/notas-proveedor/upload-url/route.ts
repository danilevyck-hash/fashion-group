// Marketing › Mobiliario — URL firmada para subir la foto de un renglón.
//
// 🔴 SOLO ADMIN en el SERVIDOR. Un token de subida firmado escribe en el
//    bucket saltándose RLS, así que la puerta tiene que estar acá.
//    ⚠️ NO usar `requireAdminOSecretaria` de api-auth.ts: ese incluye a la secretaria.
//
// Mismo patrón que /api/marketing/adjuntos/upload-url: el archivo va DIRECTO
// del navegador a Supabase (no pasa por Vercel, así que no hay tope de 4,5 MB
// ni hace falta comprimir en el cliente), y en la base se guarda el PATH, no
// la URL firmada — que caduca.
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Carpeta del bucket `marketing` donde viven estas fotos. */
const PREFIJO = "notas-proveedor";

/** Deja letras, números, guion, guion-bajo y punto. Igual que en adjuntos. */
function sanitizarNombre(nombre: string): string {
  const base = nombre.trim().toLowerCase();
  const limpio = base.replace(/[^a-z0-9._-]+/g, "_").replace(/_+/g, "_");
  return limpio.length > 120 ? limpio.slice(-120) : limpio;
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as { filename?: string };
    if (!body?.filename) {
      return NextResponse.json({ error: "Falta filename" }, { status: 400 });
    }

    const path = `${PREFIJO}/${Date.now()}_${sanitizarNombre(body.filename)}`;
    const { data, error } = await supabaseServer.storage
      .from("marketing")
      .createSignedUploadUrl(path);
    if (error || !data) {
      throw new Error(error?.message ?? "No se pudo generar URL");
    }

    return NextResponse.json({
      uploadUrl: data.signedUrl,
      token: data.token,
      path,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al generar URL de subida";
    console.error(
      "marketing/mobiliario/notas-proveedor/upload-url POST:",
      message,
    );
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
