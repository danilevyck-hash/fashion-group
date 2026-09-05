import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdminOSecretaria } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { FACTURA_BUCKET } from "@/lib/reclamos/factura-storage";

export const dynamic = "force-dynamic";

interface Body {
  filename?: string;
}

// Sanitiza nombre de archivo: deja letras, números, guion, guion-bajo, punto.
function sanitizarNombre(nombre: string): string {
  const base = nombre.trim().toLowerCase();
  const limpio = base.replace(/[^a-z0-9._-]+/g, "_").replace(/_+/g, "_");
  return limpio.length > 120 ? limpio.slice(-120) : limpio;
}

// POST /api/reclamos/factura-pdf/upload-url  { filename }
// Devuelve una signed upload URL al bucket privado "reclamo-facturas".
// El reclamo aún no existe al crear, así que el path NO depende de su id:
// usa un prefijo aleatorio. El path se guarda luego en reclamos.factura_pdf_path.
export async function POST(req: NextRequest) {
  const denied = requireAdminOSecretaria(req);
  if (denied) return denied;

  try {
    const body = (await req.json()) as Body;
    if (!body?.filename) {
      return NextResponse.json({ error: "Falta filename" }, { status: 400 });
    }
    const safeName = sanitizarNombre(body.filename);
    const safePdf = safeName.endsWith(".pdf") ? safeName : `${safeName}.pdf`;
    const prefix = randomUUID();
    const timestamp = Date.now();
    const path = `${prefix}/${timestamp}_${safePdf}`;

    const { data, error } = await supabaseServer.storage
      .from(FACTURA_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      throw new Error(error?.message ?? "No se pudo generar URL");
    }

    return NextResponse.json({ uploadUrl: data.signedUrl, token: data.token, path });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al generar URL de subida";
    console.error("reclamos/factura-pdf/upload-url POST:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
