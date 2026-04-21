import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UploadUrlRequest {
  proyectoId?: string;
  facturaId?: string;
  filename: string;
  contentType?: string;
}

// Sanitiza nombre de archivo: deja letras, números, guion, guion-bajo, punto.
function sanitizarNombre(nombre: string): string {
  const base = nombre.trim().toLowerCase();
  const limpio = base.replace(/[^a-z0-9._-]+/g, "_").replace(/_+/g, "_");
  // Trunca por si viene muy largo
  return limpio.length > 120 ? limpio.slice(-120) : limpio;
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as Partial<UploadUrlRequest>;
    if (!body?.filename) {
      return NextResponse.json(
        { error: "Falta filename" },
        { status: 400 },
      );
    }
    if (!body.proyectoId && !body.facturaId) {
      return NextResponse.json(
        { error: "Se requiere proyectoId o facturaId" },
        { status: 400 },
      );
    }
    if (body.proyectoId && !uuidRegex.test(body.proyectoId)) {
      return NextResponse.json(
        { error: "proyectoId inválido" },
        { status: 400 },
      );
    }
    if (body.facturaId && !uuidRegex.test(body.facturaId)) {
      return NextResponse.json(
        { error: "facturaId inválido" },
        { status: 400 },
      );
    }

    const safeName = sanitizarNombre(body.filename);
    const timestamp = Date.now();

    // Path: marketing/{proyectoId}/{facturaId?}/{timestamp}_{filename}
    // Nota: el bucket ya se llama "marketing", así que el path interno NO lleva el prefijo "marketing/".
    const parts: string[] = [];
    if (body.proyectoId) parts.push(body.proyectoId);
    if (body.facturaId) parts.push(body.facturaId);
    parts.push(`${timestamp}_${safeName}`);
    const path = parts.join("/");

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
    console.error("marketing/adjuntos/upload-url POST:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
