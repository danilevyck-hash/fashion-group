import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { createAdjunto } from "@/lib/marketing/mutations";
import type { CreateAdjuntoInput } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = (await req.json()) as Partial<CreateAdjuntoInput>;
    if (!body?.tipo || !body.url) {
      return NextResponse.json(
        { error: "Faltan campos: tipo, url" },
        { status: 400 },
      );
    }
    const adjunto = await createAdjunto({
      proyectoId: body.proyectoId,
      facturaId: body.facturaId,
      tipo: body.tipo,
      url: body.url,
      nombreOriginal: body.nombreOriginal,
      sizeBytes: body.sizeBytes,
    });
    return NextResponse.json(adjunto);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo registrar el adjunto";
    console.error("marketing/adjuntos POST:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
