import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MARKETING_ESCRITURA } from "@/lib/marketing/roles";
import { veMarketingNuevo } from "@/lib/marketing/marketing-nuevo";
import { ErrorZipMarca } from "@/lib/marketing/zip-marca";
import { ErrorDeCierre } from "../../periodos/cerrar";
import { cerrarCobro } from "../cerrar-cobro";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/marketing/cobros/cerrar — { marcaCodigo, periodoId, excluidos: ["factura:<id>", …] }
// Solo para quien ve el Marketing nuevo (`ROLES_MARKETING_NUEVO`).
export async function POST(req: NextRequest) {
  const auth = requireRole(req, [...ROLES_MARKETING_ESCRITURA]);
  if (auth instanceof NextResponse) return auth;
  if (!veMarketingNuevo(auth.role)) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    marcaCodigo?: unknown;
    periodoId?: unknown;
    excluidos?: unknown;
  };
  const marcaCodigo = typeof body.marcaCodigo === "string" ? body.marcaCodigo : "";
  const periodoId = typeof body.periodoId === "string" ? body.periodoId : "";
  const excluidos = Array.isArray(body.excluidos) ? body.excluidos.filter((x): x is string => typeof x === "string") : [];
  if (!marcaCodigo || !periodoId) {
    return NextResponse.json({ error: "Falta la marca o el período." }, { status: 400 });
  }
  try {
    const r = await cerrarCobro({ marcaCodigo, periodoId, excluidos, cerradoPor: auth.userName || auth.role });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof ErrorDeCierre) {
      return NextResponse.json({ error: err.message, ...(err.extra ?? {}) }, { status: err.status });
    }
    if (err instanceof ErrorZipMarca) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("POST /api/marketing/cobros/cerrar:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "No se pudo cerrar el cobro. Intenta de nuevo." }, { status: 500 });
  }
}
