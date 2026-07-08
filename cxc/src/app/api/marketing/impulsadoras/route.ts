import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { listImpulsadoras, createImpulsadora } from "@/lib/marketing/impulsadoras";
import { logActivity } from "@/lib/log-activity";
import type { CreateImpulsadoraInput } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// GET /api/marketing/impulsadoras — catálogo con split + estado de pago del mes.
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const data = await listImpulsadoras();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    console.error("marketing/impulsadoras GET:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// POST /api/marketing/impulsadoras — crea una impulsadora con su split.
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = (await req.json()) as Partial<CreateImpulsadoraInput>;
    if (!body?.nombre || body.montoMensual === undefined || !Array.isArray(body.marcas)) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 },
      );
    }
    const impulsadora = await createImpulsadora({
      nombre: body.nombre,
      montoMensual: Number(body.montoMensual),
      marcas: body.marcas,
    });
    logActivity(auth.role, "impulsadora_creada", "marketing", { id: impulsadora.id, nombre: impulsadora.nombre }, auth.userName).catch(() => {});
    return NextResponse.json(impulsadora);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
