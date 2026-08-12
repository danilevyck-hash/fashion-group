// ============================================================================
// POST /api/marketing/zip-marca
//   body: { marcaCodigo: "TH"|"CK"|"KL"|"RBK"|"J", periodoId?: string }
//
// UN ZIP por request, el de UNA marca. Con `periodoId` sale ese período (esté
// cerrado o abierto); sin él, el período ABIERTO de la marca — que es el botón
// "bajar una sola marca cuando quiera, sin cerrar nada".
//
// Ver `lib/marketing/zip-marca.ts` para la regla que sostiene todo esto: la
// plata se congela, los papeles no.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  ErrorZipMarca,
  buildZipDeMarca,
  contentDisposition,
  type CodigoErrorZipMarca,
} from "@/lib/marketing/zip-marca";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // bajar fotos/PDFs + comprimir + zip

/** Qué código HTTP le corresponde a cada negativa. */
const HTTP_POR_CODIGO: Record<CodigoErrorZipMarca, number> = {
  MARCA_DESCONOCIDA: 400,
  SIN_TABLAS_DE_PERIODO: 409,
  PERIODO_NO_ENCONTRADO: 404,
  PERIODO_DE_OTRA_MARCA: 400,
  SIN_PERIODO_ABIERTO: 404,
  // Una marca sin gasto NO genera ZIP (decisión de Daniel). No es un error del
  // sistema: es que no hay nada que mandarle a esa persona.
  MARCA_SIN_GASTO: 404,
};

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      marcaCodigo?: string;
      periodoId?: string | null;
    };

    const result = await buildZipDeMarca({
      marcaCodigo: String(body.marcaCodigo ?? ""),
      periodoId: body.periodoId ?? null,
    });

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDisposition(result.filename),
        "X-Marca": result.marcaCodigo,
        "X-Periodo-Estado": result.periodoEstado,
        "X-Fuente-Montos": result.fuenteMontos,
        "X-Total": String(result.total),
        "X-Gastos-Count": String(result.gastos),
        "X-Fotos-Incluidas": String(result.fotosIncluidas),
        "X-Fotos-Omitidas": String(result.fotosOmitidas),
        "X-Pdfs-Incluidos": String(result.pdfsIncluidos),
        "X-Pdfs-Omitidos": String(result.pdfsOmitidos),
      },
    });
  } catch (err) {
    if (err instanceof ErrorZipMarca) {
      return NextResponse.json(
        { error: err.message, codigo: err.codigo },
        { status: HTTP_POR_CODIGO[err.codigo] ?? 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("POST /api/marketing/zip-marca:", message);
    return NextResponse.json(
      { error: "No se pudo armar el reporte. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}
