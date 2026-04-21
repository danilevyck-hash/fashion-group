import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getCobranzaById } from "@/lib/marketing/queries";
import { updateCobranza } from "@/lib/marketing/mutations";
import type { UpdateCobranzaInput } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const cobranza = await getCobranzaById(params.id);
    if (!cobranza) {
      return NextResponse.json({ error: "No existe" }, { status: 404 });
    }
    return NextResponse.json(cobranza);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  let body: UpdateCobranzaInput;
  try {
    body = (await req.json()) as UpdateCobranzaInput;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const cobranza = await updateCobranza(params.id, body);
    return NextResponse.json(cobranza);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
