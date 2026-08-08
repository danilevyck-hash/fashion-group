// Marketing › Mobiliario — URL firmada para subir la FOTO de un producto del
// inventario de muebles.
//
// 🔴 La puerta va en el SERVIDOR: un token de subida firmado escribe en el
//    bucket saltándose RLS. Aquí el rol es admin + secretaria, el MISMO que ya
//    puede crear y editar productos (`/api/marketing/inventario/productos`).
//    Ojo, no es el mismo caso que `notas-proveedor/upload-url`, que es SOLO
//    admin porque esos son los costos del proveedor.
//
// Mismo patrón que /api/marketing/adjuntos/upload-url: el archivo va DIRECTO
// del navegador a Supabase (no pasa por Vercel, así que no hay tope de 4,5 MB),
// y en la base se guarda el PATH, no la URL firmada — que caduca.
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Carpeta del bucket `marketing` donde viven estas fotos. */
const PREFIJO = "inventario-productos";

/** Deja letras, números, guion, guion-bajo y punto. Igual que en adjuntos. */
function sanitizarNombre(nombre: string): string {
  const base = nombre.trim().toLowerCase();
  const limpio = base.replace(/[^a-z0-9._-]+/g, "_").replace(/_+/g, "_");
  return limpio.length > 120 ? limpio.slice(-120) : limpio;
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
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
    console.error("marketing/inventario/productos/upload-url POST:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
