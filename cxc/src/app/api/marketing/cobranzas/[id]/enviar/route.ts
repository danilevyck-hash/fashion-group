import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { marcarCobranzaEnviada } from "@/lib/marketing/mutations";

export const dynamic = "force-dynamic";

interface Body {
  fechaEnvio?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  let body: Body = {};
  try {
    const raw = await req.text();
    if (raw && raw.trim().length > 0) body = JSON.parse(raw) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    await marcarCobranzaEnviada(params.id, body.fechaEnvio);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
