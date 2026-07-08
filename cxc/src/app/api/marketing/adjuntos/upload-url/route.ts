import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UploadUrlRequest {
  proyectoId?: string;
  facturaId?: string;
  // Comprobante de pago de impulsadora: se sube ANTES de crear la(s) factura(s),
  // por eso se ancla a la impulsadora (path impulsadora/{id}/…).
  impulsadoraId?: string;
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
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as Partial<UploadUrlRequest>;
    if (!body?.filename) {
      return NextResponse.json(
        { error: "Falta filename" },
        { status: 400 },
      );
    }
    if (!body.proyectoId && !body.facturaId && !body.impulsadoraId) {
      return NextResponse.json(
        { error: "Se requiere proyectoId, facturaId o impulsadoraId" },
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
    if (body.impulsadoraId && !uuidRegex.test(body.impulsadoraId)) {
      return NextResponse.json(
        { error: "impulsadoraId inválido" },
        { status: 400 },
      );
    }

    const safeName = sanitizarNombre(body.filename);
    const timestamp = Date.now();

    // Path interno del bucket "marketing" (sin prefijo "marketing/"):
    //   proyecto/factura → {proyectoId}/{facturaId?}/{ts}_{name}
    //   impulsadora      → impulsadora/{impulsadoraId}/{ts}_{name}
    const parts: string[] = [];
    if (body.impulsadoraId) {
      parts.push("impulsadora", body.impulsadoraId);
    } else {
      if (body.proyectoId) parts.push(body.proyectoId);
      if (body.facturaId) parts.push(body.facturaId);
    }
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
