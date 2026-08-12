import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { cargarComprobante } from "@/lib/marketing/entrega-comprobante";
import { verifyEntregaToken } from "@/lib/marketing/gallery-token";
import {
  buildComprobanteEntregaPdf,
  numeroComprobante,
} from "@/lib/marketing/pdf-entrega-mueble";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/marketing/entregas-pdf/[id][?t=<token>]
//
// Comprobante de entrega de mobiliario en PDF (ver lib/marketing/
// pdf-entrega-mueble.ts). Dos puertas, porque tiene dos usos legítimos:
//   - `?t=<token>` HMAC de scope "entrega" → el link del Excel del ZIP, que se
//     abre desde el archivo descargado, sin sesión (igual que la galería de
//     fotos y el PDF combinado de facturas).
//   - sesión admin/secretaria → el botón "Comprobante" de la ficha del proyecto.
//
// El path vive bajo el prefijo público del middleware, así que la puerta la pone
// ESTE route. FAIL-CLOSED: sin token válido y sin sesión, 401/403 — nunca abierto.

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = decodeURIComponent(params.id);
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const token = req.nextUrl.searchParams.get("t");
  if (!verifyEntregaToken(id, token)) {
    // Sin token válido, exige sesión del módulo.
    const auth = requireRole(req, ["admin", "secretaria"]);
    if (auth instanceof NextResponse) return auth;
  }

  try {
    const datos = await cargarComprobante(id);
    if (!datos) {
      return NextResponse.json({ error: "Entrega no encontrada" }, { status: 404 });
    }
    // CON bultos: esta ruta sirve la nota de ENVÍO (la que acompaña la
    // mercancía). El comprobante para la marca sale del ZIP, sin bultos.
    const pdf = buildComprobanteEntregaPdf(datos, { incluirBultos: true });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="comprobante-${numeroComprobante(datos)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/entregas-pdf/[id]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
