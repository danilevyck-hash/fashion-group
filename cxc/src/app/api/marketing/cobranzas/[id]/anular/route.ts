import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { anularCobranza } from "@/lib/marketing/mutations";

export const dynamic = "force-dynamic";

interface Body {
  motivo?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.motivo || body.motivo.trim().length === 0) {
    return NextResponse.json(
      { error: "Motivo de anulación requerido" },
      { status: 400 }
    );
  }

  try {
    await anularCobranza(params.id, body.motivo);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
